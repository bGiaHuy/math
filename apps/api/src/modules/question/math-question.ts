import { BadRequestException } from '@nestjs/common';
export const QUESTION_TYPES = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] as const;
export type MathQuestionType = typeof QUESTION_TYPES[number];
export function parseNumericAnswer(value: string): number | null {
  const s = value.normalize('NFC').trim().replace(/−/g, '-').replace(/,/g, '.');
  const number = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  const regex = new RegExp(`^(${number})(?:\\s*/\\s*(${number}))?$`);
  const m = regex.exec(s);
  if (!m) return null;
  const n = Number(m[1]); const d = m[2] === undefined ? 1 : Number(m[2]);
  const result = n / d;
  return d !== 0 && Number.isFinite(result) ? result : null;
}
const invalid = (message: string): never => { throw new BadRequestException({ code: 'INVALID_QUESTION', message }); };
export function validateQuestion(q: any) {
  const type: MathQuestionType = q.questionType || 'SINGLE_CHOICE';
  if (!QUESTION_TYPES.includes(type)) invalid('Loại câu hỏi không hợp lệ.');
  if (!q.content?.trim()) invalid('Câu hỏi phải có nội dung.');
  const options = q.options || [];
  if (type === 'SINGLE_CHOICE') {
    if (q.statements?.length || q.shortAnswer) invalid('Câu nhiều lựa chọn không có ý đúng/sai hoặc đáp án ngắn.');
    if (!Array.isArray(options) || options.length < 2 || (q.questionType && options.length !== 4)) invalid('Câu nhiều lựa chọn phải có 4 phương án.');
    const keys = options.map((o: any) => String(o.optionKey || o.key || '').trim().toUpperCase());
    if (new Set(keys).size !== keys.length || keys.some((k: string) => !/^[A-D]$/.test(k)) || options.some((o: any) => !o.content?.trim())) invalid('Phương án phải khác mã A–D và có nội dung.');
    const marked = options.filter((o: any) => o.isCorrect === true);
    const correct = q.correctOption?.trim().toUpperCase() || (marked.length === 1 ? String(marked[0].optionKey || marked[0].key).toUpperCase() : null);
    if (!correct || !keys.includes(correct) || marked.length > 1) invalid('Câu hỏi phải có đúng 1 đáp án đúng.');
  } else if (type === 'TRUE_FALSE') {
    if (options.length || q.shortAnswer) invalid('Câu đúng/sai không có phương án lựa chọn hoặc đáp án ngắn.');
    const ss = q.statements;
    if (!Array.isArray(ss) || ss.length !== 4 || new Set(ss.map((s: any) => s.key)).size !== 4 || ss.some((s: any) => !['a','b','c','d'].includes(s.key) || !s.content?.trim() || typeof s.isCorrect !== 'boolean')) invalid('Câu đúng/sai phải có đúng 4 ý a–d với đáp án boolean.');
  } else {
    if (options.length || q.statements?.length) invalid('Câu trả lời ngắn không có phương án hoặc ý đúng/sai.');
    const rule = q.shortAnswer;
    if (!rule || !['TEXT','NUMERIC'].includes(rule.mode) || !Array.isArray(rule.acceptedAnswers) || !rule.acceptedAnswers.length || rule.acceptedAnswers.some((a: any) => typeof a !== 'string' || !a.trim())) invalid('Thiếu quy tắc chấm câu trả lời ngắn.');
    if (rule.tolerance !== undefined && (typeof rule.tolerance !== 'number' || !Number.isFinite(rule.tolerance) || rule.tolerance < 0)) invalid('Sai số phải là số hữu hạn không âm.');
    if (rule.mode === 'NUMERIC' && rule.acceptedAnswers.some((a: string) => parseNumericAnswer(a) === null)) invalid('Đáp án số không hợp lệ.');
  }
  return type;
}
export function buildQuestionData(q: any) {
  const questionType = validateQuestion(q);
  const options = q.options || [];
  const correct = q.correctOption?.trim().toUpperCase();
  return {
    questionType,
    ...(questionType === 'TRUE_FALSE' ? { statements: q.statements } : {}),
    ...(questionType === 'SHORT_ANSWER' ? { shortAnswer: q.shortAnswer } : {}),
    ...(q.source ? { source: q.source } : {}),
    options: { create: options.map((o: any) => ({ optionKey: String(o.optionKey || o.key).trim().toUpperCase(), content: o.content.trim(), isCorrect: correct ? String(o.optionKey || o.key).trim().toUpperCase() === correct : o.isCorrect === true })) },
  };
}
export function gradeQuestion(q: any, answer: any, weight = 1) {
  const response = answer?.response || {};
  let fraction = 0; let gradingDetails: any = {};
  if ((q.questionType || 'SINGLE_CHOICE') === 'SINGLE_CHOICE') {
    const key = (answer?.selectedOptionKey || answer?.selectedOption || '').trim().toUpperCase();
    fraction = q.options.some((o: any) => o.isCorrect && o.optionKey.toUpperCase() === key) ? 1 : 0;
  } else if (q.questionType === 'TRUE_FALSE') {
    gradingDetails = Object.fromEntries((q.statements || []).map((s: any) => [s.key, typeof response.trueFalseAnswers?.[s.key] === 'boolean' && response.trueFalseAnswers[s.key] === s.isCorrect]));
    fraction = [0, 0.1, 0.25, 0.5, 1][Object.values(gradingDetails).filter(Boolean).length];
  } else {
    const rule = q.shortAnswer;
    const input = response.shortAnswer;
    if (typeof input === 'string' && rule) {
      if (rule.mode === 'NUMERIC') {
        const actual = parseNumericAnswer(input);
        fraction = actual !== null && rule.acceptedAnswers.some((a: string) => Math.abs(actual - parseNumericAnswer(a)!) <= (rule.tolerance ?? 1e-9)) ? 1 : 0;
      } else {
        const norm = (s: string) => { const x = s.normalize('NFC').trim().replace(/\s+/g, ' '); return rule.caseSensitive ? x : x.toLocaleLowerCase('vi'); };
        fraction = rule.acceptedAnswers.some((a: string) => norm(a) === norm(input)) ? 1 : 0;
      }
    }
  }
  return { isCorrect: fraction === 1, pointsAwarded: fraction * weight, gradingDetails };
}
export function validateAnswer(q: any, a: any) {
  if (!a) return;
  const r = a.response || {};
  if ((q.questionType || 'SINGLE_CHOICE') === 'SINGLE_CHOICE') {
    const key = (a.selectedOptionKey || a.selectedOption || '').trim().toUpperCase();
    if (key && !q.options.some((o: any) => o.optionKey.toUpperCase() === key)) invalid('Phương án trả lời không thuộc câu hỏi.');
    if (Object.keys(r).length) invalid('Sai loại câu trả lời.');
  } else if (q.questionType === 'TRUE_FALSE') {
    if (a.selectedOptionKey || a.selectedOption || r.shortAnswer !== undefined || Object.keys(r).some(k => k !== 'trueFalseAnswers')) invalid('Sai loại câu trả lời.');
    if (r.trueFalseAnswers && (Array.isArray(r.trueFalseAnswers) || typeof r.trueFalseAnswers !== 'object' || Object.entries(r.trueFalseAnswers).some(([k,v]) => !['a','b','c','d'].includes(k) || typeof v !== 'boolean'))) invalid('Câu trả lời đúng/sai không hợp lệ.');
  } else if (a.selectedOptionKey || a.selectedOption || Object.keys(r).some(k => k !== 'shortAnswer') || (r.shortAnswer !== undefined && (typeof r.shortAnswer !== 'string' || r.shortAnswer.length > 1000))) invalid('Câu trả lời ngắn không hợp lệ.');
}
