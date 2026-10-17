import React, { useEffect, useState } from 'react';
import { adminApi } from '../lib/apiClient';
import MathRenderer from './MathRenderer';
import { MathQuestionResult } from './MathQuestionResponse';

const difficulties = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', VERY_HARD: 'Rất khó' };
const types = { SINGLE_CHOICE: 'Nhiều lựa chọn', TRUE_FALSE: 'Đúng / Sai', SHORT_ANSWER: 'Trả lời ngắn' };
export default function QuestionBankView({ currentUser }) {
  const [questions, setQuestions] = useState([]), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [type, setType] = useState(''), [difficulty, setDifficulty] = useState('');
  useEffect(() => { adminApi.getQuestions().then(data => setQuestions(Array.isArray(data) ? data : data.questions || [])).catch(e => setError(e.message)); }, []);
  const visible = questions.filter(q => (!type || q.questionType === type) && (!difficulty || q.difficulty === difficulty) && `${q.content} ${q.skill?.title || ''}`.toLowerCase().includes(search.toLowerCase()));
  async function update(q, value) {
    try { setError(''); await adminApi.setQuestionDifficulty(q.id, value); setQuestions(rows => rows.map(row => row.id === q.id ? { ...row, difficulty: value } : row)); }
    catch (e) { setError(e.message); }
  }
  return <section aria-label="Ngân hàng câu hỏi" style={{ padding: 20, border: '1px solid #dbe4e8', borderRadius: 12, marginBottom: 24, background: 'white' }}>
    <h2>Ngân hàng câu hỏi Toán</h2>
    <p>Độ khó là nhãn đánh giá nội dung ban đầu; có thể hiệu chỉnh khi có dữ liệu làm bài. Chọn câu và lấy đề ngẫu nhiên trong mục Tạo đề kiểm tra mới.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <label>Tìm nội dung hoặc chuyên đề<input value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label>Loại câu<select value={type} onChange={e => setType(e.target.value)}><option value="">Tất cả</option>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Độ khó<select value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="">Tất cả</option>{Object.entries(difficulties).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {error && <p role="alert">{error}</p>}<p>{visible.length} / {questions.length} câu</p>
    {visible.slice(0, 100).map(q => <details key={q.id} style={{ padding: 12, borderBottom: '1px solid #e2e8f0' }}>
      <summary><MathRenderer content={q.content} /><small>{types[q.questionType] || types.SINGLE_CHOICE} · {q.skill?.title} · {difficulties[q.difficulty] || 'Dễ'} · {q.status === 'DRAFT' ? 'Bản nháp' : 'Đã xuất bản'}</small></summary>
      <MathQuestionResult question={{...q, options: (q.options || []).map(o => ({...o, key: o.key || o.optionKey}))}} />
      <label>Độ khó câu hỏi<select aria-label={`Độ khó ${q.id}`} disabled={currentUser?.role !== 'ADMIN' && q.authorId !== currentUser?.id} value={q.difficulty || 'EASY'} onChange={e => update(q, e.target.value)}>{Object.entries(difficulties).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <MathRenderer content={q.explanation || ''} />
    </details>)}
    {visible.length > 100 && <p>Đang hiển thị 100 câu đầu. Dùng bộ lọc để thu hẹp kết quả.</p>}
  </section>;
}
