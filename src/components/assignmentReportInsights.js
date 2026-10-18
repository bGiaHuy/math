export const hasReportScore = row => row.isSubmitted && row.score !== null && row.score !== undefined && Number.isFinite(Number(row.score)) && Number(row.score) >= 0 && Number(row.score) <= 10;
export const reportPercent = (count, total) => total ? Math.round(count / total * 1000) / 10 : null;
export const searchable = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi').trim();
const blank = answer => !answer || (!answer.selectedOptionKey && !String(answer.response?.shortAnswer || '').trim() && !Object.keys(answer.response?.trueFalseAnswers || {}).length);
const counted = q => !['EXCLUDE', 'FULL_CREDIT'].includes(q.gradingMode);
export function studentMistakes(row, questions = []) {
  if (!row.isSubmitted) return null;
  const active = questions.filter(counted);
  return active.reduce((result, q) => {
    const answer = (row.answers || []).find(a => a.questionId === q.id);
    if (!answer?.isCorrect) { if (blank(answer)) result.blank++; else result.wrong++; }
    return result;
  }, { wrong: 0, blank: 0 });
}
export function buildReportInsights(data) {
  const { roster = [], questionAnalytics = [], questions = [], assignment = {} } = data;
  const submitted = roster.filter(r => r.isSubmitted), graded = submitted.filter(hasReportScore);
  const below = graded.filter(r => Number(r.score) < 5);
  const times = graded.map(r => Number(r.timeSpentSeconds)).filter(t => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  const median = times.length >= 5 ? times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2 : null;
  const timeReason = row => {
    if (!row.isSubmitted || !(row.timeSpentSeconds > 0)) return '';
    if (assignment.durationMinutes > 0 && row.timeSpentSeconds > assignment.durationMinutes * 60 + 60) return 'Vượt thời lượng hơn 1 phút';
    if (median && row.timeSpentSeconds < median / 3) return 'Dưới 1/3 thời gian trung vị';
    return '';
  };
  const ranked = questionAnalytics.filter(q => counted(q) && q.totalAnswers > 0).map(q => {
    const notCorrect = q.wrongAnswers + q.skippedAnswers;
    const common = [...(q.distribution || [])].filter(d => d.key !== q.correctOptionKey && d.count > 0).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0];
    const weakStatement = [...(q.statements || [])].sort((a, b) => a.correct - b.correct)[0];
    const shortWrong = new Map();
    for (const answer of q.answers || []) { const value = answer.response?.shortAnswer?.trim(); if (value && !answer.isCorrect) shortWrong.set(value, (shortWrong.get(value) || 0) + 1); }
    const short = [...shortWrong].sort((a, b) => b[1] - a[1])[0];
    const commonWrong = common ? `${common.count} em chọn ${common.key}` : weakStatement ? `Ý ${weakStatement.key}: ${weakStatement.correct}/${q.totalAnswers} đúng` : short ? `${short[1]} em trả lời “${short[0]}”` : q.skippedAnswers ? `${q.skippedAnswers} em bỏ trống` : 'Xem chi tiết câu trả lời';
    return { ...q, notCorrect, missRate: reportPercent(notCorrect, q.totalAnswers), commonWrong };
  }).sort((a, b) => b.missRate - a.missRate || b.notCorrect - a.notCorrect || a.orderIndex - b.orderIndex);
  const topics = new Map();
  for (const q of ranked) {
    if (!q.skillTitle || q.skillTitle === 'Chưa gắn kỹ năng') continue;
    const key = `${q.chapter || ''}:${q.skillTitle}`;
    const t = topics.get(key) || { key, title: q.skillTitle, questions: 0, notCorrect: 0, responses: 0, questionIds: [] };
    t.questions++; t.notCorrect += q.notCorrect; t.responses += q.totalAnswers; t.questionIds.push(q.questionId); topics.set(key, t);
  }
  const missingKeys = questions.filter(q => counted(q) && (q.questionType || 'SINGLE_CHOICE') === 'SINGLE_CHOICE' && (q.options || []).filter(o => o.isCorrect).length !== 1);
  return { submitted, graded, below, belowRate: reportPercent(below.length, graded.length), pending: submitted.length - graded.length,
    inProgress: roster.filter(r => !r.isSubmitted && r.status === 'IN_PROGRESS').length,
    notStarted: roster.filter(r => !r.isSubmitted && r.status !== 'IN_PROGRESS').length,
    average: graded.length ? graded.reduce((sum, r) => sum + Number(r.score), 0) / graded.length : null,
    median, timeReason, ranked, reviewQuestions: ranked.filter(q => q.missRate >= 50),
    topics: [...topics.values()].map(t => ({ ...t, missRate: reportPercent(t.notCorrect, t.responses) })).sort((a, b) => b.missRate - a.missRate || b.notCorrect - a.notCorrect),
    missingKeys, adjusted: questions.filter(q => !counted(q)),
  };
}
export function selectReportStudents(roster, questions, insights, { query = '', filter = 'ALL', sort = 'SCORE_ASC' } = {}) {
  const rows = roster.map(row => ({ ...row, mistakes: studentMistakes(row, questions), timeReason: insights.timeReason(row) })).filter(row =>
    searchable(`${row.fullName} ${row.username}`).includes(searchable(query)) &&
    (filter === 'ALL' || filter === 'LOW' && hasReportScore(row) && Number(row.score) < 5 || filter === 'GRADED' && hasReportScore(row) || filter === 'PENDING' && row.isSubmitted && !hasReportScore(row) || filter === 'IN_PROGRESS' && !row.isSubmitted && row.status === 'IN_PROGRESS' || filter === 'NOT_STARTED' && !row.isSubmitted && row.status !== 'IN_PROGRESS' || filter === 'NOT_SUBMITTED' && !row.isSubmitted || filter === 'TIME' && !!row.timeReason));
  return rows.sort((a, b) => {
    if (sort === 'NAME') return a.fullName.localeCompare(b.fullName, 'vi');
    if (sort === 'TIME') { if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? -1 : 1; return (a.timeSpentSeconds || 0) - (b.timeSpentSeconds || 0); }
    if (sort === 'MISTAKES') { if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? -1 : 1; return ((b.mistakes?.wrong || 0) + (b.mistakes?.blank || 0)) - ((a.mistakes?.wrong || 0) + (a.mistakes?.blank || 0)); }
    if (hasReportScore(a) !== hasReportScore(b)) return hasReportScore(a) ? -1 : 1;
    return (sort === 'SCORE_DESC' ? -1 : 1) * (Number(a.score || 0) - Number(b.score || 0)) || a.fullName.localeCompare(b.fullName, 'vi');
  });
}
