import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { UpdateMistakeDto } from './dto/update-mistake.dto';
import { AttemptStatus } from '@prisma/client';
import { buildStudyPlan, studyDate, targetForGoal, examDay } from './math-adaptive';

@Injectable()
export class StudentService {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Get student profile & summary statistics
  async getProfile(studentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentProfile: true,
        classMemberships: {
          include: {
            classroom: {
              include: {
                teacher: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: 'Không tìm thấy hồ sơ học sinh.'
      });
    }

    const [attemptsCount, masteriesCount, mistakesTotal, mistakesUnmastered] = await Promise.all([
      this.prisma.diagnosticAttempt.count({
        where: { studentId, status: AttemptStatus.COMPLETED }
      }),
      this.prisma.skillMastery.count({
        where: { studentId, masteryScore: { gte: targetForGoal(user.studentProfile?.targetGoal) * 100 }, evidenceCount: { gte: 5 } }
      }),
      this.prisma.mistakeRecord.count({
        where: { studentId }
      }),
      this.prisma.mistakeRecord.count({
        where: { studentId, isMastered: false }
      })
    ]);

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      profile: user.studentProfile,
      joinedClassrooms: (user.classMemberships || []).map((m: any) => ({
        id: m.classroom.id,
        name: m.classroom.name,
        grade: m.classroom.grade,
        academicYear: m.classroom.academicYear,
        teacherName: m.classroom.teacher?.fullName || 'Giáo viên',
        joinedAt: m.joinedAt
      })),
      stats: {
        completedAssessments: attemptsCount,
        masteredSkills: masteriesCount,
        totalMistakes: mistakesTotal,
        unmasteredMistakes: mistakesUnmastered
      }
    };
  }

  // 2. Update Onboarding settings
  async updateOnboarding(studentId: string, dto: UpdateOnboardingDto) {
    if (dto.examDate && !examDay(dto.examDate)) throw new BadRequestException('Ngày thi không hợp lệ. Dùng DD/MM/YYYY hoặc YYYY-MM-DD.');
    const updated = await this.prisma.studentProfile.upsert({
      where: { userId: studentId },
      update: {
        ...(dto.grade && { grade: dto.grade }),
        ...(dto.targetGoal && { targetGoal: dto.targetGoal }),
        ...(dto.dailyMinutes && { dailyMinutes: dto.dailyMinutes }),
        ...(dto.examDate !== undefined && { examDate: dto.examDate || null }),
        ...(dto.selfAssessment && { selfAssessment: dto.selfAssessment })
      },
      create: {
        userId: studentId,
        grade: dto.grade || 9,
        targetGoal: dto.targetGoal || 'Ôn thi vào lớp 10',
        dailyMinutes: dto.dailyMinutes || 45,
        examDate: dto.examDate || null,
        selfAssessment: dto.selfAssessment || 'Khá'
      }
    });

    return {
      message: 'Cập nhật thiết lập hồ sơ học tập thành công',
      profile: updated
    };
  }

