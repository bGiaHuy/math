import React from 'react';
import QuestionResponseDistribution from './QuestionResponseDistribution';
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { hasReportScore, selectReportStudents } from './assignmentReportInsights';

export const reportNumber = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const time = value => `${Math.floor((value || 0) / 60)}p ${Math.round((value || 0) % 60)}s`;
const filters = [['ALL','Tất cả'],['LOW','Dưới 5 điểm'],['NOT_SUBMITTED','Chưa nộp'],['IN_PROGRESS','Đang làm'],['NOT_STARTED','Chưa làm'],['GRADED','Đã có điểm'],['PENDING','Chờ điểm'],['TIME','Cần kiểm tra thời gian']];
export default function AssignmentResultsPanel({ data, insights, controls, setControls, onStudent, onQuestion, onAnalytics, onPublishReview, visible, readOnly }) {
  const { query, filter, sort, page, size } = controls;
  const change = (key, value) => setControls(previous => ({ ...previous, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  const setQuery = value => change('query', value), setFilter = value => change('filter', value), setSort = value => change('sort', value), setPage = value => change('page', value), setSize = value => change('size', value);
  const matches = selectReportStudents(data.roster, data.questions, insights, { query, filter, sort });
  const pages = Math.max(1, Math.ceil(matches.length / size)), current = Math.min(page, pages), start = (current - 1) * size;
  const rows = matches.slice(start, start + size);
  const reset = () => { setQuery(''); setFilter('ALL'); setSort('SCORE_ASC'); setPage(1); };
  const ranges = [[0,5,'Dưới 5'],[5,6.5,'5 – dưới 6,5'],[6.5,8,'6,5 – dưới 8'],[8,9,'8 – dưới 9'],[9,10.1,'9 – 10']];
  return <div className="ar-results">
    <div className="ar-kpis" aria-label="Tổng quan bài nộp">
      <div><span>Đã nộp</span><strong>{insights.submitted.length}<small>/{data.roster.length}</small></strong><p>{insights.pending ? `${insights.pending} bài chưa có điểm` : 'Bài đã nộp được tự chấm'}</p></div>
      <div><span>Điểm trung bình</span><strong>{reportNumber(insights.average)}<small>/10</small></strong><p>{insights.graded.length} bài có điểm</p></div>
      <button type="button" onClick={() => setFilter('NOT_SUBMITTED')}><span>Chưa nộp</span><strong>{insights.inProgress + insights.notStarted}</strong><p>{insights.inProgress} đang làm · {insights.notStarted} chưa làm</p></button>
      <button type="button" onClick={onAnalytics}><span>Câu cần xem lại</span><strong>{insights.reviewQuestions.length}</strong><p>Ít nhất 50% chưa đúng hoàn toàn</p></button>
    </div>
    <section className="ar-next-actions" aria-label="Ưu tiên xử lý"><strong>Tiếp theo</strong>{insights.pending > 0 && <button type="button" onClick={()=>setFilter('PENDING')}>Xử lý {insights.pending} bài chờ điểm <ArrowRight size={15}/></button>}{insights.below.length > 0 && <button type="button" onClick={()=>setFilter('LOW')}>Xem {insights.below.length} bài dưới 5 <ArrowRight size={15}/></button>}{insights.reviewQuestions.length > 0 && <button type="button" onClick={onAnalytics}>Rà soát {insights.reviewQuestions.length} câu cần xem lại <ArrowRight size={15}/></button>}{!insights.pending && !insights.below.length && !insights.reviewQuestions.length && <span>{insights.submitted.length ? 'Xem từng bài làm để phản hồi cho học sinh.' : 'Chờ bài nộp đầu tiên để xem điểm và phân tích.'}</span>}</section>
    <div className="ar-overview">
      <section className="tw-surface ar-distribution" aria-labelledby="ar-score-title">
        <div className="ar-section-title"><h2 id="ar-score-title">Tình hình điểm số</h2><button type="button" className="ar-text-action" onClick={() => setFilter('LOW')}>Lọc bài dưới 5 <ArrowRight size={15}/></button></div>
        <div className="ar-low-score"><strong>{reportNumber(insights.belowRate)}<span>{insights.belowRate == null ? '' : '%'}</span></strong><div><b>Học sinh dưới 5 điểm</b><p>{insights.graded.length ? `${insights.below.length}/${insights.graded.length} bài có điểm dưới 5.` : 'Chưa có bài có điểm để thống kê.'}</p></div></div>
        <div className="ar-score-bars">{ranges.map(([min,max,label]) => { const count = insights.graded.filter(r => r.score >= min && r.score < max).length; return <div key={label}><span>{label}</span><progress aria-label={`${label}: ${count} học sinh`} value={count} max={Math.max(1,insights.graded.length)}/><b>{count}</b></div>; })}</div>
        <p className="ar-footnote">Không tính bài đang làm, chưa làm hoặc chưa có điểm.</p>
      </section>
      <section className="tw-surface ar-review-preview" aria-labelledby="ar-review-title">
        <div className="ar-section-title"><h2 id="ar-review-title">Câu hỏi cần xem lại</h2><span>Tối đa 3 câu</span></div>
        {insights.reviewQuestions.length ? insights.reviewQuestions.slice(0,3).map(q => <button type="button" className="ar-question-preview" key={q.questionId} onClick={() => onQuestion(q.questionId)}><div><strong>Câu {q.orderIndex} · {q.skillTitle}</strong><small>{q.notCorrect}/{q.totalAnswers} chưa đúng · {q.commonWrong}</small><QuestionResponseDistribution question={q} compact /></div><b>{reportNumber(q.missRate)}%<small>chưa đúng</small></b><ChevronRight size={16}/></button>) : <p>{insights.submitted.length ? 'Chưa có câu nào đạt ngưỡng 50% chưa đúng hoàn toàn.' : 'Phân tích xuất hiện sau khi học sinh nộp bài.'}</p>}
        <button type="button" className="ar-text-action" onClick={onAnalytics}>Tìm nguyên nhân theo câu và kiến thức <ArrowRight size={16}/></button>
        <p className="ar-footnote">Chưa đúng gồm sai, đúng một phần và bỏ trống. Tỷ lệ cao là tín hiệu rà soát, không chứng minh đề có lỗi.</p>
      </section>
    </div>
    <div className="ar-publish-status"><div><strong>{visible ? 'Điểm đang được hiển thị theo thiết lập' : 'Điểm chưa được công bố'}</strong><p>{insights.pending ? `${insights.pending} bài đã nộp chưa có điểm cần xử lý.` : `${insights.graded.length} bài đã có điểm.`} {insights.inProgress ? `${insights.inProgress} học sinh còn đang làm.` : ''}</p></div>{!readOnly && !visible && <button type="button" onClick={onPublishReview}>Kiểm tra trước công bố</button>}</div>
    <section className="tw-surface ar-roster" aria-labelledby="ar-roster-title">
      <div className="ar-section-title"><h2 id="ar-roster-title">Bài làm của học sinh</h2><span role="status">{matches.length}/{data.roster.length} học sinh</span></div>
      <div className="ar-roster-tools"><label className="ar-search"><span>Tìm học sinh</span><div><Search size={17}/><input type="search" placeholder="Tên hoặc tài khoản, có thể gõ không dấu" value={query} onChange={e=>setQuery(e.target.value)}/></div></label>
        <label>Nhóm học sinh<select value={filter} onChange={e=>setFilter(e.target.value)}>{filters.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Sắp xếp<select value={sort} onChange={e=>setSort(e.target.value)}><option value="SCORE_ASC">Điểm thấp → cao</option><option value="SCORE_DESC">Điểm cao → thấp</option><option value="MISTAKES">Nhiều câu chưa đúng nhất</option><option value="TIME">Thời gian ngắn → dài</option><option value="NAME">Tên học sinh</option></select></label>
      </div>
      {filter === 'TIME' && <p className="ar-rule">Gợi ý rà soát: dưới 1/3 trung vị của ít nhất 5 bài có thời gian, hoặc vượt thời lượng hơn 1 phút. Trung vị hiện tại: {insights.median ? time(insights.median) : 'chưa đủ dữ liệu'}. Không kết luận gian lận.</p>}
      <div className="tw-table-wrap ar-roster-scroll" tabIndex={0} aria-label="Bảng bài làm, cuộn để xem thêm"><table><thead><tr><th>Học sinh</th><th>Trạng thái</th><th>Điểm</th><th>Sai/một phần · Trống</th><th>Thời gian</th><th>Bài làm</th></tr></thead><tbody>{rows.map(r=><tr key={r.studentId} className={r.isSubmitted ? 'ar-student-row' : ''} onClick={r.isSubmitted ? e=>{if(!e.target.closest('button'))onStudent(r.studentId);} : undefined}><td><strong>{r.fullName}</strong><small>{r.username}</small></td><td><span className={`ar-status ${r.isSubmitted ? hasReportScore(r) ? 'is-graded' : 'is-pending' : r.status==='IN_PROGRESS' ? 'is-progress' : ''}`}>{r.isSubmitted ? hasReportScore(r) ? 'Đã tự chấm' : 'Chờ điểm' : r.status==='IN_PROGRESS' ? 'Đang làm' : 'Chưa làm'}</span></td><td className={`tw-score ${hasReportScore(r) && r.score<5 ? 'ar-low' : ''}`}>{hasReportScore(r) ? reportNumber(r.score) : '—'}</td><td>{r.mistakes ? `${r.mistakes.wrong} sai · ${r.mistakes.blank} trống` : '—'}</td><td>{r.status==='NOT_STARTED' ? '—' : time(r.timeSpentSeconds)}{r.timeReason && <small className="ar-time-flag">{r.timeReason}</small>}</td><td>{r.isSubmitted ? <button type="button" aria-label={`Xem bài của ${r.fullName}`} onClick={()=>onStudent(r.studentId)}>Xem bài</button> : <span className="ar-footnote">Chưa có bài nộp</span>}</td></tr>)}</tbody></table></div>
      {!rows.length && <div className="ar-empty"><h3>Không có học sinh phù hợp</h3><p>Thử tên khác hoặc bỏ bộ lọc để xem toàn bộ lớp.</p><button type="button" onClick={reset}>Xóa bộ lọc</button></div>}
      <footer className="ar-pagination"><span>{matches.length ? `${start+1}–${Math.min(start+size,matches.length)} / ${matches.length} học sinh` : '0 học sinh'}</span><label>Số dòng<select value={size} onChange={e=>setSize(Number(e.target.value))}><option value={10}>10</option><option value={15}>15</option></select></label><div><button type="button" aria-label="Trang học sinh trước" disabled={current===1} onClick={()=>setPage(current-1)}><ChevronLeft size={16}/></button><span>Trang {current}/{pages}</span><button type="button" aria-label="Trang học sinh sau" disabled={current===pages} onClick={()=>setPage(current+1)}><ChevronRight size={16}/></button></div></footer>
      <p className="ar-footnote">Sai gồm cả câu đúng một phần; trống tính riêng. Không tính câu bị loại hoặc cho điểm toàn bộ. Xuất báo cáo luôn lấy toàn bộ danh sách.</p>
    </section>
  </div>;
}
