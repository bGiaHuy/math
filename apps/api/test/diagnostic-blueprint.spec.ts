import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { DIAGNOSTIC_BLUEPRINT, selectBlueprintPaper } from '../src/modules/diagnostic/diagnostic-blueprint';
import { DiagnosticService } from '../src/modules/diagnostic/diagnostic.service';

const bank = () => DIAGNOSTIC_BLUEPRINT.flatMap(slot => Array.from({ length: 4 }, (_, variant) => ({
  id: `${slot.slot}-${variant}`, questionType: slot.questionType, cognitiveLevel: slot.cognitiveLevel,
  difficulty: slot.difficulty, content: `Slot ${slot.slot}, variant ${variant}`, skillId: slot.skillCode,
  skill: { code: slot.skillCode, title: slot.topic, chapter: slot.topic },
  options: [{ optionKey: 'A', content: 'Answer', isCorrect: true }],
  statements: ['a', 'b', 'c', 'd'].map(key => ({ key, content: key, isCorrect: true })),
  shortAnswer: { acceptedAnswers: ['7'] }, explanation: 'Secret solution'
})));

describe('Grade 9 comprehensive diagnostic blueprint', () => {
  it('gives 100 accounts different papers with identical topic, cognition and difficulty at every slot', () => {
    const pool = bank(), papers = new Set<string>();
    for (let account = 0; account < 100; account++) {
      const ids = selectBlueprintPaper(pool, `attempt-${account}`);
      papers.add(ids.join(','));
      expect(ids).toHaveLength(22);
      expect(new Set(ids).size).toBe(22);
      expect(ids.map(id => {
        const q = pool.find(q => q.id === id)!;
        return [q.questionType, q.skill.code, q.cognitiveLevel, q.difficulty];
      })).toEqual(DIAGNOSTIC_BLUEPRINT.map(s => [s.questionType, s.skillCode, s.cognitiveLevel, s.difficulty]));
      expect(ids).toEqual(selectBlueprintPaper([...pool].reverse(), `attempt-${account}`));
    }
    expect(papers.size).toBe(100);
    expect(DIAGNOSTIC_BLUEPRINT.filter(s => s.questionType === 'SINGLE_CHOICE')).toHaveLength(12);
    expect(DIAGNOSTIC_BLUEPRINT.filter(s => s.questionType === 'TRUE_FALSE')).toHaveLength(4);
    expect(DIAGNOSTIC_BLUEPRINT.filter(s => s.questionType === 'SHORT_ANSWER')).toHaveLength(6);
    expect(['REMEMBERING', 'UNDERSTANDING', 'APPLYING', 'ADVANCED_APPLYING'].map(level =>
      DIAGNOSTIC_BLUEPRINT.filter(s => s.cognitiveLevel === level).length)).toEqual([9, 7, 4, 2]);
  });
  it('never substitutes a different topic, cognitive level or difficulty when a slot is missing', () => {
    for (const field of ['cognitiveLevel', 'difficulty', 'skill']) {
      const pool: any[] = bank().map(q => q.id.startsWith('22-') ? { ...q, [field]: field === 'skill' ? { code: 'SKILL-08' } : 'WRONG' } : q);
      try { selectBlueprintPaper(pool, 'a'); throw new Error('Expected shortage'); }
      catch (e: any) {
        expect(e.getResponse().code).toBe('DIAGNOSTIC_BLUEPRINT_INSUFFICIENT');
        expect(e.getResponse().shortages.map((s: any) => s.slot)).toContain(22);
      }
    }
  });
  it('rejects duplicated content even under different question IDs', () => {
    const pool = bank().map(q => ({ ...q, content: 'Same question' }));
    expect(() => selectBlueprintPaper(pool, 'a')).toThrow();
  });
  it('pins safe questions on start and resumes without reselecting the paper', async () => {
    const pool = bank();
    let attempt: any = null;
    const tx: any = {
      $queryRaw: vi.fn(), mathPracticeSession: { findFirst: vi.fn(async () => null) },
      studentProfile: { findUnique: vi.fn(async () => ({ grade: 9 })) },
      skillNode: { findMany: vi.fn(async () => pool.map(q => ({ id: q.skillId }))) },
      question: { findMany: vi.fn(async () => pool) },
      diagnosticAttempt: {
        findFirst: vi.fn(async () => attempt),
        create: vi.fn(async ({ data }) => (attempt = { ...data, id: 'attempt', status: 'IN_PROGRESS', startedAt: new Date(), answers: [] })),
        update: vi.fn(async ({ data }) => Object.assign(attempt, data))
      }
    };
    const service = new DiagnosticService({ $transaction: (fn: any) => fn(tx) } as any);
    const started = await service.startAttempt('student');
    expect(started.questions).toHaveLength(22);
    for (const q of started.questions) {
      expect(q).not.toHaveProperty('shortAnswer');
      expect(q).not.toHaveProperty('explanation');
      expect(q.options.every((o: any) => !('isCorrect' in o))).toBe(true);
      expect((q.statements || []).every((s: any) => !('isCorrect' in s))).toBe(true);
    }
    pool.reverse();
    const resumed = await service.startAttempt('student');
    expect(resumed.isResumed).toBe(true);
    expect(resumed.questions.map((q: any) => q.id)).toEqual(started.questions.map((q: any) => q.id));
    expect(tx.diagnosticAttempt.create).toHaveBeenCalledTimes(1);
  });
  it('does not create an attempt when the bank cannot satisfy the blueprint', async () => {
    const tx: any = {
      $queryRaw: vi.fn(), mathPracticeSession: { findFirst: vi.fn(async () => null) },
      studentProfile: { findUnique: vi.fn(async () => ({ grade: 9 })) },
      skillNode: { findMany: vi.fn(async () => [{ id: 'skill' }]) },
      question: { findMany: vi.fn(async () => bank().slice(0, 4)) },
      diagnosticAttempt: { findFirst: vi.fn(async () => null), create: vi.fn() }
    };
    const service = new DiagnosticService({ $transaction: (fn: any) => fn(tx) } as any);
    await expect(service.startAttempt('student')).rejects.toThrow();
    expect(tx.diagnosticAttempt.create).not.toHaveBeenCalled();
  });
});
