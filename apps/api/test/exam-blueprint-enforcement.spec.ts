import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { blueprintBank, blueprintQuestions, blueprintSkills } from './fixtures/blueprint';
import { validateBlueprintPaper, requireBlueprintCounts } from '../src/modules/diagnostic/diagnostic-blueprint';
import { AssignmentService } from '../src/modules/assignment/assignment.service';
import { TeacherWorkspaceService } from '../src/modules/assignment/teacher-workspace.service';
import { validateGeneratedExam } from '../src/modules/assignment/exam-ai.service';

describe('Shared exam matrix enforcement across authoring sources', () => {
  it('rejects a 22-question paper with correct type totals but wrong topics or levels', () => {
    const rows = blueprintBank();
    expect(validateBlueprintPaper([...rows].reverse()).map(q => q.id)).toEqual(rows.map(q => q.id));
    for (const patch of [{ skill: rows[0].skill }, { cognitiveLevel: 'REMEMBERING' }, { difficulty: 'EASY' }]) {
      expect(() => validateBlueprintPaper(rows.map((q,i) => i === 21 ? {...q,...patch} : q))).toThrow();
    }
  });
  it('rejects duplicate text, wrong grade, unresolved labels and document placeholders', () => {
    const rows = blueprintBank();
    for (const patch of [{ content: ' '+rows[0].content.toUpperCase()+' ' }, { skill: { ...rows[21].skill, grade: 8 } }, { source: { classification: { status: 'NEEDS_REVIEW' } } }, { content: 'Câu 22 trong đề gốc.' }]) {
      expect(() => validateBlueprintPaper(rows.map((q,i) => i === 21 ? {...q,...patch} : q))).toThrow();
    }
    for (const counts of [null, {}, { SINGLE_CHOICE:12, TRUE_FALSE:4, SHORT_ANSWER:5 }, { SINGLE_CHOICE:12, TRUE_FALSE:4, SHORT_ANSWER:6, EXTRA:0 }]) expect(() => requireBlueprintCounts(counts)).toThrow();
  });
  function assignmentSetup() {
    const rows: any[] = blueprintBank();
    let saved: any;
    const tx: any = {
      question: {
        findMany: vi.fn(async ({ where }) => rows.filter(q => where.id.in.includes(q.id))),
        create: vi.fn(async ({ data }) => { const q = { ...data, options: data.options?.create || [], id: `new-${rows.length}`, skill: blueprintSkills.find(s => s.id === data.skillId) }; rows.push(q); return q; })
      },
      skillNode: { upsert: vi.fn(async () => ({ id:'teacher-general', grade:0 })), findUnique: vi.fn(async ({ where }) => blueprintSkills.find(s => s.id === where.id)) },
      classroomAssignment: { create: vi.fn(async ({data}) => (saved = { ...data, id:'assignment', questions: data.questions.create })) },
      assignmentQuestion: { findMany: vi.fn(async () => saved.questions.map((aq: any,i: number) => ({ ...aq, id:`aq-${i}`, question:rows.find(q => q.id === aq.questionId) }))), update: vi.fn() }
    };
    const db: any = { classroom: { findUnique: vi.fn(async () => ({ id:'class', teacherId:'teacher', grade:9, isActive:true })) }, $transaction:(fn: any) => fn(tx) };
    return { service: new AssignmentService(db), tx, rows };
  }
  it('persists a valid manual/AI/JSON paper with matrix version and canonical order', async () => {
    const {service,tx} = assignmentSetup();
    const result = await service.createAssignment('teacher','class',{ title:'Đề tổng hợp', durationMinutes:45, customQuestions:blueprintQuestions().reverse() } as any);
    expect(result.assignment.questionCount).toBe(22);
    expect(tx.question.create).toHaveBeenCalledTimes(22);
    expect(tx.classroomAssignment.create.mock.calls[0][0].data.settings.paperVersion).toBe('teacher-flexible-v1');
    expect(tx.assignmentQuestion.update).toHaveBeenCalledTimes(22);
  });
  it('does not write a malformed manual/AI paper even when request counts are omitted', async () => {
    const {service,tx} = assignmentSetup();
    const questions: any[] = blueprintQuestions();
    questions[21].difficulty='INVALID';
    await expect(service.createAssignment('teacher','class',{ title:'Invalid', durationMinutes:45, customQuestions:questions } as any)).rejects.toThrow();
    expect(tx.question.create).not.toHaveBeenCalled();
    expect(tx.classroomAssignment.create).not.toHaveBeenCalled();
  });
  it('accepts and saves an AI paper covering only one resolved topic', async () => {
    const questions = blueprintQuestions().map(q => ({ ...q, skillId: blueprintSkills[0].id }));
    expect(validateGeneratedExam({questions},{SINGLE_CHOICE:12,TRUE_FALSE:4,SHORT_ANSWER:6},blueprintSkills)).toHaveLength(22);
    const {service,tx} = assignmentSetup();
    const result = await service.createAssignment('teacher','class',{ title:'Đề một chuyên đề', durationMinutes:45, customQuestions:questions } as any);
    expect(result.assignment.questionCount).toBe(22);
    expect(tx.assignmentQuestion.update).toHaveBeenCalledTimes(22);
  });
  it('saves a small teacher paper with freely assigned difficulty and cognition', async () => {
    const questions = blueprintQuestions().slice(0, 3).map(q => ({...q, difficulty:'VERY_HARD', cognitiveLevel:'APPLYING'}));
    const { service, tx } = assignmentSetup();
    const result = await service.createAssignment('teacher','class',{title:'Đề linh hoạt',durationMinutes:15,questionCounts:{SINGLE_CHOICE:3,TRUE_FALSE:0,SHORT_ANSWER:0},customQuestions:questions} as any);
    expect(result.assignment.questionCount).toBe(3);
    expect(tx.assignmentQuestion.update).toHaveBeenCalledTimes(3);
  });
  it('saves Database Systems questions without a Math skill or cognitive label', async () => {
    const {service,tx} = assignmentSetup();
    const question = {questionType:'SHORT_ANSWER',content:'Which SQL clause filters grouped rows?',difficulty:'MEDIUM',shortAnswer:{mode:'TEXT',acceptedAnswers:['HAVING'],instructions:'Enter one SQL keyword.'}};
    const result = await service.createAssignment('teacher','class',{title:'Database Systems',durationMinutes:15,questionCounts:{SINGLE_CHOICE:0,TRUE_FALSE:0,SHORT_ANSWER:1},customQuestions:[question]} as any);
    expect(result.assignment.questionCount).toBe(1);
    expect(tx.skillNode.upsert.mock.calls[0][0].create.grade).toBe(0);
    expect(tx.question.create.mock.calls[0][0].data).toMatchObject({skillId:'teacher-general',difficulty:'MEDIUM',content:question.content});
    expect(tx.assignmentQuestion.update).toHaveBeenCalledOnce();
  });
  it('blocks publishing an old incomplete draft through the settings endpoint', async () => {
    const tx: any = { $executeRaw:vi.fn(), classroomAssignment:{update:vi.fn()} };
    const service = new TeacherWorkspaceService({$transaction:(fn: any)=>fn(tx)} as any);
    vi.spyOn(service as any,'load').mockResolvedValue({ questions:[{snapshot:{...blueprintBank()[0],options:[]}}], submissions:[], settings:{} });
    await expect(service.settings('teacher','class','assignment',{status:'PUBLISHED'})).rejects.toThrow();
    expect(tx.classroomAssignment.update).not.toHaveBeenCalled();
  });
});
