import { describe, it, expect } from 'vitest';
import { tracksTabSwitches, activityReport, gradeDelivered, resultVisible } from '../src/modules/assignment/workspace-helpers';

describe('Teacher workspace rules', () => {
  it('keeps manual results hidden until publication, independent of automatic grading', () => {
    expect(resultVisible({ settings: { resultsPolicy: 'MANUAL' }, score: 10 })).toBe(false);
    expect(resultVisible({ settings: { resultsPolicy: 'MANUAL', published: true } })).toBe(true);
    expect(resultVisible({ settings: { resultsPolicy: 'AFTER_DUE' }, dueDate: new Date(Date.now() + 60000) })).toBe(false);
    expect(resultVisible({ settings: { resultsPolicy: 'AFTER_DUE' }, dueDate: new Date(Date.now() - 1000) })).toBe(true);
  });
  it('counts hidden-visible pairs once and keeps reloads separate', () => {
    const events = [
      { kind: 'HIDDEN', sessionId: 'one', at: '2026-10-17T01:00:00Z' },
      { kind: 'HIDDEN', sessionId: 'one', at: '2026-10-17T01:00:01Z' },
      { kind: 'RELOAD', sessionId: 'one', at: '2026-10-17T01:00:03Z' },
      { kind: 'VISIBLE', sessionId: 'one', at: '2026-10-17T01:00:10Z' }
    ];
    expect(activityReport(events)).toMatchObject({ count: 1, seconds: 10, reloads: 1 });
  });
  it('preserves unknown return times and handles separate tab sessions', () => {
    const events = [
      { kind: 'HIDDEN', sessionId: 'one', at: '2026-10-17T01:00:00Z' },
      { kind: 'VISIBLE', sessionId: 'two', at: '2026-10-17T01:00:10Z' }
    ];
    expect(activityReport(events).visits[0]).toMatchObject({ returnedAt: null, seconds: null });
    expect(activityReport(events, new Date('2026-10-17T01:00:20Z')).seconds).toBe(20);
  });
  it('applies full-credit and exclusion consistently even to blank responses', () => {
    expect(gradeDelivered({ gradingMode: 'FULL_CREDIT' }, undefined, 2)).toMatchObject({ pointsAwarded: 2, isCorrect: true });
    expect(gradeDelivered({ gradingMode: 'EXCLUDE' }, { selectedOptionKey: 'A' }, 0)).toMatchObject({ pointsAwarded: 0, gradingDetails: { excluded: true } });
  });
  it('normal grading uses the delivered answer and weight', () => {
    const q = { questionType: 'SINGLE_CHOICE', options: [{ optionKey: 'B', isCorrect: true }] };
    expect(gradeDelivered(q, { selectedOptionKey: 'B' }, 3).pointsAwarded).toBe(3);
    expect(gradeDelivered(q, { selectedOptionKey: 'A' }, 3).pointsAwarded).toBe(0);
  });
});

describe('Tab tracking settings', () => {
  it('honors the switch for every assignment mode and preserves legacy defaults', () => {
    for (const mode of ['TEST', 'PRACTICE']) {
      expect(tracksTabSwitches({ mode, trackTabSwitches: true })).toBe(true);
      expect(tracksTabSwitches({ mode, trackTabSwitches: false })).toBe(false);
    }
    expect(tracksTabSwitches({})).toBe(true);
    expect(tracksTabSwitches({ mode: 'PRACTICE' })).toBe(false);
  });
});
