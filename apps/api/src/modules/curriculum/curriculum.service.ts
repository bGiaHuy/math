import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CurriculumService {
  constructor(private readonly prisma: PrismaService) {}

  getGrades() {
    return [
      { id: 6, label: 'Lớp 6', lessonsCount: 22, desc: '22 bài học theo chương trình GDPT 2018' },
      { id: 7, label: 'Lớp 7', lessonsCount: 23, desc: '23 bài học theo chương trình GDPT 2018' },
      { id: 8, label: 'Lớp 8', lessonsCount: 23, desc: '23 bài học theo chương trình GDPT 2018' },
      { id: 9, label: 'Lớp 9', lessonsCount: 24, desc: '24 bài học trọng tâm và luyện thi vào 10' }
    ];
  }

  getOnboardingOptions() {
    return {
      goals: [
        { id: 'midterm', title: 'Ôn thi giữa kỳ', desc: 'Tập trung các chủ đề trọng tâm nửa học kỳ.', targetMastery: '75%' },
        { id: 'finalterm', title: 'Ôn thi cuối kỳ', desc: 'Bao quát toàn bộ kiến thức học kỳ.', targetMastery: '80%' },
        { id: 'entrance10', title: 'Ôn thi vào lớp 10', desc: 'Luyện đề thi tuyển sinh vào 10 và làm chủ câu phân loại.', targetMastery: '85%' },
        { id: 'advanced', title: 'Học nâng cao / HSG', desc: 'Tiến xa hơn chương trình chuẩn với các chuyên đề khó.', targetMastery: '95%' }
      ],
      dailyTimes: [
        { id: '30m', minutes: 30, title: '30 phút/ngày', desc: 'Nhẹ nhàng, duy trì nhịp học đều đặn.' },
        { id: '45m', minutes: 45, title: '45 phút/ngày', desc: 'Khuyến nghị tiêu chuẩn, cân bằng hiệu quả.' },
        { id: '60m', minutes: 60, title: '60 phút/ngày', desc: 'Tiến độ nhanh, bứt phá năng lực.' },
        { id: '90m', minutes: 90, title: '90 phút/ngày', desc: 'Cường độ cao, giai đoạn nước rút.' }
      ],
      selfAssessments: [
        { id: 'weak', title: 'Yếu', desc: 'Còn hổng nhiều kiến thức nền, cần bắt đầu từ bài căn bản.' },
        { id: 'average', title: 'Trung bình', desc: 'Nắm được lý thuyết nhưng chưa vững khi biến đổi.' },
        { id: 'good', title: 'Khá', desc: 'Làm tốt bài thông hiểu, muốn làm chủ bài vận dụng.' },
        { id: 'excellent', title: 'Giỏi', desc: 'Muốn chinh phục câu phân loại điểm 9-10.' }
      ]
    };
  }

  async getSkillsByGrade(grade: number = 9) {
    const skills = await this.prisma.skillNode.findMany({
      where: { grade, code: { not: 'MATH9-REVIEW-REQUIRED' } },
      orderBy: { orderIndex: 'asc' },
      include: {
        _count: {
          select: { questions: true }
        }
      }
    });

    // Group by chapter
    const chaptersMap = new Map<string, any[]>();
    for (const s of skills) {
      if (!chaptersMap.has(s.chapter)) {
        chaptersMap.set(s.chapter, []);
      }
      chaptersMap.get(s.chapter)!.push({
        id: s.id,
        code: s.code,
        title: s.title,
        orderIndex: s.orderIndex,
        questionsCount: s._count.questions
      });
    }

    const grouped = Array.from(chaptersMap.entries()).map(([chapterName, skillList]) => ({
      chapter: chapterName,
      skills: skillList
    }));

    return {
      grade,
      totalSkills: skills.length,
      chapters: grouped
    };
  }
}
