import React, { useEffect, useState } from 'react';
import { studentApi } from '../lib/apiClient';
import '../math-learning.css';
export default function LearningPathView({ onStartDiagnostic, onStartPractice, onReview, userId }) {
  const [path, setPath] = useState(null), [active, setActive] = useState(null), [error, setError] = useState('');
  const storageKey = `math-path-filters:${userId || 'student'}`;
  const [filters, setFilters] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)) || { query: '', status: 'all' }; }
    catch { return { query: '', status: 'all' }; }
  });
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(filters)); } catch {} }, [storageKey, filters]);
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  const modules = (path?.modules || []).filter(m => fold(m.title).includes(fold(filters.query)) && (filters.status === 'all' || filters.status === 'ready' && m.canPractice || filters.status === 'unassessed' && m.masteryScore === null));
  const resetFilters = () => setFilters({ query: '', status: 'all' });
  const load = async () => {
    setError('');
    try { const [p, a] = await Promise.all([studentApi.getLearningPath(), studentApi.practiceActive()]); setPath(p); setActive(a); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);
  const renderDay = (day, index) => <details className="math-day path-day" open={index === 0} key={day.date}>
        <summary><strong>{index === 0 ? 'Hôm nay' : new Date(`${day.date}T12:00:00+07:00`).toLocaleDateString('vi-VN')} · {day.plannedMinutes} phút dự kiến</strong><span>{day.activities.length} hoạt động</span></summary>
        {!day.activities.length && <p>Đã hoàn thành các việc hiện có. Bạn có thể ôn lại hoặc chọn chủ đề bên dưới.</p>}
        {day.activities.map((a, i) => <div className="math-activity" key={`${a.skillId || a.kind}-${i}`}>
          <div><strong>{a.title}</strong><p>{a.reason} Khoảng {a.minutes} phút.</p></div>
          <button className={index === 0 ? 'math-primary' : 'math-secondary'} disabled={Boolean(active) && a.kind !== 'REVIEW' && active.skillId !== a.skillId}
            onClick={() => a.kind === 'REVIEW' ? onReview() : onStartPractice(a.skillId)}>{a.kind === 'REVIEW' ? 'Mở lịch ôn' : 'Học chủ đề này'}</button>
        </div>)}
      </details>;
  return <section className="math-learning" aria-labelledby="path-title">
    <h1 id="path-title">Lộ trình học cá nhân</h1>
    {error && <p role="alert" className="math-notice math-error">{error} <button onClick={load}>Thử lại</button></p>}
    {!path && !error && <p role="status">Đang xếp lịch học…</p>}
    {active && <div className="math-notice">Bạn còn buổi luyện dở: <strong>{active.title}</strong>. <button className="math-secondary" onClick={() => onStartPractice(active.skillId)}>Tiếp tục buổi học</button></div>}
    {path && <>
      <p className="math-summary">Khối {path.grade} · {path.targetGoal} · {path.plan.dailyMinutes} phút/ngày · mục tiêu {path.plan.targetMastery}%</p>
      <p>Lịch dựa trên kết quả hiện có và được xếp lại khi bạn học tiếp. Chủ đề chưa đánh giá được ghi riêng, không coi là lỗ hổng.</p>
      {path.plan.daysLeft !== null && <p>{path.plan.daysLeft > 0 ? `Còn ${path.plan.daysLeft} ngày tới kỳ thi.` : 'Ngày thi đã đến hoặc đã qua; hãy cập nhật mục tiêu trong hồ sơ.'}</p>}
      <div className="path-section-heading"><h2>Việc học theo ngày</h2><button type="button" className="math-text-button" onClick={() => document.getElementById('path-topic-search')?.focus()}>Tìm chủ đề để luyện</button></div>
      {active && <p className="math-summary">Hoàn thành buổi luyện đang dở trước khi bắt đầu chủ đề khác. Em vẫn có thể mở lịch ôn.</p>}
      {path.plan.days[0] && renderDay(path.plan.days[0], 0)}
      {path.plan.days.length > 1 && <details className="path-future"><summary>Xem kế hoạch {path.plan.days.length - 1} ngày tiếp theo</summary>{path.plan.days.slice(1).map((day, index) => renderDay(day, index + 1))}</details>}
      {path.plan.unscheduledCount > 0 && <p className="math-notice">Còn {path.plan.unscheduledCount} chủ đề chưa xếp được trong quỹ thời gian tới ngày thi. Cân nhắc tăng thời gian hoặc thu hẹp mục tiêu.</p>}
      <h2 id="path-topics">Chọn chủ đề để luyện</h2>
      <div className="path-topic-filters"><label htmlFor="path-topic-search">Tìm chủ đề<input id="path-topic-search" type="search" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} placeholder="Ví dụ: căn bậc hai" /></label><label htmlFor="path-topic-status">Hiển thị<select id="path-topic-status" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}><option value="all">Tất cả chủ đề</option><option value="ready">Có thể luyện ngay</option><option value="unassessed">Chưa được đánh giá</option></select></label></div>
      <p role="status" className="math-summary">{modules.length} / {path.modules.length} chủ đề</p>
      {!!path.modules.length && !modules.length && <div className="math-notice"><p>Không có chủ đề khớp với bộ lọc. Thử từ khóa khác hoặc xem tất cả chủ đề.</p><button type="button" className="math-secondary" onClick={resetFilters}>Xóa bộ lọc</button></div>}
      {!path.modules.length && <p>Khối lớp này chưa có học liệu trong hệ thống.</p>}
      <div className="math-skill-grid">{modules.map(m => <article className="math-lesson" key={m.id}>
        <h3>{m.title}</h3><div className="topic-evidence">{m.masteryScore !== null && <meter min="0" max="100" value={m.masteryScore} aria-label={`Mức thành thạo ${m.title}`} />}<p>{m.masteryScore === null ? 'Chưa đánh giá' : `${m.masteryScore}% ước tính · ${m.evidenceCount} câu làm bằng chứng`}</p></div>
        <p>{m.recommendedAction}</p>
        {m.canPractice ? <button className="math-secondary" disabled={Boolean(active) && active.skillId !== m.id} onClick={() => onStartPractice(m.id)}>{m.status === 'COMPLETED' ? 'Luyện củng cố' : 'Ôn và luyện tập'}</button>
          : <p className="math-summary">Có {m.publishedQuestions} câu đã duyệt; cần ít nhất 3 câu để mở buổi luyện.</p>}
      </article>)}</div>
      <button className="math-text-button" onClick={onStartDiagnostic}>Làm bài chẩn đoán mới</button>
    </>}
  </section>;
}
