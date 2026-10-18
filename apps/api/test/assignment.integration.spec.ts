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

describe('Classroom Assignment & Admin Management Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  let teacherId: string;
  let teacherCookie: string;
  let studentId: string;
  let studentCookie: string;
  let adminId: string;
  let adminCookie: string;
  let classId: string;
  let question1Id: string;
  let question2Id: string;
  let assignmentId: string;

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
    const tEmail = `teacher_${suffix}@test.adaptivemath.local`;
    const tReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/teacher')
      .send({
        email: tEmail,
        fullName: 'Thầy Giáo Viên',
        password: 'P@ssword123!',
        schoolName: 'THCS Giảng Võ'
      });
    teacherId = tReg.body.id;
    await prisma.user.update({
      where: { id: teacherId },
      data: { role: UserRole.TEACHER }
    });
    await prisma.teacherProfile.update({
      where: { userId: teacherId },
      data: { verificationStatus: 'VERIFIED', verifiedAt: new Date() }
    });
    const tLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: tEmail, password: 'P@ssword123!' });
    teacherCookie = tLogin.headers['set-cookie'][0];

    // 2. Setup Student
    const sUsername = `stu_${suffix}`.slice(0, 30);
    const sEmail = `student_${suffix}@test.adaptivemath.local`;
    const sReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username: sUsername,
        email: sEmail,
        fullName: 'Học Sinh Bài Thi',
        password: 'P@ssword123!'
      });
    studentId = sReg.body.id;
    const sLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: sUsername, password: 'P@ssword123!' });
    studentCookie = sLogin.headers['set-cookie'][0];

    // 3. Setup Admin
    const aUsername = `adm_${suffix}`.slice(0, 30);
    const aEmail = `admin_${suffix}@test.adaptivemath.local`;
    const adminReg = await request(app.getHttpServer())
      .post('/api/v1/auth/register/student')
      .send({
        username: aUsername,
        email: aEmail,
        fullName: 'Quản Trị Viên Test',
        password: 'P@ssword123!'
      });
    adminId = adminReg.body.id;
    await prisma.user.update({
      where: { id: adminId },
      data: { role: UserRole.ADMIN }
    });
    const admLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: aUsername, password: 'P@ssword123!' });
    adminCookie = admLogin.headers['set-cookie'][0].split(';')[0];

    // 4. Create sample published questions
    const skill = await prisma.skillNode.findFirst();
    const q1 = await prisma.question.create({
      data: {
        skillId: skill!.id,
        authorId: teacherId,
        status: QuestionStatus.PUBLISHED,
        content: 'Tính giá trị của \\sqrt{16}',
        explanation: 'Vì 4^2 = 16 nên \\sqrt{16} = 4.',
        options: {
          create: [
            { optionKey: 'A', content: '2', isCorrect: false },
            { optionKey: 'B', content: '4', isCorrect: true },
            { optionKey: 'C', content: '8', isCorrect: false },
            { optionKey: 'D', content: '16', isCorrect: false }
          ]
        }
      }
    });
    question1Id = q1.id;

    const q2 = await prisma.question.create({
      data: {
        skillId: skill!.id,
        authorId: teacherId,
        status: QuestionStatus.PUBLISHED,
        content: 'Căn bậc hai số học của 25 là:',
        explanation: 'Căn bậc hai số học của 25 là 5.',
        options: {
          create: [
            { optionKey: 'A', content: '-5', isCorrect: false },
            { optionKey: 'B', content: '5', isCorrect: true },
            { optionKey: 'C', content: '\\pm 5', isCorrect: false },
            { optionKey: 'D', content: '25', isCorrect: false }
          ]
        }
      }
    });
    question2Id = q2.id;

    // 5. Create Classroom & Student Joins
    const classRes = await request(app.getHttpServer())
      .post('/api/v1/classrooms')
      .set('Cookie', teacherCookie)
      .send({ name: 'Lớp 9A Test Đề', grade: 9, academicYear: '2026-2027' })
      .expect(201);
    classId = classRes.body.classroom.id;

    // Join student
    await prisma.classroomMembership.create({
      data: {
        classId,
        studentId,
        status: 'ACTIVE'
      }
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Scenario 1: Teacher creates an assignment and verifies list', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/classrooms/${classId}/assignments`)
      .set('Cookie', teacherCookie)
      .send({
        title: 'Kiểm tra 15 phút - Căn thức bậc hai',
        description: 'Làm bài trong 15 phút',
        durationMinutes: 15,
        dueDate: '2026-11-30T23:59:59.000Z',
        questionIds: [question1Id, question2Id]
      })
      .expect(201);

    expect(res.body.assignment.title).toBe('Kiểm tra 15 phút - Căn thức bậc hai');
    expect(res.body.assignment.questionCount).toBe(2);
    assignmentId = res.body.assignment.id;

    // Verify teacher assignment list
    const listRes = await request(app.getHttpServer())
      .get(`/api/v1/classrooms/${classId}/assignments`)
      .set('Cookie', teacherCookie)
      .expect(200);

    expect(listRes.body.assignments.length).toBeGreaterThan(0);
    expect(listRes.body.assignments[0].id).toBe(assignmentId);
    expect(listRes.body.assignments[0].totalStudents).toBe(1);
    expect(listRes.body.assignments[0].totalSubmissions).toBe(0);
  });

  it('Scenario 2: Student retrieves exam for taking (verifying NO leaked answers)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/assignments/${assignmentId}/take`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(res.body.assignment.title).toBe('Kiểm tra 15 phút - Căn thức bậc hai');
    expect(res.body.assignment.questions.length).toBe(2);

    // CRITICAL SECURITY CHECK: isCorrect MUST NOT be present in options!
    for (const q of res.body.assignment.questions) {
      for (const opt of q.options) {
        expect(opt).not.toHaveProperty('isCorrect');
      }
    }
  });

  it('Scenario 3: Student submits answers, receives auto-grade and mistake logging', async () => {
    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/assignments/${assignmentId}/submit`)
      .set('Cookie', studentCookie)
      .send({
        timeSpentSeconds: 420,
        answers: [
          { questionId: question1Id, selectedOptionKey: 'B' }, // Correct!
          { questionId: question2Id, selectedOptionKey: 'A' }  // Wrong!
        ]
      })
      .expect(200);

    expect(submitRes.body.correctCount).toBe(1);
    expect(submitRes.body.totalQuestions).toBe(2);
    expect(submitRes.body.score).toBe(5.0); // 1 out of 2 = 5.0 / 10

    // Verify wrong answer recorded in Mistake Notebook
    const mistake = await prisma.mistakeRecord.findUnique({
      where: {
        studentId_questionId: {
          studentId,
          questionId: question2Id
        }
      }
    });
    expect(mistake).not.toBeNull();
    expect(mistake!.selectedOptionKey).toBe('A');
  });

  it('Scenario 4: Student views full submission result with explanations', async () => {
    const resultRes = await request(app.getHttpServer())
      .get(`/api/v1/assignments/${assignmentId}/result`)
      .set('Cookie', studentCookie)
      .expect(200);

    const r = resultRes.body.result;
    expect(r.score).toBe(5.0);
    expect(r.questions.length).toBe(2);
    expect(r.questions[0].isCorrect).toBe(true);
    expect(r.questions[0].explanation).toContain('Vì 4^2 = 16');
    expect(r.questions[1].isCorrect).toBe(false);
    expect(r.questions[1].correctOptionKey).toBe('B');
  });

  it('Scenario 5: Teacher views class scoreboard and question-by-question analytics', async () => {
    const scoreRes = await request(app.getHttpServer())
      .get(`/api/v1/classrooms/${classId}/assignments/${assignmentId}/submissions`)
      .set('Cookie', teacherCookie)
      .expect(200);

    expect(scoreRes.body.assignment.submittedCount).toBe(1);
    expect(scoreRes.body.assignment.averageScore).toBe(5.0);
    expect(scoreRes.body.roster.length).toBe(1);
    expect(scoreRes.body.roster[0].isSubmitted).toBe(true);
    expect(scoreRes.body.roster[0].score).toBe(5.0);

    // Analytics: Q1 was 100% correct, Q2 was 0% correct
    expect(scoreRes.body.questionAnalytics[0].accuracyPercentage).toBe(100);
    expect(scoreRes.body.questionAnalytics[1].accuracyPercentage).toBe(0);
  });

  it('Mixed types: draft resume, partial credit, no pre-submit answer leaks and final immutability', async () => {
    const created=await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/assignments`).set('Cookie',teacherCookie).send({title:'Mixed types',durationMinutes:45,questionCounts:{SINGLE_CHOICE:1,TRUE_FALSE:1,SHORT_ANSWER:1},customQuestions:[
      {difficulty:'EASY',questionType:'SINGLE_CHOICE',content:'Mixed SC',options:['A','B','C','D'].map(key=>({key,content:key})),correctOption:'A'},
      {difficulty:'MEDIUM',questionType:'TRUE_FALSE',content:'Mixed TF',statements:['a','b','c','d'].map((key,i)=>({key,content:key,isCorrect:i%2===0}))},
      {difficulty:'HARD',questionType:'SHORT_ANSWER',content:'Mixed SA',shortAnswer:{mode:'NUMERIC',acceptedAnswers:['1/2'],instructions:'Nhập phân số hoặc số thập phân, không ghi đơn vị.'}}
    ]}).expect(201);
    const id=created.body.assignment.id;
    const take=await request(app.getHttpServer()).get(`/api/v1/assignments/${id}/take`).set('Cookie',studentCookie).expect(200);
    const qs=take.body.assignment.questions;
    expect(qs.map(q=>q.questionType)).toEqual(['SINGLE_CHOICE','TRUE_FALSE','SHORT_ANSWER']);
    expect(take.body.assignment.isSubmitted).toBe(false);
    expect(qs[1].statements[0]).not.toHaveProperty('isCorrect');
    expect(qs[2]).not.toHaveProperty('shortAnswer');
    expect(qs[2].answerInstructions).toBe('Nhập phân số hoặc số thập phân, không ghi đơn vị.');
    const answers=[{questionId:qs[0].id,selectedOptionKey:'A'},{questionId:qs[1].id,response:{trueFalseAnswers:{a:true,b:false,c:false,d:true}}},{questionId:qs[2].id,response:{shortAnswer:'0,5'}}];
    await request(app.getHttpServer()).post(`/api/v1/assignments/${id}/draft`).set('Cookie',studentCookie).send({timeSpentSeconds:10,answers}).expect(201);
    const resumed=await request(app.getHttpServer()).get(`/api/v1/assignments/${id}/take`).set('Cookie',studentCookie).expect(200);
    expect(resumed.body.assignment.draftAnswers).toHaveLength(3);
    expect(resumed.body.assignment.startedAt).toBe(take.body.assignment.startedAt);
    const studentList=await request(app.getHttpServer()).get(`/api/v1/classrooms/${classId}/assignments`).set('Cookie',studentCookie).expect(200);
    const draftItem=studentList.body.assignments.find(a=>a.id===id);
    expect(draftItem.isSubmitted).toBe(false); expect(draftItem.studentScore).toBeNull();
    const teacherList=await request(app.getHttpServer()).get(`/api/v1/classrooms/${classId}/assignments`).set('Cookie',teacherCookie).expect(200);
    expect(teacherList.body.assignments.find(a=>a.id===id).totalSubmissions).toBe(0);
    const scoreboard=await request(app.getHttpServer()).get(`/api/v1/classrooms/${classId}/assignments/${id}/submissions`).set('Cookie',teacherCookie).expect(200);
    expect(scoreboard.body.assignment.submittedCount).toBe(0);
    expect(scoreboard.body.roster[0].isSubmitted).toBe(false); expect(scoreboard.body.roster[0].score).toBeNull();
    await request(app.getHttpServer()).get(`/api/v1/assignments/${id}/result`).set('Cookie',studentCookie).expect(404);
    const submitted=await request(app.getHttpServer()).post(`/api/v1/assignments/${id}/submit`).set('Cookie',studentCookie).send({timeSpentSeconds:20,answers}).expect(200);
    expect(submitted.body.score).toBe(7.5);
    expect(submitted.body.correctCount).toBe(2);
    await request(app.getHttpServer()).post(`/api/v1/assignments/${id}/draft`).set('Cookie',studentCookie).send({timeSpentSeconds:21,answers:[]}).expect(400);
    const result=await request(app.getHttpServer()).get(`/api/v1/assignments/${id}/result`).set('Cookie',studentCookie).expect(200);
    expect(result.body.result.questions[1].pointsAwarded).toBe(0.25);
    expect(result.body.result.questions[2].response.shortAnswer).toBe('0,5');
    const notebook=await request(app.getHttpServer()).get('/api/v1/student/mistakes').set('Cookie',studentCookie).expect(200);
    const tfMistake=notebook.body.mistakes.find(m=>m.questionId===qs[1].id);
    expect(tfMistake.questionType).toBe('TRUE_FALSE');
    expect(tfMistake.response.trueFalseAnswers).toEqual(answers[1].response!.trueFalseAnswers);
    expect(tfMistake.pointsAwarded).toBe(0.25);
    const nextExam=await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/assignments`).set('Cookie',teacherCookie).send({title:'Notebook anti leak',durationMinutes:45,questionIds:[qs[1].id]}).expect(201);
    await request(app.getHttpServer()).get(`/api/v1/assignments/${nextExam.body.assignment.id}/take`).set('Cookie',studentCookie).expect(200);
    const hidden=await request(app.getHttpServer()).get('/api/v1/student/mistakes').set('Cookie',studentCookie).expect(200);
    expect(hidden.body.mistakes.some(m=>m.questionId===qs[1].id)).toBe(false);
  });

  it('Expired timed assignment grades persisted draft and rejects late edits', async () => {
    const created=await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/assignments`).set('Cookie',teacherCookie).send({title:'Timed expiry',durationMinutes:1,questionIds:[question1Id]}).expect(201);
    const id=created.body.assignment.id;
    await request(app.getHttpServer()).get(`/api/v1/assignments/${id}/take`).set('Cookie',studentCookie).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/assignments/${id}/draft`).set('Cookie',studentCookie).send({timeSpentSeconds:1,answers:[{questionId:question1Id,selectedOptionKey:'B'}]}).expect(201);
    await prisma.assignmentSubmission.update({where:{assignmentId_studentId:{assignmentId:id,studentId}},data:{startedAt:new Date(Date.now()-70000)}});
    await request(app.getHttpServer()).post(`/api/v1/assignments/${id}/draft`).set('Cookie',studentCookie).send({timeSpentSeconds:70,answers:[{questionId:question1Id,selectedOptionKey:'A'}]}).expect(400);
    const result=await request(app.getHttpServer()).post(`/api/v1/assignments/${id}/submit`).set('Cookie',studentCookie).send({timeSpentSeconds:70,answers:[{questionId:question1Id,selectedOptionKey:'A'}]}).expect(200);
    expect(result.body.score).toBe(10);
  });

  it('Scenario 6: Admin users management, status toggle & password reset', async () => {
    // 1. Get users list
    const usersRes = await request(app.getHttpServer())
      .get('/api/v1/admin/users')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(usersRes.body.total).toBeGreaterThan(0);
    expect(usersRes.body.users.some((u: any) => u.id === studentId)).toBe(true);

    // 2. Suspend student
    const suspendRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${studentId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    expect(suspendRes.body.user.status).toBe('SUSPENDED');

    // 3. Activate student back
    const activateRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${studentId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'ACTIVE' })
      .expect(200);

    expect(activateRes.body.user.status).toBe('ACTIVE');

    // 4. Reset password
    const resetRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/users/${studentId}/reset-password`)
      .set('Cookie', adminCookie)
      .send({ newPassword: 'NewSecurePassword123!' })
      .expect(200);

    expect(resetRes.body.tempPassword).toBe('NewSecurePassword123!');

    // 5. Check all classrooms
    const classRes = await request(app.getHttpServer())
      .get('/api/v1/admin/classrooms')
      .set('Cookie', adminCookie)
      .expect(200);

    expect(classRes.body.total).toBeGreaterThan(0);
  });

  it('Scenario 7: Sample template endpoint returns standard JSON schema for AI & teachers', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/assignments/sample-template')
      .set('Cookie', teacherCookie)
      .expect(200);

    expect(res.body).toHaveProperty('title');
    expect(res.body).toHaveProperty('description');
    expect(res.body).toHaveProperty('questions');
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeGreaterThan(0);

    const firstQ = res.body.questions[0];
    expect(firstQ).toHaveProperty('content');
    expect(firstQ).toHaveProperty('options');
    expect(firstQ).toHaveProperty('explanation');
    expect(firstQ.options.length).toBe(4);
    expect(firstQ.options[0]).toHaveProperty('key');
    expect(firstQ.options[0]).toHaveProperty('content');
  });

  it('Scenario 8: Teacher creates custom assignment with manual/AI questions', async () => {
    // Re-authenticate student because Scenario 6 reset student's password
    const sLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: `student_${suffix}@test.adaptivemath.local`, password: 'NewSecurePassword123!' });
    studentCookie = sLogin.headers['set-cookie'][0];

    const customRes = await request(app.getHttpServer())
      .post(`/api/v1/classrooms/${classId}/assignments`)
      .set('Cookie', teacherCookie)
      .send({
        title: 'Đề Custom Tự Soạn - Hình học 9',
        description: 'Đề thi giáo viên nhập trực tiếp kết hợp AI',
        durationMinutes: 20,
        dueDate: '2026-12-01T12:00:00.000Z',
        customQuestions: [
          {
            content: 'Tam giác ABC vuông tại A có AB = 3cm, AC = 4cm. Độ dài cạnh BC là:',
            options: [
              { key: 'A', content: '5cm', isCorrect: true },
              { key: 'B', content: '7cm', isCorrect: false },
              { key: 'C', content: '6cm', isCorrect: false },
              { key: 'D', content: '25cm', isCorrect: false }
            ],
            explanation: 'Áp dụng định lý Pythagoras: BC = \\sqrt{AB^2 + AC^2} = \\sqrt{9 + 16} = 5cm.',
            difficulty: 'MEDIUM',
            cognitiveLevel: 'APPLYING'
          },
          {
            content: 'Giá trị của \\sin 30^\\circ bằng:',
            options: [
              { key: 'A', content: '1', isCorrect: false },
              { key: 'B', content: '\\frac{1}{2}', isCorrect: true },
              { key: 'C', content: '\\frac{\\sqrt{3}}{2}', isCorrect: false },
              { key: 'D', content: '0', isCorrect: false }
            ],
            explanation: 'Theo bảng giá trị lượng giác cơ bản, \\sin 30^\\circ = 1/2.',
            difficulty: 'EASY',
            cognitiveLevel: 'REMEMBERING'
          }
        ]
      })
      .expect(201);

    expect(customRes.body.assignment.title).toBe('Đề Custom Tự Soạn - Hình học 9');
    expect(customRes.body.assignment.questionCount).toBe(2);

    const customAssignmentId = customRes.body.assignment.id;

    // Student retrieves the custom assignment
    const takeRes = await request(app.getHttpServer())
      .get(`/api/v1/assignments/${customAssignmentId}/take`)
      .set('Cookie', studentCookie)
      .expect(200);

    const qs = takeRes.body.assignment.questions;
    expect(qs.length).toBe(2);
    expect(qs[0].content).toContain('Tam giác ABC vuông tại A');
    expect(qs[0].options.length).toBe(4);
    // Ensure isCorrect is stripped for student
    for (const opt of qs[0].options) {
      expect(opt).not.toHaveProperty('isCorrect');
    }

    // Student submits answers using 'selectedOption' (the field that previously failed with 400 Bad Request)
    const subRes = await request(app.getHttpServer())
      .post(`/api/v1/assignments/${customAssignmentId}/submit`)
      .set('Cookie', studentCookie)
      .send({
        timeSpentSeconds: 300,
        answers: [
          { questionId: qs[0].id, selectedOption: 'a' }, // Note lowercase 'a', must normalize to 'A' and match isCorrect: true
          { questionId: qs[1].id, selectedOption: 'C' }  // Selected 'C', correct is 'B' -> incorrect
        ]
      })
      .expect(200);

    expect(subRes.body.correctCount).toBe(1);
    expect(subRes.body.totalQuestions).toBe(2);
    expect(subRes.body.score).toBe(5.0);

    // Verify submission result
    const resultRes = await request(app.getHttpServer())
      .get(`/api/v1/assignments/${customAssignmentId}/result`)
      .set('Cookie', studentCookie)
      .expect(200);

    expect(resultRes.body.result.score).toBe(5.0);
    expect(resultRes.body.result.questions[0].isCorrect).toBe(true);
    expect(resultRes.body.result.questions[1].isCorrect).toBe(false);
    expect(resultRes.body.result.questions[1].correctOptionKey).toBe('B');
  });

  it('Scenario 9: Hybrid assignment creation with both bank questionIds and customQuestions', async () => {
    const hybridRes = await request(app.getHttpServer())
      .post(`/api/v1/classrooms/${classId}/assignments`)
      .set('Cookie', teacherCookie)
      .send({
        title: 'Đề Hỗn Hợp (Ngân Hàng + AI/Custom)',
        durationMinutes: 25,
        dueDate: '2026-12-05T23:59:59.000Z',
        questionIds: [question1Id],
        customQuestions: [
          {
            content: 'Phương trình bậc nhất 2x - 4 = 0 có nghiệm là:',
            options: [
              { key: 'A', content: 'x = 2', isCorrect: true },
              { key: 'B', content: 'x = -2', isCorrect: false },
              { key: 'C', content: 'x = 4', isCorrect: false },
              { key: 'D', content: 'x = 0', isCorrect: false }
            ],
            explanation: '2x - 4 = 0 <=> 2x = 4 <=> x = 2.',
            difficulty: 'EASY',
            cognitiveLevel: 'UNDERSTANDING'
          }
        ]
      })
      .expect(201);

    expect(hybridRes.body.assignment.questionCount).toBe(2);
    expect(hybridRes.body.assignment.title).toBe('Đề Hỗn Hợp (Ngân Hàng + AI/Custom)');
  });
  it('persists result publication and regrade apply while preview and stale revision leave data unchanged', async () => {
    const route = `/api/v1/classrooms/${classId}/assignments/${assignmentId}`;
    const originalBank = await prisma.question.findMany({ where: { id: { in: [question1Id, question2Id] } }, include: { options: true }, orderBy: { id: 'asc' } });
    await request(app.getHttpServer()).post(`${route}/settings`).set('Cookie', teacherCookie).send({ resultsPolicy: 'MANUAL', published: false }).expect(201);
    const hidden = await request(app.getHttpServer()).get(`/api/v1/assignments/${assignmentId}/result`).set('Cookie', studentCookie).expect(200);
    expect(hidden.body.result.score).toBeNull();
    await request(app.getHttpServer()).post(`${route}/settings`).set('Cookie', teacherCookie).send({ published: true }).expect(201);
    const persisted = await prisma.classroomAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    expect(persisted.settings).toMatchObject({ resultsPolicy: 'MANUAL', published: true });
    const report = await request(app.getHttpServer()).get(`${route}/submissions`).set('Cookie', teacherCookie).expect(200);
    const changes = report.body.questions.map((q: any) => ({ id: q.id, questionType: q.questionType, difficulty: q.difficulty, content: q.content, explanation: q.explanation || '', points: q.points,
      options: q.options.map((o: any) => ({ key: o.optionKey, content: o.content })),
      correctOption: q.id === question1Id ? 'A' : q.options.find((o: any) => o.isCorrect).optionKey }));
    const before = await prisma.assignmentSubmission.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId, studentId } } });
    const beforeAudit = await prisma.auditLog.count({ where: { targetEntityId: assignmentId, action: 'ASSIGNMENT_REGRADED' } });
    const payload = { revision: report.body.assignment.revision, reason: 'Isolated regression test answer correction', questions: changes, apply: false };
    const preview = await request(app.getHttpServer()).post(`${route}/regrade`).set('Cookie', teacherCookie).send(payload).expect(201);
    expect(preview.body.applied).toBe(false);
    expect(preview.body.changes[0].score).not.toBe(before.score);
    expect((await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: before.id } })).score).toBe(before.score);
    expect((await prisma.classroomAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).revision).toBe(payload.revision);
    expect(await prisma.auditLog.count({ where: { targetEntityId: assignmentId, action: 'ASSIGNMENT_REGRADED' } })).toBe(beforeAudit);
    const applied = await request(app.getHttpServer()).post(`${route}/regrade`).set('Cookie', teacherCookie).send({ ...payload, apply: true }).expect(201);
    expect(applied.body.applied).toBe(true);
    expect(applied.body.revision).toBe(payload.revision + 1);
    expect((await prisma.assignmentSubmission.findUniqueOrThrow({ where: { id: before.id } })).score).toBe(preview.body.changes[0].score);
    expect(await prisma.auditLog.count({ where: { targetEntityId: assignmentId, action: 'ASSIGNMENT_REGRADED' } })).toBe(beforeAudit + 1);
    await request(app.getHttpServer()).post(`${route}/regrade`).set('Cookie', teacherCookie).send({ ...payload, apply: true }).expect(409);
    expect(await prisma.question.findMany({ where: { id: { in: [question1Id, question2Id] } }, include: { options: true }, orderBy: { id: 'asc' } })).toEqual(originalBank);
    const shown = await request(app.getHttpServer()).get(`/api/v1/assignments/${assignmentId}/result`).set('Cookie', studentCookie).expect(200);
    expect(shown.body.result.score).toBe(preview.body.changes[0].score);
  });

  it('admin observes classrooms but cannot change teacher/student workflow', async () => {
    const classes = await request(app.getHttpServer()).get('/api/v1/classrooms').set('Cookie', adminCookie).expect(200);
    expect(classes.body.some((c: any) => c.id === classId)).toBe(true);
    await request(app.getHttpServer()).get(`/api/v1/classrooms/${classId}`).set('Cookie', adminCookie).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/classrooms/${classId}/assignments`).set('Cookie', adminCookie).expect(200);
    const assignment = await prisma.classroomAssignment.findFirstOrThrow({ where: { classId } });
    await request(app.getHttpServer()).get(`/api/v1/classrooms/${classId}/assignments/${assignment.id}/submissions`).set('Cookie', adminCookie).expect(200);
    await request(app.getHttpServer()).post('/api/v1/classrooms').set('Cookie', adminCookie).send({ name: 'Forbidden' }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/invite-codes`).set('Cookie', adminCookie).send({}).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/invite-codes/any/revoke`).set('Cookie', adminCookie).send({}).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/assignments`).set('Cookie', adminCookie).send({ title: 'Forbidden', durationMinutes: 15, questionIds: [question1Id] }).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/classrooms/${classId}/assignments/${assignment.id}`).set('Cookie', adminCookie).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/assignments/${assignment.id}/submit`).set('Cookie', adminCookie).send({ answers: [] }).expect(403);
  });
  it('saves a full 22-question mixed document atomically with frozen answers', async () => {
    const customQuestions = Array.from({ length: 22 }, (_, i) => ({
      content: `Bulk paper question ${i + 1}`, difficulty: 'MEDIUM',
      ...(i < 12 ? { questionType: 'SINGLE_CHOICE', correctOption: 'B',
        options: ['A','B','C','D'].map(key => ({ key, content: `Option ${key}` })) }
      : i < 16 ? { questionType: 'TRUE_FALSE', statements: ['a','b','c','d'].map((key, j) => ({ key, content: `Statement ${key}`, isCorrect: j % 2 === 0 })) }
      : { questionType: 'SHORT_ANSWER', shortAnswer: { mode: 'NUMERIC', acceptedAnswers: ['2'], tolerance: 0 } })
    }));
    const res = await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/assignments`)
      .set('Cookie', teacherCookie).send({ title: '22-question document regression', durationMinutes: 45,
        questionCounts: { SINGLE_CHOICE: 12, TRUE_FALSE: 4, SHORT_ANSWER: 6 }, customQuestions }).expect(201);
    expect(res.body.assignment.questionCount).toBe(22);
    const rows = await prisma.assignmentQuestion.findMany({ where: { assignmentId: res.body.assignment.id }, orderBy: { orderIndex: 'asc' } });
    expect(rows).toHaveLength(22);
    expect((rows[0].snapshot as any).options.find((o: any) => o.isCorrect).optionKey).toBe('B');
    expect((rows[12].snapshot as any).statements).toEqual(customQuestions[12].statements);
    expect((rows[16].snapshot as any).shortAnswer.acceptedAnswers).toEqual(['2']);
    expect(new Set(rows.map(row => (row.snapshot as any).skillId)).size).toBe(1);
    const before = await prisma.question.count({ where: { authorId: teacherId } });
    await request(app.getHttpServer()).post(`/api/v1/classrooms/${classId}/assignments`).set('Cookie', teacherCookie)
      .send({ title: 'Invalid paper', durationMinutes: 45, customQuestions: [...customQuestions, customQuestions[0]] }).expect(400);
    expect(await prisma.question.count({ where: { authorId: teacherId } })).toBe(before);
  });

});
