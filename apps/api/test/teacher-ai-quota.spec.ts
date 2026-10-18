import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { AiBudgetService } from '../src/modules/ai/ai-budget.service';

describe('Teacher authoring without quotas', () => {
  it('records a teacher request without checking tutoring quotas or old reservations', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'teacher-request' });
    const transaction = vi.fn();
    const service = new AiBudgetService({ aiRequest: { create }, $transaction: transaction } as any);
    const data = { userId: 'teacher', ipHash: 'test', task: 'TEACHER_EXAM', model: 'claude-haiku-4-5-20251001', reservedUsd: 100 };
    expect(await service.reserve(data)).toEqual({ id: 'teacher-request' });
    expect(create).toHaveBeenCalledWith({ data });
    expect(transaction).not.toHaveBeenCalled();
  });
});
