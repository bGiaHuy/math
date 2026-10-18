import { requireTeacherCounts, validateTeacherPaper } from './teacher-paper';
import { DIAGNOSTIC_BLUEPRINT, DIAGNOSTIC_BLUEPRINT_VERSION, EXAM_QUESTION_COUNTS, requireBlueprintCounts, selectBlueprintPaper, validateBlueprintPaper } from '../diagnostic/diagnostic-blueprint';
import { requireQuestionLabels } from '../question/question-labels';
import { tracksTabSwitches, activityReport, deliveredQuestion, resultVisible, gradeDelivered } from './workspace-helpers';
import { buildQuestionData, validateQuestion, validateAnswer, gradeQuestion } from '../question/math-question';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { UserRole, AssignmentStatus, SubmissionStatus, QuestionStatus, CognitiveLevel } from '@prisma/client';
import { CustomQuestionDto } from './dto/create-assignment.dto';
import { RandomExamDto } from './dto/random-exam.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async randomPreview(teacherId: string, dto: RandomExamDto) {
    const counts = dto.questionCounts || EXAM_QUESTION_COUNTS;
    requireBlueprintCounts(counts);
    const skillIds = [...new Set(dto.skillIds?.length ? dto.skillIds : dto.skillId ? [dto.skillId] : [])];
    if (!skillIds.length) throw new BadRequestException('Hãy chọn ít nhất một chuyên đề để lấy đề từ ngân hàng.');
    const pool = await this.prisma.question.findMany({
      where: {
        skill: { grade: 9 },
        skillId: { in: skillIds },
        ...(dto.cognitiveLevel ? { cognitiveLevel: dto.cognitiveLevel } : {}),
        ...(dto.difficulty ? { difficulty: dto.difficulty } : {}),
        OR: [
          { status: QuestionStatus.PUBLISHED },
          { status: QuestionStatus.DRAFT, authorId: teacherId },
          { status: QuestionStatus.DRAFT, source: { path: ['reviewStatus'], equals: 'VERIFIED' } }
        ]
      },
      include: { skill: true, options: true }
    });
    const ids = selectBlueprintPaper(pool.filter(q => skillIds.includes(q.skillId)), randomUUID(), false);
    const questions = validateBlueprintPaper(ids.map(id => pool.find(q => q.id === id)!), false);
    return { questionIds: ids, questions, questionCounts: EXAM_QUESTION_COUNTS, blueprintVersion: DIAGNOSTIC_BLUEPRINT_VERSION };
  }

  // 1. Giáo viên tạo đề thi / bài tập cho lớp (hỗ trợ cả câu hỏi từ ngân hàng lẫn câu hỏi tự tạo / nhập từ AI)
  async createAssignment(teacherId: string, classId: string, dto: CreateAssignmentDto, role: UserRole = UserRole.TEACHER) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException({ code: 'CLASSROOM_READ_ONLY', message: 'Chỉ giáo viên phụ trách được thay đổi lớp học và bài tập.' });
    }
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId }
    });

    if (!classroom) {
      throw new NotFoundException({
        code: 'CLASSROOM_NOT_FOUND',
        message: 'Lớp học không tồn tại.'
      });
    }

    if (classroom.teacherId !== teacherId || !classroom.isActive) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Bạn chỉ có quyền tạo đề thi cho lớp do bạn phụ trách.'
      });
    }

    if (dto.settings?.documentId && !await this.prisma.examDocument.findFirst({ where: { id: dto.settings.documentId, ownerId: teacherId }, select: { id: true } })) throw new ForbiddenException('Tài liệu không thuộc giáo viên.');
    if (dto.settings?.resultsPolicy === 'AFTER_DUE' && !dto.dueDate) throw new BadRequestException('Cần hạn nộp để công bố sau hạn.');
    return this.prisma.$transaction(async (tx) => {
    const rawQuestionIds = Array.isArray(dto.questionIds) ? dto.questionIds.filter(Boolean) : [];
    const customQuestions = Array.isArray(dto.customQuestions) ? dto.customQuestions : [];

    if (rawQuestionIds.length === 0 && customQuestions.length === 0) {
      throw new BadRequestException({
        code: 'NO_QUESTIONS_PROVIDED',
        message: 'Đề thi phải có ít nhất 1 câu hỏi (chọn từ ngân hàng hoặc tự tạo).'
      });
    }

    // Verify all questionIds exist and are PUBLISHED
    if (rawQuestionIds.length > 0) {
      const questions = await tx.question.findMany({
        where: {
          id: { in: rawQuestionIds },
          OR: [{status: QuestionStatus.PUBLISHED},{status:QuestionStatus.DRAFT,authorId:teacherId},{status:QuestionStatus.DRAFT,source:{path:['reviewStatus'],equals:'VERIFIED'}}]
        }
      });

      if (questions.length !== rawQuestionIds.length) {
        throw new BadRequestException({
          code: 'INVALID_QUESTIONS',
          message: 'Một số câu hỏi được chọn không tồn tại hoặc chưa được duyệt (PUBLISHED).'
        });
      }
    }

    if (dto.questionCounts) requireTeacherCounts(dto.questionCounts);
    customQuestions.forEach(validateQuestion);
    if (new Set(rawQuestionIds).size !== rawQuestionIds.length) throw new BadRequestException('Câu hỏi bị trùng.');
    const selected = await tx.question.findMany({where:{id:{in:rawQuestionIds}}, include:{skill:true,options:true}});
    const skillIds = [...new Set(customQuestions.map(q => q.skillId).filter((id): id is string => !!id))];
    const skills = skillIds.length ? await tx.skillNode.findMany({ where: { id: { in: skillIds } } }) : [];
    const skillsById = new Map(skills.map(skill => [skill.id, skill]));
    const customWithSkills = customQuestions.map(cq => {
      if (!['EASY','MEDIUM','HARD','VERY_HARD'].includes(cq.difficulty)) throw new BadRequestException('Chọn độ khó cho mỗi câu hỏi.');
      const skill = cq.skillId ? skillsById.get(cq.skillId) : null;
      if (cq.skillId && !skill) throw new BadRequestException('Chuyên đề câu hỏi không tồn tại.');
      return { ...cq, skill };
    });
    validateTeacherPaper([...selected, ...customWithSkills]);
    const contents = [...selected.map(q=>q.content.trim()), ...customQuestions.map(q=>q.content.trim())];
    if (new Set(contents).size !== contents.length) throw new BadRequestException('Nội dung câu hỏi bị trùng.');
    if(dto.questionCounts) {
      const actual = {SINGLE_CHOICE:0,TRUE_FALSE:0,SHORT_ANSWER:0};
      [...selected,...customQuestions].forEach(q=>actual[q.questionType || 'SINGLE_CHOICE']++);
      if(Object.keys(actual).some(k=>actual[k]!==dto.questionCounts[k])) throw new BadRequestException('Số lượng từng loại không khớp câu đã chọn.');
    }
    const createdCustomQuestionIds: string[] = [];

    if (customQuestions.length > 0) {
      // Resolve the fallback once; bulk inserts avoid a network round trip per question/option.
      const fallbackSkillId = customQuestions.some(q => !q.skillId) ? (await tx.skillNode.upsert({
        where: { code: 'TEACHER-DOCUMENT-GENERAL' },
        create: { code: 'TEACHER-DOCUMENT-GENERAL', title: 'Nội dung tài liệu giáo viên', chapter: 'Tài liệu giáo viên', grade: 0, orderIndex: 0 },
        update: {}
      })).id : null;
      const rows = customQuestions.map(cq => {
        const id = randomUUID();
        createdCustomQuestionIds.push(id);
        const { options, ...questionData } = buildQuestionData({ ...cq, source: undefined });
        return {
          question: { id, skillId: cq.skillId || fallbackSkillId!, authorId: teacherId,
            cognitiveLevel: (cq.cognitiveLevel || 'UNDERSTANDING') as CognitiveLevel,
            difficulty: cq.difficulty, content: cq.content.trim(),
            explanation: cq.explanation?.trim() || null, status: QuestionStatus.DRAFT, ...questionData },
          options: options.create.map(option => ({ ...option, questionId: id }))
        };
      });
      await tx.question.createMany({ data: rows.map(row => row.question) });
      const options = rows.flatMap(row => row.options);
      if (options.length) await tx.questionOption.createMany({ data: options });
    }

    const allQuestionIds = [...rawQuestionIds, ...createdCustomQuestionIds];
    const paperRows = await tx.question.findMany({where:{id:{in:allQuestionIds}},include:{skill:true,options:true}});
    const paperById = new Map(paperRows.map(q => [q.id, q]));
    const orderedIds = validateTeacherPaper(allQuestionIds.map(id => paperById.get(id)!)).map(q => q.id);
    allQuestionIds.splice(0, allQuestionIds.length, ...orderedIds);

    const assignment = await tx.classroomAssignment.create({
      data: {
        classId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        durationMinutes: dto.durationMinutes,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.status || AssignmentStatus.PUBLISHED,
        settings: { ...(dto.settings ? JSON.parse(JSON.stringify(dto.settings)) : {}), paperVersion: 'teacher-flexible-v1' },
        questions: {
          createMany: { data: allQuestionIds.map((qid, idx) => ({
            questionId: qid,
            orderIndex: idx + 1,
            points: 1.0,
            snapshot: JSON.parse(JSON.stringify(paperById.get(qid)))
          })) }
        }
      },
      include: {
        questions: {
          include: {
            question: {
              include: {
                skill: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        }
      }
    });

    return {
      message: 'Tạo đề thi thành công',
      assignment: {
        id: assignment.id,
        classId: assignment.classId,
        title: assignment.title,
        description: assignment.description,
        durationMinutes: assignment.durationMinutes,
        dueDate: assignment.dueDate,
        status: assignment.status,
        questionCount: assignment.questions.length,
        createdAt: assignment.createdAt
      }
    };
    }, { maxWait: 10000, timeout: 30000 });
  }

  // 2. Lấy danh sách đề thi của lớp (Giáo viên hoặc Học sinh trong lớp)
  async getClassAssignments(userId: string, classId: string, isTeacher: boolean, role: UserRole = isTeacher ? UserRole.TEACHER : UserRole.STUDENT) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      include: {
        memberships: true
      }
    });

    if (!classroom) {
      throw new NotFoundException({
        code: 'CLASSROOM_NOT_FOUND',
        message: 'Lớp học không tồn tại.'
      });
    }

    if (isTeacher) {
      if (role !== UserRole.ADMIN && classroom.teacherId !== userId) {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'Bạn không có quyền xem lớp học này.'
        });
      }
    } else {
      const isMember = classroom.memberships.some(m => m.studentId === userId && m.status === 'ACTIVE');
      if (!isMember) {
        throw new ForbiddenException({
          code: 'ACCESS_DENIED',
          message: 'Bạn chưa tham gia lớp học này.'
        });
      }
    }

    const assignments = await this.prisma.classroomAssignment.findMany({
      where: {
        classId,
        ...(isTeacher ? {} : { status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] } })
      },
      include: {
        questions: true,
        submissions: isTeacher
          ? { where: {status: {not: SubmissionStatus.IN_PROGRESS}}, select: { id: true, studentId: true, score: true, submittedAt: true } }
          : { where: { studentId: userId, status: {not: SubmissionStatus.IN_PROGRESS} } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalStudents = classroom.memberships.length;

    return {
      assignments: assignments.map(a => {
        const studentSubmission = !isTeacher && a.submissions.length > 0 ? a.submissions[0] : null;
        const totalSubmissions = isTeacher ? a.submissions.length : 0;
        const avgScore = isTeacher && totalSubmissions > 0
          ? Number((a.submissions.reduce((acc, s) => acc + s.score, 0) / totalSubmissions).toFixed(1))
          : null;

        return {
          id: a.id,
          classId: a.classId,
          className: classroom.name,
          title: a.title,
          description: a.description,
          durationMinutes: a.durationMinutes,
          dueDate: a.dueDate,
          status: a.status,
          settings: isTeacher ? a.settings : undefined,
          resultsVisible: resultVisible(a),
          questionCount: a.questions.length,
          createdAt: a.createdAt,
          // Teacher stats
          totalStudents,
          totalSubmissions,
          averageScore: avgScore,
          // Student status
          isSubmitted: !!studentSubmission,
          studentScore: resultVisible(a) ? studentSubmission?.score ?? null : null,
          studentSubmittedAt: studentSubmission?.submittedAt ?? null
        };
      })
    };
  }

  // 3. Học sinh lấy đề thi để làm bài (ẨN ĐÁP ÁN ĐÚNG BẢO MẬT)
  async getAssignmentForTaking(studentId: string, assignmentId: string) {
    return this.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId}))`;
    const assignment = await tx.classroomAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        classroom: {
          include: {
            memberships: true
          }
        },
        questions: {
          include: {
            question: {
              include: {
                skill: true,
                options: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        },
        submissions: {
          where: { studentId }, include: {answers:true}
        }
      }
    });

    if (assignment?.questions) assignment.questions.forEach((aq: any) => { aq.question = deliveredQuestion(aq); });

    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Đề thi không tồn tại.'
      });
    }

    const isMember = assignment.classroom.memberships.some(
      m => m.studentId === studentId && m.status === 'ACTIVE'
    );
    if (!isMember) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Bạn chưa là thành viên của lớp học này.'
      });
    }

    if (assignment.status !== AssignmentStatus.PUBLISHED) {
      throw new BadRequestException({
        code: 'ASSIGNMENT_NOT_ACTIVE',
        message: 'Đề thi hiện đang đóng hoặc chưa phát hành.'
      });
    }

    if (!assignment.classroom.isActive || (assignment.dueDate && assignment.dueDate.getTime() < Date.now())) throw new BadRequestException('Đề thi đã đóng hoặc hết hạn.');
    const existingSubmission = await tx.assignmentSubmission.upsert({
      where:{assignmentId_studentId:{assignmentId,studentId}}, update:{},
      create:{assignmentId,studentId,status:SubmissionStatus.IN_PROGRESS,totalQuestions:assignment.questions.length}, include:{answers:true}
    });

    return {
      assignment: {
        id: assignment.id,
        classId: assignment.classId,
        className: assignment.classroom.name,
        title: assignment.title,
        description: assignment.description,
        durationMinutes: assignment.durationMinutes,
        dueDate: assignment.dueDate,
        isSubmitted: existingSubmission.status !== SubmissionStatus.IN_PROGRESS,
        startedAt: existingSubmission.startedAt,
        timeSpentSeconds: existingSubmission.timeSpentSeconds,
        draftAnswers: existingSubmission.answers.map(a=>({questionId:a.questionId,selectedOptionKey:a.selectedOptionKey,response:a.response})),
        studentScore: resultVisible(assignment) ? existingSubmission?.score ?? null : null,
        mode: (assignment.settings as any)?.mode || 'TEST',
        trackTabSwitches: tracksTabSwitches(assignment.settings),
        tabSwitchCount: activityReport(existingSubmission.activityEvents as any[] || []).count,
        document: (assignment.settings as any)?.documentId ? await tx.examDocument.findUnique({ where: { id: (assignment.settings as any).documentId }, select: { id: true, fileName: true, mimeType: true, size: true } }) : null,
        questions: assignment.questions.map(aq => ({
          id: aq.question.id,
          orderIndex: aq.orderIndex,
          content: aq.question.content,
          questionType: aq.question.questionType,
          answerInstructions: aq.question.questionType === 'SHORT_ANSWER' ? (aq.question.shortAnswer as any)?.instructions || ((aq.question.shortAnswer as any)?.mode === 'TEXT' ? 'Nhập câu trả lời bằng văn bản.' : 'Nhập số hoặc phân số, không kèm đơn vị hay ký hiệu %.') : undefined,
          statements: Array.isArray(aq.question.statements) ? (aq.question.statements as any[]).map(s=>({key:s.key,content:s.content})) : [],
          cognitiveLevel: aq.question.cognitiveLevel,
          skillTitle: aq.question.skill?.title || 'Chủ đề bài tập',
          chapter: aq.question.skill?.chapter || 'Lớp học',
          options: aq.question.options.map(opt => ({
            key: opt.optionKey,
            content: opt.content
            // Note: isCorrect is deliberately EXCLUDED here for exam integrity!
          }))
        }))
      }
    };
      });
  }

  // 4. Học sinh nộp bài thi — Tự động chấm điểm & Lưu lịch sử
  async submitAssignment(studentId: string, assignmentId: string, dto: SubmitAssignmentDto) {
    const assignment = await this.prisma.classroomAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        classroom: {
          include: { memberships: true }
        },
        questions: {
          include: {
            question: {
              include: {
                skill: true,
                options: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        },
        submissions: {
          where: { studentId }, include: {answers:true}
        }
      }
    });

    if (assignment?.questions) assignment.questions.forEach((aq: any) => { aq.question = deliveredQuestion(aq); });

    if (!assignment) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Đề thi không tồn tại.'
      });
    }

    const isMember = assignment.classroom.memberships.some(
      m => m.studentId === studentId && m.status === 'ACTIVE'
    );
    if (!isMember) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Bạn không thuộc lớp học này.'
      });
    }

    if (assignment.status !== AssignmentStatus.PUBLISHED || !assignment.classroom.isActive) {
      throw new BadRequestException({ code: 'ASSIGNMENT_NOT_ACTIVE', message: 'Đề thi hoặc lớp học đã đóng, không thể nộp bài.' });
    }
    if (assignment.dueDate && assignment.dueDate.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'ASSIGNMENT_EXPIRED', message: 'Đã hết hạn nộp bài.' });
    }

    const submission = await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId + ':' + studentId}))`;
      const latest = await tx.classroomAssignment.findUnique({ where: { id: assignmentId } });
      if (!latest || latest.status !== AssignmentStatus.PUBLISHED) throw new BadRequestException('Bài đã đóng.');
      if (latest.dueDate && latest.dueDate.getTime() < Date.now()) throw new BadRequestException('Đã hết hạn nộp bài.');
      assignment.settings = latest.settings;
      const refreshed = await tx.assignmentQuestion.findMany({ where: { assignmentId }, include: { question: { include: { options: true } } } });
      assignment.questions = refreshed.map((aq: any) => ({ ...aq, question: deliveredQuestion(aq) })) as any;
      const existing = await tx.assignmentSubmission.findUnique({where:{assignmentId_studentId:{assignmentId,studentId}}});
      if(existing && existing.status !== SubmissionStatus.IN_PROGRESS) throw new BadRequestException({code:'ALREADY_SUBMITTED',message:'Bạn đã nộp bài thi này rồi.'});
      const expired = existing && assignment.durationMinutes > 0 && Date.now() > existing.startedAt.getTime() + assignment.durationMinutes * 60000 + 5000;
      const saved = expired ? await tx.submissionAnswer.findMany({where:{submissionId:existing.id}}) : null;
      const answersMap = this.answerMap(assignment.questions, saved || dto.answers);
      const records = assignment.questions.map(aq=>{
        const a=answersMap.get(aq.questionId);
        const grade=gradeDelivered(aq.question,a,aq.points);
        return {questionId:aq.questionId,selectedOptionKey:(a?.selectedOptionKey || a?.selectedOption || '').trim().toUpperCase() || null,response:a?.response || {},...grade};
      });
      const awarded=records.reduce((n,a)=>n+a.pointsAwarded,0);
      const possible=assignment.questions.reduce((n,a)=>n+a.points,0);
      return tx.assignmentSubmission.upsert({
        where:{assignmentId_studentId:{assignmentId,studentId}},
        create:{assignmentId,studentId,score:Number((awarded/possible*10).toFixed(1)),totalQuestions:records.length,correctCount:records.filter(a=>a.isCorrect).length,status:SubmissionStatus.SUBMITTED,submittedAt:new Date(),timeSpentSeconds:dto.timeSpentSeconds,answers:{create:records}},
        update:{score:Number((awarded/possible*10).toFixed(1)),totalQuestions:records.length,correctCount:records.filter(a=>a.isCorrect).length,status:SubmissionStatus.SUBMITTED,submittedAt:new Date(),timeSpentSeconds:Math.max(dto.timeSpentSeconds,existing?.timeSpentSeconds||0),answers:{deleteMany:{},create:records}},
        include:{answers:true}
      });
    });
    const wrongQuestionsToRecord = submission.answers.filter(a=>!a.isCorrect);
    const finalScore=submission.score, correctCount=submission.correctCount, totalQuestions=submission.totalQuestions;

    // Auto-record wrong questions to student Mistake Notebook
    for (const w of wrongQuestionsToRecord) {
      try {
        await this.prisma.mistakeRecord.upsert({
          where: {
            studentId_questionId: {
              studentId,
              questionId: w.questionId
            }
          },
          update: {
            selectedOptionKey: w.selectedOptionKey,
            isMastered: false,
            updatedAt: new Date()
          },
          create: {
            studentId,
            questionId: w.questionId,
            selectedOptionKey: w.selectedOptionKey,
            isMastered: false
          }
        });
      } catch (err) {
        // Silently continue if mistake recording fails
      }
    }

    return {
      message: 'Nộp bài thi thành công',
      submissionId: submission.id,
      score: resultVisible(assignment) ? finalScore : null,
      correctCount: resultVisible(assignment) ? correctCount : null,
      totalQuestions,
      submittedAt: submission.submittedAt
    };
  }

  private answerMap(questions: any[], answers: any[]) {
    const map=new Map<string,any>();
    for(const a of answers || []) {
      const aq=questions.find(q=>q.questionId===a.questionId);
      const q=aq ? deliveredQuestion(aq) : null;
      if(!q || map.has(a.questionId)) throw new BadRequestException('Câu trả lời trùng hoặc không thuộc đề.');
      validateAnswer(q,a); map.set(a.questionId,a);
    }
    return map;
  }

  async saveDraft(studentId:string,assignmentId:string,dto:SubmitAssignmentDto) {
    const taking = await this.getAssignmentForTaking(studentId,assignmentId);
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId + ':' + studentId}))`;
      const sub=await tx.assignmentSubmission.findUnique({where:{assignmentId_studentId:{assignmentId,studentId}}});
      if(!sub || sub.status!==SubmissionStatus.IN_PROGRESS) throw new BadRequestException('Bài đã nộp, không thể lưu nháp.');
      if(taking.assignment.durationMinutes > 0 && Date.now() > sub.startedAt.getTime() + taking.assignment.durationMinutes * 60000 + 5000) throw new BadRequestException({code:'ASSIGNMENT_TIME_EXPIRED',message:'Đã hết thời gian làm bài. Hãy nộp bài đã lưu.'});
      const questions=await tx.assignmentQuestion.findMany({where:{assignmentId},include:{question:{include:{options:true}}}});
      const map=this.answerMap(questions,dto.answers);
      await tx.assignmentSubmission.update({where:{id:sub.id},data:{timeSpentSeconds:Math.max(sub.timeSpentSeconds,dto.timeSpentSeconds),answers:{deleteMany:{},create:[...map.values()].map(a=>({questionId:a.questionId,selectedOptionKey:(a.selectedOptionKey || a.selectedOption || '').trim().toUpperCase() || null,response:a.response || {}}))}}});
      return {savedAt:new Date().toISOString()};
    });
  }

  // 5. Học sinh xem kết quả và lời giải chi tiết sau khi nộp
  async getStudentAssignmentResult(studentId: string, assignmentId: string) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId
        }
      },
      include: {
        assignment: {
          include: {
            classroom: true,
            questions: {
              include: {
                question: {
                  include: {
                    skill: true,
                    options: true
                  }
                }
              },
              orderBy: { orderIndex: 'asc' }
            }
          }
        },
        answers: true
      }
    });

    if (!submission || submission.status === SubmissionStatus.IN_PROGRESS) {
      throw new NotFoundException({
        code: 'SUBMISSION_NOT_FOUND',
        message: 'Chưa có kết quả làm bài cho đề thi này.'
      });
    }

    if (!resultVisible(submission.assignment)) return { result: { assignmentTitle: submission.assignment.title, className: submission.assignment.classroom.name, pendingPublication: true, questions: [], score: null, totalQuestions: submission.totalQuestions } };
    submission.assignment.questions.forEach((aq: any) => { aq.question = deliveredQuestion(aq); });
    const showSolutions = (submission.assignment.settings as any)?.showSolutions !== false;
    const answersMap = new Map(submission.answers.map(a => [a.questionId, a]));

    return {
      result: {
        submissionId: submission.id,
        assignmentTitle: submission.assignment.title,
        resultsUpdated: submission.assignment.revision > 1,
        showSolutions,
        className: submission.assignment.classroom.name,
        score: submission.score,
        correctCount: submission.correctCount,
        totalQuestions: submission.totalQuestions,
        submittedAt: submission.submittedAt,
        timeSpentSeconds: submission.timeSpentSeconds,
        questions: submission.assignment.questions.map(aq => {
          const q = aq.question;
          const ans = answersMap.get(q.id);
          const correctOption = q.options.find(o => o.isCorrect);

          return {
            id: q.id,
            orderIndex: aq.orderIndex,
            content: q.content,
            cognitiveLevel: q.cognitiveLevel,
            skillTitle: q.skill?.title || 'Chủ đề bài tập',
            chapter: q.skill?.chapter || 'Lớp học',
            explanation: showSolutions ? q.explanation : null,
            gradingMode: (q as any).gradingMode || 'NORMAL',
            questionType:q.questionType, statements:showSolutions ? q.statements : (q.statements as any[] || []).map(({isCorrect, ...st}: any) => st), shortAnswer:showSolutions ? q.shortAnswer : null,
            response:ans?.response || {}, gradingDetails:showSolutions ? ans?.gradingDetails || {} : {}, pointsAwarded:ans?.pointsAwarded || 0,
            studentSelectedKey: ans?.selectedOptionKey || null,
            isCorrect: ans?.isCorrect || false,
            correctOptionKey: showSolutions ? correctOption?.optionKey || '' : '',
            options: q.options.map(opt => ({
              key: opt.optionKey,
              content: opt.content,
              isCorrect: showSolutions ? opt.isCorrect : undefined
            }))
          };
        })
      }
    };
  }

  // 6. Giáo viên xem bảng điểm lớp học và phân tích từng câu hỏi
  async getAssignmentSubmissionsForTeacher(teacherId: string, classId: string, assignmentId: string, role: UserRole = UserRole.TEACHER) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      include: {
        memberships: {
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                username: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!classroom) {
      throw new NotFoundException({
        code: 'CLASSROOM_NOT_FOUND',
        message: 'Lớp học không tồn tại.'
      });
    }

    if ((role !== UserRole.ADMIN && classroom.teacherId !== teacherId)) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Bạn chỉ có quyền xem bảng điểm của lớp do bạn phụ trách.'
      });
    }

    const assignment = await this.prisma.classroomAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        questions: {
          include: {
            question: {
              include: {
                skill: true,
                options: true
              }
            }
          },
          orderBy: { orderIndex: 'asc' }
        },
        submissions: {
          where:{status:{not:SubmissionStatus.IN_PROGRESS}},
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                username: true,
                email: true
              }
            },
            answers: true
          },
          orderBy: { score: 'desc' }
        }
      }
    });

    if (!assignment || assignment.classId !== classId) {
      throw new NotFoundException({
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Đề thi không tồn tại trong lớp này.'
      });
    }

    const submissionsMap = new Map(assignment.submissions.map(s => [s.studentId, s]));

    // Roster with scores
    const roster = classroom.memberships.map(m => {
      const sub = submissionsMap.get(m.studentId);
      return {
        studentId: m.studentId,
        fullName: m.student.fullName,
        username: m.student.username,
        email: m.student.email,
        isSubmitted: !!sub,
        score: sub?.score ?? null,
        correctCount: sub?.correctCount ?? null,
        totalQuestions: sub?.totalQuestions ?? assignment.questions.length,
        timeSpentSeconds: sub?.timeSpentSeconds ?? null,
        submittedAt: sub?.submittedAt ?? null
      };
    });

    // Per-question accuracy analytics across the class
    const questionAnalytics = assignment.questions.map(aq => {
      const q = aq.question;
      const correctOption = q.options.find(o => o.isCorrect);
      let correctAnswersInClass = 0;
      let totalAnswersInClass = 0;

      for (const sub of assignment.submissions) {
        const studentAns = sub.answers.find(a => a.questionId === q.id);
        if (studentAns) {
          totalAnswersInClass += 1;
          if (studentAns.isCorrect) correctAnswersInClass += 1;
        }
      }

      const passRate = totalAnswersInClass > 0
        ? Math.round((correctAnswersInClass / totalAnswersInClass) * 100)
        : 0;

      return {
        questionId: q.id,
        orderIndex: aq.orderIndex,
        content: q.content,
        cognitiveLevel: q.cognitiveLevel,
        skillTitle: q.skill.title,
        chapter: q.skill.chapter,
        correctOptionKey: correctOption?.optionKey || '',
        totalAnswers: totalAnswersInClass,
        correctAnswers: correctAnswersInClass,
        accuracyPercentage: passRate
      };
    });

    const submittedCount = assignment.submissions.length;
    const avgScore = submittedCount > 0
      ? Number((assignment.submissions.reduce((acc, s) => acc + s.score, 0) / submittedCount).toFixed(1))
      : 0;

    return {
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        durationMinutes: assignment.durationMinutes,
        dueDate: assignment.dueDate,
        status: assignment.status,
        totalStudents: classroom.memberships.length,
        submittedCount,
        averageScore: avgScore
      },
      roster,
      questionAnalytics
    };
  }

  // 7. Giáo viên xóa đề thi
  async deleteAssignment(teacherId: string, classId: string, assignmentId: string, role: UserRole = UserRole.TEACHER) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException({ code: 'CLASSROOM_READ_ONLY', message: 'Chỉ giáo viên phụ trách được thay đổi lớp học và bài tập.' });
    }
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId }
    });

    if (!classroom || classroom.teacherId !== teacherId) {
      throw new ForbiddenException({
        code: 'ACCESS_DENIED',
        message: 'Bạn không có quyền xóa đề thi này.'
      });
    }

    const assignment = await this.prisma.classroomAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment || assignment.classId !== classId) {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'Đề thi không tồn tại trong lớp này.' });
    }
    await this.prisma.classroomAssignment.delete({
      where: { id: assignmentId, classId }
    });

    return { message: 'Đã xóa đề thi thành công.' };
  }

  // 8. Cung cấp file đề thi mẫu theo chuẩn GDPT 2018
  async getSampleExamTemplate() {
    const skills = await this.prisma.skillNode.findMany({ where: { grade: 9 } });
    return {
      title: 'Đề tổng hợp Toán 9', description: 'Mẫu điền nội dung theo ma trận. Điền đầy đủ câu hỏi, lời giải và đáp án trước khi lưu.',
      durationMinutes: 45, blueprintVersion: DIAGNOSTIC_BLUEPRINT_VERSION, questionCounts: EXAM_QUESTION_COUNTS,
      questions: DIAGNOSTIC_BLUEPRINT.map(slot => ({
        skillId: skills.find(s => s.code === slot.skillCode)?.id || '', questionType: slot.questionType,
        cognitiveLevel: slot.cognitiveLevel, difficulty: slot.difficulty, content: '', explanation: '',
        ...(slot.questionType === 'SINGLE_CHOICE' ? { options: ['A','B','C','D'].map(key => ({ key, content: '' })), correctOption: '' } :
          slot.questionType === 'TRUE_FALSE' ? { statements: ['a','b','c','d'].map(key => ({ key, content: '', isCorrect: false })) } :
          { shortAnswer: { mode: 'NUMERIC', acceptedAnswers: [], instructions: '', tolerance: 1e-9 } })
      }))
    };
  }
}
