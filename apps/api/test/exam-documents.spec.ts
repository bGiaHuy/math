import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ExamDocumentService } from '../src/modules/assignment/exam-document.service';
import { mwapiToken } from '../src/modules/ai/ai.config';

describe('Original exam files', () => {
  it('checks actual file signature rather than trusting the extension or browser MIME', async () => {
    const prisma = { examDocument: { create: vi.fn().mockResolvedValue({ id: 'doc' }) } };
    const service = new ExamDocumentService(prisma as any);
    await expect(service.upload('teacher', { originalname: 'exam.pdf', buffer: Buffer.from('<script>bad</script>') })).rejects.toThrow('Tệp không hợp lệ');
    await expect(service.upload('teacher', { originalname: 'exam.svg', buffer: Buffer.from('<svg/>') })).rejects.toThrow();
    expect(prisma.examDocument.create).not.toHaveBeenCalled();
    await service.upload('teacher', { originalname: 'exam.pdf', buffer: Buffer.from('%PDF-1.4\nexam') });
    expect(prisma.examDocument.create.mock.calls[0][0].data.mimeType).toBe('application/pdf');
  });
  it('accepts PNG signatures and stores original bytes privately', async () => {
    const prisma = { examDocument: { create: vi.fn().mockResolvedValue({ id: 'doc' }) } };
    const service = new ExamDocumentService(prisma as any);
    const buffer = Buffer.from([137,80,78,71,13,10,26,10,0]);
    await service.upload('teacher', { originalname: 'geometry.png', buffer });
    const args = prisma.examDocument.create.mock.calls[0][0];
    expect(args.data).toMatchObject({ ownerId: 'teacher', mimeType: 'image/png', content: buffer });
    expect(args.select.content).toBeUndefined();
  });
  it('denies an unassigned student and permits the document owner', async () => {
    const prisma = { examDocument: { findUnique: vi.fn().mockResolvedValue({ id: 'doc', ownerId: 'owner', fileName: 'exam.pdf' }) }, classroomAssignment: { findFirst: vi.fn().mockResolvedValue(null) } };
    const service = new ExamDocumentService(prisma as any);
    await expect(service.get('student', 'doc', 'STUDENT')).rejects.toThrow('Bạn không có quyền');
    const result = await service.get('owner', 'doc', 'TEACHER');
    expect(result).toMatchObject({ id: 'doc' }); expect(result).not.toHaveProperty('ownerId');
    expect(prisma.classroomAssignment.findFirst.mock.calls[0][0].where.classroom.memberships.some).toEqual({ studentId: 'student', status: 'ACTIVE' });
  });
  it('prefers the project credential over a token inherited from the coding environment', () => {
    expect(mwapiToken({ MATH_MWAPI_AUTH_TOKEN: 'project-test', ANTHROPIC_AUTH_TOKEN: 'inherited-test' })).toBe('project-test');
    expect(mwapiToken({ ANTHROPIC_AUTH_TOKEN: 'legacy-test' })).toBe('legacy-test');
  });
});
