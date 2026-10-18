import React from 'react';
import QuestionResponseDistribution from './QuestionResponseDistribution';
import { TeacherPageSize, useTeacherPageSize } from './TeacherListControls';
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { reportNumber } from './AssignmentResultsPanel';
import { searchable } from './assignmentReportInsights';
import { QUESTION_LABELS } from './teacherQuestionHelpers';
import MathRenderer from './MathRenderer';

export default function AssignmentAnalyticsPanel({ data, insights, controls, setControls, onQuestion }) {
  const [pageSize,setPageSize] = useTeacherPageSize();
  const {query,topic,filter,sort,page}=controls;
  const change=(key,value)=>setControls(previous=>({...previous,[key]:value,...(key==='page'?{}:{page:1})}));
  const setQuery=value=>change('query',value),setTopic=value=>change('topic',value),setFilter=value=>change('filter',value),setSort=value=>change('sort',value),setPage=value=>change('page',value);
  const rows=data.questionAnalytics.map(q=>({...q,notCorrect:q.wrongAnswers+q.skippedAnswers,missRate:q.totalAnswers?(q.wrongAnswers+q.skippedAnswers)/q.totalAnswers*100:null,commonWrong:insights.ranked.find(r=>r.questionId===q.questionId)?.commonWrong})).filter(q=>
    searchable(`Câu ${q.orderIndex} ${q.skillTitle} ${q.content}`).includes(searchable(query))&&(!topic||q.skillTitle===topic)&&
    (filter==='ALL'||filter==='REVIEW'&&!['EXCLUDE','FULL_CREDIT'].includes(q.gradingMode)&&q.missRate>=50||filter==='BLANK'&&q.skippedAnswers>0||filter==='ADJUSTED'&&['EXCLUDE','FULL_CREDIT'].includes(q.gradingMode)))
    .sort((a,b)=>sort==='ORDER'?a.orderIndex-b.orderIndex:sort==='BLANK'?b.skippedAnswers-a.skippedAnswers:(b.missRate??-1)-(a.missRate??-1)||a.orderIndex-b.orderIndex);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize)),current=Math.min(page,pages),visible=rows.slice((current-1)*pageSize,current*pageSize);
  return <div className="ar-analytics">
    <section className="tw-surface ar-topic-insights"><div className="ar-section-title"><div><h2>Nên ôn lại kiến thức nào?</h2><p>Ưu tiên theo tỷ lệ chưa đúng trong bài này.</p></div></div>
      {insights.topics.filter(t=>t.notCorrect>0).length ? <div className="ar-topic-grid">{insights.topics.filter(t=>t.notCorrect>0).slice(0,3).map(t=><button type="button" key={t.key} onClick={()=>{setTopic(t.title);setFilter('ALL');setQuery('');document.getElementById('ar-question-list')?.scrollIntoView({block:'start',behavior:'smooth'});}}><strong>{t.title}</strong><b>{reportNumber(t.missRate)}% chưa đúng</b><span className="ar-topic-track" aria-hidden="true"><span style={{width:`${t.missRate}%`}} /></span><span>{t.questions} câu · {t.notCorrect}/{t.responses} lượt trả lời</span><small>Xem các câu thuộc kiến thức này <ArrowRight size={14}/></small></button>)}</div> : <p>{insights.submitted.length ? 'Chưa có kiến thức đã phân loại cần ưu tiên theo dữ liệu này.' : 'Chưa có bài nộp để phân tích kiến thức.'}</p>}
      <p className="ar-footnote">Chưa đúng gồm sai, đúng một phần và bỏ trống; không tính câu bị loại hoặc cho điểm toàn bộ. Đây là bằng chứng trong một bài kiểm tra, chưa đủ để kết luận mức thành thạo. Nếu nhiều em cùng sai, hãy kiểm tra đề/đáp án trước khi quyết định giảng lại.</p>
    </section>
    <section className="tw-surface" id="ar-question-list" aria-labelledby="ar-analysis-title"><div className="ar-section-title"><div><h2 id="ar-analysis-title">Tìm nguyên nhân theo từng câu</h2><p>{insights.submitted.length} bài đã nộp · Chọn câu để xem đề, đáp án và nhóm học sinh.</p></div></div>
      <div className="ar-analysis-tools"><label>Tìm câu hỏi<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Số câu, nội dung hoặc kiến thức"/></label><label>Kiến thức<select value={topic} onChange={e=>setTopic(e.target.value)}><option value="">Tất cả kiến thức</option>{[...new Set(data.questionAnalytics.map(q=>q.skillTitle))].map(t=><option key={t} value={t}>{t}</option>)}</select></label><label>Nhóm câu<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">Tất cả câu</option><option value="REVIEW">Từ 50% chưa đúng</option><option value="BLANK">Có học sinh bỏ trống</option><option value="ADJUSTED">Đã điều chỉnh chấm</option></select></label><label>Sắp xếp<select value={sort} onChange={e=>setSort(e.target.value)}><option value="MISS">Tỷ lệ chưa đúng cao nhất</option><option value="BLANK">Bỏ trống nhiều nhất</option><option value="ORDER">Thứ tự câu hỏi</option></select></label></div>
      <TeacherPageSize value={pageSize} onChange={value=>{setPageSize(value);setPage(1);}} />
      {topic&&<p className="ar-active-filter">Đang xem: <strong>{topic}</strong><button type="button" onClick={()=>setTopic('')}>Bỏ lọc kiến thức</button></p>}
      <div className="ar-analysis-legend"><span>Phân bố trên cùng thang 100%</span><span>Đúng · Sai/một phần · Trống</span></div>
      <div className="ar-question-list">{visible.map(q=><button type="button" className="ar-analysis-question" key={q.questionId} onClick={()=>onQuestion(q.questionId)}>
        <span className="ar-question-identity"><strong>Câu {q.orderIndex}</strong><small>{QUESTION_LABELS[q.questionType]}</small></span>
        <span className="ar-question-main"><span className="ar-question-heading"><strong>{q.skillTitle}</strong><b>{q.gradingMode==='EXCLUDE'?'Không tính điểm':q.gradingMode==='FULL_CREDIT'?'Cho điểm toàn bộ':q.missRate==null?'Chưa có dữ liệu':`${reportNumber(q.missRate)}% chưa đúng`}</b></span>
          <span className="ar-question-excerpt">{String(q.content || '').length > 300 ? 'Nội dung dài hoặc có nhiều công thức · Mở chi tiết để đọc đầy đủ' : <MathRenderer content={q.content}/>}</span>
          <QuestionResponseDistribution question={q} />
          {q.commonWrong && <span className="ar-common-response">Thường gặp: {q.commonWrong}</span>}
        </span><span className="ar-question-inspect">Xem chi tiết <ArrowRight size={16} aria-hidden="true"/></span>
      </button>)}</div>
      {!rows.length&&<div className="ar-empty"><h3>Không có câu phù hợp</h3><p>Thử bỏ lọc hoặc tìm bằng số câu.</p><button type="button" onClick={()=>{setQuery('');setTopic('');setFilter('ALL');}}>Xóa bộ lọc</button></div>}
      <footer className="ar-pagination"><span role="status">{rows.length} câu · Trang {current}/{pages}</span><div><button type="button" aria-label="Trang câu hỏi trước" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></button><button type="button" aria-label="Trang câu hỏi sau" disabled={current===pages} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></button></div></footer>
    </section>
  </div>;
}
