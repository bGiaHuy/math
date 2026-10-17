import {
  Injectable,
  OnModuleInit,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as argon2 from '@node-rs/argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterStudentDto } from './dto/register-student.dto';
import { RegisterTeacherDto } from './dto/register-teacher.dto';
import { UpdateTeacherProfileDto } from './dto/update-teacher-profile.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, UserStatus, TeacherVerificationStatus } from '@prisma/client';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly sessionSecret: string;
  private readonly sessionTtlMs: number;

  constructor(private readonly prisma: PrismaService) {
    this.sessionSecret =
      process.env.SESSION_SECRET || 'adaptivemath_dev_session_secret_key_at_least_32_chars_long';
    this.sessionTtlMs = (parseInt(process.env.SESSION_TTL_SECONDS || '604800', 10)) * 1000;
  }

  async onModuleInit() {
    const pending = await this.prisma.user.findMany({
      where: { role: UserRole.TEACHER_APPLICANT, status: UserStatus.ACTIVE, teacherProfile: { isNot: null } },
      select: { id: true }
    });
    for (const user of pending) await this.autoApproveTeacher(user.id);
  }

  private async autoApproveTeacher(userId: string) {
    return this.prisma.$transaction(async tx => {
      const changed = await tx.user.updateMany({
        where: { id: userId, role: UserRole.TEACHER_APPLICANT, status: UserStatus.ACTIVE },
        data: { role: UserRole.TEACHER, permissionVersion: { increment: 1 } }
      });
      if (changed.count) {
        await tx.teacherProfile.update({ where: { userId }, data: {
          verificationStatus: TeacherVerificationStatus.VERIFIED, verifiedAt: new Date(),
          verifiedByAdminId: null, rejectionReason: null
        } });
        await tx.auditLog.create({ data: {
          actorUserId: userId, action: 'TEACHER_AUTO_APPROVED', targetEntity: 'User', targetEntityId: userId,
          metadata: { actorType: 'SYSTEM', policy: 'automatic_teacher_registration' }
        } });
      }
      return tx.user.findUniqueOrThrow({ where: { id: userId }, include: { studentProfile: true, teacherProfile: true } });
    });
  }

  // Hash password using Argon2id with OWASP recommended parameters
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1
    });
  }

  // Verify password using Argon2id
  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  // Generate a high-entropy 32-byte session token
  generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Hash session token before storing in database (Defense-in-depth against DB leak)
  hashSessionToken(token: string): string {
    return crypto
      .createHmac('sha256', this.sessionSecret)
      .update(token)
      .digest('hex');
  }

  // Register Student
  async registerStudent(dto: RegisterStudentDto) {
    // Check uniqueness of username
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username }
    });
    if (existingUsername) {
      throw new ConflictException({
        code: 'USERNAME_ALREADY_EXISTS',
        message: 'Tên đăng nhập này đã được sử dụng. Vui lòng chọn tên khác.'
      });
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email }
      });
      if (existingEmail) {
        throw new ConflictException({
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Địa chỉ email này đã được sử dụng. Vui lòng chọn email khác.'
        });
      }
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email || null,
        fullName: dto.fullName,
        passwordHash,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        studentProfile: {
          create: {
            grade: 9,
            targetGoal: 'Ôn thi vào lớp 10',
            dailyMinutes: 45,
            parentEmail: dto.parentEmail || null
          }
        }
      },
      include: {
        studentProfile: true
      }
    });

    return this.sanitizeUser(user);
  }

  // Register teacher and approve automatically under system policy
  async registerTeacher(dto: RegisterTeacherDto) {
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });
    if (existingEmail) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Địa chỉ email này đã được sử dụng.'
      });
    }

    // Auto generate username from email prefix if not provided
    const usernamePrefix = dto.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
    const username = `${usernamePrefix}_${crypto.randomBytes(2).toString('hex')}`;

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        username,
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        role: UserRole.TEACHER_APPLICANT,
        status: UserStatus.ACTIVE,
        teacherProfile: {
          create: {
            schoolName: dto.schoolName || null,
            city: dto.city || null,
            verificationStatus: TeacherVerificationStatus.PENDING_REVIEW
          }
        }
      },
      include: {
        teacherProfile: true
      }
    });

    return this.sanitizeUser(await this.autoApproveTeacher(user.id));
  }

  // Login: authenticate credentials and create persistent DB session
  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: dto.identifier }, { email: dto.identifier }]
      },
      include: {
        studentProfile: true,
        teacherProfile: true
      }
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác.'
      });
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Tài khoản của bạn đã bị tạm khóa. Vui lòng liên hệ ban quản trị.'
      });
    }

    const isPasswordValid = await this.verifyPassword(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Tên đăng nhập hoặc mật khẩu không chính xác.'
      });
    }

    if (user.role === UserRole.TEACHER_APPLICANT) {
      user = await this.autoApproveTeacher(user.id);
    }

    // Generate session token and store hash in database
    const sessionToken = this.generateSessionToken();
    const tokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        permissionVersion: user.permissionVersion,
        userAgent: userAgent || 'Unknown',
        ipAddress: ipAddress || 'Unknown',
        expiresAt
      }
    });

    // Record login audit log
    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'USER_LOGIN',
        targetEntity: 'User',
        targetEntityId: user.id,
        ipAddress: ipAddress || null
      }
    });

    // Clean up expired sessions asynchronously in background
    this.cleanupExpiredSessions().catch(() => undefined);

    return {
      user: this.sanitizeUser(user),
      sessionToken,
      expiresAt
    };
  }

  // Validate session token from cookie
  async validateSession(rawToken: string) {
    if (!rawToken || rawToken.length < 32) return null;

    const tokenHash = this.hashSessionToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            studentProfile: true,
            teacherProfile: true
          }
        }
      }
    });

    if (!session || session.revokedAt) return null;

    // Check expiration
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    // Check account status
    if (session.user.status === UserStatus.SUSPENDED) {
      return null;
    }

    // A role or permission change invalidates every session created with an older version.
    if (session.permissionVersion !== session.user.permissionVersion) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      }).catch(() => undefined);
      return null;
    }

    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() }
      }).catch(() => undefined);
    }

    return this.sanitizeUser(session.user);
  }

  // Logout single session
  async logout(rawToken: string, userId?: string, ipAddress?: string) {
    if (!rawToken) return;
    const tokenHash = this.hashSessionToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true }
    });

    await this.prisma.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    const targetUserId = userId || session?.userId;
    if (targetUserId) {
      await this.prisma.auditLog.create({
        data: {
          actorUserId: targetUserId,
          action: 'USER_LOGOUT',
          targetEntity: 'Session',
          targetEntityId: session?.id || targetUserId,
          ipAddress: ipAddress || null
        }
      }).catch(() => undefined);
    }
  }

  async listSessions(userId: string, currentRawToken?: string) {
    const currentTokenHash = currentRawToken
      ? this.hashSessionToken(currentRawToken)
      : undefined;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { permissionVersion: true }
    });

    // Lazily mark any outdated permission version sessions as revoked
    if (user) {
      await this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
          permissionVersion: { lt: user.permissionVersion }
        },
        data: { revokedAt: new Date() }
      }).catch(() => undefined);
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        permissionVersion: user?.permissionVersion || 1,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastSeenAt: 'desc' }
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      isCurrent: session.tokenHash === currentTokenHash
    }));
  }

  async revokeSession(userId: string, sessionId: string, ipAddress?: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    if (result.count === 0) {
      throw new ForbiddenException({
        code: 'SESSION_NOT_ACCESSIBLE',
        message: 'Không thể thu hồi phiên đăng nhập này.'
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'SESSION_REVOKED',
        targetEntity: 'Session',
        targetEntityId: sessionId,
        ipAddress: ipAddress || null
      }
    }).catch(() => undefined);
  }

  // Logout all sessions of a user (e.g. on password reset or account compromise)
  async logoutAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { permissionVersion: { increment: 1 } }
      })
    ]);
  }

  // Change user password
  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Tài khoản không tồn tại trên hệ thống.'
      });
    }

    const isCurrentValid = await this.verifyPassword(user.passwordHash, dto.currentPassword);
    if (!isCurrentValid) {
      throw new BadRequestException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Mật khẩu hiện tại không chính xác.'
      });
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        code: 'PASSWORD_UNCHANGED',
        message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.'
      });
    }

    const newPasswordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          permissionVersion: { increment: 1 }
        }
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'USER_PASSWORD_CHANGED',
          targetEntity: 'User',
          targetEntityId: userId,
          metadata: { timestamp: new Date().toISOString() }
        }
      })
    ]);

    return {
      success: true,
      message: 'Đổi mật khẩu thành công.'
    };
  }

  // Create a fresh session for user (e.g. immediately after changing password)
  async createSessionForUser(userId: string, userAgent?: string, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const sessionToken = this.generateSessionToken();
    const tokenHash = this.hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        permissionVersion: user.permissionVersion,
        userAgent: userAgent || 'Unknown',
        ipAddress: ipAddress || 'Unknown',
        expiresAt
      }
    });

    return { sessionToken, expiresAt };
  }

  // Periodically / asynchronously delete expired sessions
  async cleanupExpiredSessions() {
    const now = new Date();
    await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { revokedAt: { lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } }
        ]
      }
    }).catch(() => undefined);
  }

  // Update and re-submit teacher application after review/rejection
  async updateTeacherProfile(userId: string, dto: UpdateTeacherProfileDto) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId }
    });
    if (!profile) {
      throw new NotFoundException({
        code: 'TEACHER_PROFILE_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ giáo viên.'
      });
    }


    await this.prisma.teacherProfile.update({
      where: { userId },
      data: {
        schoolName: dto.schoolName.trim(),
        city: dto.city ? dto.city.trim() : profile.city,
        rejectionReason: null,
        updatedAt: new Date()
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'TEACHER_PROFILE_UPDATED',
        targetEntity: 'TeacherProfile',
        targetEntityId: profile.id,
        metadata: {
          previousStatus: profile.verificationStatus,
          previousReason: profile.rejectionReason,
          newSchoolName: dto.schoolName
        }
      }
    });

    const refreshedUser = await this.autoApproveTeacher(userId);

    return {
      message: 'Hồ sơ đã được cập nhật. Quyền giáo viên được hệ thống cấp tự động.',
      user: this.sanitizeUser(refreshedUser)
    };
  }

  // Strip password hash from returned user object
  sanitizeUser(user: any) {
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }
}
