import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';

describe('Classroom and Crockford Code Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  
  // Test accounts
  let verifiedTeacherId: string;
  let verifiedTeacherCookie: string;
  let otherTeacherId: string;
  let otherTeacherCookie: string;
  let unverifiedTeacherId: string;
  let unverifiedTeacherCookie: string;
  let studentId: string;
  let studentCookie: string;

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

    // 1. Setup Verified Teacher
    const vtEmail = `vt_${suffix}@test.adaptivemath.local`;
    const vtReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/teacher')
      .send({
        email: vtEmail,
        fullName: 'Giáo viên Verified',
        password: 'P@ssword123!',
        schoolName: 'THCS Thử Nghiệm'
      });
    verifiedTeacherId = vtReg.body.id;
    // Elevate to TEACHER & VERIFIED
    await prisma.user.update({
      where: { id: verifiedTeacherId },
      data: { role: 'TEACHER' }
    });
    await prisma.teacherProfile.update({
      where: { userId: verifiedTeacherId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() }
    });
    const vtLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: vtEmail, password: 'P@ssword123!' });
    verifiedTeacherCookie = vtLogin.headers['set-cookie'][0].split(';')[0];

    // 2. Setup Other Verified Teacher (for cross-scope test)
    const otEmail = `ot_${suffix}@test.adaptivemath.local`;
    const otReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/teacher')
      .send({
        email: otEmail,
        fullName: 'Giáo viên Khác',
        password: 'P@ssword123!',
        schoolName: 'THCS Khác'
      });
    otherTeacherId = otReg.body.id;
    await prisma.user.update({
      where: { id: otherTeacherId },
      data: { role: 'TEACHER' }
    });
    await prisma.teacherProfile.update({
      where: { userId: otherTeacherId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() }
    });
    const otLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: otEmail, password: 'P@ssword123!' });
    otherTeacherCookie = otLogin.headers['set-cookie'][0].split(';')[0];

    // 3. Setup Unverified Teacher Applicant
    const utEmail = `ut_${suffix}@test.adaptivemath.local`;
    const utReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/teacher')
      .send({
        email: utEmail,
        fullName: 'Giáo viên Chưa Duyệt',
        password: 'P@ssword123!',
        schoolName: 'THCS Chờ Duyệt'
      });
    unverifiedTeacherId = utReg.body.id;
    const utLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: utEmail, password: 'P@ssword123!' });
    unverifiedTeacherCookie = utLogin.headers['set-cookie'][0].split(';')[0];
    // Registration now auto-approves teachers; explicitly model an unverified profile.
    await prisma.teacherProfile.update({ where: { userId: unverifiedTeacherId }, data: { verificationStatus: 'PENDING_REVIEW', verifiedAt: null } });

    // 4. Setup Student
    const stReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username: `st_${suffix}`.slice(0, 30),
        email: `st_${suffix}@test.adaptivemath.local`,
        fullName: 'Học sinh Lớp 9',
        password: 'P@ssword123!'
      });
    studentId = stReg.body.id;
    const stLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: `st_${suffix}`.slice(0, 30), password: 'P@ssword123!' });
    studentCookie = stLogin.headers['set-cookie'][0].split(';')[0];
  });

  afterAll(async () => {
    const ids = [verifiedTeacherId, otherTeacherId, unverifiedTeacherId, studentId].filter(Boolean);
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    }
    await app.close();
  });

  it('rejects unverified teacher from creating classrooms (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/classrooms')
      .set('Cookie', unverifiedTeacherCookie)
      .send({ name: 'Lớp học của GV chưa duyệt', grade: 9 })
      .expect(403);
  });

  it('allows verified teacher to create classroom with Crockford code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/classrooms')
      .set('Cookie', verifiedTeacherCookie)
      .send({ name: 'Toán 9A1 Ôn Thi Vào 10', grade: 9, academicYear: '2026-2027' })
      .expect(201);

    expect(res.body.classroom).toBeDefined();
    expect(res.body.classroom.name).toBe('Toán 9A1 Ôn Thi Vào 10');
    expect(res.body.classroom.inviteCode).toBeDefined();
    expect(res.body.classroom.inviteCode).toHaveLength(8);
    // Crockford characters exclude I, L, O, U
    expect(/^[0-9A-HJKMNP-TV-Z]{8}$/.test(res.body.classroom.inviteCode)).toBe(true);

    const classId = res.body.classroom.id;
    const inviteCode = res.body.classroom.inviteCode;

    // Student joins classroom with the Crockford code
    const joinRes = await request(app.getHttpServer())
      .post('/api/v1/classrooms/join')
      .set('Cookie', studentCookie)
      .send({ code: inviteCode })
      .expect(200);

    expect(joinRes.body.classroom.id).toBe(classId);

    // Duplicate join attempt rejected with 409
    await request(app.getHttpServer())
      .post('/api/v1/classrooms/join')
      .set('Cookie', studentCookie)
      .send({ code: inviteCode })
      .expect(409);

    // Cross-teacher access blocked with 403 FORBIDDEN_SCOPE
    await request(app.getHttpServer())
      .get(`/api/v1/classrooms/${classId}`)
      .set('Cookie', otherTeacherCookie)
      .expect(403);

    // Owner teacher gets classroom details with student list
    const details = await request(app.getHttpServer())
      .get(`/api/v1/classrooms/${classId}`)
      .set('Cookie', verifiedTeacherCookie)
      .expect(200);

    expect(details.body.students).toHaveLength(1);
    expect(details.body.students[0].studentId).toBe(studentId);

    // Revoke invite code
    const codeId = details.body.inviteCodes[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/classrooms/${classId}/invite-codes/${codeId}/revoke`)
      .set('Cookie', verifiedTeacherCookie)
      .expect(200);

    // Revoked code cannot be used to join
    const secondStudentReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username: `st2_${suffix}`.slice(0, 30),
        email: `st2_${suffix}@test.adaptivemath.local`,
        fullName: 'Học sinh 2',
        password: 'P@ssword123!'
      });
    const st2Login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: `st2_${suffix}`.slice(0, 30), password: 'P@ssword123!' });
    const st2Cookie = st2Login.headers['set-cookie'][0].split(';')[0];

    await request(app.getHttpServer())
      .post('/api/v1/classrooms/join')
      .set('Cookie', st2Cookie)
      .send({ code: inviteCode })
      .expect(400);

    await prisma.user.delete({ where: { id: secondStudentReg.body.id } }).catch(() => undefined);
  });
});
