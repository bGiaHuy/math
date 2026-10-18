import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { DIAGNOSTIC_BLUEPRINT } from '../src/modules/diagnostic/diagnostic-blueprint';
import { DiagnosticService } from '../src/modules/diagnostic/diagnostic.service';
import { estimateAbility, diagnosticMastery, itemParameters } from '../src/modules/student/math-adaptive';

const tf = { id: 'tf', skillId: 's', skill: { title: 'Skill', chapter: 'Math' }, cognitiveLevel: 'REMEMBERING', questionType: 'TRUE_FALSE', content: 'Decide', options: [], statements: ['a','b','c','d'].map(key => ({ key, content: key, isCorrect: true })) };
describe('Mixed diagnostic grading and disclosure', () => {
  it('restores completed results after a reload without starting another attempt', async () => {
    const findFirst = vi.fn().mockResolvedValue({id:'saved',status:'COMPLETED'});
    const service = new DiagnosticService({diagnosticAttempt:{findFirst}} as any);
    const result = {attemptId:'saved',scorePercentage:85};
    vi.spyOn(service,'getAttemptResult').mockResolvedValue(result as any);
    expect(await service.getLatestState('student')).toEqual({status:'COMPLETED',result});
    expect(service.getAttemptResult).toHaveBeenCalledWith('student','saved');
    findFirst.mockResolvedValue({id:'draft',status:'IN_PROGRESS'});
    expect(await service.getLatestState('student')).toEqual({status:'IN_PROGRESS',attemptId:'draft'});
    findFirst.mockResolvedValue(null);
    expect(await service.getLatestState('student')).toEqual({status:'NOT_STARTED'});
  });
  it('uses marked bank difficulty unless an explicit calibrated IRT parameter exists', () => {
    expect(itemParameters({ cognitiveLevel: 'REMEMBERING', difficulty: 'VERY_HARD' }).b).toBe(1.5);
    expect(itemParameters({ cognitiveLevel: 'APPLYING' }).b).toBe(.5);
    expect(itemParameters({ difficulty: 'VERY_HARD', irtB: -.2 }).b).toBe(-.2);
  });
  it('persists fractional true/false credit, supports replay, and hides solutions until final result', async () => {
    const attempt: any = { id: 'attempt', studentId: 'student', status: 'IN_PROGRESS', skillIds: ['s'], startedAt: new Date(), answers: [] };
    const tx: any = { $queryRaw: vi.fn(), diagnosticAttempt: { findUnique: vi.fn(() => attempt), update: vi.fn() }, question: { findMany: vi.fn(() => [tf]) }, attemptAnswer: { create: vi.fn(({ data }) => ({ ...data, answeredAt: new Date() })) } };
    const service = new DiagnosticService({ $transaction: (fn: any) => fn(tx) } as any);
    const dto = { attemptId: 'attempt', questionId: 'tf', response: { trueFalseAnswers: { a: true, b: true, c: true, d: false } } };
    const result = await service.answerQuestion('student', dto);
    expect(result.pointsAwarded).toBe(.5);
    expect(result.isCorrect).toBe(false);
    expect(result).not.toHaveProperty('explanation');
    expect(result).not.toHaveProperty('correctOptionKey');
    expect(tx.attemptAnswer.create.mock.calls[0][0].data.response).toEqual(dto.response);
    attempt.answers.push({ ...tx.attemptAnswer.create.mock.calls[0][0].data, question: tf });
    expect((await service.answerQuestion('student', dto)).replayed).toBe(true);
    expect(tx.attemptAnswer.create).toHaveBeenCalledTimes(1);
    expect(tx.question.findMany.mock.calls[0][0].where.OR).toEqual([{ status: 'PUBLISHED' }, { status: 'DRAFT', source: { path: ['reviewStatus'], equals: 'VERIFIED' } }]);
  });
  it('sends four safe statements, no short answer keys, and preserves grouped section order', () => {
    const service: any = new DiagnosticService({} as any);
    expect(service.safeQuestion(tf).statements).toEqual(tf.statements.map(({ key, content }) => ({ key, content })));
    const sa = { ...tf, id: 'sa', questionType: 'SHORT_ANSWER', shortAnswer: { acceptedAnswers: ['7'] } };
    expect(service.safeQuestion(sa)).not.toHaveProperty('shortAnswer');
    expect(service.next([tf, sa], { id: 'a', answers: [{ questionId: tf.id, question: tf, isCorrect: true, pointsAwarded: 1 }] }).id).toBe('sa');
    const sc = { ...tf, id: 'sc', questionType: 'SINGLE_CHOICE' };
    expect(service.next([tf, sa, sc], { id: 'a', answers: [] }).id).toBe('sc');
    expect(service.next([tf, sa, sc], { id: 'a', answers: [{ questionId: 'tf', question: tf, isCorrect: true }] }).id).toBe('sa');
  });
  it('caps grouped sections at twelve, four and six with no return to earlier types', () => {
    const service: any = new DiagnosticService({} as any);
    const types = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'];
    const pool = types.flatMap((questionType, phase) => Array.from({ length: 20 }, (_, n) => ({ ...tf, id: `${phase}-${n}`, skillId: `${phase}-${n}`, questionType })));
    const answers: any[] = [];
    while (true) {
      const q = service.next(pool, { id: 'grouped', answers });
      if (!q) break;
      answers.push({ questionId: q.id, question: q, isCorrect: true, pointsAwarded: 1 });
    }
    expect(answers.map(a => a.question.questionType)).toEqual([...Array(12).fill(types[0]), ...Array(4).fill(types[1]), ...Array(6).fill(types[2])]);
  });
  it('freezes a deterministic grouped full paper and follows its pinned order', () => {
    const service: any = new DiagnosticService({} as any);
    const types = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'];
    const pool = types.flatMap((questionType, phase) => Array.from({ length: 20 }, (_, n) => ({ ...tf, id: `${phase}-${n}`, skillId: `${phase}-${n}`, questionType })));
    const attempt = { id: 'paper', answers: [] };
    pool.splice(0, pool.length, ...DIAGNOSTIC_BLUEPRINT.map(slot => ({ ...tf, ...slot, id: `slot-${slot.slot}`, content: `Question ${slot.slot}`, skill: { ...tf.skill, code: slot.skillCode } })));
    const ids = service.freeze(pool, attempt);
    expect(ids).toEqual(service.freeze([...pool].reverse(), attempt));
    expect(ids).toHaveLength(22);
    expect(ids.map((id: string) => pool.find(q => q.id === id).questionType)).toEqual([...Array(12).fill(types[0]), ...Array(4).fill(types[1]), ...Array(6).fill(types[2])]);
    expect(service.next(pool, { ...attempt, questionIds: ids }).id).toBe(ids[0]);
    expect(service.next(pool, { ...attempt, questionIds: ids, answers: [{ questionId: ids[0] }] }).id).toBe(ids[1]);
  });
  it('rejects incomplete papers instead of silently issuing fewer than 12/4/6 questions', () => {
    const service: any = new DiagnosticService({} as any);
    const pool = DIAGNOSTIC_BLUEPRINT.map(slot => ({ ...tf, ...slot, id: `slot-${slot.slot}`, content: `Question ${slot.slot}`, skill: { ...tf.skill, code: slot.skillCode } }));
    for (const phase of [0, 1, 2]) {
      expect(() => service.freeze(pool.filter(q => q.id !== `slot-${[1, 13, 17][phase]}`), { id: 'paper', answers: [] })).toThrow();
    }
    expect(service.freeze(pool, { id: 'paper', answers: [] })).toHaveLength(22);
  });
  it('uses the same grade-wide pool without consulting account mastery', async () => {
    const tx: any = {
      studentProfile: { findUnique: vi.fn(async () => ({ grade: 9 })) },
      skillNode: { findMany: vi.fn(async () => Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` }))) },
      skillMastery: { findMany: vi.fn() },
      question: { findMany: vi.fn(async () => []) }
    };
    const service: any = new DiagnosticService({} as any);
    await service.pool(tx, 'student-a');
    await service.pool(tx, 'student-b');
    expect(tx.skillMastery.findMany).not.toHaveBeenCalled();
    expect(tx.question.findMany.mock.calls[0][0]).toEqual(tx.question.findMany.mock.calls[1][0]);
    expect(tx.question.findMany.mock.calls[0][0].where.skillId.in).toHaveLength(12);
  });
  it('saves typed full-paper snapshots, rejects foreign questions and finalized drafts', async () => {
    const attempt: any = { id: 'a', studentId: 's', status: 'IN_PROGRESS', questionIds: [tf.id], startedAt: new Date() };
    const tx: any = { $queryRaw: vi.fn(), diagnosticAttempt: { findUnique: vi.fn(() => attempt), update: vi.fn() }, question: { findMany: vi.fn(() => [tf]) } };
    const service = new DiagnosticService({ $transaction: (fn: any) => fn(tx) } as any);
    const answers = [{ questionId: tf.id, response: { trueFalseAnswers: { a: false } } }];
    expect((await service.saveDraft('s', { attemptId: 'a', answers })).saved).toBe(true);
    expect(tx.diagnosticAttempt.update.mock.calls[0][0].data.draftAnswers).toEqual(answers);
    await expect(service.saveDraft('s', { attemptId: 'a', answers: [{ questionId: 'foreign' }] })).rejects.toThrow();
    await expect(service.saveDraft('foreign', { attemptId: 'a', answers })).rejects.toThrow();
    attempt.status = 'COMPLETED';
    await expect(service.saveDraft('s', { attemptId: 'a', answers })).rejects.toThrow();
  });
  it('finalizes all pinned questions from drafts exactly once and counts blanks as zero', async () => {
    const sa = { ...tf, id: 'sa', questionType: 'SHORT_ANSWER', shortAnswer: { mode: 'NUMERIC', acceptedAnswers: ['7'] } };
    const attempt: any = { id: 'a', studentId: 's', status: 'IN_PROGRESS', questionIds: ['tf', 'sa'], answers: [], draftAnswers: [{ questionId: 'tf', response: { trueFalseAnswers: { a: true, b: true, c: true, d: false } } }] };
    const tx: any = { $queryRaw: vi.fn(), diagnosticAttempt: { findUnique: vi.fn(() => attempt), update: vi.fn() }, question: { findMany: vi.fn(() => [tf, sa]) }, attemptAnswer: { create: vi.fn(({ data }) => ({ ...data, answeredAt: new Date() })) }, mistakeRecord: { upsert: vi.fn() }, skillMastery: { upsert: vi.fn() } };
    const service = new DiagnosticService({ $transaction: (fn: any) => fn(tx) } as any);
    const result = await service.submitAttempt('s', 'a');
    expect(result.totalAnswered).toBe(2);
    expect(result.scorePercentage).toBe(25);
    expect(tx.attemptAnswer.create).toHaveBeenCalledTimes(2);
    attempt.status = 'COMPLETED';
    expect((await service.submitAttempt('s', 'a')).alreadySubmitted).toBe(true);
    expect(tx.attemptAnswer.create).toHaveBeenCalledTimes(2);
  });
  it('uses partial credit in ability and mastery while retaining legacy correctness fallback', () => {
    const answers = (pointsAwarded: number) => [{ question: tf, isCorrect: false, pointsAwarded }];
    expect(estimateAbility(answers(.75)).theta).toBeGreaterThan(estimateAbility(answers(0)).theta);
    expect(diagnosticMastery(answers(.75), 0)).toBeGreaterThan(diagnosticMastery(answers(0), 0));
    expect(estimateAbility([{ question: tf, isCorrect: true }])).toEqual(estimateAbility(answers(1)));
  });
});
