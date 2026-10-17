export const EXAM_PARTS = [
  { type: 'SINGLE_CHOICE', title: 'Phần I. Trắc nghiệm nhiều lựa chọn' },
  { type: 'TRUE_FALSE', title: 'Phần II. Trắc nghiệm đúng / sai' },
  { type: 'SHORT_ANSWER', title: 'Phần III. Trả lời ngắn' }
];
export function orderExamQuestions(questions = []) {
  const rank = new Map(EXAM_PARTS.map((part, index) => [part.type, index]));
  return [...questions].sort((a, b) => (rank.get(a.questionType || 'SINGLE_CHOICE') ?? 3) - (rank.get(b.questionType || 'SINGLE_CHOICE') ?? 3));
}
