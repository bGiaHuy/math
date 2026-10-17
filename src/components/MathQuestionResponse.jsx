import React from 'react';
import MathRenderer from './MathRenderer';
import './MathQuestionResponse.css';

export const QUESTION_TYPE_LABELS = { SINGLE_CHOICE: 'Nhiều lựa chọn', TRUE_FALSE: 'Đúng / Sai — 4 ý', SHORT_ANSWER: 'Trả lời ngắn' };
export function isQuestionAnswered(question, answer) {
  if (question.questionType === 'TRUE_FALSE') return ['a', 'b', 'c', 'd'].every(key => typeof answer?.trueFalseAnswers?.[key] === 'boolean');
  if (question.questionType === 'SHORT_ANSWER') return typeof answer?.shortAnswer === 'string' && answer.shortAnswer.trim().length > 0;
  return typeof answer === 'string' && answer.length > 0;
}
export function toAssignmentAnswers(answers) {
  return Object.entries(answers).map(([questionId, value]) => typeof value === 'string'
    ? { questionId, selectedOptionKey: value }
    : { questionId, response: value });
}
export function fromAssignmentAnswers(answers = []) {
  return Object.fromEntries(answers.map(answer => [answer.questionId, answer.response && Object.keys(answer.response).length ? answer.response : answer.selectedOptionKey || '']));
}

export default function MathQuestionResponse({ question, answer, onChange, disabled = false }) {
  const type = question.questionType || 'SINGLE_CHOICE';
  return <div className="math-response">
    <p className="math-response-type">{QUESTION_TYPE_LABELS[type]}</p>
    {type === 'TRUE_FALSE' ? <div className="math-statements">
      {(question.statements || []).map(statement => <fieldset key={statement.key} disabled={disabled}>
        <legend><strong>{statement.key}) </strong><MathRenderer content={statement.content} /></legend>
        <div className="math-boolean-options">{[true, false].map(value => <label key={String(value)}>
          <input type="radio" name={`${question.id}-${statement.key}`} checked={answer?.trueFalseAnswers?.[statement.key] === value}
            onChange={() => onChange({ trueFalseAnswers: { ...(answer?.trueFalseAnswers || {}), [statement.key]: value } })} />
          {value ? 'Đúng' : 'Sai'}
        </label>)}</div>
      </fieldset>)}
    </div> : type === 'SHORT_ANSWER' ? <label className="math-short-answer">
      Câu trả lời của em
      <input type="text" disabled={disabled} maxLength={1000} value={answer?.shortAnswer || ''}
        onChange={event => onChange({ shortAnswer: event.target.value })} autoComplete="off" placeholder="Nhập câu trả lời" />
      <small>Với đáp án số, em có thể nhập số thập phân hoặc phân số, ví dụ 0,5 hoặc 1/2.</small>
    </label> : <fieldset className="math-choice-options" disabled={disabled}>
      <legend className="sr-only">Chọn một đáp án</legend>
      {(question.options || []).map(option => <label key={option.key} className={answer === option.key ? 'selected' : ''}>
        <input type="radio" name={question.id} checked={answer === option.key} onChange={() => onChange(option.key)} />
        <strong>{option.key}</strong><MathRenderer content={option.content} />
      </label>)}
    </fieldset>}
  </div>;
}

export function MathQuestionResult({ question }) {
  const q = question;
  if (q.questionType === 'TRUE_FALSE') return <div className="math-response-result">
    {(q.statements || []).map(statement => {
      const selected = q.response?.trueFalseAnswers?.[statement.key];
      return <div key={statement.key}><strong>{statement.key}) </strong><MathRenderer content={statement.content} />
        <p>Em chọn: {typeof selected === 'boolean' ? selected ? 'Đúng' : 'Sai' : 'Chưa trả lời'} · Đáp án: {statement.isCorrect ? 'Đúng' : 'Sai'} · {q.gradingDetails?.[statement.key] ? 'Ý đúng' : 'Chưa đạt'}</p>
      </div>;
    })}
  </div>;
  if (q.questionType === 'SHORT_ANSWER') return <div className="math-response-result">
    <p>Em trả lời: <strong>{q.response?.shortAnswer || 'Chưa trả lời'}</strong></p>
    <p>Đáp án chấp nhận: {(q.shortAnswer?.acceptedAnswers || []).join(' hoặc ')}</p>
    {q.shortAnswer?.mode === 'NUMERIC' && <small>Sai số tuyệt đối cho phép: {q.shortAnswer.tolerance ?? 1e-9}</small>}
  </div>;
  return <div className="math-response-result">{(q.options || []).map(option => <div key={option.key} className={option.isCorrect ? 'correct' : option.key === q.studentSelectedKey ? 'incorrect' : ''}>
    <strong>{option.key}. </strong><MathRenderer content={option.content} />
    {option.isCorrect ? ' — Đáp án đúng' : option.key === q.studentSelectedKey ? ' — Em đã chọn' : ''}
  </div>)}</div>;
}
