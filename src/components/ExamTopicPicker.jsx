import React, { useState } from 'react';

const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
export default function ExamTopicPicker({ topics, selected, onChange }) {
  const [search, setSearch] = useState('');
  const visible = topics.filter(topic => normalize(topic.title).includes(normalize(search)));
  const groups = Object.groupBy(visible, topic => topic.chapter || (/góc|tròn|giác|hình|trụ|nón|cầu/i.test(topic.title) ? 'Hình học và đo lường' : /thống kê|xác suất|tần số/i.test(topic.title) ? 'Thống kê và xác suất' : 'Số và đại số'));
  const all = visible.length > 0 && visible.every(topic => selected.includes(topic.id));
  return <section className="tec-topics" aria-label="Chuyên đề Toán 9">
    <div className="tec-topics-heading"><strong>Chuyên đề Toán 9</strong><span role="status">{selected.length} đã chọn</span></div>
    <div className="tec-topics-tools"><input aria-label="Tìm chuyên đề" placeholder="Tìm chuyên đề…" value={search} onChange={event => setSearch(event.target.value)} /><button type="button" disabled={!visible.length} onClick={() => onChange(all ? selected.filter(id => !visible.some(topic => topic.id === id)) : [...new Set([...selected, ...visible.map(topic => topic.id)])])}>{all ? 'Bỏ chọn kết quả' : 'Chọn tất cả kết quả'}</button></div>
    <div className="tec-topics-scroll" tabIndex={0} aria-label="Danh sách chuyên đề">{Object.entries(groups).map(([group, items]) => <fieldset key={group}><legend>{group}</legend><div className="tec-topic-grid">{items.map(topic => <label className={`tec-topic-row ${selected.includes(topic.id) ? 'is-selected' : ''}`} key={topic.id}><input type="checkbox" checked={selected.includes(topic.id)} onChange={event => onChange(event.target.checked ? [...selected, topic.id] : selected.filter(id => id !== topic.id))} /><span>{topic.title}</span></label>)}</div></fieldset>)}{!visible.length && <p>Không tìm thấy chuyên đề. Thử từ khóa khác.</p>}</div>
    <small>{selected.length ? 'Có thể kết hợp nhiều chuyên đề. Câu đã thêm được giữ khi đổi bộ lọc.' : 'Chọn chuyên đề để xem câu hỏi phù hợp.'}</small>
  </section>;
}
