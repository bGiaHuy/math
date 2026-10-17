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
import { randomInt } from 'crypto';

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async randomPreview(teacherId: string, dto: RandomExamDto) {
    const counts = dto.questionCounts || { SINGLE_CHOICE: 12, TRUE_FALSE: 4, SHORT_ANSWER: 6 };
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    if (!total || total > 200 || Object.values(counts).some(n => !Number.isInteger(n) || n < 0)) {
      throw new BadRequestException('Đề ngẫu nhiên cần từ 1 đến 200 câu, số lượng từng loại là số nguyên không âm.');
    }
    const pool = await this.prisma.question.findMany({
      where: {
        skill: { grade: 9 },
        ...(dto.skillId ? { skillId: dto.skillId } : {}),
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
    // Deduplicate source copies too, so the same question cannot appear twice in an exam.
    const seen = new Set<string>();
    const unique = pool.filter(q => {
      const key = q.content.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const questions: typeof pool = [];
    for (const type of ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] as const) {
      const candidates = unique.filter(q => q.questionType === type);
      if (candidates.length < counts[type]) {
        throw new BadRequestException({ code: 'INSUFFICIENT_QUESTION_BANK', message: `Ngân hàng chỉ có ${candidates.length} câu ${type} phù hợp, cần ${counts[type]}. Giảm số lượng hoặc mở rộng bộ lọc.`, questionType: type, available: candidates.length, requested: counts[type] });
      }
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = randomInt(i + 1); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      questions.push(...candidates.slice(0, counts[type]));
    }
    return { questionIds: questions.map(q => q.id), questions, questionCounts: counts };
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

    customQuestions.forEach(validateQuestion);
    if (new Set(rawQuestionIds).size !== rawQuestionIds.length) throw new BadRequestException('Câu hỏi bị trùng.');
    const selected = await tx.question.findMany({where:{id:{in:rawQuestionIds}}});
    const contents = [...selected.map(q=>q.content.trim()), ...customQuestions.map(q=>q.content.trim())];
    if (new Set(contents).size !== contents.length) throw new BadRequestException('Nội dung câu hỏi bị trùng.');
    if(dto.questionCounts) {
      const actual = {SINGLE_CHOICE:0,TRUE_FALSE:0,SHORT_ANSWER:0};
      [...selected,...customQuestions].forEach(q=>actual[q.questionType || 'SINGLE_CHOICE']++);
      if(Object.keys(actual).some(k=>actual[k]!==dto.questionCounts[k])) throw new BadRequestException('Số lượng từng loại không khớp câu đã chọn.');
    }
    const createdCustomQuestionIds: string[] = [];

    if (customQuestions.length > 0) {
      // Find or establish default SkillNode for custom questions
      let defaultSkillNode = classroom.grade
        ? await tx.skillNode.findFirst({ where: { grade: classroom.grade } })
        : null;
      if (!defaultSkillNode) {
        defaultSkillNode = await tx.skillNode.findFirst();
      }
      if (!defaultSkillNode) {
        defaultSkillNode = await tx.skillNode.upsert({
          where: { code: 'CUSTOM_TEACHER_EXAM' },
          update: {},
          create: {
            code: 'CUSTOM_TEACHER_EXAM',
            title: 'Câu hỏi đề kiểm tra giáo viên',
            grade: classroom.grade || 9,
            chapter: 'Đề kiểm tra giáo viên',
            orderIndex: 999
          }
        });
      }

      for (let i = 0; i < customQuestions.length; i++) {
        const cq = customQuestions[i];
        if (!cq.content || !cq.content.trim()) {
          throw new BadRequestException({
            code: 'INVALID_CUSTOM_QUESTION',
            message: `Câu hỏi số ${i + 1} không có nội dung.`
          });
        }
        // Determine cognitive level
        let level: CognitiveLevel = CognitiveLevel.REMEMBERING;
        const rawLevel = (cq.cognitiveLevel || '').toUpperCase();
        if (rawLevel.includes('ANALYZ') || rawLevel.includes('ADVANCED') || rawLevel.includes('VẬN DỤNG CAO')) {
          level = CognitiveLevel.ADVANCED_APPLYING;
        } else if (rawLevel.includes('THÔNG HIỂU') || rawLevel.includes('UNDERSTAND') || rawLevel.includes('COMPREHENSION')) {
          level = CognitiveLevel.UNDERSTANDING;
        } else if (rawLevel.includes('VẬN DỤNG') || rawLevel.includes('APPLY') || rawLevel.includes('APPLICATION')) {
          level = CognitiveLevel.APPLYING;
        }

        const skillId = cq.skillId || defaultSkillNode.id;

        const newQuestion = await tx.question.create({
          data: {
            skillId,
            authorId: teacherId,
            cognitiveLevel: level,
            difficulty: cq.difficulty,
            content: cq.content.trim(),
            explanation: cq.explanation?.trim() || null,
            status: QuestionStatus.DRAFT,
            ...buildQuestionData({...cq, source: undefined})
          }
        });
        createdCustomQuestionIds.push(newQuestion.id);
      }
    }

    const allQuestionIds = [...rawQuestionIds, ...createdCustomQuestionIds];
    const typeRows = await tx.question.findMany({where:{id:{in:allQuestionIds}},select:{id:true,questionType:true}});
    const ranks={SINGLE_CHOICE:0,TRUE_FALSE:1,SHORT_ANSWER:2};
    const rankMap=new Map(typeRows.map(q=>[q.id,ranks[q.questionType]]));
    allQuestionIds.sort((a,b)=>rankMap.get(a)!-rankMap.get(b)!);

    const assignment = await tx.classroomAssignment.create({
      data: {
        classId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        durationMinutes: dto.durationMinutes,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        status: dto.status || AssignmentStatus.PUBLISHED,
        questions: {
          create: allQuestionIds.map((qid, idx) => ({
            questionId: qid,
            orderIndex: idx + 1,
            points: 1.0
          }))
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
    });
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
        ...(isTeacher ? {} : { status: AssignmentStatus.PUBLISHED })
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
          questionCount: a.questions.length,
          createdAt: a.createdAt,
          // Teacher stats
          totalStudents,
          totalSubmissions,
          averageScore: avgScore,
          // Student status
          isSubmitted: !!studentSubmission,
          studentScore: studentSubmission?.score ?? null,
          studentSubmittedAt: studentSubmission?.submittedAt ?? null
        };
      })
    };
  }

  // 3. Học sinh lấy đề thi để làm bài (ẨN ĐÁP ÁN ĐÚNG BẢO MẬT)
  async getAssignmentForTaking(studentId: string, assignmentId: string) {
    const assignment = await this.prisma.classroomAssignment.findUnique({
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
    const existingSubmission = await this.prisma.assignmentSubmission.upsert({
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
        studentScore: existingSubmission?.score ?? null,
        questions: assignment.questions.map(aq => ({
          id: aq.question.id,
          orderIndex: aq.orderIndex,
          content: aq.question.content,
          questionType: aq.question.questionType,
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId + ':' + studentId}))`;
      const existing = await tx.assignmentSubmission.findUnique({where:{assignmentId_studentId:{assignmentId,studentId}}});
      if(existing && existing.status !== SubmissionStatus.IN_PROGRESS) throw new BadRequestException({code:'ALREADY_SUBMITTED',message:'Bạn đã nộp bài thi này rồi.'});
      const expired = existing && assignment.durationMinutes > 0 && Date.now() > existing.startedAt.getTime() + assignment.durationMinutes * 60000 + 5000;
      const saved = expired ? await tx.submissionAnswer.findMany({where:{submissionId:existing.id}}) : null;
      const answersMap = this.answerMap(assignment.questions, saved || dto.answers);
      const records = assignment.questions.map(aq=>{
        const a=answersMap.get(aq.questionId);
        const grade=gradeQuestion(aq.question,a,aq.points);
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
      score: finalScore,
      correctCount,
      totalQuestions,
      submittedAt: submission.submittedAt
    };
  }

  private answerMap(questions: any[], answers: any[]) {
    const map=new Map<string,any>();
    for(const a of answers || []) {
      const q=questions.find(q=>q.questionId===a.questionId)?.question;
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

    const answersMap = new Map(submission.answers.map(a => [a.questionId, a]));

    return {
      result: {
        submissionId: submission.id,
        assignmentTitle: submission.assignment.title,
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
            explanation: q.explanation,
            questionType:q.questionType, statements:q.statements, shortAnswer:q.shortAnswer,
            response:ans?.response || {}, gradingDetails:ans?.gradingDetails || {}, pointsAwarded:ans?.pointsAwarded || 0,
            studentSelectedKey: ans?.selectedOptionKey || null,
            isCorrect: ans?.isCorrect || false,
            correctOptionKey: correctOption?.optionKey || '',
            options: q.options.map(opt => ({
              key: opt.optionKey,
              content: opt.content,
              isCorrect: opt.isCorrect
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
  getSampleExamTemplate() {
    return {
      title: 'Đề kiểm tra 15 phút - Căn bậc hai và Hằng đẳng thức',
      description: 'Kiểm tra kiến thức cơ bản về căn bậc hai, điều kiện xác định và rút gọn biểu thức chứa căn.',
      durationMinutes: 15,
      questions: [
        {
          content: 'Giá trị của biểu thức $\\sqrt{25} - \\sqrt{9}$ là:',
          options: [
            { key: 'A', content: '2' },
            { key: 'B', content: '4' },
            { key: 'C', content: '16' },
            { key: 'D', content: '-2' }
          ],
          correctOption: 'A',
          explanation: 'Ta có $\\sqrt{25} = 5$ và $\\sqrt{9} = 3$. Do đó $5 - 3 = 2$.',
          cognitiveLevel: 'REMEMBERING'
        },
        {
          content: 'Điều kiện xác định của biểu thức $\\sqrt{2x - 6}$ là:',
          options: [
            { key: 'A', content: '$x \\ge 3$' },
            { key: 'B', content: '$x > 3$' },
            { key: 'C', content: '$x \\le 3$' },
            { key: 'D', content: '$x \\ge 6$' }
          ],
          correctOption: 'A',
          explanation: 'Biểu thức $\\sqrt{2x - 6}$ có nghĩa khi và chỉ khi $2x - 6 \\ge 0 \\Leftrightarrow 2x \\ge 6 \\Leftrightarrow x \\ge 3$.',
          cognitiveLevel: 'UNDERSTANDING'
        },
        {
          content: 'Rút gọn biểu thức $P = \\sqrt{(2 - \\sqrt{5})^2} + \\sqrt{5}$ ta được kết quả là:',
          options: [
            { key: 'A', content: '$2$' },
            { key: 'B', content: '$2\\sqrt{5} - 2$' },
            { key: 'C', content: '$-2$' },
            { key: 'D', content: '$2\\sqrt{5} + 2$' }
          ],
          correctOption: 'B',
          explanation: 'Vì $2 < \\sqrt{5}$ nên $2 - \\sqrt{5} < 0$. Do đó $\\sqrt{(2-\\sqrt{5})^2} = |2-\\sqrt{5}| = \\sqrt{5} - 2$. Vậy $P = \\sqrt{5} - 2 + \\sqrt{5} = 2\\sqrt{5} - 2$.',
          cognitiveLevel: 'APPLYING'
        }
      ]
    };
  }
}
