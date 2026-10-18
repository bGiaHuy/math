export const QUESTION_LABELS = { SINGLE_CHOICE: 'Nhiều lựa chọn', TRUE_FALSE: 'Đúng / Sai', SHORT_ANSWER: 'Trả lời ngắn' };
export const DEFAULT_QUESTION_COUNTS = { SINGLE_CHOICE: 12, TRUE_FALSE: 4, SHORT_ANSWER: 6 };
export const types = Object.keys(QUESTION_LABELS);
export const fresh = (questionType = 'SINGLE_CHOICE') => ({ questionType, content: '', options: ['A', 'B', 'C', 'D'].map(key => ({ key, content: '' })), correctOption: 'A', statements: ['a', 'b', 'c', 'd'].map(key => ({ key, content: '', isCorrect: true })), shortAnswer: { mode: 'NUMERIC', acceptedAnswers: [], tolerance: 0.000000001, caseSensitive: false }, explanation: '', skillId: '', difficulty: '', cognitiveLevel: 'REMEMBERING' });
export const getQuestionType = q => q.questionType || 'SINGLE_CHOICE';
export function countQuestions(bank, ids, custom) {
  return [...bank.filter(q => ids.includes(q.id)), ...custom].reduce((counts, q) => ({ ...counts, [getQuestionType(q)]: counts[getQuestionType(q)] + 1 }), { SINGLE_CHOICE: 0, TRUE_FALSE: 0, SHORT_ANSWER: 0 });
}
export function normalizeTeacherQuestion(q) {
  const questionType = getQuestionType(q);
  if (!types.includes(questionType) || !String(q.content || '').trim()) throw new Error('Câu hỏi phải có nội dung và loại hợp lệ.');
  if (q.difficulty && !['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'].includes(q.difficulty)) throw new Error('Độ khó không hợp lệ.');
  const result = { ...(q.skillId ? { skillId: q.skillId } : {}), difficulty: q.difficulty || '', questionType, content: q.content.trim(), explanation: q.explanation || '', cognitiveLevel: q.cognitiveLevel || 'REMEMBERING' };
  if (questionType === 'SINGLE_CHOICE') {
    if (!Array.isArray(q.options) || q.options.length !== 4 || ['A', 'B', 'C', 'D'].some(key => !q.options.some(o => o.key === key && String(o.content || '').trim())) || !['A', 'B', 'C', 'D'].includes(q.correctOption)) throw new Error('Câu nhiều lựa chọn cần đủ 4 phương án A–D và một đáp án đúng.');
    result.options = q.options.map(o => ({ key: o.key, content: o.content.trim() })); result.correctOption = q.correctOption;
  } else if (questionType === 'TRUE_FALSE') {
    if (!Array.isArray(q.statements) || q.statements.length !== 4 || ['a', 'b', 'c', 'd'].some(key => !q.statements.some(s => s.key === key && String(s.content || '').trim() && typeof s.isCorrect === 'boolean'))) throw new Error('Câu đúng/sai cần đủ 4 ý a–d và đáp án từng ý.');
    result.statements = q.statements.map(s => ({ key: s.key, content: s.content.trim(), isCorrect: s.isCorrect }));
  } else {
    const rule = q.shortAnswer;
    if (!rule || !['NUMERIC', 'TEXT'].includes(rule.mode) || !Array.isArray(rule.acceptedAnswers) || !rule.acceptedAnswers.length || rule.acceptedAnswers.some(a => typeof a !== 'string' || !a.trim())) throw new Error('Câu trả lời ngắn cần ít nhất một đáp án và cách chấm hợp lệ.');
    if (rule.mode === 'NUMERIC') {
      const number = value => { const pieces = value.trim().replace(',', '.').split('/'); if (pieces.length > 2 || pieces.some(p => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(p.trim()))) return NaN; return pieces.length === 2 ? Number(pieces[0]) / Number(pieces[1]) : Number(pieces[0]); };
      if (rule.acceptedAnswers.some(a => !Number.isFinite(number(a))) || !Number.isFinite(Number(rule.tolerance ?? 1e-9)) || Number(rule.tolerance ?? 1e-9) < 0) throw new Error('Đáp án số phải là số hữu hạn hoặc phân số; sai số không âm.');
    }
    result.shortAnswer = { ...rule, acceptedAnswers: rule.acceptedAnswers.map(a => a.trim()) };
  }
  return result;
}
