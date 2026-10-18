import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ReviewQuestionDto } from './dto/review-question.dto';
import {
  UserRole,
  UserStatus,
  TeacherVerificationStatus,
  QuestionStatus,
  AttemptStatus
} from '@prisma/client';
import { requireQuestionLabels } from '../question/question-labels';
import { buildQuestionData } from '../question/math-question';
import * as argon2 from '@node-rs/argon2';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // 3. Create Question (Initial status: DRAFT)
  async createQuestion(authorId: string, dto: CreateQuestionDto) {
    requireQuestionLabels(dto);
    const skill = await this.prisma.skillNode.findUnique({
      where: { id: dto.skillId }
    });

    if (!skill || skill.code === 'MATH9-REVIEW-REQUIRED') {
      throw new NotFoundException({
        code: 'SKILL_NOT_FOUND',
        message: 'Kỹ năng SkillNode không tồn tại.'
      });
    }

    const question = await this.prisma.question.create({
      data: {
        skillId: dto.skillId,
        versionNumber: 1,
        cognitiveLevel: dto.cognitiveLevel,
        difficulty: dto.difficulty,
        irtA: dto.irtA,
        irtB: dto.irtB,
        irtC: dto.irtC,
        content: dto.content,
        explanation: dto.explanation,
        status: QuestionStatus.DRAFT,
        authorId,
        ...buildQuestionData(dto)
      },
      include: {
        options: true,
        skill: true
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: authorId,
        action: 'QUESTION_CREATED',
        targetEntity: 'Question',
        targetEntityId: question.id,
        metadata: { skillCode: skill.code, version: 1 }
      }
    });

    return {
      message: 'Tạo câu hỏi thành công (trạng thái DRAFT)',
      question
    };
  }

  // 4. Review Question with MAKER-CHECKER Guard (authorId !== reviewerId)
  async reviewQuestion(reviewerId: string, questionId: string, dto: ReviewQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId }
    });

    if (!question) {
      throw new NotFoundException({
        code: 'QUESTION_NOT_FOUND',
        message: 'Không tìm thấy câu hỏi.'
      });
    }

    // STRICT MAKER-CHECKER ENFORCEMENT: Author cannot review or publish own question
    if (question.authorId === reviewerId) {
      throw new ForbiddenException({
        code: 'MAKER_CHECKER_VIOLATION',
        message: 'Quy tắc Maker-Checker: Tác giả câu hỏi không được phép tự thẩm định hoặc phê duyệt câu hỏi của chính mình.'
      });
    }

    if (dto.status === QuestionStatus.PUBLISHED && (question.source as any)?.classification?.status === 'NEEDS_REVIEW') {
      throw new BadRequestException('Câu hỏi chưa đủ nội dung để phân loại kiến thức và độ khó. Hãy rà soát trước khi xuất bản.');
    }

    const updated = await this.prisma.question.update({
      where: { id: questionId },
      data: {
        status: dto.status,
        reviewerId
      },
      include: {
        options: true,
        skill: true,
        author: { select: { fullName: true, username: true } },
        reviewer: { select: { fullName: true, username: true } }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: reviewerId,
        action: 'QUESTION_REVIEWED',
        targetEntity: 'Question',
        targetEntityId: question.id,
        metadata: { previousStatus: question.status, newStatus: dto.status }
      }
    });

    return {
      message: `Đã cập nhật trạng thái câu hỏi thành ${dto.status}`,
      question: updated
    };
  }

  // 5. List Questions with filters
  async getQuestions(status?: QuestionStatus, skillId?: string, userId?: string, role?: UserRole, questionType?: string, difficulty?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (skillId) where.skillId = skillId;
    if (difficulty) {
      if (!['EASY','MEDIUM','HARD','VERY_HARD'].includes(difficulty)) throw new BadRequestException('Độ khó không hợp lệ.');
      where.difficulty = difficulty;
    }
    if (questionType) {
      if (!['SINGLE_CHOICE','TRUE_FALSE','SHORT_ANSWER'].includes(questionType)) throw new BadRequestException('Loại câu hỏi không hợp lệ.');
      where.questionType = questionType;
    }
    if (role === UserRole.TEACHER) where.OR = [
      { status: QuestionStatus.PUBLISHED },
      { status: QuestionStatus.DRAFT, authorId: userId },
      { status: QuestionStatus.DRAFT, source: { path: ['reviewStatus'], equals: 'VERIFIED' } }
    ];

    return this.prisma.question.findMany({
      where,
      include: {
        skill: true,
        options: true,
        author: { select: { id: true, fullName: true, username: true } },
        reviewer: { select: { id: true, fullName: true, username: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async setQuestionDifficulty(userId: string, role: UserRole, questionId: string, difficulty: string) {
    const q = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!q) throw new NotFoundException('Không tìm thấy câu hỏi.');
    return this.setQuestionLabels(userId, role, questionId, { skillId: q.skillId, difficulty });
  }

  async setQuestionLabels(userId: string, role: UserRole, questionId: string, labels: { skillId: string; difficulty: string }) {
    requireQuestionLabels(labels);
    return this.prisma.$transaction(async tx => {
      const q = await tx.question.findUnique({ where: { id: questionId }, include: { skill: true } });
      if (!q) throw new NotFoundException('Không tìm thấy câu hỏi.');
      if (role !== UserRole.ADMIN && q.authorId !== userId) throw new ForbiddenException('Chỉ sửa nhãn câu hỏi do mình sở hữu.');
      const skill = await tx.skillNode.findUnique({ where: { id: labels.skillId } });
      if (!skill || skill.grade !== q.skill.grade || skill.code === 'MATH9-REVIEW-REQUIRED') throw new BadRequestException('Chuyên đề phải tồn tại và thuộc đúng khối lớp.');
      const source: any = q.source && typeof q.source === 'object' && !Array.isArray(q.source) ? q.source : {};
      const updated = await tx.question.update({ where: { id: questionId }, data: { skillId: labels.skillId, difficulty: labels.difficulty as any,
        source: { ...source, classification: { ...source.classification, status: 'PROVISIONAL', method: 'USER_LABELLED',
          knowledgeArea: skill.chapter, topic: skill.title, skillCode: skill.code, difficulty: labels.difficulty,
          cognitiveLevel: q.cognitiveLevel, labelledBy: userId, labelledAt: new Date().toISOString() } }
      }, include: { skill: true, options: true } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'QUESTION_LABELS_UPDATED', targetEntity: 'Question', targetEntityId: q.id,
        metadata: { before: { skillId: q.skillId, difficulty: q.difficulty }, after: labels } } });
      return updated;
    });
  }

  // 6. Get Audit Logs
  async getAuditLogs(limit: number = 50) {
    return this.prisma.auditLog.findMany({
      take: limit,
      include: {
        actor: {
          select: { id: true, username: true, fullName: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  // 7. System Analytics & Overview
  async getSystemOverview() {
    const totalUsers = await this.prisma.user.count();
    const studentsCount = await this.prisma.user.count({ where: { role: UserRole.STUDENT } });
    const teachersCount = await this.prisma.user.count({ where: { role: UserRole.TEACHER } });
    const pendingTeachersCount = await this.prisma.user.count({ where: { role: UserRole.TEACHER_APPLICANT } });
    const classroomsCount = await this.prisma.classroom.count();
    const questionsCount = await this.prisma.question.count();
    const completedAttempts = await this.prisma.diagnosticAttempt.count({ where: { status: AttemptStatus.COMPLETED } });

    return {
      totalUsers,
      studentsCount,
      teachersCount,
      pendingTeachersCount,
      classroomsCount,
      questionsCount,
      completedAttempts,
      systemHealth: 'HEALTHY'
    };
  }

  // 8. User Management: Get list of all users with search & filters
  async getUsers(query: { role?: UserRole; status?: UserStatus; search?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { username: { contains: s, mode: 'insensitive' } },
        { fullName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } }
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          status: true,
          createdAt: true,
          teacherProfile: {
            select: {
              schoolName: true,
              city: true,
              verificationStatus: true
            }
          },
          studentProfile: {
            select: {
              grade: true,
              targetGoal: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  // 9. Update user status (Active / Suspended)
  async updateUserStatus(adminId: string, userId: string, newStatus: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Người dùng không tồn tại.'
      });
    }

    if (user.id === adminId && newStatus === UserStatus.SUSPENDED) {
      throw new BadRequestException({
        code: 'CANNOT_SUSPEND_SELF',
        message: 'Bạn không thể tự khóa tài khoản quản trị của chính mình.'
      });
    }

    const txOps: any[] = [
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: newStatus,
          permissionVersion: { increment: 1 } // Invalidate active session tokens
        }
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: adminId,
          action: newStatus === UserStatus.SUSPENDED ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
          targetEntity: 'User',
          targetEntityId: userId,
          metadata: { previousStatus: user.status, newStatus }
        }
      })
    ];

    if (newStatus === UserStatus.SUSPENDED) {
      txOps.push(
        this.prisma.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() }
        })
      );
    }

    const updated = await this.prisma.$transaction(txOps);

    return {
      message: `Đã ${newStatus === UserStatus.SUSPENDED ? 'khóa' : 'mở khóa'} tài khoản ${user.username} thành công.`,
      user: {
        id: updated[0].id,
        username: updated[0].username,
        status: updated[0].status
      }
    };
  }

  // 10. Reset user password
  async resetUserPassword(adminId: string, userId: string, newPassword?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Người dùng không tồn tại.'
      });
    }

    const passwordToSet = newPassword?.trim() || 'P@ssword123!';
    const passwordHash = await argon2.hash(passwordToSet, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1
    });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          permissionVersion: { increment: 1 }
        }
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: adminId,
          action: 'PASSWORD_RESET_BY_ADMIN',
          targetEntity: 'User',
          targetEntityId: userId
        }
      })
    ]);

    return {
      message: `Đã đặt lại mật khẩu cho tài khoản ${user.username} thành công.`,
      tempPassword: passwordToSet
    };
  }

  // 11. Get all classrooms across system
  async getAllClassrooms() {
    const classrooms = await this.prisma.classroom.findMany({
      include: {
        teacher: {
          select: {
            id: true,
            fullName: true,
            email: true,
            teacherProfile: { select: { schoolName: true, city: true } }
          }
        },
        memberships: {
          select: { id: true }
        },
        assignments: {
          select: { id: true, title: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      total: classrooms.length,
      classrooms: classrooms.map(c => ({
        id: c.id,
        name: c.name,
        grade: c.grade,
        academicYear: c.academicYear,
        isActive: c.isActive,
        createdAt: c.createdAt,
        teacher: {
          id: c.teacher.id,
          fullName: c.teacher.fullName,
          email: c.teacher.email,
          schoolName: c.teacher.teacherProfile?.schoolName,
          city: c.teacher.teacherProfile?.city
        },
        studentsCount: c.memberships.length,
        assignmentsCount: c.assignments.length
      }))
    };
  }

  // 12. Curriculum Stats
  async getCurriculumStats() {
    const [byStatus, byLevel, skills] = await Promise.all([
      this.prisma.question.groupBy({
        by: ['status'],
        _count: { id: true }
      }),
      this.prisma.question.groupBy({
        by: ['cognitiveLevel'],
        _count: { id: true }
      }),
      this.prisma.skillNode.findMany({
        include: {
          _count: {
            select: { questions: true }
          }
        },
        orderBy: { orderIndex: 'asc' }
      })
    ]);

    return {
      byStatus: byStatus.map(s => ({ status: s.status, count: s._count.id })),
      byLevel: byLevel.map(l => ({ level: l.cognitiveLevel, count: l._count.id })),
      bySkill: skills.map(sk => ({
        id: sk.id,
        code: sk.code,
        title: sk.title,
        chapter: sk.chapter,
        questionCount: sk._count.questions
      }))
    };
  }
}
