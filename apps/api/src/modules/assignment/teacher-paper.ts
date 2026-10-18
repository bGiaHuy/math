import { BadRequestException } from '@nestjs/common';
import { QUESTION_TYPES, validateQuestion } from '../question/math-question';

export function requireTeacherCounts(counts: any) {
  if (!counts || Object.keys(counts).length !== 3 || QUESTION_TYPES.some(type => !Number.isInteger(counts[type]) || counts[type] < 0 || counts[type] > 40) || QUESTION_TYPES.reduce((sum, type) => sum + counts[type], 0) < 1 || QUESTION_TYPES.reduce((sum, type) => sum + counts[type], 0) > 60) {
    throw new BadRequestException('Chọn từ 1 đến 60 câu, tối đa 40 câu mỗi loại.');
  }
}

export function validateTeacherPaper<T extends { content?: string; id?: string }>(questions: T[]): T[] {
  if (!questions.length || questions.length > 60) throw new BadRequestException('Đề cần từ 1 đến 60 câu.');
  const seen = new Set<string>();
  for (const q of questions as any[]) {
    validateQuestion(q);
    if (!['EASY','MEDIUM','HARD','VERY_HARD'].includes(q.difficulty)) throw new BadRequestException('Mỗi câu cần một trong bốn độ khó.');
    const key = q.content.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) throw new BadRequestException('Đề có câu trùng nội dung.');
    seen.add(key);
  }
  return questions;
}
