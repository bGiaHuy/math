import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { UserRole, QuestionStatus } from '@prisma/client';

describe('Comprehensive E2E Scenarios (Technical Handoff & Release Readiness)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  // Test accounts tracking for cleanup
  const createdUserIds: string[] = [];
  const createdClassIds: string[] = [];
  const createdQuestionIds: string[] = [];

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
  });

  afterAll(async () => {
    // Cleanup created data
    for (const qId of createdQuestionIds) {
      await prisma.question.delete({ where: { id: qId } }).catch(() => undefined);
    }
    for (const cId of createdClassIds) {
      await prisma.classroom.delete({ where: { id: cId } }).catch(() => undefined);
    }
    for (const uId of createdUserIds) {
      await prisma.user.delete({ where: { id: uId } }).catch(() => undefined);
    }
    await app.close();
  });

  // Helper to extract session cookie from response
  const getCookie = (res: any): string => {
    const raw = res.headers['set-cookie']?.[0];
    if (!raw) return '';
    return raw.split(';')[0];
  };

  // ============================================================================
  // Scenario 1: Student End-to-End Flow
  // ============================================================================
  it('Scenario 1: Student Flow (Registration -> Onboarding -> CAT Diagnostic -> Mastery/Path -> Mistakes)', async () => {
    const username = `stu_${runId}`.slice(0, 30);
    const email = `stu_${runId}@adaptivemath.vn`;

    // 1. Register student
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username,
        email,
        fullName: 'Học Sinh Kiểm Thử E2E',
        password: 'P@ssword123!'
      })
      .expect(201);

    const studentId = regRes.body.id;
    createdUserIds.push(studentId);
    expect(regRes.body.role).toBe(UserRole.STUDENT);

    // 2. Login as student
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'P@ssword123!' })
      .expect(200);

    const studentCookie = getCookie(loginRes);
    expect(studentCookie).toContain('am_session=');

    // 3. Complete Onboarding Wizard (PATCH /student/onboarding)
    const onboardRes = await request(app.getHttpServer())
      .patch('/api/v1/student/onboarding')
      .set('Cookie', studentCookie)
      .send({
        grade: 9,
        targetGoal: 'Thi đỗ chuyên Toán',
        dailyMinutes: 60,
        selfAssessment: 'Khá'
      })
      .expect(200);

    expect(onboardRes.body.profile.targetGoal).toBe('Thi đỗ chuyên Toán');
    expect(onboardRes.body.profile.dailyMinutes).toBe(60);

    // 4. Start CAT Diagnostic Test (POST /diagnostic/start)
    const startRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/start')
      .set('Cookie', studentCookie)
      .expect(201);

    expect(startRes.body.attemptId).toBeDefined();
    expect(startRes.body.currentQuestion).toBeDefined();
    expect(startRes.body.currentTheta).toBe(0);
    const attemptId = startRes.body.attemptId;
    const questionId = startRes.body.currentQuestion.id;

    const dbQuestion = await prisma.question.findUniqueOrThrow({ where: { id: questionId }, include: { options: true } });
    const firstResponse = dbQuestion.questionType === 'TRUE_FALSE'
      ? { response: { trueFalseAnswers: Object.fromEntries((dbQuestion.statements as any[]).map(s => [s.key, s.isCorrect])) } }
      : dbQuestion.questionType === 'SHORT_ANSWER'
        ? { response: { shortAnswer: (dbQuestion.shortAnswer as any).acceptedAnswers[0] } }
        : { selectedOptionKey: dbQuestion.options.find(o => o.isCorrect)!.optionKey };
    // 5. Submit an answer (POST /diagnostic/answer)
    const answerRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId,
        questionId,
        ...firstResponse,
        timeSpentSeconds: 25
      })
      .expect(200);

    expect(answerRes.body.answeredCount).toBe(1);
    expect(answerRes.body.currentTheta).toBeDefined();

    // Double-submit prevention test: submitting the same question again should be idempotent
    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/diagnostic/answer')
      .set('Cookie', studentCookie)
      .send({
        attemptId,
        questionId,
        selectedOptionKey: 'B',
        timeSpentSeconds: 10
      })
      .expect(200);

    expect(replayRes.body.replayed).toBe(true);

    // 6. Finalize Diagnostic Test (POST /diagnostic/submit/:id)
    const finishRes = await request(app.getHttpServer())
      .post(`/api/v1/diagnostic/submit/${attemptId}`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(finishRes.body.status).toBe('COMPLETED');
    expect(finishRes.body.finalTheta).toBeDefined();

    // 7. Check Profile Mastery (GET /student/mastery)
    const masteryRes = await request(app.getHttpServer())
      .get('/api/v1/student/mastery')
      .set('Cookie', studentCookie)
      .expect(200);

    expect(masteryRes.body.averageMasteryScore).toBeDefined();
    expect(masteryRes.body.skills).toBeInstanceOf(Array);

    // 8. Check Learning Path (GET /student/learning-path)
    const pathRes = await request(app.getHttpServer())
      .get('/api/v1/student/learning-path')
      .set('Cookie', studentCookie)
      .expect(200);

    expect(pathRes.body.modules).toBeInstanceOf(Array);
    expect(pathRes.body.modules.length).toBeGreaterThan(0);

    // 9. Check Mistakes Notebook (GET /student/mistakes)
    const mistakesRes = await request(app.getHttpServer())
      .get('/api/v1/student/mistakes')
      .set('Cookie', studentCookie)
      .expect(200);

    expect(mistakesRes.body.mistakes).toBeInstanceOf(Array);
    if (mistakesRes.body.mistakes.length > 0) {
      const mistakeId = mistakesRes.body.mistakes[0].id;
      // Add note and toggle mastery
      await request(app.getHttpServer())
        .patch(`/api/v1/student/mistakes/${mistakeId}`)
        .set('Cookie', studentCookie)
        .send({ userNotes: 'Cần chú ý điều kiện x >= 0', isMastered: true })
        .expect(200);
    }
  });

  // ============================================================================
  // Scenario 2: Teacher End-to-End Flow
  // ============================================================================
  it('Scenario 2: Teacher Flow (Register -> Auto VERIFIED -> Manual Review Removed -> Create Class -> Invite Code -> Roster)', async () => {
    const teacherEmail = `tea_${runId}@adaptivemath.vn`;

    // 1. Register automatically verified teacher
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/teacher')
      .send({
        email: teacherEmail,
        fullName: 'Cô Lê Hoàng Mai',
        password: 'P@ssword123!',
        schoolName: 'THCS Giảng Võ',
        city: 'Hà Nội'
      })
      .expect(201);

    const teacherId = regRes.body.id;
    createdUserIds.push(teacherId);
    expect(regRes.body.role).toBe(UserRole.TEACHER);

    // Login as teacher
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: teacherEmail, password: 'P@ssword123!' })
      .expect(200);

    const teacherCookie = getCookie(loginRes);

    // The system verifies teachers automatically. Manual approval route is removed.
    const profile=await prisma.teacherProfile.findUnique({where:{userId:teacherId}});
    expect(profile?.verificationStatus).toBe('VERIFIED');
    expect(profile?.verifiedAt).toBeTruthy();
    const adminLoginRes=await request(app.getHttpServer()).post('/api/v1/auth/login').send({identifier:'admin',password:'P@ssword123!'}).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/admin/teachers/${teacherId}/review`).set('Cookie',getCookie(adminLoginRes)).send({status:'VERIFIED'}).expect(404);
    const verifiedTeacherCookie=teacherCookie;

    const teacherMe = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', verifiedTeacherCookie)
      .expect(200);

    expect(teacherMe.body.user.role).toBe(UserRole.TEACHER);

    // 5. Verified Teacher creates Classroom (POST /classrooms)
    const classRes = await request(app.getHttpServer())
      .post('/api/v1/classrooms')
      .set('Cookie', verifiedTeacherCookie)
      .send({ name: 'Lớp 9A - Ôn thi vào 10', grade: 9, academicYear: '2026-2027' })
      .expect(201);

    const classId = classRes.body.classroom.id;
    createdClassIds.push(classId);
    expect(classRes.body.classroom.name).toBe('Lớp 9A - Ôn thi vào 10');

    // 6. Teacher generates Crockford Base32 invite code (POST /classrooms/:id/invite-codes)
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/classrooms/${classId}/invite-codes`)
      .set('Cookie', verifiedTeacherCookie)
      .send({ maxUses: 30, expiresInDays: 14 })
      .expect(201);

    expect(inviteRes.body.plainCode).toBeDefined();
    expect(inviteRes.body.plainCode.length).toBe(8);
    const plainCode = inviteRes.body.plainCode;

    // 7. A student joins the class using the plain Crockford code (POST /classrooms/join)
    const studentUsername = `stu_join_${runId}`.slice(0, 30);
    const stuReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({ username: studentUsername, fullName: 'Học sinh vào lớp', password: 'P@ssword123!' })
      .expect(201);
    createdUserIds.push(stuReg.body.id);

    const stuLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: studentUsername, password: 'P@ssword123!' })
      .expect(200);
    const stuCookie = getCookie(stuLogin);

    const joinRes = await request(app.getHttpServer())
      .post('/api/v1/classrooms/join')
      .set('Cookie', stuCookie)
      .send({ code: plainCode })
      .expect(200);

    expect(joinRes.body.classroom.name).toBe('Lớp 9A - Ôn thi vào 10');

    // 8. Teacher views student roster (GET /classrooms/:id/students)
    // Verifies Gate 0 D-04 data privacy: Teacher can see roster, but NOT individual mistake notes
    const rosterRes = await request(app.getHttpServer())
      .get(`/api/v1/classrooms/${classId}/students`)
      .set('Cookie', verifiedTeacherCookie)
      .expect(200);

    expect(rosterRes.body).toBeInstanceOf(Array);
    expect(rosterRes.body.length).toBe(1);
    expect(rosterRes.body[0].fullName).toBe('Học sinh vào lớp');
    expect(rosterRes.body[0].mistakeRecords).toBeUndefined(); // Privacy Guard: D-04 compliant!
  });

  // ============================================================================
  // Scenario 3: Maker-Checker & Question Moderation Flow
  // ============================================================================
  it('Scenario 3: Maker-Checker (Author creates DRAFT -> Self-review FORBIDDEN -> Reviewer approves -> Audit Log recorded)', async () => {
    // 1. Create Author with CONTENT_AUTHOR role
    const authorUsername = `aut_${runId}`.slice(0, 30);
    const authorReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({ username: authorUsername, fullName: 'Tác giả nội dung', password: 'P@ssword123!' })
      .expect(201);
    const authorId = authorReg.body.id;
    createdUserIds.push(authorId);

    await prisma.user.update({
      where: { id: authorId },
      data: { role: UserRole.CONTENT_AUTHOR }
    });

    const authorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: authorUsername, password: 'P@ssword123!' })
      .expect(200);
    const authorCookie = getCookie(authorLogin);

    // Get any existing skillId
    const skill = await prisma.skillNode.findFirst();
    expect(skill).toBeDefined();

    // 2. Author creates question in DRAFT status
    const createQRes = await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set('Cookie', authorCookie)
      .send({
        skillId: skill!.id,
        cognitiveLevel: 'APPLYING',
        content: `Đề bài kiểm chuẩn Maker-Checker E2E ${runId}`,
        explanation: 'Lời giải chi tiết từng bước',
        options: [
          { optionKey: 'A', content: '$x=1$', isCorrect: true },
          { optionKey: 'B', content: '$x=2$', isCorrect: false },
          { optionKey: 'C', content: '$x=3$', isCorrect: false },
          { optionKey: 'D', content: '$x=4$', isCorrect: false }
        ]
      })
      .expect(201);

    const questionId = createQRes.body.question.id;
    createdQuestionIds.push(questionId);
    expect(createQRes.body.question.status).toBe(QuestionStatus.DRAFT);
    expect(createQRes.body.question.authorId).toBe(authorId);

    // 3. Author attempts to self-approve question -> STRICTLY FORBIDDEN (403 MAKER_CHECKER_VIOLATION)
    const selfReviewRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/questions/${questionId}/review`)
      .set('Cookie', authorCookie)
      .send({ status: 'PUBLISHED' })
      .expect(403);

    expect(selfReviewRes.body.code).toBe('MAKER_CHECKER_VIOLATION');

    // 4. Admin (different user) reviews and approves question
    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'admin', password: 'P@ssword123!' })
      .expect(200);
    const adminCookie = getCookie(adminLogin);

    const approveQRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/questions/${questionId}/review`)
      .set('Cookie', adminCookie)
      .send({ status: 'PUBLISHED' })
      .expect(200);

    expect(approveQRes.body.question.status).toBe(QuestionStatus.PUBLISHED);
    expect(approveQRes.body.question.reviewerId).toBeDefined();
    expect(approveQRes.body.question.reviewerId).not.toBe(authorId);

    // 5. Verify Security Audit Log recorded in database
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        targetEntityId: questionId,
        action: 'QUESTION_REVIEWED'
      }
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.action).toBe('QUESTION_REVIEWED');
  });

  // ============================================================================
  // Scenario 4: Session Revocation Flow
  // ============================================================================
  it('Scenario 4: Session Revocation (Login 2 devices -> Revoke device 1 -> Immediate 401 on next request)', async () => {
    const username = `sess_user_${runId}`.slice(0, 30);
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({ username, fullName: 'Người dùng đa thiết bị', password: 'P@ssword123!' })
      .expect(201);
    createdUserIds.push(regRes.body.id);

    // Device 1 login
    const dev1Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')
      .send({ identifier: username, password: 'P@ssword123!' })
      .expect(200);
    const dev1Cookie = getCookie(dev1Login);

    // Device 2 login
    const dev2Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')
      .send({ identifier: username, password: 'P@ssword123!' })
      .expect(200);
    const dev2Cookie = getCookie(dev2Login);

    // Both devices are active
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', dev1Cookie).expect(200);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Cookie', dev2Cookie).expect(200);

    // Device 2 fetches sessions list
    const sessionsRes = await request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Cookie', dev2Cookie)
      .expect(200);

    expect(sessionsRes.body.sessions.length).toBeGreaterThanOrEqual(2);
    const dev1Session = sessionsRes.body.sessions.find((s: any) => !s.isCurrent);
    expect(dev1Session).toBeDefined();

    // Device 2 revokes Device 1's session
    await request(app.getHttpServer())
      .post(`/api/v1/auth/sessions/${dev1Session.id}/revoke`)
      .set('Cookie', dev2Cookie)
      .expect(200);

    // Device 1 sends next request -> IMMEDIATELY 401 UNAUTHORIZED!
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', dev1Cookie)
      .expect(401);

    // Device 2 remains authenticated
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', dev2Cookie)
      .expect(200);
  });
});
