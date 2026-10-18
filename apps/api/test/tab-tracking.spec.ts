import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { validate } from 'class-validator';
import { AssignmentSettingsDto } from '../src/modules/assignment/teacher-workspace.dto';
import { TeacherWorkspaceService } from '../src/modules/assignment/teacher-workspace.service';

describe('Assignment tab activity', () => {
  const event = { id: 'event-1', sessionId: 'session-1', kind: 'HIDDEN', occurredAt: new Date().toISOString() };
  function fixture(mode: string, enabled: boolean, status = 'IN_PROGRESS') {
    const sub = { id: 'submission', status, startedAt: new Date(Date.now() - 60000), activityEvents: [],
      assignment: { settings: { mode, trackTabSwitches: enabled }, classroom: { memberships: [{}] } } };
    const tx = { $executeRaw: vi.fn(), assignmentSubmission: {
      findUnique: vi.fn().mockResolvedValue(sub), update: vi.fn().mockResolvedValue(sub),
    } };
    const service = new TeacherWorkspaceService({ $transaction: (fn: any) => fn(tx) } as any);
    return { service, tx };
  }
  it('validates the optional setting as a boolean', async () => {
    expect(await validate(Object.assign(new AssignmentSettingsDto(), { trackTabSwitches: true }))).toHaveLength(0);
    expect(await validate(Object.assign(new AssignmentSettingsDto(), { trackTabSwitches: 'false' }))).toHaveLength(1);
  });
  for (const mode of ['TEST', 'PRACTICE']) {
    it(`stores each event once in ${mode} when enabled`, async () => {
      const { service, tx } = fixture(mode, true);
      expect(await service.activity('student', 'exam', event)).toEqual({ saved: true });
      await service.activity('student', 'exam', event);
      expect(tx.assignmentSubmission.update).toHaveBeenCalledTimes(1);
    });
    it(`rejects activity in ${mode} when disabled`, async () => {
      const { service, tx } = fixture(mode, false);
      expect(await service.activity('student', 'exam', event)).toEqual({ saved: false });
      expect(tx.assignmentSubmission.update).not.toHaveBeenCalled();
    });
  }
  it('does not count departures after submission', async () => {
    const { service, tx } = fixture('TEST', true, 'SUBMITTED');
    expect(await service.activity('student', 'exam', event)).toEqual({ saved: false });
    expect(tx.assignmentSubmission.update).not.toHaveBeenCalled();
  });
});
