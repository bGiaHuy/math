import React, { useEffect, useState } from 'react';
import { ListChecks, Eye } from 'lucide-react';
import { DEFAULT_QUESTION_COUNTS, QUESTION_LABELS } from './teacherQuestionHelpers';

const difficulties = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', VERY_HARD: 'Rất khó' };

export default function ComposerSupport({ actual, questions, counts = DEFAULT_QUESTION_COUNTS, onPreview, onSelectSlot }) {
  const [expanded, setExpanded] = useState(false);
  let position = 0;
  const slots = Object.entries(counts).flatMap(([questionType, count]) => Array.from({ length: Math.max(0, Number(count)) }, (_, index) => ({ slot: ++position, questionType, filled: index < actual[questionType] })));
  const total = questions.length;
  const target = Object.values(counts).reduce((sum, n) => sum + Number(n), 0);
  return <aside className={`tec-support ${expanded ? 'is-expanded' : ''}`} aria-label="Cấu trúc và độ khó" tabIndex={0}><div className="tec-support-heading"><ListChecks size={19} /><h3>Cấu trúc đề</h3></div><div className="tec-total"><strong>{total}<span>/{target}</span></strong><span>Câu hỏi đã thêm</span></div><progress aria-label="Số câu đã thêm vào đề" value={Math.min(total, target)} max={target || 1} /><button type="button" className="tec-mobile-matrix-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Thu gọn cấu trúc đề' : 'Mở cấu trúc và chọn vị trí'}</button><div className="tec-support-types">{Object.entries(counts).map(([type, n], index) => <div className={`tec-type-progress tec-pattern-${index}`} key={type}><span>{QUESTION_LABELS[type]}</span><strong>{actual[type]}/{n}</strong><div className="tec-mini-track"><span style={{width: `${n ? Math.min(actual[type] / n, 1) * 100 : 0}%`}} /></div></div>)}</div><div className="tec-slot-picker"><small>Chọn vị trí còn thiếu để lọc loại câu</small><div>{slots.map(slot => <button type="button" key={slot.slot} disabled={slot.filled || !onSelectSlot} aria-label={`Vị trí ${slot.slot}: ${slot.filled ? 'đã có câu' : QUESTION_LABELS[slot.questionType]}`} onClick={() => onSelectSlot(slot)}>{slot.filled ? '✓' : slot.slot}</button>)}</div></div><h3 className="tec-difficulty-heading">Phân loại độ khó</h3><div className="tec-support-types">{Object.entries(difficulties).map(([code, label]) => <div key={code}><span>{label}</span><strong>{questions.filter(q => q.difficulty === code).length} câu</strong></div>)}</div><p className="tec-support-status" role="status">{total < target ? `Còn ${target - total} câu để đủ số lượng.` : 'Kiểm tra nội dung và đáp án trước khi giao.'}</p>{onPreview && <button type="button" disabled={!total} onClick={onPreview}><Eye size={16} />Xem trước đề</button>}</aside>;
}

export function AiQuestionSkeleton({ loading }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(false); if (!loading) return; const timer = setTimeout(() => setVisible(true), 240); return () => clearTimeout(timer); }, [loading]);
  if (!loading) return null;
  return <div className="tec-generation-result" aria-busy="true" aria-label="AI đang tạo câu hỏi"><p role="status">Đang tạo và kiểm tra câu hỏi…</p><small>Giữ trang mở. Các câu đã có vẫn được giữ lại.</small><div className={`tec-skeleton-surface ${visible ? 'is-visible' : ''}`} aria-hidden="true" data-testid="ai-question-skeleton">{[0, 1, 2].map(i => <div className="tec-skeleton-question" key={i}><span className="tec-skeleton-number" /><div><span className="tec-skeleton-line" /><span className="tec-skeleton-line tec-skeleton-short" /></div><span className="tec-skeleton-tag" /></div>)}</div></div>;
}
