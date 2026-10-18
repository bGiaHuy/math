import { BadRequestException } from '@nestjs/common';
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] as const;
export function requireQuestionLabels(q: { skillId?: string; difficulty?: string }) {
  if (typeof q?.skillId !== 'string' || !q.skillId.trim() || !DIFFICULTIES.includes(q.difficulty as any)) {
    throw new BadRequestException({ code: 'QUESTION_LABELS_REQUIRED', message: 'Mỗi câu hỏi phải được chọn chuyên đề kiến thức và độ khó (Dễ, Trung bình, Khó hoặc Rất khó).' });
  }
}