  // 3. Get Student Mastery Overview
  async getMasteryOverview(studentId: string) {
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId: studentId } });
    const masteries = await this.prisma.skillMastery.findMany({
      where: { studentId, skill: { grade: profile?.grade || 9 } },
      include: {
        skill: true
      },
      orderBy: { masteryScore: 'desc' }
    });

    const totalCount = masteries.length;
    const avgScore = totalCount > 0
      ? Math.round(masteries.reduce((acc, m) => acc + m.masteryScore, 0) / totalCount)
      : 0;

    const allSkills = await this.prisma.skillNode.findMany({ where: { grade: profile?.grade || 9 }, orderBy: { orderIndex: 'asc' } });
    const target = targetForGoal(profile?.targetGoal) * 100;
    const strongSkills = masteries.filter(m => m.masteryScore >= target && m.evidenceCount >= 5);
    const averageSkills = masteries.filter(m => m.evidenceCount >= 5 && m.masteryScore >= 50 && m.masteryScore < target);
    const weakSkills = masteries.filter(m => m.evidenceCount >= 5 && m.masteryScore < 50);

    return {
      averageMasteryScore: avgScore,
      totalAssessedSkills: totalCount,
      totalAvailableSkills: allSkills.length,
      unassessedCount: allSkills.filter(s => !masteries.some(m => m.skillId === s.id)).length,
      targetMastery: target,
      strongCount: strongSkills.length,
      averageCount: averageSkills.length,
      weakCount: weakSkills.length,
      insufficientCount: masteries.filter(m => m.evidenceCount < 5).length,
      catalog: allSkills.map(skill => {
        const mastery = masteries.find(item => item.skillId === skill.id);
        return { skillId: skill.id, title: skill.title, chapter: skill.chapter,
          masteryScore: mastery ? Math.round(mastery.masteryScore) : null,
          evidenceCount: mastery?.evidenceCount ?? 0, lastAssessedAt: mastery?.lastAssessedAt ?? null };
      }),
      skills: masteries.map(m => ({
        skillId: m.skillId,
        code: m.skill.code,
        title: m.skill.title,
        chapter: m.skill.chapter,
        score: Math.round(m.masteryScore),
        masteryScore: Math.round(m.masteryScore),
        attemptsCount: m.attemptsCount || 1,
        evidenceCount: m.evidenceCount,
        level: m.evidenceCount < 5 ? 'CHƯA ĐỦ DỮ LIỆU' : m.masteryScore >= target ? 'THÀNH THẠO' : (m.masteryScore >= 50 ? 'ĐANG CỦNG CỐ' : 'CẦN LUYỆN TẬP'),
        lastAssessedAt: m.lastAssessedAt
      }))
    };
  }

  async getActivity(studentId: string) {
    const [diagnostics, sessions] = await Promise.all([
      this.prisma.diagnosticAttempt.findMany({ where: { studentId, status: 'COMPLETED' }, include: { answers: { select: { timeSpentSeconds: true } } } }),
      this.prisma.mathPracticeSession.findMany({ where: { studentId, status: 'COMPLETED' } })
    ]);
    const logs: Record<string, any> = {};
    const add = (date: Date, seconds: number, activity: string) => {
      if (!date) return;
      const key = studyDate(date), row = logs[key] || { minutes: 0, sessions: 0, completed: true, activities: [] };
      row.minutes += Math.max(1, Math.ceil(seconds / 60)); row.sessions++; row.activities.push(activity); logs[key] = row;
    };
    diagnostics.forEach(a => add(a.completedAt, a.answers.reduce((n, q) => n + q.timeSpentSeconds, 0), 'Kiểm tra chẩn đoán'));
    sessions.forEach(s => add(s.completedAt, ((s.state as any).answers || []).reduce((n: number, a: any) => n + a.timeSpentSeconds, 0), 'Luyện tập theo chủ đề'));
    return { logs };
  }

  // 4. Get Personalized Learning Path
  async getLearningPath(studentId: string) {
    const userProfile = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId }
    });
    const grade = userProfile?.grade || 9;

    const allSkills = await this.prisma.skillNode.findMany({
      where: { grade },
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { questions: { where: { status: 'PUBLISHED', questionType: 'SINGLE_CHOICE' } } } } }
    });

    const masteries = await this.prisma.skillMastery.findMany({
      where: { studentId }
    });
    const masteryMap = new Map(masteries.map(m => [m.skillId, m]));
    const target = targetForGoal(userProfile?.targetGoal) * 100;
    const completed = await this.prisma.mathPracticeSession.findMany({ where: { studentId, status: 'COMPLETED' }, select: { skillId: true, completedAt: true } });
    const today = studyDate();
    const published = await this.prisma.question.findMany({ where: { status: 'PUBLISHED' }, select: { id: true } });
    const dueCount = await this.prisma.mathReviewCard.count({ where: { studentId, due: { lte: new Date() }, questionId: { in: published.map(q => q.id) } } });

    // Construct path modules
    const modules = allSkills.map((s) => {
      const mastery = masteryMap.get(s.id), score = mastery ? Math.round(mastery.masteryScore) : null;
      const evidenceCount = mastery?.evidenceCount || 0;
      const status = score !== null && score >= target && evidenceCount >= 5 ? 'COMPLETED' : 'IN_PROGRESS';

      return {
        id: s.id,
        code: s.code,
        title: s.title,
        chapter: s.chapter,
        orderIndex: s.orderIndex,
        masteryScore: score,
        evidenceCount,
        canPractice: s._count.questions >= 3,
        publishedQuestions: s._count.questions,
        completedToday: completed.some(c => c.skillId === s.id && c.completedAt && studyDate(c.completedAt) === today),
        status,
        recommendedAction: score === null ? 'Chưa đánh giá; bắt đầu bằng kiến thức cơ bản.'
          : evidenceCount < 5 ? 'Kết quả tạm tính; cần thêm câu mới để xác nhận.'
          : status === 'COMPLETED' ? 'Đạt mục tiêu hiện tại; tiếp tục ôn các câu đến hạn.' : 'Ôn kiến thức và luyện câu mới để củng cố.'
      };
    });

    return {
      targetGoal: userProfile?.targetGoal || 'Ôn thi vào lớp 10',
      grade,
      modules,
      dueCount,
      plan: buildStudyPlan(modules, userProfile?.dailyMinutes, userProfile?.examDate, userProfile?.targetGoal, new Date(), dueCount)
    };
  }

  // 5. Get Mistake Notebook Records
  async getMistakes(studentId: string, isMastered?: boolean) {
    if (await this.prisma.diagnosticAttempt.findFirst({ where: { studentId, status: 'IN_PROGRESS' } })) {
      throw new ForbiddenException({ code: 'DIAGNOSTIC_IN_PROGRESS', message: 'Bạn còn một lượt kiểm tra chưa kết thúc. Quay lại làm tiếp hoặc kết thúc lượt này để mở sổ tay.' });
    }
    // Hide questions present in any active classroom exam rather than leaking old notebook answers.
    const activeQuestions=await this.prisma.assignmentQuestion.findMany({where:{assignment:{submissions:{some:{studentId,status:'IN_PROGRESS'}}}},select:{questionId:true}});
    const hiddenIds=activeQuestions.map(q=>q.questionId);
    const where: any = { studentId, ...(hiddenIds.length ? {questionId:{notIn:hiddenIds}} : {}) };
    if (typeof isMastered === 'boolean') {
      where.isMastered = isMastered;
    }

    const mistakes = await this.prisma.mistakeRecord.findMany({
      where,
      include: {
        question: {
          include: {
            skill: true,
            options: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const finalizedAnswers=await this.prisma.submissionAnswer.findMany({where:{questionId:{in:mistakes.map(m=>m.questionId)},submission:{studentId,status:{not:'IN_PROGRESS'}}},include:{submission:{select:{submittedAt:true}}},orderBy:{submission:{submittedAt:'desc'}}});
    const latestAnswer=new Map<string,typeof finalizedAnswers[number]>();
    for(const answer of finalizedAnswers) if(!latestAnswer.has(answer.questionId)) latestAnswer.set(answer.questionId,answer);
    const diagnosticAnswers = await this.prisma.attemptAnswer.findMany({ where: { questionId: { in: mistakes.map(m => m.questionId) }, attempt: { studentId, status: 'COMPLETED' } }, orderBy: { answeredAt: 'desc' } });
    const latestDiagnostic = new Map<string, typeof diagnosticAnswers[number]>();
    for (const answer of diagnosticAnswers) if (!latestDiagnostic.has(answer.questionId)) latestDiagnostic.set(answer.questionId, answer);
    return {
      total: mistakes.length,
      mistakes: mistakes.map(m => {
        const assignmentAnswer=latestAnswer.get(m.questionId), diagnosticAnswer=latestDiagnostic.get(m.questionId);
        const answer = diagnosticAnswer && (!assignmentAnswer || diagnosticAnswer.answeredAt > assignmentAnswer.submission.submittedAt) ? diagnosticAnswer : assignmentAnswer;
        const typed={questionType:m.question.questionType,statements:m.question.statements,shortAnswer:m.question.shortAnswer,response:answer?.response || {},gradingDetails:answer?.gradingDetails || {},pointsAwarded:answer?.pointsAwarded || 0};
        const correctOpt = m.question.options.find(o => o.isCorrect);
        const correctKey = correctOpt?.optionKey || '';
        const optionsList = m.question.options.map(o => ({
          key: o.optionKey,
          content: o.content,
          isCorrect: o.isCorrect
        }));

        return {
          ...typed,
          id: m.id,
          questionId: m.questionId,
          skillCode: m.question.skill.code,
          skillTitle: m.question.skill.title,
          chapter: m.question.skill.chapter,
          content: m.question.content,
          cognitiveLevel: m.question.cognitiveLevel,
          explanation: m.question.explanation,
          selectedOptionKey: m.selectedOptionKey,
          correctOptionKey: correctKey,
          isMastered: m.isMastered,
          userNotes: m.userNotes,
          createdAt: m.createdAt,
          question: {
            ...typed,
            id: m.question.id,
            content: m.question.content,
            cognitiveLevel: m.question.cognitiveLevel,
            explanation: m.question.explanation,
            skillId: m.question.skillId,
            skillCode: m.question.skill.code,
            skillTitle: m.question.skill.title,
            chapter: m.question.skill.chapter,
            correctOptionKey: correctKey,
            options: optionsList
          },
          options: optionsList
        };
      })
    };
  }

  // 6. Update Mistake (toggle mastered status or edit personal notes)
  async updateMistake(studentId: string, mistakeId: string, dto: UpdateMistakeDto) {
    const mistake = await this.prisma.mistakeRecord.findFirst({
      where: { id: mistakeId, studentId }
    });

    if (!mistake) {
      throw new NotFoundException({
        code: 'MISTAKE_NOT_FOUND',
        message: 'Không tìm thấy câu hỏi trong sổ tay lỗi sai.'
      });
    }

    const updated = await this.prisma.mistakeRecord.update({
      where: { id: mistakeId },
      data: {
        ...(dto.isMastered !== undefined && { isMastered: dto.isMastered }),
        ...(dto.userNotes !== undefined && { userNotes: dto.userNotes })
      }
    });

    return {
      message: 'Cập nhật sổ tay lỗi sai thành công',
      mistake: updated
    };
  }
}
