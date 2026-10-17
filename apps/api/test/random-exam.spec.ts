import { describe, it, expect, vi } from 'vitest';
import { AssignmentService } from '../src/modules/assignment/assignment.service';

const rows = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'].flatMap(questionType => Array.from({ length: 30 }, (_, i) => ({ id: `${questionType}-${i}`, content: `${questionType} ${i}`, questionType })));
const setup = (pool = rows) => {
  const findMany = vi.fn().mockResolvedValue(pool);
  return { service: new AssignmentService({ question: { findMany } } as any), findMany };
};
describe('Random bank exam preview', () => {
  it('selects default 12/4/6 without replacement and never writes', async () => {
    const { service, findMany } = setup();
    const result = await service.randomPreview('teacher', {});
    expect(result.questionIds).toHaveLength(22);
    expect(new Set(result.questionIds).size).toBe(22);
    for (const [type, count] of Object.entries(result.questionCounts)) expect(result.questions.filter(q => q.questionType === type)).toHaveLength(count);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0][0].where.OR).toContainEqual({ status: 'DRAFT', authorId: 'teacher' });
    expect(findMany.mock.calls[0][0].where.skill).toEqual({ grade: 9 });
  });
  it('passes difficulty and topic constraints to database', async () => {
    const { service, findMany } = setup();
    await service.randomPreview('teacher', { difficulty: 'HARD', skillId: 'skill', cognitiveLevel: 'APPLYING', questionCounts: { SINGLE_CHOICE: 1, TRUE_FALSE: 1, SHORT_ANSWER: 1 } });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ difficulty: 'HARD', skillId: 'skill', cognitiveLevel: 'APPLYING' });
  });
  it('rejects insufficient bank rather than quietly changing counts', async () => {
    const { service } = setup(rows.filter(q => q.questionType === 'SINGLE_CHOICE'));
    await expect(service.randomPreview('teacher', {})).rejects.toThrow();
  });
  it('deduplicates copies by normalized question content', async () => {
    const { service } = setup([{ id: '1', questionType: 'SINGLE_CHOICE', content: ' A   B ' }, { id: '2', questionType: 'SINGLE_CHOICE', content: 'a b' }] as any);
    await expect(service.randomPreview('teacher', { questionCounts: { SINGLE_CHOICE: 2, TRUE_FALSE: 0, SHORT_ANSWER: 0 } })).rejects.toThrow();
  });
  it('rejects empty, fractional or over-limit count requests', async () => {
    const { service, findMany } = setup();
    for (const count of [0, -1, 0.5, 201]) await expect(service.randomPreview('teacher', { questionCounts: { SINGLE_CHOICE: count, TRUE_FALSE: 0, SHORT_ANSWER: 0 } })).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  });
});
