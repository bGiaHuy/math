import React from 'react';
import { Sparkles, Library, PenLine, FileUp, Braces, Check, ArrowRight } from 'lucide-react';

export const EXAM_METHODS = [
  { id: 'ai', title: 'Tạo đề bằng AI', description: 'Tạo câu hỏi từ tài liệu mọi môn và phân loại bốn độ khó.', icon: Sparkles, tone: 'amber' },
  { id: 'bank', title: 'Ngân hàng câu hỏi', description: 'Tự động soạn đủ 22 câu theo ma trận và chuyên đề đã chọn.', icon: Library, tone: 'sage' },
  { id: 'manual', title: 'Soạn thủ công', description: 'Tự biên soạn nội dung, đáp án và lời giải từng câu.', icon: PenLine, tone: 'blue' },
  { id: 'document', title: 'Tải đề từ tệp', description: 'Giữ đề gốc PDF, Word hoặc ảnh, thêm phiếu trả lời.', icon: FileUp, tone: 'clay', secondary: true },
  { id: 'json', title: 'Nhập từ JSON', description: 'Nhập dữ liệu đề theo cấu trúc JSON có sẵn.', icon: Braces, tone: 'slate', secondary: true }
];

export default function ExamMethodSelector({ selected, onSelect, onContinue, questionCount, opened }) {
  const method = EXAM_METHODS.find(m => m.id === selected) || EXAM_METHODS[0];
  const card = item => {
    const Icon = item.icon, checked = selected === item.id;
    return <button type="button" key={item.id} role="radio" aria-checked={checked} aria-label={item.title} title={item.description} className={`tec-method-card tec-method-${item.tone} ${checked ? 'is-selected' : ''}`} onClick={() => onSelect(item.id)} onKeyDown={event => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = EXAM_METHODS.findIndex(m => m.id === item.id);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? EXAM_METHODS.length - 1 : (index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + EXAM_METHODS.length) % EXAM_METHODS.length;
      onSelect(EXAM_METHODS[next].id);
      event.currentTarget.closest('[role="radiogroup"]')?.querySelectorAll('[role="radio"]')[next]?.focus();
    }} tabIndex={checked ? 0 : -1}>
      <span className="tec-method-icon"><Icon size={22} strokeWidth={1.7} /></span>
      <span className="tec-method-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
      <span className="tec-method-check" aria-hidden="true">{checked && <Check size={14} strokeWidth={2.5} />}</span>
    </button>;
  };
  return <section className={`tec-method-picker ${opened ? 'is-compact' : ''}`} aria-labelledby="tec-method-title">
    <div className="tec-method-heading"><span className="tec-method-eyebrow">Nguồn câu hỏi</span><h3 id="tec-method-title">Bạn muốn tạo đề như thế nào?</h3><p>Chọn phương thức để bắt đầu thêm câu hỏi vào đề.</p></div>
    <div role="radiogroup" aria-labelledby="tec-method-title"><div className="tec-method-primary">{EXAM_METHODS.filter(m => !m.secondary).map(card)}</div><div className="tec-method-secondary">{EXAM_METHODS.filter(m => m.secondary).map(card)}</div></div>
    <div className="tec-method-confirm"><div><p aria-live="polite">Đã chọn: <strong>{method.title}</strong></p><small>{questionCount ? `${questionCount} câu đã thêm được giữ lại khi chuyển phương thức.` : 'Có thể kết hợp ngân hàng, câu tự soạn và câu do AI tạo trong cùng một đề.'}</small></div><button type="button" className="tec-method-continue" onClick={onContinue}>{opened ? 'Mở vùng làm việc' : 'Tiếp tục với phương thức này'}<ArrowRight size={17} /></button></div>
  </section>;
}
