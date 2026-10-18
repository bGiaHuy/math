export function deliveredQuestion(aq: any): any { return aq.snapshot || aq.question; }
export function resultVisible(assignment: any): boolean {
  const s = assignment.settings || {};
  return (s.resultsPolicy || 'IMMEDIATE') === 'IMMEDIATE' || s.published === true ||
    (s.resultsPolicy === 'AFTER_DUE' && assignment.dueDate && new Date(assignment.dueDate).getTime() <= Date.now());
}
export function tracksTabSwitches(settings: any = {}) {
  return settings?.trackTabSwitches ?? (settings?.mode !== 'PRACTICE');
}
export function activityReport(events: any[] = [], end?: Date) {
  const open = new Map<string, any>();
  const visits: any[] = [];
  for (const e of events) {
    if (e.kind === 'HIDDEN' && !open.has(e.sessionId)) open.set(e.sessionId, e);
    if (e.kind === 'VISIBLE' && open.has(e.sessionId)) {
      const start = open.get(e.sessionId); open.delete(e.sessionId);
      visits.push({ leftAt: start.at, returnedAt: e.at, seconds: Math.max(0, Math.round((Date.parse(e.at) - Date.parse(start.at)) / 1000)) });
    }
  }
  for (const start of open.values()) visits.push({ leftAt: start.at, returnedAt: null, seconds: end ? Math.max(0, Math.round((end.getTime() - Date.parse(start.at)) / 1000)) : null });
  return { count: visits.length, seconds: visits.reduce((sum, v) => sum + (v.seconds || 0), 0), visits, reloads: events.filter(e => e.kind === 'RELOAD').length };
}
export function isBlank(answer: any) {
  return !answer || (!answer.selectedOptionKey && !answer.response?.shortAnswer?.trim() && !Object.keys(answer.response?.trueFalseAnswers || {}).length);
}
import { gradeQuestion } from '../question/math-question';
export function gradeDelivered(q: any, answer: any, weight = 1) {
  if (q.gradingMode === 'FULL_CREDIT') return { isCorrect: true, pointsAwarded: weight, gradingDetails: { fullCredit: true } };
  if (q.gradingMode === 'EXCLUDE') return { isCorrect: false, pointsAwarded: 0, gradingDetails: { excluded: true } };
  return gradeQuestion(q, answer, weight);
}
