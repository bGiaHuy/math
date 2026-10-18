import React, { useState } from 'react';
import { X } from 'lucide-react';
import useModalFocus from './useModalFocus';
export default function ReportPublishReview({ data, insights, busy, editing, error, onClose, onConfirm, onPaper, onAnalytics }) {
  const [reviewed,setReviewed]=useState(false),[acceptIncomplete,setAcceptIncomplete]=useState(false);
  const dialogRef=useModalFocus(true,()=>{if(!busy)onClose();});
  const unfinished=insights.inProgress+insights.notStarted;
  const blocked=!insights.graded.length||insights.pending>0||insights.missingKeys.length>0||editing||data.assignment.status==='DRAFT';
  return <div className="tw-overlay"><section ref={dialogRef} className="tw-dialog ar-publish-dialog" role="dialog" aria-modal="true" aria-labelledby="ar-publish-title" tabIndex={-1}>
    <div className="ar-section-title"><h2 id="ar-publish-title">Kiểm tra trước khi công bố</h2><button type="button" aria-label="Đóng kiểm tra công bố" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    <p>Công bố cho phép học sinh xem điểm theo thiết lập của bài. Thao tác này không đóng nhận bài và không đổi tùy chọn xem lời giải.</p>
    <ul className="ar-checklist"><li><strong>{insights.graded.length}/{insights.submitted.length} bài đã nộp có điểm</strong>{insights.pending>0&&<span className="ar-low">{insights.pending} bài chưa có điểm — cần xử lý trước.</span>}</li><li><strong>{unfinished} học sinh chưa nộp</strong><span>{insights.inProgress} đang làm · {insights.notStarted} chưa làm. Không được coi là bài chưa chấm.</span></li><li><strong>{insights.reviewQuestions.length} câu có từ 50% chưa đúng</strong><span>Có thể do kiến thức, độ khó hoặc đề/đáp án; cần giáo viên xem lại.</span>{insights.reviewQuestions.length>0&&<button type="button" disabled={busy} onClick={onAnalytics}>Xem phân tích từng câu</button>}</li><li><strong>Đề và đáp án</strong><span>{insights.missingKeys.length ? `${insights.missingKeys.length} câu nhiều lựa chọn chưa có đúng một đáp án đúng.` : 'Cần giáo viên đối chiếu nội dung và đáp án trước khi công bố.'} {insights.adjusted.length>0?`${insights.adjusted.length} câu đã điều chỉnh cách chấm.`:''}</span><button type="button" disabled={busy} onClick={onPaper}>Rà soát đề & đáp án</button></li></ul>
    {!insights.graded.length&&<p className="ar-rule">Chưa có bài đã có điểm để công bố. Kiểm tra các bài đã nộp hoặc quay lại khi có kết quả.</p>}
    {editing&&<p className="ar-rule">Đang có chỉnh sửa đề/đáp án chưa áp dụng. Hoàn tất hoặc hủy chỉnh sửa trước.</p>}
    {data.assignment.status==='DRAFT'&&<p className="ar-rule">Đề đang là bản nháp, chưa thể công bố điểm.</p>}
    <label className="ar-confirm-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/><span>Tôi đã rà soát đề, đáp án và các câu cần xem lại.</span></label>
    {unfinished>0&&<label className="ar-confirm-check"><input type="checkbox" checked={acceptIncomplete} disabled={busy} onChange={e=>setAcceptIncomplete(e.target.checked)}/><span>Tôi muốn công bố điểm hiện có dù còn {unfinished} học sinh chưa nộp.</span></label>}
    {error&&<p className="tw-error" role="alert">{error}</p>}
    <div className="tw-actions"><button type="button" disabled={busy} onClick={onClose}>Tiếp tục rà soát</button><button type="button" className="tw-primary" disabled={busy||blocked||!reviewed||(unfinished>0&&!acceptIncomplete)} onClick={onConfirm}>{busy?'Đang công bố…':'Xác nhận công bố điểm'}</button></div>
  </section></div>;
}
