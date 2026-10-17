// Math-only learning models. Default item parameters are provisional, not calibrated.
export const LEVELS = ['REMEMBERING', 'UNDERSTANDING', 'APPLYING', 'ADVANCED_APPLYING'];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const answerCredit = (answer: any) => typeof answer.pointsAwarded === 'number' ? clamp(answer.pointsAwarded, 0, 1) : Number(Boolean(answer.isCorrect));
export function itemParameters(q: any) {
  const difficultyIndex = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'].indexOf(q.difficulty);
  const levelIndex = difficultyIndex >= 0 ? difficultyIndex : Math.max(0, LEVELS.indexOf(q.cognitiveLevel));
  return {
    a: Number.isFinite(q.irtA) && q.irtA > 0 ? q.irtA : 1.2,
    b: Number.isFinite(q.irtB) ? q.irtB : [-1.5, -0.5, 0.5, 1.5][levelIndex],
    c: Number.isFinite(q.irtC) && q.irtC >= 0 && q.irtC < 1 ? q.irtC : q.questionType === 'SHORT_ANSWER' ? 0 : q.questionType === 'TRUE_FALSE' ? 0.5 : 0.25
  };
}
export function probability(theta: number, q: any) {
  const { a, b, c } = itemParameters(q);
  const z = a * (theta - b);
  const logistic = z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
  return clamp(c + (1 - c) * logistic, 1e-9, 1 - 1e-9);
}
export function information(theta: number, q: any) {
  const p = probability(theta, q), { a, c } = itemParameters(q);
  return a * a * (1 - p) * (p - c) ** 2 / ((1 - c) ** 2 * p);
}
export function estimateAbility(answers: any[]) {
  let theta = 0;
  for (let i = 0; i < 60; i++) {
    let score = -theta / 4, info = 0.25;
    for (const answer of answers) {
      const q = answer.question, p = probability(theta, q), { a, c } = itemParameters(q);
      score += a * (answerCredit(answer) - p) * (p - c) / (p * (1 - c));
      info += information(theta, q);
    }
    const step = clamp(score / info, -0.75, 0.75);
    theta = clamp(theta + step, -4, 4);
    if (Math.abs(step) < 1e-5) break;
  }
  return { theta, standardError: 1 / Math.sqrt(0.25 + answers.reduce((sum, a) => sum + information(theta, a.question), 0)) };
}
function tie(seed: string, id: string) {
  let n = 2166136261;
  for (const c of seed + id) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function selectStaircase(questions: any[], answers: any[], seed: string) {
  const used = new Set(answers.map(a => a.questionId));
  const skills = [...new Set(questions.map(q => q.skillId))];
  const candidates: { question: any; count: number }[] = [];
  const theta = estimateAbility(answers).theta;
  for (const skillId of skills) {
    const pool = questions.filter(q => q.skillId === skillId);
    const history = answers.filter(a => a.question.skillId === skillId);
    const availableLevels = LEVELS.filter(l => pool.some(q => q.cognitiveLevel === l));
    let levelIndex = 0, failures = 0, stopped = false;
    for (const a of history) {
      const index = availableLevels.indexOf(a.question.cognitiveLevel);
      if (index < 0) continue;
      levelIndex = index;
      if (answerCredit(a) >= 0.75) { levelIndex++; failures = 0; }
      else { failures++; if (failures >= 2) { stopped = true; break; } }
    }
    if (stopped || levelIndex >= availableLevels.length) continue;
    // An unanswered verification item is required before a gap can be confirmed.
    const items = pool.filter(q => q.cognitiveLevel === availableLevels[levelIndex] && !used.has(q.id));
    if (!items.length) continue;
    items.sort((a, b) => information(theta, b) - information(theta, a) || tie(seed, a.id) - tie(seed, b.id));
    candidates.push({ question: items[0], count: history.length });
  }
  candidates.sort((a, b) => a.count - b.count || tie(seed, a.question.skillId) - tie(seed, b.question.skillId));
  return candidates[0]?.question ?? null;
}
export function diagnosticMastery(answers: any[], theta: number) {
  if (!answers.length) return null;
  const weight = Math.min(1, answers.length / 5);
  const observed = answers.reduce((sum, a) => sum + answerCredit(a), 0) / answers.length;
  const predicted = answers.reduce((sum, a) => sum + probability(theta, a.question), 0) / answers.length;
  return clamp(weight * observed + (1 - weight) * predicted, 0.01, 0.99);
}
export function updateKnowledge(prior: number, correct: boolean) {
  const p = clamp(prior, 0.01, 0.99);
  const posterior = correct ? p * 0.9 / (p * 0.9 + (1 - p) * 0.25)
    : p * 0.1 / (p * 0.1 + (1 - p) * 0.75);
  return clamp(posterior + (1 - posterior) * 0.15, 0.01, 0.99);
}
export const targetForGoal = (goal: string) => /nâng cao|HSG/i.test(goal || '') ? 0.95
  : /vào lớp 10/i.test(goal || '') ? 0.85 : /cuối kỳ/i.test(goal || '') ? 0.8 : 0.75;
export function studyDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function examDay(value: string) {
  if (!value) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00+07:00`);
  return Number.isFinite(date.getTime()) && studyDate(date) === iso ? iso : null;
}
export function buildStudyPlan(modules: any[], dailyMinutes: number, examDate: string, goal: string, now = new Date(), dueCount = 0) {
  const budget = clamp(dailyMinutes || 45, 15, 240), target = targetForGoal(goal);
  const start = studyDate(now), exam = examDay(examDate);
  const daysLeft = exam ? Math.ceil((new Date(`${exam}T00:00:00+07:00`).getTime() - new Date(`${start}T00:00:00+07:00`).getTime()) / 86400000) : null;
  const horizon = Math.min(90, daysLeft === null ? 28 : Math.max(1, daysLeft));
  const sessionMinutes = Math.min(25, budget);
  const tasks = modules.filter(m => m.status !== 'COMPLETED' && m.canPractice !== false && !m.completedToday).sort((a, b) => {
    // Unassessed skills are scheduled as exploration, never described as gaps.
    const priority = (m: any) => m.masteryScore === null ? 0.2 : Math.max(0, target - m.masteryScore / 100) + (m.evidenceCount < 5 ? 0.1 : 0);
    return priority(b) - priority(a) || a.orderIndex - b.orderIndex;
  }).map(m => ({ skillId: m.id, title: m.title, kind: m.masteryScore === null ? 'EXPLORE' : 'PRACTICE', minutes: sessionMinutes,
    reason: m.masteryScore === null ? 'Chưa đủ dữ liệu; bắt đầu bằng bài cơ bản.' : 'Củng cố kỹ năng còn dưới mục tiêu.' }));
  const days: any[] = [];
  let cursor = 0;
  for (let day = 0; day < horizon && (cursor < tasks.length || day === 0); day++) {
    const date = new Date(`${start}T00:00:00+07:00`); date.setUTCDate(date.getUTCDate() + day);
    const reviewMinutes = day % 4 === 3 || (day === 0 && dueCount > 0) ? Math.min(15, budget) : 0;
    const slots = day % 4 === 3 ? 0 : Math.min(2, Math.floor((budget - reviewMinutes) / sessionMinutes));
    const activities: any[] = tasks.slice(cursor, cursor + slots);
    cursor += activities.length;
    if (reviewMinutes) activities.unshift({ kind: 'REVIEW', title: 'Ôn các câu đến hạn', minutes: reviewMinutes,
      reason: day === 0 ? `${dueCount} câu đã đến lịch ôn.` : 'Củng cố trí nhớ trước khi học tiếp.' });
    days.push({ date: studyDate(date), activities, plannedMinutes: activities.reduce((sum, t) => sum + t.minutes, 0) });
  }
  return { dailyMinutes: budget, targetMastery: Math.round(target * 100), daysLeft, days, unscheduledCount: tasks.length - cursor };
}
