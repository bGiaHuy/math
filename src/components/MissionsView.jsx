import React from 'react';
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';

export default function MissionsView({ onStartDiagnostic, onNavigateTab, hasCompletedTest = false }) {
  const tasks = [
    {title:'Xác định điểm xuất phát', description:'Bài chẩn đoán giúp chọn kiến thức cần học trước.', done:hasCompletedTest, action: onStartDiagnostic, label:hasCompletedTest ? 'Đánh giá lại' : 'Làm bài đầu vào'},
    {title:'Học theo quỹ thời gian của em', description:'Mở kế hoạch cá nhân để chọn buổi học phù hợp.', action:()=>onNavigateTab?.('learning-path'), label:'Mở lộ trình'},
    {title:'Hiểu lại câu đã sai', description:'Xem bài làm và lời giải, ghi lại điều cần nhớ.', action:()=>onNavigateTab?.('mistakes'), label:'Mở sổ tay'}
  ];
  return <section className="learning-checklist" aria-labelledby="checklist-title">
    <header><p className="study-eyebrow">VIỆC HỌC CỦA EM</p><h1 id="checklist-title">Chọn bước học tiếp theo</h1><p>Đi từ đánh giá ban đầu đến luyện tập và ôn lại.</p></header>
    <ol>{tasks.map((task,i)=><li key={task.title}><span className={`checklist-marker ${task.done?'done':''}`} aria-hidden="true">{task.done?<CheckCircle2 size={24}/>:<Circle size={24}/>}</span><div><span className="checklist-step">Bước {i+1}{task.done?' · Đã có kết quả chẩn đoán':''}</span><h2>{task.title}</h2><p>{task.description}</p></div><button className="math-secondary" onClick={task.action}>{task.label}<ArrowRight size={16}/></button></li>)}</ol>
    <p className="checklist-note">Trạng thái chẩn đoán dựa trên bài đã hoàn thành. Lộ trình và sổ tay hiển thị tiến độ học tương ứng.</p>
  </section>;
}
