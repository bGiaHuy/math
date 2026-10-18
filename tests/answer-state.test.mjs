import test from 'node:test';
import assert from 'node:assert/strict';
import {answerState} from '../src/lib/answerState.js';
test('answer presentation separates absence, completeness, grading, and adjustments',()=>{
 assert.equal(answerState({isCorrect:false}),'unanswered');
 assert.equal(answerState({questionType:'TRUE_FALSE',response:{trueFalseAnswers:{a:false}},isCorrect:false}),'incomplete');
 assert.equal(answerState({response:{shortAnswer:'0'},isCorrect:null}),'pending');
 assert.equal(answerState({studentSelectedKey:'B',isCorrect:false}),'incorrect');
 assert.equal(answerState({studentSelectedKey:'A',isCorrect:true}),'correct');
 assert.equal(answerState({studentSelectedKey:'B',isCorrect:false,pointsAwarded:0.25}),'partial');
 assert.equal(answerState({gradingMode:'EXCLUDE'}),'excluded');
 assert.equal(answerState({gradingMode:'FULL_CREDIT'}),'credited');
 assert.equal(answerState({questionType:'TRUE_FALSE',response:{trueFalseAnswers:{a:false,b:false,c:false,d:false}},isCorrect:true}),'correct');
});
