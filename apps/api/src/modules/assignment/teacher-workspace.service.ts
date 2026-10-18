import { validateTeacherPaper } from './teacher-paper';
import { DIAGNOSTIC_BLUEPRINT_VERSION, validateBlueprintPaper } from '../diagnostic/diagnostic-blueprint';
import { RegradeDto } from './regrade.dto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityDto, AssignmentSettingsDto } from './teacher-workspace.dto';
import { tracksTabSwitches, activityReport, deliveredQuestion, isBlank, gradeDelivered } from './workspace-helpers';
import { gradeQuestion, validateQuestion } from '../question/math-question';

@Injectable()
export class TeacherWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(db: any, userId: string, classId: string, id: string, role: string = 'TEACHER', write = false) {
    const a = await db.classroomAssignment.findUnique({ where: { id }, include: {
      classroom: { include: { memberships: { where: { status: 'ACTIVE' }, include: { student: { select: { id: true, fullName: true, username: true, email: true } } } } } },
      questions: { orderBy: { orderIndex: 'asc' }, include: { question: { include: { options: true, skill: true } } } },
      submissions: { include: { answers: true } }
    } });
    if (!a || a.classId !== classId) throw new NotFoundException('Không tìm thấy bài tập trong lớp.');
    if ((write && role !== 'TEACHER') || (role !== 'ADMIN' && a.classroom.teacherId !== userId)) throw new ForbiddenException('Bạn không có quyền quản lý bài tập này.');
    return a;
  }

  async report(userId: string, classId: string, id: string, role: string) {
    const a = await this.load(this.prisma, userId, classId, id, role);
    const submitted = a.submissions.filter((s: any) => s.status !== 'IN_PROGRESS');
    const roster = a.classroom.memberships.map((m: any) => {
      const s = a.submissions.find((s: any) => s.studentId === m.studentId);
      return { studentId: m.studentId, ...m.student, id: undefined, isSubmitted: !!s && s.status !== 'IN_PROGRESS',
        status: s?.status || 'NOT_STARTED', score: s && s.status !== 'IN_PROGRESS' ? s.score : null,
        correctCount: s?.correctCount ?? null, totalQuestions: a.questions.length, submittedAt: s?.submittedAt,
        timeSpentSeconds: s?.timeSpentSeconds || 0, activity: activityReport(s?.activityEvents || [], s?.submittedAt),
        answers: s?.status !== 'IN_PROGRESS' ? s?.answers || [] : [] };
    });
    const questions = a.questions.map((aq: any) => ({ ...deliveredQuestion(aq), id: aq.questionId, orderIndex: aq.orderIndex, points: aq.points }));
    const questionAnalytics = questions.map((q: any) => {
      const answers = submitted.map((s: any) => ({ ...s.answers.find((x: any) => x.questionId === q.id), studentId: s.studentId }));
      const correct = answers.filter((x: any) => x.isCorrect).length;
      const skipped = answers.filter((x: any) => isBlank(x) && !x.isCorrect).length;
      return { questionId: q.id, orderIndex: q.orderIndex, content: q.content, questionType: q.questionType,
        gradingMode: q.gradingMode || 'NORMAL', skillTitle: q.skill?.title || 'Chưa gắn kỹ năng', chapter: q.skill?.chapter, cognitiveLevel: q.cognitiveLevel,
        correctOptionKey: q.options?.find((o: any) => o.isCorrect)?.optionKey || '',
        totalAnswers: submitted.length, correctAnswers: correct, skippedAnswers: skipped,
        wrongAnswers: submitted.length - correct - skipped, accuracyPercentage: submitted.length ? Math.round(correct / submitted.length * 100) : 0,
        answers, distribution: q.questionType === 'SINGLE_CHOICE' ? q.options.map((o: any) => ({ key: o.optionKey, count: answers.filter((x: any) => x.selectedOptionKey === o.optionKey).length })) : [],
        statements: q.questionType === 'TRUE_FALSE' ? q.statements.map((st: any) => ({ key: st.key, correct: answers.filter((x: any) => x.response?.trueFalseAnswers?.[st.key] === st.isCorrect).length })) : [],
        shortAnswers: q.questionType === 'SHORT_ANSWER' ? [...new Set(answers.map((x: any) => x.response?.shortAnswer?.trim()).filter(Boolean))].map(value => ({ value, count: answers.filter((x: any) => x.response?.shortAnswer?.trim() === value).length })) : [] };
    });
    const history = await this.prisma.auditLog.findMany({ where: { targetEntity: 'ClassroomAssignment', targetEntityId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { assignment: { id, classId, title: a.title, description: a.description, durationMinutes: a.durationMinutes, dueDate: a.dueDate,
      status: a.status, settings: a.settings, document: a.settings?.documentId ? await this.prisma.examDocument.findUnique({ where: { id: a.settings.documentId }, select: { id: true, fileName: true, mimeType: true, size: true } }) : null, revision: a.revision, totalStudents: roster.length, submittedCount: submitted.length,
      averageScore: submitted.length ? Number((submitted.reduce((n: number, s: any) => n + s.score, 0) / submitted.length).toFixed(1)) : null }, roster, questions, questionAnalytics, history };
  }

  async settings(userId: string, classId: string, id: string, dto: AssignmentSettingsDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const a = await this.load(tx, userId, classId, id, 'TEACHER', true);
      if (dto.documentId && dto.documentId !== a.settings?.documentId) {
        if (a.submissions.length) throw new BadRequestException('Đã có người bắt đầu làm; không được đổi tài liệu gốc.');
        if (!await tx.examDocument.findFirst({ where: { id: dto.documentId, ownerId: userId }, select: { id: true } })) throw new ForbiddenException('Tài liệu không thuộc giáo viên.');
      }
      const { title, status, ...rest } = dto;
      if (status === 'PUBLISHED') validateTeacherPaper(a.questions.map((aq: any) => deliveredQuestion(aq)));
      const settings = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
      if (title !== undefined && !title.trim()) throw new BadRequestException('Tên bài không được để trống.');
      if (dto.resultsPolicy === 'AFTER_DUE' && !a.dueDate) throw new BadRequestException('Cần hạn nộp để công bố sau hạn.');
      if (status === 'DRAFT' && a.submissions.length) throw new BadRequestException('Bài đã có người làm không thể chuyển về nháp.');
      await tx.classroomAssignment.update({ where: { id }, data: { ...(title ? { title: title.trim() } : {}), ...(status ? { status } : {}), settings: { ...a.settings, ...settings } } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'ASSIGNMENT_SETTINGS', targetEntity: 'ClassroomAssignment', targetEntityId: id, metadata: { before: a.settings, after: settings, status: status || a.status } } });
      return { saved: true };
    });
  }

  async regrade(userId: string, classId: string, id: string, dto: RegradeDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      const a = await this.load(tx, userId, classId, id, 'TEACHER', true);
      if (a.revision !== dto.revision) throw new ConflictException('Đề đã thay đổi. Tải lại trước khi sửa.');
      if (!dto.reason.trim()) throw new BadRequestException('Nhập lý do chỉnh sửa.');
      if (dto.questions.length !== a.questions.length || new Set(dto.questions.map(q => q.id)).size !== a.questions.length) throw new BadRequestException('Không được thêm, xóa hoặc trùng câu ở lần cập nhật này.');
      const next = a.questions.map((aq: any) => {
        const old = deliveredQuestion(aq), q = dto.questions.find(q => q.id === aq.questionId);
        if (!q || (q.questionType || 'SINGLE_CHOICE') !== old.questionType) throw new BadRequestException('Không được đổi loại câu hỏi.');
        validateQuestion(q);
        if (a.submissions.length && (q.content !== old.content || JSON.stringify((q.options || []).map(o => ({ key: o.key, content: o.content }))) !== JSON.stringify((old.options || []).map((o: any) => ({ key: o.optionKey, content: o.content }))) || JSON.stringify((q.statements || []).map(s => ({ key: s.key, content: s.content }))) !== JSON.stringify((old.statements || []).map((s: any) => ({ key: s.key, content: s.content }))))) throw new BadRequestException('Đã có người bắt đầu làm; chỉ được sửa đáp án, quy tắc chấm và lời giải.');
        const gradingMode = q.gradingMode || 'NORMAL';
        return { ...aq, points: gradingMode === 'EXCLUDE' ? 0 : q.points || aq.points || 1, question: { ...old, gradingMode, content: q.content, explanation: q.explanation || '', options: (q.options || []).map(o => ({ optionKey: o.key, content: o.content, isCorrect: o.key === q.correctOption })), statements: q.statements || [], shortAnswer: q.shortAnswer || null } };
      });
      if (a.settings?.blueprintVersion === DIAGNOSTIC_BLUEPRINT_VERSION || !a.submissions.length) validateTeacherPaper(next.map((aq: any) => aq.question));
      if (next.reduce((n: number, q: any) => n + q.points, 0) <= 0) throw new BadRequestException('Đề phải còn ít nhất một câu được tính điểm.');
      const changes = a.submissions.filter((s: any) => s.status !== 'IN_PROGRESS').map((s: any) => {
        const answers = next.map((aq: any) => ({ questionId: aq.questionId, ...gradeDelivered(aq.question, s.answers.find((x: any) => x.questionId === aq.questionId), aq.points) }));
        const score = Number((answers.reduce((n: number, x: any) => n + x.pointsAwarded, 0) / next.reduce((n: number, x: any) => n + x.points, 0) * 10).toFixed(1));
        return { studentId: s.studentId, submissionId: s.id, oldScore: s.score, score, answers };
      });
      if (dto.apply) {
        for (const aq of next) await tx.assignmentQuestion.update({ where: { id: aq.id }, data: { snapshot: aq.question, points: aq.points } });
        for (const c of changes) {
          await tx.assignmentSubmission.update({ where: { id: c.submissionId }, data: { score: c.score, correctCount: c.answers.filter((x: any) => x.isCorrect).length } });
          for (const ans of c.answers) await tx.submissionAnswer.updateMany({ where: { submissionId: c.submissionId, questionId: ans.questionId }, data: { isCorrect: ans.isCorrect, pointsAwarded: ans.pointsAwarded, gradingDetails: ans.gradingDetails } });
        }
        await tx.classroomAssignment.update({ where: { id }, data: { revision: { increment: 1 } } });
        await tx.auditLog.create({ data: { actorUserId: userId, action: 'ASSIGNMENT_REGRADED', targetEntity: 'ClassroomAssignment', targetEntityId: id,
          metadata: { reason: dto.reason, revision: a.revision + 1, before: a.questions.map((q: any) => deliveredQuestion(q)), after: next.map((q: any) => q.question), changes: changes.map(({ answers, ...c }: any) => c) } } });
      }
      return { applied: !!dto.apply, revision: a.revision + (dto.apply ? 1 : 0), changes: changes.map(({ answers, ...c }: any) => c) };
    }, { timeout: 30000 });
  }

  async activity(studentId: string, assignmentId: string, dto: ActivityDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${assignmentId + ':' + studentId}))`;
      const sub = await tx.assignmentSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } }, include: { assignment: { include: { classroom: { include: { memberships: { where: { studentId, status: 'ACTIVE' } } } } } } } });
      if (!sub || !sub.assignment.classroom.memberships.length) throw new ForbiddenException('Bạn chưa bắt đầu bài kiểm tra này.');
      if (sub.status !== 'IN_PROGRESS') return { saved: false };
      if (!tracksTabSwitches(sub.assignment.settings)) return { saved: false };
      const events = (sub.activityEvents || []) as any[];
      if (!events.some(e => e.id === dto.id) && events.length < 2000) {
        const receivedAt = new Date();
        const at = new Date(Math.min(receivedAt.getTime(), Math.max(sub.startedAt.getTime(), Date.parse(dto.occurredAt)))).toISOString();
        events.push({ ...dto, at, receivedAt: receivedAt.toISOString() });
        await tx.assignmentSubmission.update({ where: { id: sub.id }, data: { activityEvents: events } });
      }
      return { saved: true };
    });
  }
}
