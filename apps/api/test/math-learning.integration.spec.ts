import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { CognitiveLevel } from '@prisma/client';
import { ExpressAdapter } from '@nestjs/platform-express';

describe('Math learning loop with real persistence and access control', () => {
  let app: INestApplication, db: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 7)}`;
  const users: string[] = [], cookies: string[] = [], skills: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(new ExpressAdapter()); app.use(cookieParser()); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init(); db = app.get(PrismaService);
    const admin = await db.user.findUnique({ where: { username: 'admin' } });
    for (let i = 0; i < 3; i++) {
      const username = `math${i}_${suffix}`.slice(0, 30);
      const reg = await request(app.getHttpServer()).post('/api/v1/auth/register/student')
        .send({ username, fullName: 'Math QA learner', password: 'MathQaStrong123!' }).expect(201);
      users.push(reg.body.id);
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ identifier: username, password: 'MathQaStrong123!' }).expect(200);
      cookies.push(login.headers['set-cookie'][0].split(';')[0]);
      await db.studentProfile.upsert({ where: { userId: users[i] }, update: { grade: 8 }, create: { userId: users[i], grade: 8, targetGoal: 'Ôn thi cuối kỳ', dailyMinutes: 30 } });
    }
    for (let s = 0; s < 2; s++) {
      const skill = await db.skillNode.create({ data: { code: `math_qa_${suffix}_${s}`, title: `QA Skill ${s}`, chapter: 'QA', grade: 8, orderIndex: s + 1 } });
      skills.push(skill.id);
      for (let i = 0; i < 12; i++) await db.question.create({ data: { skillId: skill.id, authorId: admin!.id,
        cognitiveLevel: Object.values(CognitiveLevel)[Math.floor(i / 3)], status: 'PUBLISHED', content: `QA ${s}: ${i}+1=?`, explanation: `Answer ${i+1}`,
        options: { create: [{ optionKey: 'A', content: String(i+1), isCorrect: true }, { optionKey: 'B', content: '-1', isCorrect: false }] } } });
    }
  });
  afterAll(async () => {
    if (!db) { await app?.close(); return; }
    await db.auditLog.deleteMany({ where: { actorUserId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.question.deleteMany({ where: { skillId: { in: skills } } });
    await db.skillNode.deleteMany({ where: { id: { in: skills } } }); await app.close();
  });
  const get = (user: number, path: string) => request(app.getHttpServer()).get(`/api/v1/${path}`).set('Cookie', cookies[user]);
  const post = (user: number, path: string, body = {}) => request(app.getHttpServer()).post(`/api/v1/${path}`).set('Cookie', cookies[user]).send(body);
  it('keeps diagnostics grade-scoped, rejects forged questions, resumes deterministically and submits atomically', async () => {
    const start = (await post(0, 'diagnostic/start').expect(201)).body;
    expect(skills).toContain(start.currentQuestion.skillId);
    expect(start.questions).toHaveLength(12);
    expect(start.questions.every((q: any) => skills.includes(q.skillId) && q.questionType === 'SINGLE_CHOICE')).toBe(true);
    expect(new Set(start.questions.map((q: any) => q.id)).size).toBe(start.questions.length);
    expect(start.currentQuestion.id).toBe(start.questions[0].id);
    expect(start.currentQuestion).not.toHaveProperty('explanation'); expect(start.currentQuestion.options[0]).not.toHaveProperty('isCorrect');
    await get(0, `diagnostic/results/${start.attemptId}`).expect(403);
    const foreign = await db.question.findFirst({ where: { skillId: skills[0], id: { not: start.currentQuestion.id } } });
    await post(0, 'diagnostic/answer', { attemptId: start.attemptId, questionId: foreign!.id, selectedOptionKey: 'A' }).expect(409);
    await post(0, `student/practice/start/${skills[0]}`).expect(403);
    const payload = { attemptId: start.attemptId, questionId: start.currentQuestion.id, selectedOptionKey: 'B', timeSpentSeconds: 5 };
    const responses = await Promise.all([post(0, 'diagnostic/answer', payload), post(0, 'diagnostic/answer', payload)]);
    expect(responses.every(r => r.status === 200)).toBe(true); expect(responses.filter(r => r.body.replayed)).toHaveLength(1);
    const resume = (await post(0, 'diagnostic/start').expect(201)).body;
    expect(resume.questions).toEqual(start.questions);
    expect(resume.answeredCount).toBe(1); expect(resume.currentQuestion.id).toBe(responses[0].body.nextQuestion.id);
    const submits = await Promise.all([post(0, `diagnostic/submit/${start.attemptId}`), post(0, `diagnostic/submit/${start.attemptId}`)]);
    expect(submits.every(r => r.status === 200)).toBe(true);
    const mastery = await db.skillMastery.findFirst({ where: { studentId: users[0] } });
    expect(mastery!.evidenceCount).toBe(start.questions.filter((q: any) => q.skillId === mastery!.skillId).length); expect(mastery!.attemptsCount).toBe(1);
    const path = (await get(0, 'student/learning-path').expect(200)).body;
    expect(path.modules.filter((m: any) => start.questions.some((q: any) => q.skillId === m.id)).every((m: any) => m.masteryScore !== null)).toBe(true);
    expect(path.modules.every((m: any) => m.status !== 'COMPLETED')).toBe(true);
  });
  it('persists all three practice phases, updates BKT only from new evidence and puts mistakes into spaced review', async () => {
    let state = (await post(1, `student/practice/start/${skills[0]}`).expect(201)).body;
    await post(1, 'diagnostic/start').expect(409);
    await post(2, `student/practice/${state.sessionId}/answer`, { questionId: state.currentQuestion.id, answer: 'A', timeSpentSeconds: 3 }).expect(404);
    const phases = new Set<string>(), qIds = new Set<string>();
    while (state.currentQuestion) {
      phases.add(state.phase); expect(qIds.has(state.currentQuestion.id)).toBe(false); qIds.add(state.currentQuestion.id);
      expect(state.currentQuestion).not.toHaveProperty('explanation');
      const payload = { questionId: state.currentQuestion.id, answer: state.answeredCount === 0 ? 'B' : 'A', timeSpentSeconds: 15 };
      const first = (await post(1, `student/practice/${state.sessionId}/answer`, payload).expect(201)).body;
      const replay = (await post(1, `student/practice/${state.sessionId}/answer`, payload).expect(201)).body;
      expect(replay.replayed).toBe(true); expect(replay.answeredCount).toBe(first.answeredCount);
      state = first;
      if (state.status === 'IN_PROGRESS') {
        const resumed = (await post(1, `student/practice/start/${skills[0]}`).expect(201)).body;
        expect(resumed.sessionId).toBe(state.sessionId); expect(resumed.currentQuestion.id).toBe(state.currentQuestion.id);
      }
    }
    expect([...phases]).toEqual(['WARMUP','PRACTICE','CHECK']); expect(state.status).toBe('COMPLETED');
    expect(state.result.newEvidenceCount).toBe(7);
    const mastery = await db.skillMastery.findUnique({ where: { studentId_skillId: { studentId: users[1], skillId: skills[0] } } });
    expect(mastery!.evidenceCount).toBe(7); expect(mastery!.masteryScore).toBeGreaterThan(85);
    expect(await db.mathReviewCard.count({ where: { studentId: users[1] } })).toBe(1);
    const logs = (await get(1, 'student/activity').expect(200)).body.logs;
    expect(Object.keys(logs)).toHaveLength(1); expect(Object.values(logs)[0]).toMatchObject({ minutes: 3, sessions: 1 });
    const path = (await get(1, 'student/learning-path').expect(200)).body;
    expect(path.modules.find((m: any) => m.id === skills[0]).status).toBe('COMPLETED');
    expect(path.plan.days[0].activities[0].kind).toBe('REVIEW');
  });
  it('retains saved evidence on abandon and validates calendar dates and question-bank readiness', async () => {
    const start = (await post(2, `student/practice/start/${skills[1]}`).expect(201)).body;
    await post(2, `student/practice/${start.sessionId}/answer`, { questionId: start.currentQuestion.id, answer: 'B', timeSpentSeconds: 1 }).expect(201);
    await post(2, `student/practice/${start.sessionId}/abandon`).expect(201);
    expect((await get(2, 'student/practice/active').expect(200)).body.session).toBeNull();
    expect(await db.mistakeRecord.count({ where: { studentId: users[2] } })).toBe(1);
    await request(app.getHttpServer()).patch('/api/v1/student/onboarding').set('Cookie', cookies[2]).send({ examDate: '31/02/2027' }).expect(400);
  });
});
