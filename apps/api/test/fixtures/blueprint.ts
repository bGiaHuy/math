import { DIAGNOSTIC_BLUEPRINT } from '../../src/modules/diagnostic/diagnostic-blueprint';
export const blueprintSkills = [...new Set(DIAGNOSTIC_BLUEPRINT.map(s => s.skillCode))].map(code => ({ id: `skill-${code}`, code, grade: 9, title: code, chapter: 'Toán 9' }));
export const blueprintQuestions = () => DIAGNOSTIC_BLUEPRINT.map(s => ({
  skillId: `skill-${s.skillCode}`, questionType: s.questionType, cognitiveLevel: s.cognitiveLevel, difficulty: s.difficulty,
  content: `Bài toán vị trí ${s.slot}: ${s.topic}`, explanation: 'Lời giải kiểm thử',
  ...(s.questionType === 'SINGLE_CHOICE' ? { options: ['A', 'B', 'C', 'D'].map(key => ({ key, content: key })), correctOption: 'A' } :
    s.questionType === 'TRUE_FALSE' ? { statements: ['a', 'b', 'c', 'd'].map(key => ({ key, content: key, isCorrect: true })) } :
    { shortAnswer: { mode: 'NUMERIC', acceptedAnswers: ['7'], instructions: 'Nhập số, không ghi đơn vị.' } })
}));
export const blueprintBank = () => blueprintQuestions().map((q, i) => ({ ...q, id: `q-${i}`, skill: blueprintSkills.find(s => s.id === q.skillId) }));
