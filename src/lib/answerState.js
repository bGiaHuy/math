/** Presentation only: never used to calculate grades. */
export function answerState(q) {
  if (q.gradingMode === 'EXCLUDE') return 'excluded';
  if (q.gradingMode === 'FULL_CREDIT') return 'credited';
  const response = q.response || {};
  const selected = q.studentSelectedKey || q.selectedOptionKey;
  const values = Object.values(response.trueFalseAnswers || {}).filter(v => typeof v === 'boolean');
  const hasAnswer = Boolean(selected || response.shortAnswer?.trim() || values.length);
  if (!hasAnswer) return 'unanswered';
  if (q.questionType === 'TRUE_FALSE' && values.length < 4) return 'incomplete';
  if (q.isCorrect == null) return 'pending';
  if (q.isCorrect) return 'correct';
  if (q.pointsAwarded > 0) return 'partial';
  return 'incorrect';
}
export const ANSWER_STATE_LABELS = { excluded:'— Không tính điểm', credited:'✓ Cho điểm toàn bộ', unanswered:'○ Chưa trả lời', incomplete:'◐ Trả lời chưa đủ', pending:'◷ Chờ chấm', correct:'✓ Đúng', partial:'◐ Đúng một phần', incorrect:'✕ Sai' };
