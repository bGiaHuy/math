import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeacherQuestion, countQuestions, DEFAULT_QUESTION_COUNTS } from '../src/components/teacherQuestionHelpers.js';
const sc = { content: '2 + 2 = ?', options: ['A','B','C','D'].map(key=>({key,content:key})), correctOption:'B' };
const tf = { questionType:'TRUE_FALSE',content:'Xét các ý',statements:['a','b','c','d'].map((key,index)=>({key,content:`Ý ${key}`,isCorrect:index%2===0})) };
const sa = { questionType:'SHORT_ANSWER',content:'Tính 1/2',shortAnswer:{mode:'NUMERIC',acceptedAnswers:['0,5','1/2'],tolerance:1e-9} };
test('JSON legacy single-choice remains valid and new multiple-choice requires four distinct A–D choices',()=>{
  assert.equal(normalizeTeacherQuestion(sc).questionType,'SINGLE_CHOICE');
  assert.throws(()=>normalizeTeacherQuestion({...sc,options:sc.options.slice(0,3)}));
  assert.throws(()=>normalizeTeacherQuestion({...sc,options:[...sc.options.slice(0,3),sc.options[0]]}));
  assert.throws(()=>normalizeTeacherQuestion({...sc,questionType:'ESSAY'}));
});
test('true/false JSON requires exactly four complete distinct statements and boolean answer keys',()=>{
  assert.deepEqual(normalizeTeacherQuestion(tf).statements,tf.statements);
  assert.throws(()=>normalizeTeacherQuestion({...tf,statements:tf.statements.slice(0,3)}));
  assert.throws(()=>normalizeTeacherQuestion({...tf,statements:tf.statements.map(s=>({...s,isCorrect:'false'}))}));
  assert.throws(()=>normalizeTeacherQuestion({...tf,statements:[...tf.statements.slice(0,3),tf.statements[0]]}));
});
test('numeric short-answer accepts fractions/comma decimals and rejects impossible numeric keys',()=>{
  assert.deepEqual(normalizeTeacherQuestion(sa).shortAnswer.acceptedAnswers,['0,5','1/2']);
  for(const answer of ['1/0','NaN','Infinity','1+1','2 cm','']) assert.throws(()=>normalizeTeacherQuestion({...sa,shortAnswer:{...sa.shortAnswer,acceptedAnswers:[answer]}}));
  assert.throws(()=>normalizeTeacherQuestion({...sa,shortAnswer:{...sa.shortAnswer,tolerance:-1}}));
});
test('text short-answer keeps case rule, strips unrelated type fields and rejects empty keys',()=>{
  const q=normalizeTeacherQuestion({...sa,options:sc.options,shortAnswer:{mode:'TEXT',acceptedAnswers:[' Có '],caseSensitive:true}});
  assert.equal(q.shortAnswer.caseSensitive,true);assert.deepEqual(q.shortAnswer.acceptedAnswers,['Có']);assert.equal(q.options,undefined);
  assert.throws(()=>normalizeTeacherQuestion({...sa,shortAnswer:{mode:'TEXT',acceptedAnswers:[]}}));
});
test('counts combine selected bank questions with authored questions without counting unselected bank entries',()=>{
  assert.deepEqual(DEFAULT_QUESTION_COUNTS,{SINGLE_CHOICE:12,TRUE_FALSE:4,SHORT_ANSWER:6});
  assert.deepEqual(countQuestions([{...sc,id:'selected'},{...tf,id:'not-selected'}],['selected'],[tf,sa]),{SINGLE_CHOICE:1,TRUE_FALSE:1,SHORT_ANSWER:1});
});

 test('preserves explicit knowledge and difficulty labels through preview and save normalization',()=>{
  const labelled=normalizeTeacherQuestion({...sc,skillId:'trigonometry',difficulty:'MEDIUM'});
  assert.equal(labelled.skillId,'trigonometry');assert.equal(labelled.difficulty,'MEDIUM');
  assert.equal(normalizeTeacherQuestion(sc).difficulty,'');
 });
