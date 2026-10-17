import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createEmptyCard } from 'ts-fsrs';
import { PrismaService } from '../prisma/prisma.service';
import { estimateAbility, itemParameters, updateKnowledge } from './math-adaptive';
import { MATH_LESSONS } from './math-lessons';

@Injectable()
export class MathPracticeService {
  constructor(private readonly db: PrismaService) {}
  private async lock(tx: any, id: string) { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`; }
  private async available(tx: any, id: string) {
    if (await tx.diagnosticAttempt.findFirst({ where: { studentId: id, status: 'IN_PROGRESS' } }))
      throw new ForbiddenException('Hãy nộp bài kiểm tra trước khi luyện tập.');
  }
  private phase(state: any) {
    return state.answers.length < state.warmupCount ? 'WARMUP'
      : state.answers.length < state.total - state.checkCount ? 'PRACTICE' : 'CHECK';
  }
  private next(state: any, questions: any[]) {
    const phase = this.phase(state), used = new Set(state.answers.map((a: any) => a.questionId));
    if (used.size >= state.total) return null;
    const pool = questions.filter(q => !used.has(q.id) && (phase === 'CHECK' ? state.checkIds.includes(q.id) : !state.checkIds.includes(q.id)));
    const history = state.answers.map((a: any) => ({ isCorrect: a.isCorrect, question: questions.find(q => q.id === a.questionId) })).filter((a: any) => a.question);
    const theta = estimateAbility(history).theta;
    const recent = state.answers.slice(-2);
    const delta = recent.length === 2 && recent.every((a: any) => !a.isCorrect) ? -0.5
      : recent.length === 2 && recent.every((a: any) => a.isCorrect) ? 0.8 : 0.3;
    const target = phase === 'WARMUP' ? -1.5 : theta + delta;
    pool.sort((a, b) => (phase === 'WARMUP' ? 0 : Number(state.seenIds.includes(a.id)) - Number(state.seenIds.includes(b.id)))
      || Math.abs(itemParameters(a).b - target) - Math.abs(itemParameters(b).b - target) || a.id.localeCompare(b.id));
    return pool[0] || null;
  }
  private view(session: any, questions: any[]) {
    const state = session.state, q = session.status === 'IN_PROGRESS' ? questions.find(q => q.id === state.currentId) : null;
    return { sessionId: session.id, skillId: session.skillId, title: session.skill.title, status: session.status,
      lesson: MATH_LESSONS[session.skill.code] || null, phase: this.phase(state), answeredCount: state.answers.length,
      totalQuestions: state.total, reusedQuestionCount: state.poolIds.filter((id: string) => state.seenIds.includes(id)).length,
      currentQuestion: q ? { id: q.id, content: q.content, cognitiveLevel: q.cognitiveLevel,
        options: q.options.map((o: any) => ({ key: o.optionKey, content: o.content })) } : null,
      result: state.result || null,
      lastFeedback: state.lastFeedback || null };
  }
  private questions(tx: any, state: any) {
    return tx.question.findMany({ where: { id: { in: state.poolIds } }, include: { options: true }, orderBy: { id: 'asc' } });
  }
  async start(id: string, skillId: string) {
    return this.db.$transaction(async tx => {
      await this.lock(tx, id); await this.available(tx, id);
      const existing = await tx.mathPracticeSession.findFirst({ where: { studentId: id, status: 'IN_PROGRESS' }, include: { skill: true } });
      if (existing) {
        if (existing.skillId !== skillId) throw new ConflictException('Bạn còn một buổi luyện dở. Mở buổi đó và kết thúc trước khi đổi chủ đề.');
        return { ...this.view(existing, await this.questions(tx, existing.state)), isResumed: true };
      }
      const profile = await tx.studentProfile.findUnique({ where: { userId: id } });
      const skill = await tx.skillNode.findFirst({ where: { id: skillId, grade: profile?.grade || 9 } });
      if (!skill) throw new NotFoundException('Không tìm thấy chủ đề trong khối lớp của bạn.');
      const pool = await tx.question.findMany({ where: { skillId, status: 'PUBLISHED', questionType: 'SINGLE_CHOICE' }, include: { options: true }, orderBy: { id: 'asc' } });
      if (pool.length < 3) throw new BadRequestException('Chủ đề cần ít nhất 3 câu đã duyệt để có đủ ba pha luyện tập. Hãy chọn chủ đề khác.');
      const [diagnostic, sessions] = await Promise.all([
        tx.attemptAnswer.findMany({ where: { attempt: { studentId: id }, question: { skillId } }, select: { questionId: true } }),
        tx.mathPracticeSession.findMany({ where: { studentId: id, skillId }, select: { state: true } })
      ]);
      const seenIds = [...new Set([...diagnostic.map(a => a.questionId), ...sessions.flatMap(s => ((s.state as any).answers || []).map((a: any) => a.questionId))])];
      const mastery = await tx.skillMastery.findUnique({ where: { studentId_skillId: { studentId: id, skillId } } });
      const total = Math.min(9, pool.length), checkCount = total >= 5 ? 2 : 1, warmupCount = total >= 5 ? 2 : 1;
      const latest = await tx.diagnosticAttempt.findFirst({ where: { studentId: id, status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } });
      const checkTarget = (latest?.finalTheta ?? 0) + 0.3;
      pool.sort((a, b) => Number(seenIds.includes(a.id)) - Number(seenIds.includes(b.id))
        || Math.abs(itemParameters(a).b - checkTarget) - Math.abs(itemParameters(b).b - checkTarget) || a.id.localeCompare(b.id));
      const checkIds = pool.slice(0, checkCount).map(q => q.id);
      const state: any = { answers: [], poolIds: pool.map(q => q.id), seenIds, checkIds, total, checkCount, warmupCount,
        knowledge: mastery ? mastery.masteryScore / 100 : 0.1, currentId: null };
      state.currentId = this.next(state, pool)?.id;
      const session = await tx.mathPracticeSession.create({ data: { studentId: id, skillId, state }, include: { skill: true } });
      return this.view(session, pool);
    });
  }
  async active(id: string) {
    const session = await this.db.mathPracticeSession.findFirst({ where: { studentId: id, status: 'IN_PROGRESS' }, include: { skill: true } });
    return { session: session ? this.view(session, await this.questions(this.db, session.state)) : null };
  }
  async answer(id: string, sessionId: string, questionId: string, answer: string, timeSpentSeconds: number) {
    return this.db.$transaction(async tx => {
      await this.lock(tx, id); await this.available(tx, id);
      const session = await tx.mathPracticeSession.findFirst({ where: { id: sessionId, studentId: id }, include: { skill: true } });
      if (!session) throw new NotFoundException('Không tìm thấy buổi luyện của bạn.');
      const state: any = session.state, questions = await this.questions(tx, state);
      const recorded = state.answers.find((a: any) => a.questionId === questionId);
      if (recorded) return { ...this.view(session, questions), feedback: recorded.feedback, replayed: true };
      if (session.status !== 'IN_PROGRESS' || questionId !== state.currentId) throw new ConflictException('Câu hỏi không thuộc lượt hiện tại.');
      const q = questions.find(q => q.id === questionId);
      if (!q || q.status !== 'PUBLISHED') throw new ConflictException('Câu hỏi không còn được xuất bản. Hãy kết thúc buổi này và mở buổi mới.');
      if (!q.options.some(o => o.optionKey === answer)) throw new BadRequestException('Chọn đáp án hợp lệ.');
      const isCorrect = q.options.find(o => o.isCorrect)?.optionKey === answer, phase = this.phase(state);
      const feedback = { isCorrect, correctOptionKey: q.options.find(o => o.isCorrect)?.optionKey, explanation: q.explanation,
        encouragement: isCorrect ? 'Bạn đã làm đúng. Tiếp tục với câu tiếp theo.' : 'Đọc lại lời giải và thử xác định bước mình nhầm.' };
      const isNewEvidence = phase !== 'WARMUP' && !state.seenIds.includes(q.id);
      if (phase !== 'WARMUP' && (isNewEvidence || !isCorrect)) {
        state.knowledge = updateKnowledge(state.knowledge, isCorrect);
        await tx.skillMastery.upsert({ where: { studentId_skillId: { studentId: id, skillId: session.skillId } },
          create: { studentId: id, skillId: session.skillId, masteryScore: state.knowledge * 100, evidenceCount: isNewEvidence ? 1 : 0 },
          update: { masteryScore: state.knowledge * 100, evidenceCount: { increment: isNewEvidence ? 1 : 0 }, lastAssessedAt: new Date() } });
      }
      if (!isCorrect) {
        await tx.mistakeRecord.upsert({ where: { studentId_questionId: { studentId: id, questionId: q.id } },
          create: { studentId: id, questionId: q.id, selectedOptionKey: answer }, update: { selectedOptionKey: answer, isMastered: false } });
        await tx.mathReviewCard.upsert({ where: { studentId_questionId: { studentId: id, questionId: q.id } },
          create: { studentId: id, questionId: q.id, scheduler: JSON.parse(JSON.stringify(createEmptyCard())) }, update: {} });
      } else if (phase === 'CHECK') {
        await tx.mistakeRecord.updateMany({ where: { studentId: id, questionId: q.id }, data: { isMastered: true } });
      }
      state.answers.push({ questionId, answer, isCorrect, phase, isNewEvidence, timeSpentSeconds, feedback });
      state.lastFeedback = feedback;
      const next = this.next(state, questions);
      state.currentId = next?.id || null;
      let status: any = 'IN_PROGRESS';
      if (!next) {
        status = 'COMPLETED';
        const checks = state.answers.filter((a: any) => a.phase === 'CHECK');
        state.result = { correctCount: state.answers.filter((a: any) => a.isCorrect).length, total: state.answers.length,
          checkCorrect: checks.filter((a: any) => a.isCorrect).length, checkTotal: checks.length,
          newEvidenceCount: state.answers.filter((a: any) => a.isNewEvidence).length,
          masteryScore: Math.round(state.knowledge * 100), minutes: Math.max(1, Math.ceil(state.answers.reduce((n: number, a: any) => n + a.timeSpentSeconds, 0) / 60)) };
      }
      const saved = await tx.mathPracticeSession.update({ where: { id: sessionId }, data: { state, status, completedAt: status === 'COMPLETED' ? new Date() : null }, include: { skill: true } });
      return { ...this.view(saved, questions), feedback };
    });
  }
  async abandon(id: string, sessionId: string) {
    return this.db.$transaction(async tx => {
      await this.lock(tx, id);
      const session = await tx.mathPracticeSession.findFirst({ where: { id: sessionId, studentId: id } });
      if (!session) throw new NotFoundException('Không tìm thấy buổi luyện.');
      if (session.status === 'IN_PROGRESS') await tx.mathPracticeSession.update({ where: { id: sessionId }, data: { status: 'ABANDONED', completedAt: new Date() } });
      return { saved: true };
    });
  }
}
