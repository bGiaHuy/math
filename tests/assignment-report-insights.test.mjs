import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReportInsights, hasReportScore, selectReportStudents, studentMistakes } from '../src/components/assignmentReportInsights.js';
const makeRow = (i, score) => ({ studentId:String(i),fullName:`Học sinh ${i}`,username:`hs${i}`,isSubmitted:true,status:'SUBMITTED',score,timeSpentSeconds:1200,answers:[] });
const question = {id:'q',questionType:'SINGLE_CHOICE',options:[{optionKey:'A',isCorrect:true},{optionKey:'B',isCorrect:false}]};
test('19/31 is 61.3%; unsubmitted and missing scores are never treated as zero',()=>{
 const roster=[...Array.from({length:31},(_,i)=>makeRow(i,i<19?4:7)),{...makeRow(31,null),isSubmitted:false,status:'IN_PROGRESS'},{...makeRow(32,null),isSubmitted:false,status:'NOT_STARTED'},makeRow(33,null)];
 const report=buildReportInsights({roster});assert.equal(report.belowRate,61.3);assert.equal(report.graded.length,31);assert.equal(report.pending,1);assert.equal(report.inProgress,1);assert.equal(report.notStarted,1);assert.equal(hasReportScore(makeRow('null',null)),false);assert.equal(hasReportScore(makeRow('zero',0)),true);
});
test('empty report has no invented score, percentage or time anomaly',()=>{const r=buildReportInsights({});assert.equal(r.average,null);assert.equal(r.belowRate,null);assert.equal(r.median,null);assert.deepEqual(r.reviewQuestions,[]);});
test('partial answers and blanks are distinguished; excluded/full-credit questions do not create support flags',()=>{
 const questions=[question,{id:'blank'}, {id:'partial',questionType:'TRUE_FALSE'},{id:'excluded',gradingMode:'EXCLUDE'},{id:'credit',gradingMode:'FULL_CREDIT'}];
 const row={...makeRow(1,3),answers:[{questionId:'q',selectedOptionKey:'B',isCorrect:false},{questionId:'partial',response:{trueFalseAnswers:{a:true}},pointsAwarded:.5,isCorrect:false}]};
 assert.deepEqual(studentMistakes(row,questions),{wrong:2,blank:1});assert.equal(studentMistakes({...row,isSubmitted:false},questions),null);
});
test('question ranking and topic rates use answer opportunities, not averages of percentages',()=>{
 const q={questionId:'q',orderIndex:1,skillTitle:'Căn thức',totalAnswers:10,correctAnswers:2,wrongAnswers:6,skippedAnswers:2,correctOptionKey:'A',distribution:[{key:'A',count:2},{key:'B',count:5},{key:'C',count:1}]};
 const r=buildReportInsights({questionAnalytics:[q,{...q,questionId:'q2',totalAnswers:2,correctAnswers:2,wrongAnswers:0,skippedAnswers:0},{...q,questionId:'excluded',gradingMode:'EXCLUDE'}]});
 assert.equal(r.ranked.length,2);assert.equal(r.reviewQuestions[0].missRate,80);assert.equal(r.ranked[0].commonWrong,'5 em chọn B');assert.equal(r.topics[0].missRate,66.7);
});
test('time flags require at least five positive durations; zero and in-progress are not fast submissions',()=>{
 const sparse=buildReportInsights({roster:[makeRow(1,5),makeRow(2,5)]});assert.equal(sparse.timeReason({...makeRow(3,5),timeSpentSeconds:1}),'');
 const r=buildReportInsights({assignment:{durationMinutes:45},roster:Array.from({length:6},(_,i)=>makeRow(i,5))});assert.ok(r.timeReason({...makeRow(7,5),timeSpentSeconds:120}));assert.equal(r.timeReason({...makeRow(7,5),timeSpentSeconds:0}),'');assert.equal(r.timeReason({...makeRow(7,5),isSubmitted:false,timeSpentSeconds:120}),'');assert.ok(r.timeReason({...makeRow(7,5),timeSpentSeconds:3000}));
});
test('student filters, accent-insensitive search and score sorting preserve zero and put ungraded last',()=>{
 const roster=[makeRow(1,8),{...makeRow(2,0),fullName:'Nguyễn Minh Đức'}, {...makeRow(3,null),isSubmitted:false,status:'IN_PROGRESS'},makeRow(4,null)];const insights=buildReportInsights({roster});
 assert.deepEqual(selectReportStudents(roster,[],insights).map(r=>r.studentId),['2','1','3','4']);assert.equal(selectReportStudents(roster,[],insights,{query:'nguyen minh duc'}).length,1);assert.equal(selectReportStudents(roster,[],insights,{filter:'LOW'}).length,1);assert.equal(selectReportStudents(roster,[],insights,{filter:'PENDING'}).length,1);
});
