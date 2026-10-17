import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaveDiagnosticDraftDto } from './dto/save-diagnostic-draft.dto';
import { AnswerQuestionDto } from './dto/answer-question.dto';
import { gradeQuestion, validateAnswer } from '../question/math-question';
import { estimateAbility, diagnosticMastery, selectStaircase } from '../student/math-adaptive';

const eligibleQuestions = { OR: [{ status: 'PUBLISHED' as const }, { status: 'DRAFT' as const, source: { path: ['reviewStatus'], equals: 'VERIFIED' } }] };
const answerInclude = { question: { include: { skill: true, options: true } } };
@Injectable()
export class DiagnosticService {
  private readonly maxQuestions = Math.max(1, Math.min(22, Number(process.env.DIAGNOSTIC_MAX_QUESTIONS) || 22));
  constructor(private readonly prisma: PrismaService) {}
  private timeLimit(q?: any) { return q?.questionType === 'TRUE_FALSE' ? 180 : 90; }
  private remainingSeconds(startedAt: Date, q?: any) {
    return Math.max(0, this.timeLimit(q) - Math.floor((Date.now() - startedAt.getTime()) / 1000));
  }
  private safeQuestion(q: any) {
    return q ? { id: q.id, skillId: q.skillId, skillTitle: q.skill.title, chapter: q.skill.chapter,
      cognitiveLevel: q.cognitiveLevel, content: q.content, questionType: q.questionType || 'SINGLE_CHOICE', difficulty: q.difficulty,
      questionTimeLimitSeconds: this.timeLimit(q),
      statements: q.questionType === 'TRUE_FALSE' ? (q.statements || []).map((s: any) => ({ key: s.key, content: s.content })) : undefined,
      options: q.options.map((o: any) => ({ key: o.optionKey, content: o.content })) } : null;
  }
  private async lock(tx: any, studentId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))::text`;
  }
  private async pool(tx: any, studentId: string, attempt?: any) {
    if (attempt?.questionIds?.length) return tx.question.findMany({ where: { id: { in: attempt.questionIds } }, include: { skill: true, options: true }, orderBy: { id: 'asc' } });
    if (attempt?.skillIds?.length) return tx.question.findMany({ where: { skillId: { in: attempt.skillIds }, ...eligibleQuestions },
      include: { skill: true, options: true }, orderBy: { id: 'asc' } });
    const profile = await tx.studentProfile.findUnique({ where: { userId: studentId } });
    // Eight skills per diagnostic permit coverage and verification within 24 items.
    const skills = await tx.skillNode.findMany({
      where: { grade: profile?.grade || 9, questions: { some: eligibleQuestions } },
      orderBy: [{ orderIndex: 'asc' }, { code: 'asc' }]
    });
    const assessed = await tx.skillMastery.findMany({ where: { studentId } });
    skills.sort((a: any, b: any) => {
      const ma = assessed.find((m: any) => m.skillId === a.id), mb = assessed.find((m: any) => m.skillId === b.id);
      return Number(Boolean(ma)) - Number(Boolean(mb)) || (ma?.masteryScore || 0) - (mb?.masteryScore || 0) || a.orderIndex - b.orderIndex || a.code.localeCompare(b.code);
    });
    const skillIds = [...new Set([...skills.slice(0, 8).map((s: any) => s.id), ...(attempt?.answers || []).map((a: any) => a.question.skillId)])];
    return tx.question.findMany({ where: { skillId: { in: skillIds }, ...eligibleQuestions },
      include: { skill: true, options: true }, orderBy: { id: 'asc' } });
  }
  private freeze(pool: any[], attempt: any) {
    const existing = attempt.answers.map((a: any) => a.questionId);
    const used = new Set(existing);
    const remaining = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'].flatMap((type, index) => {
      const count = attempt.answers.filter((a: any) => (a.question.questionType || 'SINGLE_CHOICE') === type).length;
      return pool.filter(q => !used.has(q.id) && (q.questionType || 'SINGLE_CHOICE') === type)
        .sort((a, b) => { const hash = (id: string) => [...attempt.id + id].reduce((v, c) => Math.imul(v ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0; return hash(a.id) - hash(b.id); })
        .slice(0, Math.max(0, [12,4,6][index] - count)).map(q => q.id);
    });
    return [...existing, ...remaining].slice(0, Math.max(existing.length, this.maxQuestions));
  }
  private globalRemaining(attempt: any) { return Math.max(0, 2700 - Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000)); }
  private next(pool: any[], attempt: any) {
    if (attempt.questionIds?.length) return pool.find(q => q.id === attempt.questionIds.find((id: string) => !attempt.answers.some((a: any) => a.questionId === id))) || null;
    if (attempt.answers.length >= this.maxQuestions) return null;
    const phases = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'];
    const caps = [12, 4, 6];
    // Never return to an earlier section, including resumed legacy mixed attempts.
    const currentPhase = Math.max(0, ...attempt.answers.map((a: any) => phases.indexOf(a.question.questionType || 'SINGLE_CHOICE')));
    for (let phase = currentPhase; phase < phases.length; phase++) {
      const history = attempt.answers.filter((a: any) => (a.question.questionType || 'SINGLE_CHOICE') === phases[phase]);
      if (history.length >= caps[phase]) continue;
      const candidates = pool.filter(q => (q.questionType || 'SINGLE_CHOICE') === phases[phase]);
      const question = selectStaircase(candidates, history, attempt.id);
      if (question) return question;
    }
    return null;
  }
  private answerResponse(attempt: any, q: any, answer: any, pool: any[], replayed = false) {
    const next = this.next(pool, attempt);
    return { replayed, isCorrect: answer.isCorrect, pointsAwarded: answer.pointsAwarded ?? Number(answer.isCorrect),
      questionTimeRemainingSeconds: this.remainingSeconds(attempt.answers.at(-1)?.answeredAt ?? attempt.startedAt, next), questionTimeLimitSeconds: this.timeLimit(next), currentTheta: attempt.currentTheta,
      standardError: estimateAbility(attempt.answers).standardError, answeredCount: attempt.answers.length,
      totalQuestions: attempt.questionIds?.length || this.maxQuestions, isReadyToSubmit: !next, nextQuestion: this.safeQuestion(next) };
  }
  async startAttempt(studentId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, studentId);
      if (await tx.mathPracticeSession.findFirst({ where: { studentId, status: 'IN_PROGRESS' } }))
        throw new ConflictException('Hãy hoàn thành hoặc kết thúc buổi luyện trước khi kiểm tra.');
      let attempt: any = await tx.diagnosticAttempt.findFirst({ where: { studentId, status: 'IN_PROGRESS' },
        include: { answers: { include: answerInclude, orderBy: [{ answeredAt: 'asc' }, { id: 'asc' }] } } });
      const isResumed = Boolean(attempt), pool = await this.pool(tx, studentId, attempt);
      if (!pool.length) throw new BadRequestException({ code: 'QUESTION_POOL_EMPTY', message: 'Chưa có câu hỏi đã duyệt cho khối lớp của bạn.' });
      const skillIds = [...new Set(pool.map((q: any) => q.skillId))] as string[];
      if (!attempt) attempt = { ...await tx.diagnosticAttempt.create({ data: { studentId, currentTheta: 0, skillIds } }), answers: [] };
      else {
        attempt.currentTheta = estimateAbility(attempt.answers).theta;
        await tx.diagnosticAttempt.update({ where: { id: attempt.id }, data: { currentTheta: attempt.currentTheta, skillIds } });
      }
      if (!attempt.questionIds?.length) {
        attempt.questionIds = this.freeze(pool, attempt);
        await tx.diagnosticAttempt.update({ where: { id: attempt.id }, data: { questionIds: attempt.questionIds } });
      }
      const next = this.next(pool, attempt);
      return { questions: attempt.questionIds.map((id: string) => this.safeQuestion(pool.find(q => q.id === id))).filter(Boolean),
        draftAnswers: [...attempt.answers.map((a: any) => ({ questionId: a.questionId, selectedOptionKey: a.selectedOptionKey, response: a.response || {} })), ...(Array.isArray(attempt.draftAnswers) ? attempt.draftAnswers.filter((a: any) => !attempt.answers.some((saved: any) => saved.questionId === a.questionId)) : [])],
        lockedQuestionIds: attempt.answers.map((a: any) => a.questionId), timeLimitSeconds: 2700, timeRemainingSeconds: this.globalRemaining(attempt),
        attemptId: attempt.id, isResumed, status: attempt.status, currentTheta: attempt.currentTheta,
        standardError: estimateAbility(attempt.answers).standardError,
        answeredCount: attempt.answers.length, totalQuestions: attempt.questionIds?.length || this.maxQuestions,
        availableSkillCount: new Set(pool.map((q: any) => q.skillId)).size,
        isReadyToSubmit: !next,
        questionTimeLimitSeconds: this.timeLimit(next),
        questionTimeRemainingSeconds: this.remainingSeconds(attempt.answers.at(-1)?.answeredAt ?? attempt.startedAt, next),
        currentQuestion: this.safeQuestion(next), parameterStatus: 'PROVISIONAL' };
    }, { maxWait: 10000, timeout: 15000 });
  }
  async answerQuestion(studentId: string, dto: AnswerQuestionDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, studentId);
      const attempt = await tx.diagnosticAttempt.findUnique({ where: { id: dto.attemptId },
        include: { answers: { include: answerInclude, orderBy: [{ answeredAt: 'asc' }, { id: 'asc' }] } } });
      if (!attempt) throw new NotFoundException('Không tìm thấy bài chẩn đoán.');
      if (attempt.studentId !== studentId) throw new ForbiddenException('Bạn không có quyền truy cập bài kiểm tra này.');
      if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('Bài kiểm tra đã kết thúc.');
      const pool = await this.pool(tx, studentId, attempt), existing = attempt.answers.find(a => a.questionId === dto.questionId);
      if (existing) return this.answerResponse(attempt, existing.question, existing, pool, true);
      const q = this.next(pool, attempt);
      if (!q || q.id !== dto.questionId) throw new ConflictException('Câu hỏi không thuộc lượt hiện tại. Hãy tải lại phiên làm bài.');
      validateAnswer(q, dto);
      const type = q.questionType || 'SINGLE_CHOICE';
      const hasAnswer = type === 'SINGLE_CHOICE' ? Boolean(dto.selectedOptionKey)
        : type === 'TRUE_FALSE' ? Object.keys(dto.response?.trueFalseAnswers || {}).length === 4
        : typeof dto.response?.shortAnswer === 'string' && Boolean(dto.response.shortAnswer.trim());
      if (!hasAnswer && !dto.isSkipped && !dto.isTimeout) throw new BadRequestException('Hoàn thành câu trả lời hoặc bỏ qua câu hỏi.');
      const isTimeout = Boolean(dto.isTimeout || this.remainingSeconds(attempt.answers.at(-1)?.answeredAt ?? attempt.startedAt, q) === 0);
      const { isCorrect, pointsAwarded, gradingDetails } = gradeQuestion(q, isTimeout || dto.isSkipped ? {} : dto);
      const ability = estimateAbility([...attempt.answers, { question: q, isCorrect, pointsAwarded }]);
      const answer = await tx.attemptAnswer.create({ data: { attemptId: attempt.id, questionId: q.id,
        selectedOptionKey: isTimeout || dto.isSkipped ? null : dto.selectedOptionKey || null, isCorrect, isTimeout,
        response: isTimeout || dto.isSkipped ? {} : dto.response || {}, pointsAwarded, gradingDetails,
        isSkipped: !isTimeout && Boolean(dto.isSkipped), timeSpentSeconds: isTimeout ? this.timeLimit(q) : Math.min(this.timeLimit(q), dto.timeSpentSeconds || 0),
        thetaAfter: ability.theta } });
      await tx.diagnosticAttempt.update({ where: { id: attempt.id }, data: { currentTheta: ability.theta } });
      return this.answerResponse({ ...attempt, currentTheta: ability.theta, answers: [...attempt.answers, { ...answer, question: q }] }, q, answer, pool);
    }, { maxWait: 10000, timeout: 15000 });
  }
  async saveDraft(studentId: string, dto: SaveDiagnosticDraftDto) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, studentId);
      const attempt = await tx.diagnosticAttempt.findUnique({ where: { id: dto.attemptId } });
      if (!attempt || attempt.studentId !== studentId) throw new NotFoundException('Không tìm thấy bài kiểm tra.');
      if (attempt.status !== 'IN_PROGRESS') throw new ConflictException('Bài kiểm tra đã kết thúc.');
      if (Date.now() - attempt.startedAt.getTime() > 2705000) throw new ConflictException('Bài kiểm tra đã hết giờ. Hãy nộp bài.');
      if (dto.answers.some(a => !a || typeof a.questionId !== 'string') || new Set(dto.answers.map(a => a.questionId)).size !== dto.answers.length) throw new BadRequestException('Câu trả lời không hợp lệ.');
      const questions = await tx.question.findMany({ where: { id: { in: attempt.questionIds } }, include: { options: true } });
      for (const answer of dto.answers) {
        const q = questions.find(q => q.id === answer.questionId);
        if (!q) throw new BadRequestException('Câu hỏi không thuộc bài kiểm tra.');
        validateAnswer(q, answer);
      }
      const answers = dto.answers.map(a => ({ questionId: a.questionId, ...(a.selectedOptionKey ? { selectedOptionKey: a.selectedOptionKey } : {}), ...(a.response ? { response: a.response } : {}) }));
      await tx.diagnosticAttempt.update({ where: { id: attempt.id }, data: { draftAnswers: answers as any } });
      return { saved: true, timeRemainingSeconds: this.globalRemaining(attempt) };
    }, { maxWait: 10000, timeout: 15000 });
  }

  async abandonCurrentAttempt(studentId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, studentId);
      const result = await tx.diagnosticAttempt.updateMany({
        where: { studentId, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED', completedAt: new Date() }
      });
      return { abandonedCount: result.count, message: 'Đã kết thúc lượt kiểm tra đang dở. Kết quả đã nộp trước đó được giữ nguyên.' };
    }, { maxWait: 10000, timeout: 15000 });
  }

  async submitAttempt(studentId: string, attemptId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, studentId);
      const attempt = await tx.diagnosticAttempt.findUnique({ where: { id: attemptId },
        include: { answers: { include: answerInclude, orderBy: { answeredAt: 'asc' } } } });
      if (!attempt || attempt.studentId !== studentId) throw new NotFoundException('Không tìm thấy bài chẩn đoán.');
      if (attempt.status === 'ABANDONED') throw new BadRequestException('Bài kiểm tra đã được kết thúc.');
      if (attempt.status === 'IN_PROGRESS' && attempt.questionIds.length) {
        const questions = await tx.question.findMany({ where: { id: { in: attempt.questionIds } }, include: { options: true, skill: true } });
        const drafts = Array.isArray(attempt.draftAnswers) ? attempt.draftAnswers as any[] : [];
        for (const questionId of attempt.questionIds) {
          if (attempt.answers.some(a => a.questionId === questionId)) continue;
          const q = questions.find(q => q.id === questionId);
          if (!q) throw new ConflictException('Câu hỏi đã thay đổi. Liên hệ giáo viên.');
          const draft = drafts.find(a => a.questionId === questionId) || {};
          const graded = gradeQuestion(q, draft);
          const thetaAfter = estimateAbility([...attempt.answers, { question: q, ...graded }]).theta;
          const answer = await tx.attemptAnswer.create({ data: { attemptId, questionId, selectedOptionKey: draft.selectedOptionKey || null, response: draft.response || {}, ...graded, thetaAfter, isSkipped: !draft.selectedOptionKey && !Object.keys(draft.response || {}).length } });
          attempt.answers.push({ ...answer, question: q });
        }
      }
      if (!attempt.answers.length) throw new BadRequestException('Bài chẩn đoán chưa có câu trả lời để nộp.');
      const ability = estimateAbility(attempt.answers), correctCount = attempt.answers.filter(a => a.isCorrect).length;
      const skills = [...new Set(attempt.answers.map(a => a.question.skillId))], skillsEvaluated: any[] = [];
      if (attempt.status !== 'COMPLETED') {
        await tx.diagnosticAttempt.update({ where: { id: attemptId }, data: { status: 'COMPLETED', currentTheta: ability.theta, finalTheta: ability.theta, completedAt: new Date() } });
        for (const a of attempt.answers.filter(a => !a.isCorrect)) await tx.mistakeRecord.upsert({
          where: { studentId_questionId: { studentId, questionId: a.questionId } },
          update: { selectedOptionKey: a.selectedOptionKey, attemptId, isMastered: false },
          create: { studentId, questionId: a.questionId, selectedOptionKey: a.selectedOptionKey, attemptId } });
        for (const skillId of skills) {
          const answers = attempt.answers.filter(a => a.question.skillId === skillId), score = diagnosticMastery(answers, ability.theta) * 100;
          await tx.skillMastery.upsert({ where: { studentId_skillId: { studentId, skillId } },
            update: { masteryScore: score, evidenceCount: answers.length, attemptsCount: { increment: 1 }, lastAssessedAt: new Date() },
            create: { studentId, skillId, masteryScore: score, evidenceCount: answers.length } });
          skillsEvaluated.push({ skillId, title: answers[0].question.skill.title, masteryScore: score,
            evidenceCount: answers.length, status: answers.length < 5 ? 'INSUFFICIENT_DATA' : score >= 85 ? 'STRONG' : 'NEEDS_PRACTICE' });
        }
      }
      return { attemptId, status: 'COMPLETED', finalTheta: ability.theta, standardError: ability.standardError,
        scorePercentage: Math.round(attempt.answers.reduce((sum, a) => sum + (a.pointsAwarded ?? Number(a.isCorrect)), 0) / attempt.answers.length * 100), correctCount,
        totalAnswered: attempt.answers.length, skillsEvaluated, alreadySubmitted: attempt.status === 'COMPLETED', parameterStatus: 'PROVISIONAL' };
    }, { maxWait: 10000, timeout: 15000 });
  }
  async getLatestState(studentId: string) {
    const attempt = await this.prisma.diagnosticAttempt.findFirst({
      where: { studentId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } }, orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, completedAt: true }
    });
    if (!attempt) return { status: 'NOT_STARTED' };
    if (attempt.status === 'COMPLETED') return { status: 'COMPLETED', result: await this.getAttemptResult(studentId, attempt.id) };
    return { status: 'IN_PROGRESS', attemptId: attempt.id };
  }

  async getAttemptResult(studentId: string, attemptId: string) {
    const attempt = await this.prisma.diagnosticAttempt.findUnique({ where: { id: attemptId },
      include: { answers: { include: answerInclude, orderBy: { answeredAt: 'asc' } } } });
    if (!attempt || attempt.studentId !== studentId) throw new NotFoundException('Không tìm thấy kết quả.');
    if (attempt.status !== 'COMPLETED') throw new ForbiddenException('Hãy nộp bài trước khi xem kết quả.');
    const rank = ['SINGLE_CHOICE','TRUE_FALSE','SHORT_ANSWER'];
    attempt.answers.sort((a,b) => rank.indexOf(a.question.questionType) - rank.indexOf(b.question.questionType) || (attempt.questionIds || []).indexOf(a.questionId) - (attempt.questionIds || []).indexOf(b.questionId));
    const ability = estimateAbility(attempt.answers);
    return { attemptId, status: attempt.status, finalTheta: ability.theta, standardError: ability.standardError,
      startedAt: attempt.startedAt, completedAt: attempt.completedAt, totalAnswered: attempt.answers.length,
      scorePercentage: Math.round(attempt.answers.reduce((sum, a) => sum + (a.pointsAwarded ?? Number(a.isCorrect)), 0) / attempt.answers.length * 100),
      correctCount: attempt.answers.filter(a => a.isCorrect).length, parameterStatus: 'PROVISIONAL',
      answers: attempt.answers.map(a => ({ questionId: a.questionId, content: a.question.content,
        questionType: a.question.questionType, statements: a.question.statements, shortAnswer: a.question.shortAnswer,
        response: a.response, gradingDetails: a.gradingDetails, pointsAwarded: a.pointsAwarded ?? Number(a.isCorrect),
        explanation: a.question.explanation, skillTitle: a.question.skill.title, selectedOptionKey: a.selectedOptionKey,
        isCorrect: a.isCorrect, isTimeout: a.isTimeout, timeSpentSeconds: a.timeSpentSeconds, thetaAfter: a.thetaAfter,
        options: a.question.options.map(o => ({ key: o.optionKey, content: o.content, isCorrect: o.isCorrect })) })) };
  }
}
