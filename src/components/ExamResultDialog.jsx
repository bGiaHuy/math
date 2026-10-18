import React, { useState } from 'react';
import useModalFocus from './useModalFocus';
import { createPortal } from 'react-dom';
import { X, BookOpen, Clock, CheckCircle, Lightbulb } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { MathQuestionResult } from './MathQuestionResponse';
import './exam-result.css';
import { answerState, ANSWER_STATE_LABELS } from '../lib/answerState';

export default function ExamResultDialog({ data, loading, onClose, teacher = false, children }) {
  const [filter, setFilter] = useState('all');
  const dialog = useModalFocus(true, onClose);
  const questions = data?.questions || [];
  const needsReview = q => ['incorrect', 'unanswered', 'incomplete', 'partial'].includes(answerState(q));
  const reviewCount = questions.filter(needsReview).length;
  const jump = id => {
    setFilter('all');
    requestAnimationFrame(() => { const el = document.getElementById(`review-${id}`); el?.scrollIntoView({ block: 'start' }); el?.focus({ preventScroll: true }); });
  };
  return createPortal(<div className="exam-result-overlay"><section ref={dialog} tabIndex={-1} className="exam-result" role="dialog" aria-modal="true" aria-labelledby="exam-result-title">
    <header className="exam-result-header"><div><span className="exam-result-eyebrow">{teacher ? 'Chi tiết bài làm học sinh' : `Lớp ${data?.className || 'học của em'} · Kết quả bài làm`}</span><h2 id="exam-result-title">{data?.assignmentTitle || 'Kết quả bài làm'}</h2>{data?.submittedAt && <p>Nộp lúc {new Date(data.submittedAt).toLocaleString('vi-VN')}</p>}</div><button className="exam-result-close" onClick={onClose} aria-label="Đóng kết quả"><X size={22}/></button></header>
    {loading || !data ? <div className="exam-result-empty" role="status">Đang tải kết quả bài làm…</div> : data.pendingPublication ? <div className="exam-result-empty"><h3>Em đã nộp bài</h3><p>Kết quả chưa được công bố. Em có thể quay lại xem sau.</p></div> : <>
      <div className="exam-result-summary"><div className="exam-result-score"><span>{teacher ? 'Điểm bài làm' : 'Điểm của em'}</span><strong>{data.score}<small> / 10</small></strong></div><div><span><CheckCircle size={16}/> Số câu đúng</span><strong>{data.correctCount}<small> / {data.totalQuestions}</small></strong></div><div><span><Clock size={16}/> Thời gian làm bài</span><strong>{Math.floor(data.timeSpentSeconds / 60)}<small> phút </small>{data.timeSpentSeconds % 60}<small> giây</small></strong></div></div>
      {data.resultsUpdated && <p className="exam-result-update" role="status">Kết quả đã được cập nhật do điều chỉnh đề hoặc đáp án.</p>}
      <div className="exam-result-layout"><aside className="exam-result-nav"><h3>Tổng quan câu hỏi</h3><p>Chọn số câu để xem lại bài làm.</p><div className="exam-result-grid">{questions.map((q, i) => <button key={q.id} className={answerState(q)} onClick={() => jump(q.id)} aria-label={`Câu ${i + 1}: ${ANSWER_STATE_LABELS[answerState(q)]}`}>{i + 1}</button>)}</div><div className="exam-result-legend"><span>● Đúng</span><span>✕ Sai</span><span>○ Chưa trả lời</span><span>◐ Chưa đủ / Một phần</span><span>◷ Chờ chấm</span></div>{!teacher && data.showSolutions !== false && reviewCount > 0 && <div className="exam-result-notebook"><BookOpen size={20}/><strong>Ôn lại từ câu chưa đúng</strong><p>Các câu làm sai đã được lưu vào Sổ tay lỗi sai để em luyện tập tiếp.</p></div>}</aside>
      <main className="exam-result-content"><div className="exam-result-toolbar"><h3>Xem lại bài làm</h3><div aria-label="Lọc câu hỏi">{[['all', `Tất cả (${questions.length})`], ['review', `Cần ôn (${reviewCount})`]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      {filter === 'review' && !reviewCount && <p className="exam-result-empty">{questions.length > 0 && questions.every(q => answerState(q) === 'correct') ? (teacher ? 'Học sinh đã trả lời đúng tất cả các câu.' : 'Em đã trả lời đúng tất cả các câu.') : 'Chưa có câu được xác định cần ôn. Câu chờ chấm, không tính điểm hoặc cho điểm toàn bộ không nằm trong bộ lọc này.'}</p>}
      {questions.map((q, idx) => (filter === 'all' || needsReview(q)) && <article id={`review-${q.id}`} tabIndex={-1} className="exam-result-question" key={q.id}><div className="exam-result-question-heading"><span>Câu {idx + 1}<small>{q.skillTitle}</small></span><span className={`exam-result-status ${answerState(q)}`}>{ANSWER_STATE_LABELS[answerState(q)]}</span></div><div className="exam-result-prompt"><MathRenderer content={q.content}/></div><MathQuestionResult question={{ ...q, showSolutions: data.showSolutions }}/>{data.showSolutions !== false && q.explanation && <details className="exam-result-solution"><summary><Lightbulb size={17}/> Lời giải & phương pháp</summary><MathRenderer content={q.explanation}/></details>}</article>)}{children}</main></div>
    </>}
    <footer className="exam-result-footer"><span>{teacher ? 'Xem chi tiết câu trả lời và kết quả chấm điểm.' : 'Hiểu chỗ sai để tiến bộ ở lần tiếp theo.'}</span><button onClick={onClose}>{teacher ? 'Đóng bài làm' : 'Về lớp học'}</button></footer>
  </section></div>, document.body);
}
