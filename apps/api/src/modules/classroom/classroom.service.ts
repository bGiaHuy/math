import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassroomDto } from './dto/create-classroom.dto';
import { GenerateInviteCodeDto } from './dto/generate-invite-code.dto';
import { JoinClassroomDto } from './dto/join-classroom.dto';
import {
  generateCrockfordCode,
  normalizeCrockfordCode,
  hashInviteCode
} from './utils/crockford.util';
import { UserRole, TeacherVerificationStatus } from '@prisma/client';

@Injectable()
export class ClassroomService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Create a new Classroom (Only Verified Teachers)
  async createClassroom(teacherId: string, dto: CreateClassroomDto, role: UserRole = UserRole.TEACHER) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException({ code: 'CLASSROOM_READ_ONLY', message: 'Chỉ giáo viên phụ trách được thay đổi lớp học và bài tập.' });
    }
    const teacher = await this.prisma.user.findUnique({
      where: { id: teacherId },
      include: { teacherProfile: true }
    });

    if (!teacher || teacher.teacherProfile?.verificationStatus !== TeacherVerificationStatus.VERIFIED) {
      throw new ForbiddenException({
        code: 'TEACHER_NOT_VERIFIED',
        message: 'Chỉ giáo viên đã hoàn tất xác minh chuyên môn mới có quyền tạo lớp học.'
      });
    }

    // Generate initial Crockford 8-char code
    const plainCode = generateCrockfordCode(8);
    const codeHash = hashInviteCode(plainCode);
    const codePrefix = plainCode.substring(0, 3);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 days default

    const classroom = await this.prisma.classroom.create({
      data: {
        teacherId,
        name: dto.name,
        grade: dto.grade || 9,
        academicYear: dto.academicYear || '2026-2027',
        isActive: true,
        inviteCodes: {
          create: {
            codeHash,
            codePlainPrefix: codePrefix,
            maxUses: 50,
            usedCount: 0,
            expiresAt
          }
        }
      },
      include: {
        inviteCodes: true
      }
    });

    return {
      message: 'Tạo lớp học thành công',
      classroom: {
        id: classroom.id,
        name: classroom.name,
        grade: classroom.grade,
        academicYear: classroom.academicYear,
        createdAt: classroom.createdAt,
        inviteCode: plainCode, // Return plain code once on generation
        codeExpiresAt: expiresAt
      }
    };
  }

  // 2. List all classrooms owned by teacher
  async getTeacherClassrooms(teacherId: string, role: UserRole = UserRole.TEACHER) {
    const classrooms = await this.prisma.classroom.findMany({
      where: role === UserRole.ADMIN ? {} : { teacherId },
      include: {
        _count: {
          select: { memberships: true }
        },
        inviteCodes: {
          where: {
            revokedAt: null,
            expiresAt: { gt: new Date() }
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return classrooms.map(c => ({
      id: c.id,
      name: c.name,
      grade: c.grade,
      academicYear: c.academicYear,
      isActive: c.isActive,
      studentCount: c._count.memberships,
      activeCodePrefix: c.inviteCodes[0]?.codePlainPrefix || null,
      codeExpiresAt: c.inviteCodes[0]?.expiresAt || null,
      createdAt: c.createdAt
    }));
  }

  // 3. Get Classroom Details with Scope / Ownership Guard
  async getClassroomDetails(teacherId: string, classId: string, role: UserRole = UserRole.TEACHER) {
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId },
      include: {
        memberships: {
          include: {
            student: {
              include: {
                studentProfile: true
              }
            }
          }
        },
        inviteCodes: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!classroom) {
      throw new NotFoundException({
        code: 'CLASSROOM_NOT_FOUND',
        message: 'Không tìm thấy lớp học.'
      });
    }

    // Ownership scope check (PRD security requirement)
    if ((role !== UserRole.ADMIN && classroom.teacherId !== teacherId)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'Bạn không có quyền quản lý lớp học này.'
      });
    }

    return {
      id: classroom.id,
      name: classroom.name,
      grade: classroom.grade,
      academicYear: classroom.academicYear,
      isActive: classroom.isActive,
      students: classroom.memberships.map(m => ({
        studentId: m.studentId,
        username: m.student.username,
        fullName: m.student.fullName,
        email: m.student.email,
        targetGoal: m.student.studentProfile?.targetGoal,
        dailyMinutes: m.student.studentProfile?.dailyMinutes,
        joinedAt: m.joinedAt
      })),
      inviteCodes: classroom.inviteCodes.map(code => ({
        id: code.id,
        codePrefix: code.codePlainPrefix,
        usedCount: code.usedCount,
        maxUses: code.maxUses,
        expiresAt: code.expiresAt,
        isRevoked: code.revokedAt !== null
      }))
    };
  }

  // 4. Generate a new Crockford Invite Code
  async generateInviteCode(teacherId: string, classId: string, dto: GenerateInviteCodeDto, role: UserRole = UserRole.TEACHER) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException({ code: 'CLASSROOM_READ_ONLY', message: 'Chỉ giáo viên phụ trách được thay đổi lớp học và bài tập.' });
    }
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId }
    });

    if (!classroom) {
      throw new NotFoundException({
        code: 'CLASSROOM_NOT_FOUND',
        message: 'Không tìm thấy lớp học.'
      });
    }

    if (classroom.teacherId !== teacherId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'Bạn không có quyền tạo mã mời cho lớp này.'
      });
    }

    const plainCode = generateCrockfordCode(8);
    const codeHash = hashInviteCode(plainCode);
    const codePrefix = plainCode.substring(0, 3);
    const expiresInDays = dto.expiresInDays || 30;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 3600 * 1000);

    const record = await this.prisma.classroomInviteCode.create({
      data: {
        classId,
        codeHash,
        codePlainPrefix: codePrefix,
        maxUses: dto.maxUses || 50,
        expiresAt
      }
    });

    return {
      message: 'Tạo mã mời lớp thành công',
      inviteCodeId: record.id,
      plainCode, // Shown once
      expiresAt,
      maxUses: record.maxUses
    };
  }

  // 5. Revoke an Invite Code
  async revokeInviteCode(teacherId: string, classId: string, codeId: string, role: UserRole = UserRole.TEACHER) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException({ code: 'CLASSROOM_READ_ONLY', message: 'Chỉ giáo viên phụ trách được thay đổi lớp học và bài tập.' });
    }
    const classroom = await this.prisma.classroom.findUnique({
      where: { id: classId }
    });

    if (!classroom || classroom.teacherId !== teacherId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_SCOPE',
        message: 'Bạn không có quyền thao tác trên lớp học này.'
      });
    }

    const code = await this.prisma.classroomInviteCode.findFirst({
      where: { id: codeId, classId }
    });

    if (!code) {
      throw new NotFoundException({
        code: 'CODE_NOT_FOUND',
        message: 'Mã mời không tồn tại.'
      });
    }

    await this.prisma.classroomInviteCode.update({
      where: { id: codeId },
      data: { revokedAt: new Date() }
    });

    return {
      message: 'Đã thu hồi mã mời lớp thành công'
    };
  }

  // 6. Student Joins Classroom via Crockford Code
  async joinClassroom(studentId: string, dto: JoinClassroomDto) {
    const normalized = normalizeCrockfordCode(dto.code);
    if (normalized.length < 4) {
      throw new BadRequestException({
        code: 'INVALID_CODE_FORMAT',
        message: 'Mã lớp không hợp lệ.'
      });
    }

    const codeHash = hashInviteCode(normalized);

    const inviteCode = await this.prisma.classroomInviteCode.findUnique({
      where: { codeHash },
      include: {
        classroom: {
          include: {
            teacher: true
          }
        }
      }
    });

    if (!inviteCode) {
      throw new NotFoundException({
        code: 'INVALID_INVITE_CODE',
        message: 'Mã tham gia lớp không tồn tại hoặc đã bị thu hồi.'
      });
    }

    if (inviteCode.revokedAt) {
      throw new BadRequestException({
        code: 'CODE_REVOKED',
        message: 'Mã mời này đã bị giáo viên thu hồi.'
      });
    }

    if (inviteCode.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        code: 'CODE_EXPIRED',
        message: 'Mã mời này đã hết hạn sử dụng.'
      });
    }

    if (inviteCode.usedCount >= inviteCode.maxUses) {
      throw new BadRequestException({
        code: 'CODE_MAX_USES_REACHED',
        message: 'Mã mời đã đạt số lượng học sinh tối đa.'
      });
    }

    // Check if student already joined this classroom
    const existingMembership = await this.prisma.classroomMembership.findUnique({
      where: {
        classId_studentId: {
          classId: inviteCode.classId,
          studentId
        }
      }
    });

    if (existingMembership) {
      throw new ConflictException({
        code: 'ALREADY_JOINED_CLASS',
        message: 'Bạn đã là thành viên của lớp học này rồi.'
      });
    }

    // Create membership & increment usedCount
    await this.prisma.$transaction([
      this.prisma.classroomMembership.create({
        data: {
          classId: inviteCode.classId,
          studentId,
          status: 'ACTIVE'
        }
      }),
      this.prisma.classroomInviteCode.update({
        where: { id: inviteCode.id },
        data: {
          usedCount: { increment: 1 }
        }
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: studentId,
          action: 'STUDENT_JOIN_CLASSROOM',
          targetEntity: 'Classroom',
          targetEntityId: inviteCode.classId
        }
      })
    ]);

    return {
      message: 'Tham gia lớp học thành công!',
      classroom: {
        id: inviteCode.classroom.id,
        name: inviteCode.classroom.name,
        grade: inviteCode.classroom.grade,
        academicYear: inviteCode.classroom.academicYear,
        teacherName: inviteCode.classroom.teacher.fullName
      }
    };
  }

  // 7. Get student list for a classroom
  async getClassroomStudents(teacherId: string, classId: string, role: UserRole = UserRole.TEACHER) {
    const details = await this.getClassroomDetails(teacherId, classId, role);
    return details.students;
  }
}
