import React from 'react';

// The server-provided denominator is shared by every segment and textual count.
export default function QuestionResponseDistribution({ question, compact = false }) {
  const { totalAnswers = 0, correctAnswers = 0, wrongAnswers = 0, skippedAnswers = 0 } = question;
  return <span className={`ar-response-summary ${compact ? 'is-compact' : ''}`}>
    {totalAnswers > 0 && <span className="ar-response-distribution" aria-hidden="true">
      <span className="ar-response-correct" style={{ width: `${correctAnswers / totalAnswers * 100}%` }} />
      <span className="ar-response-wrong" style={{ width: `${wrongAnswers / totalAnswers * 100}%` }} />
      <span className="ar-response-blank" style={{ width: `${skippedAnswers / totalAnswers * 100}%` }} />
    </span>}
    <span className="ar-question-breakdown"><span className="ar-count-correct">{correctAnswers} đúng</span><span className="ar-count-wrong">{wrongAnswers} sai/một phần</span><span className="ar-count-blank">{skippedAnswers} trống</span>{!compact && <span>{totalAnswers} lượt trả lời</span>}</span>
  </span>;
}
