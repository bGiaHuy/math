import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { UserRole } from '@prisma/client';
import { requireQuestionLabels } from '../src/modules/question/question-labels';
import { AdminService } from '../src/modules/admin/admin.service';
import { AssignmentService } from '../src/modules/assignment/assignment.service';

describe('Question knowledge and difficulty labels', () => {
  it('rejects missing or invalid labels instead of supplying a default', () => {
    for (const q of [{}, { skillId: 's' }, { difficulty: 'EASY' }, { skillId: ' ', difficulty: 'EASY' }, { skillId: 's', difficulty: 'UNKNOWN' }]) expect(() => requireQuestionLabels(q)).toThrow();
    expect(() => requireQuestionLabels({ skillId: 's', difficulty: 'VERY_HARD' })).not.toThrow();
  });
  it('rejects unlabeled admin creation before touching storage', async () => {
    const db: any = { question: { create: vi.fn() } };
    const service = new AdminService(db);
    await expect(service.createQuestion('author', { skillId: 's', cognitiveLevel: 'REMEMBERING' } as any)).rejects.toThrow();
    expect(db.question.create).not.toHaveBeenCalled();
  });
  it('does not publish unresolved placeholder questions', async () => {
    const db: any = { question: { findUnique: vi.fn(async () => ({ id: 'q', authorId: 'author', source: { classification: { status: 'NEEDS_REVIEW' } } })), update: vi.fn() } };
    const service = new AdminService(db);
    await expect(service.reviewQuestion('reviewer', 'q', { status: 'PUBLISHED' } as any)).rejects.toThrow();
    expect(db.question.update).not.toHaveBeenCalled();
  });
  function setup(grade = 9) {
    const question = { id: 'q', skillId: 'old', authorId: 'author', cognitiveLevel: 'UNDERSTANDING', difficulty: 'EASY', skill: { grade: 9 }, source: { reviewStatus: 'VERIFIED', classification: { status: 'PROVISIONAL' } } };
    const tx: any = { question: { findUnique: vi.fn(async () => question), update: vi.fn(async ({ data }) => ({ ...question, ...data })) },
      skillNode: { findUnique: vi.fn(async () => ({ id: 'new', code: 'SKILL-07', title: 'Lượng giác', chapter: 'Hình học', grade })) },
      auditLog: { create: vi.fn() } };
    const db: any = { $transaction: (fn: any) => fn(tx) };
    return { tx, service: new AdminService(db) };
  }
  it('updates topic and difficulty atomically, preserves provenance and records the change', async () => {
    const { tx, service } = setup();
    const q = await service.setQuestionLabels('author', UserRole.CONTENT_AUTHOR, 'q', { skillId: 'new', difficulty: 'MEDIUM' });
    expect(q.skillId).toBe('new'); expect(q.difficulty).toBe('MEDIUM');
    expect((q.source as any).reviewStatus).toBe('VERIFIED');
    expect((q.source as any).classification).toMatchObject({ skillCode: 'SKILL-07', difficulty: 'MEDIUM', method: 'USER_LABELLED' });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(tx.question.update.mock.calls[0][0].data).not.toHaveProperty('content');
    expect(tx.question.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });
  it('rejects editing another author and cross-grade topics without writing', async () => {
    const a = setup();
    await expect(a.service.setQuestionLabels('outsider', UserRole.TEACHER, 'q', { skillId: 'new', difficulty: 'MEDIUM' })).rejects.toThrow();
    expect(a.tx.question.update).not.toHaveBeenCalled();
    const b = setup(8);
    await expect(b.service.setQuestionLabels('admin', UserRole.ADMIN, 'q', { skillId: 'new', difficulty: 'MEDIUM' })).rejects.toThrow();
    expect(b.tx.question.update).not.toHaveBeenCalled();
  });
  it('requires labels on custom assignment questions before creating them', async () => {
    const tx: any = { question: { findMany: vi.fn(async () => []), create: vi.fn() } };
    const db: any = { classroom: { findUnique: vi.fn(async () => ({ id: 'c', teacherId: 'teacher', grade: 9 })) }, $transaction: (fn: any) => fn(tx) };
    const service = new AssignmentService(db);
    await expect(service.createAssignment('teacher', 'c', { title: 'Test', durationMinutes: 45, customQuestions: [{ questionType: 'SHORT_ANSWER', content: 'Tính 1/2', shortAnswer: { mode: 'NUMERIC', acceptedAnswers: ['0.5'] } }] } as any)).rejects.toThrow();
    expect(tx.question.create).not.toHaveBeenCalled();
  });
});
