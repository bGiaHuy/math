import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { UserRole, TeacherVerificationStatus } from '@prisma/client';
import { AssignmentService } from '../src/modules/assignment/assignment.service';
import { AssignmentController } from '../src/modules/assignment/assignment.controller';
import { ClassroomService } from '../src/modules/classroom/classroom.service';
import { ClassroomController } from '../src/modules/classroom/classroom.controller';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';

const context = (controller: any, method: string, role: string, verified = true) => ({
  getHandler: () => controller.prototype[method], getClass: () => controller,
  switchToHttp: () => ({ getRequest: () => ({ user: { role, teacherProfile: { verificationStatus: verified ? TeacherVerificationStatus.VERIFIED : TeacherVerificationStatus.PENDING_REVIEW } } }) })
}) as any;

describe('Classroom authorization policy', () => {
  const guard = new RolesGuard(new Reflector());
  for (const [controller, methods] of [
    [ClassroomController, ['createClassroom', 'getTeacherClassrooms', 'getClassroomDetails', 'generateInviteCode', 'revokeInviteCode', 'getClassroomStudents']],
    [AssignmentController, ['createAssignment', 'getAssignmentSubmissions', 'deleteAssignment']]
  ] as const) {
    for (const method of methods) {
      it(`${controller.name}.${method} enforces observer admin and owner teacher policy`, () => {
        expect(guard.canActivate(context(controller, method, UserRole.TEACHER))).toBe(true);
        const writes = ['createClassroom', 'generateInviteCode', 'revokeInviteCode', 'createAssignment', 'deleteAssignment'];
        if (writes.includes(method)) expect(() => guard.canActivate(context(controller, method, UserRole.ADMIN))).toThrow();
        else expect(guard.canActivate(context(controller, method, UserRole.ADMIN))).toBe(true);
        for (const role of [UserRole.STUDENT, UserRole.TEACHER_APPLICANT, UserRole.CONTENT_AUTHOR, UserRole.CONTENT_REVIEWER, 'UNKNOWN']) expect(() => guard.canActivate(context(controller, method, role))).toThrow();
        expect(() => guard.canActivate(context(controller, method, UserRole.TEACHER, false))).toThrow();
      });
    }
  }
  for (const method of ['getAssignmentForTaking', 'submitAssignment', 'getStudentAssignmentResult']) {
    it(`${method} remains student-only`, () => {
      expect(guard.canActivate(context(AssignmentController, method, UserRole.STUDENT))).toBe(true);
      for (const role of [UserRole.ADMIN, UserRole.TEACHER]) expect(() => guard.canActivate(context(AssignmentController, method, role))).toThrow();
    });
  }
  it('limits teacher listing while letting admin list all classrooms', async () => {
    const db = { classroom: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new ClassroomService(db as any);
    await service.getTeacherClassrooms('teacher');
    expect(db.classroom.findMany.mock.calls[0][0].where).toEqual({ teacherId: 'teacher' });
    await service.getTeacherClassrooms('admin', UserRole.ADMIN);
    expect(db.classroom.findMany.mock.calls[1][0].where).toEqual({});
  });
  it('denies cross-class deletion even when the caller owns the URL classroom', async () => {
    const db = { classroom: { findUnique: vi.fn().mockResolvedValue({ teacherId: 'teacher' }) }, classroomAssignment: { findUnique: vi.fn().mockResolvedValue({ classId: 'other-class' }), delete: vi.fn() } };
    const service = new AssignmentService(db as any);
    await expect(service.deleteAssignment('teacher', 'owned-class', 'foreign-assignment')).rejects.toThrow();
    expect(db.classroomAssignment.delete).not.toHaveBeenCalled();
    await expect(service.deleteAssignment('stranger', 'owned-class', 'foreign-assignment')).rejects.toThrow();
  });
  it('denies admin writes even when service is called directly', async () => {
    const db = { classroom: { findUnique: vi.fn().mockResolvedValue({ teacherId: 'teacher' }) }, classroomAssignment: { findUnique: vi.fn().mockResolvedValue({ classId: 'class' }), delete: vi.fn().mockResolvedValue({}) } };
    const service = new AssignmentService(db as any);
    await expect(service.deleteAssignment('admin', 'class', 'assignment', UserRole.ADMIN)).rejects.toThrow();
    await expect(service.createAssignment('admin', 'class', {} as any, UserRole.ADMIN)).rejects.toThrow();
    expect(db.classroomAssignment.delete).not.toHaveBeenCalled();
    const classes = new ClassroomService(db as any);
    await expect(classes.createClassroom('admin', {} as any, UserRole.ADMIN)).rejects.toThrow();
    await expect(classes.generateInviteCode('admin', 'class', {} as any, UserRole.ADMIN)).rejects.toThrow();
    await expect(classes.revokeInviteCode('admin', 'class', 'code', UserRole.ADMIN)).rejects.toThrow();
  });
  for (const state of [{ status: 'DRAFT', active: true }, { status: 'CLOSED', active: true }, { status: 'PUBLISHED', active: false }, { status: 'PUBLISHED', active: true, dueDate: new Date(0) }]) {
    it(`rejects submission for ${JSON.stringify(state)}`, async () => {
      const db = { classroomAssignment: { findUnique: vi.fn().mockResolvedValue({ status: state.status, dueDate: state.dueDate, classroom: { isActive: state.active, memberships: [{ studentId: 'student', status: 'ACTIVE' }] }, submissions: [] }) }, assignmentSubmission: { create: vi.fn() } };
      await expect(new AssignmentService(db as any).submitAssignment('student', 'assignment', { answers: [] } as any)).rejects.toThrow();
      expect(db.assignmentSubmission.create).not.toHaveBeenCalled();
    });
  }
  it('keeps non-member students out and restricts members to published or closed assignments and their own completed submissions', async () => {
    const classroom = { teacherId: 'teacher', memberships: [{ studentId: 'member', status: 'ACTIVE' }] };
    const db = { classroom: { findUnique: vi.fn().mockResolvedValue(classroom) }, classroomAssignment: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new AssignmentService(db as any);
    await expect(service.getClassAssignments('outsider', 'class', false)).rejects.toThrow();
    await expect(service.getClassAssignments('other-teacher', 'class', true)).rejects.toThrow();
    await service.getClassAssignments('member', 'class', false);
    expect(db.classroomAssignment.findMany.mock.calls[0][0]).toMatchObject({ where: { classId: 'class', status: { in: ['PUBLISHED', 'CLOSED'] } }, include: { submissions: { where: { studentId: 'member', status: { not: 'IN_PROGRESS' } } } } });
    await service.getClassAssignments('admin', 'class', true, UserRole.ADMIN);
    expect(db.classroomAssignment.findMany.mock.calls[1][0].where).toEqual({ classId: 'class' });
  });
});
