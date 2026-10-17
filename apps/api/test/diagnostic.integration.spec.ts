import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Diagnostic CAT/IRT and Student Mastery Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

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

    // Setup student
    const stReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username: `diag_${suffix}`.slice(0, 30),
        email: `diag_${suffix}@test.adaptivemath.local`,
        fullName: 'Học sinh Thi Thử',
        password: 'P@ssword123!'
      });
    studentId = stReg.body.id;
    const stLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: `diag_${suffix}`.slice(0, 30), password: 'P@ssword123!' });
    studentCookie = stLogin.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    if (studentId) {
      await prisma.user.delete({ where: { id: studentId } }).catch(() => undefined);
    }
    await app.close();
  });

  it('runs adaptive diagnostic loop, computes mastery, and populates mistake records', async () => {
    // 1. Start diagnostic attempt
    const startRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/start')
      .set('Cookie', studentCookie)
      .send({ grade: 9 })
      .expect(201);

    expect(startRes.body.attemptId).toBeDefined();
    expect(startRes.body.currentTheta).toBe(0);
    expect(startRes.body.questions[0].id).toBe(startRes.body.currentQuestion.id);
    const rank = { SINGLE_CHOICE: 0, TRUE_FALSE: 1, SHORT_ANSWER: 2 };
    expect(startRes.body.questions.every((q, i, rows) => i === 0 || rank[q.questionType] >= rank[rows[i - 1].questionType])).toBe(true);
    expect(startRes.body.currentQuestion).toBeDefined();

    const attemptId = startRes.body.attemptId;
    const firstQ = startRes.body.currentQuestion;

    // 2. Submit wrong answer for first question

    const answer1Res = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId,
        questionId: firstQ.id,
        ...await answerFor(firstQ.id, false),
        timeSpentSeconds: 45
      })
      .expect(200);

    // Because it was incorrect, theta should have decreased
    expect(answer1Res.body.currentTheta).toBeLessThan(0);
    expect(answer1Res.body.isCorrect).toBe(false);

    // 3. Finalize attempt
    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/diagnostic/submit/${attemptId}`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(submitRes.body.status).toBe('COMPLETED');
    expect(submitRes.body.totalAnswered).toBe(startRes.body.totalQuestions);
    expect(submitRes.body.correctCount).toBe(0);

    // 4. Verify Student Mistake Notebook contains the wrong answer
    const mistakesRes = await request(app.getHttpServer())
      .get('/api/v1/student/mistakes')
      .set('Cookie', studentCookie)
      .expect(200);

    expect(mistakesRes.body.total).toBe(startRes.body.totalQuestions);
    expect(mistakesRes.body.mistakes.some((m: any) => m.questionId === firstQ.id)).toBe(true);
    expect(mistakesRes.body.mistakes[0].isMastered).toBe(false);

    // 5. Update mistake record (mark mastered)
    const mistakeId = mistakesRes.body.mistakes[0].id;
    const patchMistake = await request(app.getHttpServer())
      .patch(`/api/v1/student/mistakes/${mistakeId}`)
      .set('Cookie', studentCookie)
      .send({ isMastered: true, userNotes: 'Đã hiểu cách giải qua lời giải chi tiết' })
      .expect(200);

    expect(patchMistake.body.mistake.isMastered).toBe(true);

    // 6. Student views learning path
    const pathRes = await request(app.getHttpServer())
      .get('/api/v1/student/learning-path')
      .set('Cookie', studentCookie)
      .expect(200);

    expect(pathRes.body.grade).toBe(9);
    expect(pathRes.body.modules.length).toBeGreaterThan(0);
  });
});
