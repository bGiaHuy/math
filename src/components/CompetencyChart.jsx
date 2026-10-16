import React, { useState } from 'react';
import './competency-chart.css';
import MathCompetencyRadar from './MathCompetencyRadar';

export default function CompetencyChart({ data }) {
  const [chapter, setChapter] = useState('');
  const [order, setOrder] = useState('curriculum');
  const skills = data.catalog || data.skills || [];
  const chapters = [...new Set(skills.map(skill => skill.chapter).filter(Boolean))];
  const rows = skills.filter(skill => !chapter || skill.chapter === chapter);
  if (order === 'priority') rows.sort((a, b) => (a.masteryScore ?? 101) - (b.masteryScore ?? 101));
  return <section className="competency-chart" aria-labelledby="competency-chart-title">
    <header><div><p className="competency-chart-kicker">BẢN ĐỒ KỸ NĂNG</p><h3 id="competency-chart-title">Bạn đang vững ở đâu?</h3></div><strong>Mục tiêu {data.targetMastery}%</strong></header>
    <p>Điểm là ước tính hiện tại. Cần ít nhất 5 câu làm bằng chứng để xác nhận mức thành thạo; kỹ năng chưa đánh giá không được tính là 0 điểm.</p>
    <MathCompetencyRadar skills={skills} target={data.targetMastery} onChapter={setChapter}/>
    <details className="math-competency-method"><summary>Điểm năng lực được tính như thế nào?</summary><p>Bài chẩn đoán kết hợp số câu đúng với ước tính độ khó câu hỏi. Luyện tập cập nhật ước tính sau mỗi câu đủ điều kiện; câu khởi động không tăng bằng chứng, làm đúng câu đã gặp không làm tăng bằng chứng. Chat với gia sư không tăng điểm.</p><p>Radar lấy trung bình các kỹ năng có dữ liệu trong mỗi chương, kèm số kỹ năng đã đánh giá. Chương chưa đánh giá không có điểm và không được thay bằng 0. Điểm này là ước tính của mô hình, không phải điểm thi hay xác suất đã được kiểm định. Xem từng kỹ năng bên dưới để biết kết quả còn tạm tính.</p></details>
    <div className="competency-chart-filters"><label>Chương<select value={chapter} onChange={event => setChapter(event.target.value)}><option value="">Tất cả chương</option>{chapters.map(value => <option key={value}>{value}</option>)}</select></label><label>Thứ tự<select value={order} onChange={event => setOrder(event.target.value)}><option value="curriculum">Theo chương trình</option><option value="priority">Điểm thấp trước</option></select></label></div>
    <div className="competency-chart-axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
    <ul className="competency-chart-rows">{rows.map(skill => {
      const assessed = Number.isFinite(skill.masteryScore);
      const score = assessed ? Math.min(100, Math.max(0, skill.masteryScore)) : null;
      const enough = (skill.evidenceCount || 0) >= 5;
      const status = !assessed ? 'Chưa đánh giá' : !enough ? 'Chưa đủ bằng chứng' : score >= data.targetMastery ? 'Thành thạo' : score >= 50 ? 'Đang củng cố' : 'Cần luyện tập';
      const updated = skill.lastAssessedAt && new Date(skill.lastAssessedAt);
      return <li key={skill.skillId}><div className="competency-chart-label"><strong>{skill.title}</strong><span>{status}</span></div><div className="competency-chart-track" role="img" aria-label={`${skill.title}: ${assessed ? `${score}% ước tính` : status}; ${skill.evidenceCount || 0} câu bằng chứng`}><span className={`competency-chart-bar ${!enough ? 'provisional' : ''}`} style={{ width: `${score ?? 0}%` }}/><i style={{ left: `${data.targetMastery}%` }} aria-hidden="true"/>{!assessed && <em>Chưa có dữ liệu</em>}</div><div className="competency-chart-detail"><span>{assessed ? `${score}% · ` : ''}{skill.evidenceCount || 0} câu bằng chứng</span><span>{updated && Number.isFinite(updated.getTime()) ? `Cập nhật ${updated.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : 'Chưa có ngày đánh giá'}</span></div></li>;
    })}</ul>
    <p className="competency-chart-note">Vạch đứng là mục tiêu của bạn. Thanh gạch chéo là kết quả tạm tính. Số bằng chứng không phải khoảng tin cậy thống kê.</p>
  </section>;
}
