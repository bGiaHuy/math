import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { UserRole, AttemptStatus } from '@prisma/client';

describe('Diagnostic CAT Resilience & Edge-Cases (Resume, Timeout, Last-Answer, Duplicate Submit)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `resil_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  let studentId: string;
  let studentCookie: string;

  async function answerFor(questionId: string, correct = true) {
    const q = await prisma.question.findUniqueOrThrow({ where: { id: questionId }, include: { options: true } });
    if (q.questionType === 'TRUE_FALSE') return { response: { trueFalseAnswers: Object.fromEntries((q.statements as any[]).map(s => [s.key, correct ? s.isCorrect : !s.isCorrect])) } };
    if (q.questionType === 'SHORT_ANSWER') return { response: { shortAnswer: correct ? (q.shortAnswer as any).acceptedAnswers[0] : '__wrong__' } };
    return { selectedOptionKey: q.options.find(o => o.isCorrect === correct)!.optionKey };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_COOKIE_NAME = 'am_session';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication(new ExpressAdapter());
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);

    // Register & Login Student
    const username = `stu_${runId}`.slice(0, 30);
    const email = `stu_${runId}@test.adaptivemath.local`;
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username,
        email,
        fullName: 'Học Sinh Kiểm Thử Khả Năng Khôi Phục',
        password: 'P@ssword123!'
      })
      .expect(201);

    studentId = regRes.body.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'P@ssword123!' })
      .expect(200);

    studentCookie = loginRes.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    if (studentId) {
      await prisma.user.delete({ where: { id: studentId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('verifies resume attempt, timeout answer, last-answer inclusion, and idempotent duplicate submission', async () => {
    // =========================================================================
    // 1. Start Attempt #1
    // =========================================================================
    const startRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/start')
      .set('Cookie', studentCookie)
      .expect(201);

    expect(startRes.body.attemptId).toBeDefined();
    expect(startRes.body.isResumed).toBe(false);
    expect(startRes.body.answeredCount).toBe(0);
    expect(startRes.body.currentTheta).toBe(0);
    const attemptId = startRes.body.attemptId;
    const q1 = startRes.body.currentQuestion;
    expect(q1).toBeDefined();

    // Answer Question 1 correctly
    const q1Correct = await prisma.questionOption.findFirst({
      where: { questionId: q1.id, isCorrect: true }
    });


    const ans1Res = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId,
        questionId: q1.id,
        ...await answerFor(q1.id),
        timeSpentSeconds: 30,
        isSkipped: false,
        isTimeout: false
      })
      .expect(200);

    expect(ans1Res.body.isCorrect).toBe(true);
    expect(ans1Res.body.answeredCount).toBe(1);
    const thetaAfterQ1 = ans1Res.body.currentTheta;
    expect(thetaAfterQ1).toBeGreaterThan(0);

    // =========================================================================
    // 2. Simulate User Dropping Out & Resuming Attempt (POST /diagnostic/start)
    // =========================================================================
    const resumeRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/start')
      .set('Cookie', studentCookie)
      .expect(201);

    expect(resumeRes.body.attemptId).toBe(attemptId);
    expect(resumeRes.body.isResumed).toBe(true);
    expect(resumeRes.body.answeredCount).toBe(1);
    expect(resumeRes.body.currentTheta).toBe(thetaAfterQ1);
    const q2 = resumeRes.body.currentQuestion;
    expect(q2).toBeDefined();
    expect(q2.id).not.toBe(q1.id);

    // =========================================================================
    // 3. Timeout Handling on Question 2 (isTimeout: true, timeSpentSeconds: 90)
    // =========================================================================
    const timeoutRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId,
        questionId: q2.id,
        selectedOptionKey: null,
        timeSpentSeconds: 90,
        isSkipped: false,
        isTimeout: true
      })
      .expect(200);

    expect(timeoutRes.body.isCorrect).toBe(false);
    expect(timeoutRes.body.answeredCount).toBe(2);
    const thetaAfterTimeout = timeoutRes.body.currentTheta;
    expect(thetaAfterTimeout).toBeLessThan(thetaAfterQ1);
    const q3 = timeoutRes.body.nextQuestion;
    expect(q3).toBeDefined();

    // =========================================================================
    // 4. Answer Question 3 (The Last Answer before submission)
    // =========================================================================
    const q3Correct = await prisma.questionOption.findFirst({
      where: { questionId: q3.id, isCorrect: true }
    });

    const ans3Res = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId,
        questionId: q3.id,
        ...await answerFor(q3.id),
        timeSpentSeconds: 20,
        isSkipped: false,
        isTimeout: false
      })
      .expect(200);

    expect(ans3Res.body.answeredCount).toBe(3);

    // =========================================================================
    // 5. Finalize Attempt & Verify Last-Answer Inclusion
    // =========================================================================
    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/diagnostic/submit/${attemptId}`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(submitRes.body.status).toBe(AttemptStatus.COMPLETED);
    expect(submitRes.body.totalAnswered).toBe(startRes.body.totalQuestions);
    expect(submitRes.body.finalTheta).toBeDefined();

    // Verify through GET /diagnostic/results/:attemptId
    const resultRes = await request(app.getHttpServer())
      .get(`/api/v1/diagnostic/results/${attemptId}`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(resultRes.body.status).toBe(AttemptStatus.COMPLETED);
    expect(resultRes.body.answers).toHaveLength(startRes.body.totalQuestions);

    // Check that question 3 (the last answered question) is fully preserved
    const q3AnswerRecord = resultRes.body.answers.find(
      (a: any) => a.questionId === q3.id
    );
    expect(q3AnswerRecord).toBeDefined();

    // =========================================================================
    // 6. Duplicate Submission Protection (Submitting completed attempt again)
    // =========================================================================
    const duplicateSubmitRes = await request(app.getHttpServer())
      .post(`/api/v1/diagnostic/submit/${attemptId}`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(duplicateSubmitRes.body.alreadySubmitted).toBe(true);
    expect(duplicateSubmitRes.body.status).toBe(AttemptStatus.COMPLETED);
    expect(duplicateSubmitRes.body.totalAnswered).toBe(startRes.body.totalQuestions);

    // Verify DB still only has exactly 3 answers and attempt is not corrupted
    const dbAnswers = await prisma.attemptAnswer.findMany({
      where: { attemptId }
    });
    expect(dbAnswers).toHaveLength(startRes.body.totalQuestions);
  });

  it('returns the stored answer for simultaneous submissions without a 500 or duplicate row', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/start')
      .set('Cookie', studentCookie)
      .expect(201);
    const payload = {
      attemptId: start.body.attemptId,
      questionId: start.body.currentQuestion.id,
      ...await answerFor(start.body.currentQuestion.id),
      timeSpentSeconds: 2,
      isSkipped: false,
      isTimeout: false
    };
    const responses = await Promise.all(Array.from({ length: 5 }, () =>
      request(app.getHttpServer())
        .post('/api/v1/diagnostic/answer')
        .set('Cookie', studentCookie)
        .send(payload)
    ));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses.some((response) => response.body.replayed === true)).toBe(true);
    expect(await prisma.attemptAnswer.count({
      where: { attemptId: payload.attemptId, questionId: payload.questionId }
    })).toBe(1);

    await prisma.attemptAnswer.update({
      where: { attemptId_questionId: { attemptId: payload.attemptId, questionId: payload.questionId } },
      data: { answeredAt: new Date(Date.now() - 181_000) }
    });
    const resumed = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/start')
      .set('Cookie', studentCookie)
      .expect(201);
    expect(resumed.body.questionTimeRemainingSeconds).toBe(0);

    const lateAnswer = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId: payload.attemptId,
        questionId: resumed.body.currentQuestion.id,
        ...await answerFor(resumed.body.currentQuestion.id),
        timeSpentSeconds: 1,
        isSkipped: false,
        isTimeout: false
      })
      .expect(200);
    expect(lateAnswer.body.isCorrect).toBe(false);
    const timedOut = await prisma.attemptAnswer.findUnique({
      where: { attemptId_questionId: {
        attemptId: payload.attemptId,
        questionId: resumed.body.currentQuestion.id
      } }
    });
    expect(timedOut?.isTimeout).toBe(true);
    expect(timedOut?.selectedOptionKey).toBeNull();
  });
  it('unlocks notebook after abandoning only the current student attempt and preserves submitted results', async () => {
    const completedBefore = await prisma.diagnosticAttempt.count({ where: { studentId, status: 'COMPLETED' } });
    const masteryBefore = await prisma.skillMastery.findMany({ where: { studentId }, orderBy: { id: 'asc' } });
    const other = await prisma.user.create({ data: { username: `other_${Date.now()}`, fullName: 'Other student', passwordHash: 'unused', role: 'STUDENT' } });
    try {
      const foreign = await prisma.diagnosticAttempt.create({ data: { studentId: other.id, currentTheta: 0 } });
      const started = await request(app.getHttpServer()).post('/api/v1/diagnostic/start').set('Cookie', studentCookie).expect(201);
      await request(app.getHttpServer()).get('/api/v1/student/mistakes').set('Cookie', studentCookie).expect(403);
      await request(app.getHttpServer()).post('/api/v1/diagnostic/abandon-current').expect(401);
      const ended = await request(app.getHttpServer()).post('/api/v1/diagnostic/abandon-current').set('Cookie', studentCookie).expect(200);
      expect(ended.body.abandonedCount).toBe(1);
      expect((await prisma.diagnosticAttempt.findUniqueOrThrow({ where: { id: started.body.attemptId } })).status).toBe('ABANDONED');
      expect((await prisma.diagnosticAttempt.findUniqueOrThrow({ where: { id: foreign.id } })).status).toBe('IN_PROGRESS');
      await request(app.getHttpServer()).get('/api/v1/student/mistakes').set('Cookie', studentCookie).expect(200);
      const replay = await request(app.getHttpServer()).post('/api/v1/diagnostic/abandon-current').set('Cookie', studentCookie).expect(200);
      expect(replay.body.abandonedCount).toBe(0);
      expect(await prisma.diagnosticAttempt.count({ where: { studentId, status: 'COMPLETED' } })).toBe(completedBefore);
      expect(await prisma.skillMastery.findMany({ where: { studentId }, orderBy: { id: 'asc' } })).toEqual(masteryBefore);
    } finally { await prisma.user.delete({ where: { id: other.id } }); }
  });

});
