import {describe,it,expect} from 'vitest';
import {gradeQuestion,validateQuestion,validateAnswer,parseNumericAnswer} from '../src/modules/question/math-question';
const tf={questionType:'TRUE_FALSE',content:'Q',statements:['a','b','c','d'].map((key,i)=>({key,content:key,isCorrect:i%2===0}))};
const sa={questionType:'SHORT_ANSWER',content:'Q',shortAnswer:{mode:'NUMERIC',acceptedAnswers:['1/2'],tolerance:0.001}};
describe('Math typed questions',()=>{
 it('TF partial credit ignores missing false',()=>expect(gradeQuestion(tf,{response:{trueFalseAnswers:{a:true,b:false,c:false}}})).toMatchObject({isCorrect:false,pointsAwarded:0.25,gradingDetails:{a:true,b:true,c:false,d:false}}));
 it.each([0,1,2,3,4])('TF nonlinear rubric for %i correct statements', count => {
 const q={...tf,statements:tf.statements.map(s=>({...s,isCorrect:true}))};
 const trueFalseAnswers=Object.fromEntries(q.statements.map((s,i)=>[s.key,i<count]));
 expect(gradeQuestion(q,{response:{trueFalseAnswers}},2).pointsAwarded).toBe([0,.1,.25,.5,1][count]*2);
 });
 it('numeric normalization and safe parser',()=>{
 for(const v of ['0,5','1/2','0.5005']) expect(gradeQuestion(sa,{response:{shortAnswer:v}}).isCorrect).toBe(true);
 for(const v of ['1/0','Infinity','1+1','0.6','0.5 kg']) expect(gradeQuestion(sa,{response:{shortAnswer:v}}).isCorrect).toBe(false);
 expect(parseNumericAnswer('−1/2')).toBe(-0.5);
 });
 it('grades displayed decimal-comma examples numerically rather than as text',()=>{
 const numeric=(key:string)=>({questionType:'SHORT_ANSWER',shortAnswer:{mode:'NUMERIC',acceptedAnswers:[key],tolerance:1e-9}});
 expect(gradeQuestion(numeric('239'),{response:{shortAnswer:'239'}}).pointsAwarded).toBe(1);
 expect(gradeQuestion(numeric('6.9'),{response:{shortAnswer:'6,9'}}).pointsAwarded).toBe(1);
 expect(gradeQuestion(numeric('6.9'),{response:{shortAnswer:'6,8'}}).pointsAwarded).toBe(0);
 });
 it('text normalization' ,()=>expect(gradeQuestion({questionType:'SHORT_ANSWER',shortAnswer:{mode:'TEXT',acceptedAnswers:['Hà Nội']}},{response:{shortAnswer:' hà   nội '}}).isCorrect).toBe(true));
 it('invalid question and answer rejected',()=>{
 expect(()=>validateQuestion({...tf,statements:tf.statements.slice(1)})).toThrow();
 expect(()=>validateQuestion({...sa,shortAnswer:{mode:'NUMERIC',acceptedAnswers:['NaN']}})).toThrow();
 expect(()=>validateAnswer(tf,{response:{trueFalseAnswers:{a:'false'}}})).toThrow();
 expect(()=>validateAnswer(sa,{selectedOptionKey:'A'})).toThrow();
 });
 it('legacy question allowed explicit new choice requires4',()=>{
 const q={content:'Q',options:[{key:'A',content:'1',isCorrect:true},{key:'B',content:'2'}]};
 expect(validateQuestion(q)).toBe('SINGLE_CHOICE');
 expect(()=>validateQuestion({...q,questionType:'SINGLE_CHOICE'})).toThrow();
 });
});
