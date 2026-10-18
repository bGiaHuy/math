import TeacherLibrary from './TeacherLibrary';
import TeacherOverview from './TeacherOverview';
import TeacherClassDirectory from './TeacherClassDirectory';
import './teacher-portal-layout.css';
import useModalFocus from './useModalFocus';
import { answerState, ANSWER_STATE_LABELS } from '../lib/answerState';
import RegradeImpact from './RegradeImpact';
import TeacherLocalDrafts from './TeacherLocalDrafts';
import TeacherStudentList from './TeacherStudentList';
import { TeacherPagination, useTeacherPageSize, teacherSearch } from './TeacherListControls';
import './teacher-foundation.css';
import AssignmentResultsPanel from './AssignmentResultsPanel';
import AssignmentAnalyticsPanel from './AssignmentAnalyticsPanel';
import ReportPublishReview from './ReportPublishReview';
import { buildReportInsights } from './assignmentReportInsights';
import './assignment-report.css';
import ExamResultDialog from './ExamResultDialog';
import { useRouteState, useDraftState } from '../lib/navigationState';
import ExamDocumentView from './ExamDocumentView';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookOpen, ChevronRight, Copy, Download, FileText, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { assignmentApi, classroomApi } from '../lib/apiClient';
import TeacherExamComposer from './TeacherExamComposer';
import QuestionBankView from './QuestionBankView';
import MathRenderer from './MathRenderer';
import { MathQuestionResult } from './MathQuestionResponse';
import { countQuestions, DEFAULT_QUESTION_COUNTS, normalizeTeacherQuestion, QUESTION_LABELS } from './teacherQuestionHelpers';
import './teacher-workspace.css';

const date = value => value ? new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : 'Không giới hạn';
const score = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const duration = seconds => `${Math.floor((seconds || 0) / 60)}p ${Math.round((seconds || 0) % 60)}s`;
const status = a => a.status === 'DRAFT' ? 'Bản nháp' : a.status === 'CLOSED' || (a.dueDate && Date.parse(a.dueDate) < Date.now()) ? 'Đã đóng' : 'Đang nhận bài';
const asEditable = q => normalizeTeacherQuestion({ ...q, options: (q.options || []).map(o => ({ key: o.key || o.optionKey, content: o.content })), correctOption: q.correctOption || q.options?.find(o => o.isCorrect)?.optionKey });
function downloadCsv(name, rows) {
  const blob = new Blob(['\ufeff' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Empty({ title, children }) { return <div className="tw-empty"><BookOpen size={28} /><h3>{title}</h3><p>{children}</p></div>; }
function Tabs({ items, value, onChange }) { return <nav className="tw-tabs" aria-label="Điều hướng nội dung">{items.map(([key, label]) => <button key={key} type="button" aria-current={key === value ? 'page' : undefined} className={key === value ? 'active' : ''} onClick={() => onChange(key)}>{label}</button>)}</nav>; }
function Stat({ label, value, note }) { return <div className="tw-stat"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>; }

export default function TeacherWorkspace({ currentUser, activeTab = 'teacher-overview', onNavigate }) {
  const readOnly = currentUser?.role === 'ADMIN';
  const [classes, setClasses] = useState([]), [assignments, setAssignments] = useState([]), [details, setDetails] = useState(null);
  const [classId, setClassId] = useRouteState('class', null), [classTab, setClassTab] = useRouteState('classTab', 'overview');
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [assignmentFailures,setAssignmentFailures] = useState([]);
  const [classDirectoryControls,setClassDirectoryControls] = useState({page:1,query:'',grade:''});
  const [libraryView,setLibraryView] = useState('grid');
  const [assignmentPageSize,setAssignmentPageSize] = useTeacherPageSize();
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [search, setSearch] = useState(''), [folder, setFolder] = useState(''), [filter, setFilter] = useState('');
  const [report, setReport] = useState(null), [reportTab, setReportTab] = useRouteState('reportTab', 'results');
  const [composerId, setComposerId] = useRouteState('draft', null);
  const composer = React.useMemo(() => { if (!composerId || readOnly) return null; try { return JSON.parse(localStorage.getItem('exam-source:' + currentUser.id + ':' + composerId)) || { classId: classId, source: null }; } catch { return { classId: classId, source: null }; } }, [composerId, currentUser.id, readOnly]);
  const setComposer = value => { if (!value) { setComposerId(null); return; } const id = crypto.randomUUID(); try { localStorage.setItem('exam-source:' + currentUser.id + ':' + id, JSON.stringify(value)); } catch {} setComposerId(id); };
  const [creatingClass, setCreatingClass] = useState(false);
  const [invite, setInvite] = useState(null), [confirm, setConfirm] = useState(null);
  const [detailsError, setDetailsError] = useState(''), [detailsRetry, setDetailsRetry] = useState(0);
  const [classReports, setClassReports] = useState(null), [aggregateLoading, setAggregateLoading] = useState(false);
  const [reportId, setReportId] = useRouteState('report', null);
  const [reportError,setReportError] = useState(''), [reportRetry,setReportRetry] = useState(0);
  const reportSelection = useRef(null);
  const reportClassId = assignments.find(a => a.id === reportId)?.classId;
  useEffect(() => {
    let active = true;
    setReport(current => current?.assignment.id === reportId ? current : null); setReportError('');
    const assignment = reportClassId ? { id: reportId, classId: reportClassId } : null;
    if (assignment) assignmentApi.getAssignmentSubmissions(assignment.classId, assignment.id).then(data => { if (active) setReport({ ...data, selectedStudentId: reportSelection.current?.assignmentId === assignment.id ? reportSelection.current.studentId : null }); }).catch(e => { if (active) setReportError(e.message); });
    return () => { active = false; };
  }, [reportId, reportClassId, reportRetry]);
  const requestVersion = useRef(0), aggregateVersion = useRef(0);
  const workspaceDialogRef = useModalFocus(creatingClass || !!confirm, () => { if (!busy) { setCreatingClass(false); setConfirm(null); } });
  const selectedClass = classes.find(c => c.id === classId);
  const allClassAssignments = assignments.filter(a => a.classId === classId);
  const isLibrary = activeTab === 'teacher-library';

  async function load() {
    const request = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const response = await classroomApi.getTeacherClassrooms();
      const rows = Array.isArray(response) ? response : response.classrooms || [];
      const results = await Promise.allSettled(rows.map(async c => {
        const result = await assignmentApi.getClassAssignments(c.id);
        return (result.assignments || []).map(a => ({ ...a, className: c.name }));
      }));
      if (request !== requestVersion.current) return;
      setClasses(rows); setAssignments(results.flatMap(result => result.status === 'fulfilled' ? result.value : [])); setAssignmentFailures(rows.filter((_,index) => results[index].status === 'rejected')); setClassReports(null);
    } catch (e) { if (request === requestVersion.current) setError(e.message); }
    finally { if (request === requestVersion.current) setLoading(false); }
  }
  useEffect(() => { load(); return () => { requestVersion.current++; }; }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); document.querySelector('.tab-viewport')?.scrollTo({ top: 0 }); }, [activeTab, report?.assignment.id, !!composer]);
  useEffect(() => { setReport(null); setSearch(''); setFolder(''); setFilter(''); }, [activeTab]);
  useEffect(() => {
    let active = true; setDetails(null); setDetailsError(''); setClassReports(null); setInvite(value => value?.classId === classId ? value : null);
    if (classId) classroomApi.getClassroomDetails(classId).then(data => { if (active) setDetails(data.classroom || data); }).catch(e => { if (active) setDetailsError(e.message); });
    return () => { active = false; };
  }, [classId, detailsRetry]);
  useEffect(() => () => { aggregateVersion.current++; }, [classId]);
  async function act(task, success) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); if (success) setNotice(success); }
    catch (e) { setError(e.message || 'Không thể hoàn tất thao tác.'); }
    finally { setBusy(false); }
  }
  function navigate(tab) { setClassId(null); setClassTab('overview'); onNavigate?.(tab); }
  function openClass(id, tab = 'overview') { setReportId(null); setClassId(id); setClassTab(tab); setReport(null); setFolder(''); setSearch(''); setFilter(''); }
  function openReport(a, tab = 'results', selectedStudentId = null) {
    reportSelection.current = { assignmentId: a.id, studentId: selectedStudentId };
    setReportId(a.id); setReportTab(tab);
  }
  async function aggregate() {
    if (assignmentFailures.some(c => c.id === classId)) return;
    const generation = ++aggregateVersion.current;
    setAggregateLoading(true); setError('');
    try {
      const data = await Promise.all(allClassAssignments.filter(a => a.status !== 'DRAFT').map(a => assignmentApi.getAssignmentSubmissions(classId, a.id)));
      if (generation === aggregateVersion.current) setClassReports(data);
    } catch (e) { if (generation === aggregateVersion.current) setError(e.message); }
    finally { if (generation === aggregateVersion.current) setAggregateLoading(false); }
  }
  useEffect(() => { if (classId && ['gradebook', 'skills'].includes(classTab) && !classReports) aggregate(); }, [classId, classTab, assignments]);
  const assignmentsIncomplete = isLibrary ? assignmentFailures.length > 0 : assignmentFailures.some(c => c.id === classId);
  const scoped = isLibrary ? assignments : allClassAssignments;
  const visible = scoped.filter(a => (!search || teacherSearch(`${a.title} ${a.className}`).includes(teacherSearch(search))) && (!folder || a.settings?.folder === folder) && (!filter || a.status === filter));
  useEffect(() => setAssignmentPage(1), [search, folder, filter, classId, activeTab]);
  const listPage = Math.min(assignmentPage, Math.max(1, Math.ceil(visible.length / assignmentPageSize)));
  const startComposer = (source = null) => {
    if (!classes.some(c => c.isActive)) { setCreatingClass(true); setNotice('Tạo một lớp trước để lưu hoặc giao đề.'); return; }
    setComposer({ classId: classId || classes.find(c => c.isActive)?.id, source }); setReport(null);
  };

  function assignmentList() {
    return <TeacherLibrary view={libraryView} onView={setLibraryView} pageSize={assignmentPageSize} onPageSize={value => { setAssignmentPageSize(value); setAssignmentPage(1); }} assignments={scoped} search={search} onSearch={setSearch}
      folder={folder} onFolder={setFolder} filter={filter} onFilter={setFilter}
      page={listPage} onPage={setAssignmentPage} onOpen={openReport}
      onReuse={assignment => act(async () => { const data = await assignmentApi.getAssignmentSubmissions(assignment.classId, assignment.id); startComposer(data); })}
      onDelete={setConfirm} onCreate={() => startComposer()} busy={busy} readOnly={readOnly} incomplete={assignmentsIncomplete} />;
  }

  return <div className="teacher-workspace teacher-portal" data-screen={activeTab}>
    {!loading && assignmentFailures.length > 0 && <section className="tw-notice" role="alert"><strong>Chưa tải được bài giao của {assignmentFailures.map(c => c.name).join(', ')}.</strong><p>Các lớp khác vẫn dùng được. Danh sách và số bài tổng hợp hiện chưa đầy đủ.</p><button disabled={busy} onClick={load}>Thử tải lại bài giao</button></section>}
    {readOnly && <p className="tw-notice">Chế độ quan sát: chỉ xem dữ liệu lớp và kết quả.</p>}
    {error && <div className="tw-error" role="alert">{error}<button aria-label="Đóng thông báo lỗi" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <p className="tw-notice" role="status">{notice}</p>}
    {composer && loading ? <p role="status">Đang tải lớp học…</p> : composer ? <ExamEditor key={composerId} draftKey={`exam-draft:${currentUser.id}:${composerId}`} initial={composer} classes={classes} onBack={() => setComposer(null)} onSave={async () => { setComposer(null); await load(); setNotice('Đã lưu đề trên máy chủ.'); }} /> : reportId && !loading && !error && !assignmentFailures.length && !assignments.some(a => a.id === reportId) ? <section className="tw-surface tw-report-missing"><h1>Không tìm thấy bài giao</h1><p>Bài này không có trong danh sách hiện tại. Có thể đường dẫn đã cũ hoặc tài khoản không có quyền xem.</p><div className="tw-actions"><button onClick={() => setReportId(null)}>Về danh sách bài giao</button><button onClick={load}>Tải lại danh sách</button></div></section> : reportId && !report && !loading && assignments.some(a => a.id === reportId) ? <section className="tw-surface tw-report-recovery"><button className="tw-back" onClick={() => setReportId(null)}><ArrowLeft size={16} />Quay lại danh sách</button>{reportError ? <><h1>Chưa tải được báo cáo</h1><p role="alert">{reportError}</p><button className="tw-primary" onClick={() => setReportRetry(value => value + 1)}>Thử tải lại báo cáo</button></> : <p role="status">Đang tải bài nộp và kết quả…</p>}</section> : report ? <AssignmentReport key={report.assignment.id} data={report} tab={reportTab} setTab={setReportTab} readOnly={readOnly} onBack={() => { setReport(null); setReportId(null); }} onRefresh={async () => { const r = await assignmentApi.getAssignmentSubmissions(report.assignment.classId, report.assignment.id); setReport(r); await load(); }} /> : <>
      {(activeTab !== 'teacher-overview' || selectedClass || loading) && <header className="tw-header tp-page-header"><div><span className="tw-overline">Không gian giảng dạy / Toán THCS</span><h1>{activeTab === 'teacher-bank' ? 'Ngân hàng câu hỏi' : isLibrary ? 'Thư viện đề' : selectedClass ? selectedClass.name : activeTab === 'teacher-classes' ? 'Lớp học của thầy cô' : 'Một ngày dạy học mới.'}</h1><p>{selectedClass ? `Khối ${selectedClass.grade} · Năm học ${selectedClass.academicYear} · ${selectedClass.studentCount} học sinh` : isLibrary ? 'Tìm đề, mở kết quả hoặc dùng lại cho lần giao mới.' : activeTab === 'teacher-bank' ? 'Tìm câu hỏi theo chuyên đề, dạng bài và độ khó.' : 'Theo dõi lớp học, giao bài và hiểu rõ kết quả của từng em.'}</p></div><div className="tw-actions"><button disabled={loading || busy} aria-label="Tải lại dữ liệu" onClick={load}><RefreshCw size={17} /></button>{!readOnly && <button className="tw-primary" onClick={() => startComposer()}><Plus size={17} />{selectedClass ? 'Giao bài' : 'Tạo đề mới'}</button>}</div></header>}
      {loading ? <div className="tw-loading" role="status">Đang tải lớp học và bài tập…</div> : error && !classes.length ? <div className="tw-library-loading-error"><h2>Chưa thể tải không gian giảng dạy</h2><p>Dữ liệu lớp chưa tải được. Thử lại trước khi tạo lớp hoặc giao bài.</p><button onClick={load}>Thử tải lại</button></div> : activeTab === 'teacher-bank' ? <QuestionBankView currentUser={currentUser} /> : isLibrary ? <>{!readOnly && <TeacherLocalDrafts userId={currentUser.id} classes={classes} onResume={id => { setReportId(null); setComposerId(id); }} />}{assignmentList()}</> : selectedClass ? <>
        <div className="tw-class-tools"><button onClick={() => setClassId(null)}><ArrowLeft size={16} />Tất cả lớp</button><label>Chuyển lớp<select value={classId} onChange={e => openClass(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{!readOnly && <button disabled={busy} onClick={() => act(async () => { const r = await classroomApi.generateInviteCode(classId, { maxUses: 50, expiresInDays: 30 }); setInvite({ ...r, classId }); setDetailsRetry(value => value + 1); })}><Plus size={15} />Tạo mã mời</button>}</div>
        {invite?.classId === classId && <div className="tw-invite" role="status"><div><small>Mã mời mới · chỉ hiển thị trong phiên này</small><strong>{invite.plainCode}</strong><span>Gửi mã này cho học sinh để tham gia lớp. Tối đa {invite.maxUses || 50} lượt sử dụng.</span><span>Hết hạn: {date(invite.expiresAt)}</span></div><button onClick={() => act(async () => { try { await navigator.clipboard.writeText(invite.plainCode); } catch { throw new Error('Trình duyệt chưa cho phép sao chép. Hãy chọn mã mời bên dưới và sao chép thủ công, hoặc cấp quyền sao chép rồi thử lại.'); } }, 'Đã sao chép mã mời.')}><Copy size={16} />Sao chép</button></div>}
        {detailsError && <div className="tw-error" role="alert"><p>Chưa tải được thành viên và mã mời: {detailsError}</p><button disabled={busy} onClick={() => setDetailsRetry(value => value + 1)}>Thử tải thông tin lớp</button></div>}
        <Tabs items={[[ 'overview', 'Tổng quan lớp'], ['assignments', 'Bài tập'], ['students', 'Học sinh'], ['gradebook', 'Sổ điểm'], ['skills', 'Tiến độ kỹ năng']]} value={classTab} onChange={setClassTab} />
        {classTab === 'overview' && <><div className="tw-stats"><Stat label="Học sinh" value={selectedClass.studentCount} /><Stat label="Bài đã giao" note={assignmentsIncomplete ? 'Chưa tải được' : undefined} value={assignmentsIncomplete ? '—' : allClassAssignments.filter(a => a.status !== 'DRAFT').length} /><Stat label="Đang nhận bài" value={assignmentsIncomplete ? '—' : allClassAssignments.filter(a => status(a) === 'Đang nhận bài').length} /><Stat label="Đề nháp" value={assignmentsIncomplete ? '—' : allClassAssignments.filter(a => a.status === 'DRAFT').length} /></div><div className="tw-section-heading"><h2>Bài tập gần đây</h2><button onClick={() => setClassTab('assignments')}>Xem tất cả <ChevronRight size={15} /></button></div><RecentAssignments rows={allClassAssignments.filter(a => a.status !== 'DRAFT').slice(0, 5)} onOpen={openReport} /><InviteCodes loading={!details && !detailsError} failed={!!detailsError} details={details} readOnly={readOnly} busy={busy} onRevoke={codeId => act(async () => { await classroomApi.revokeInviteCode(classId, codeId); setInvite(value => value?.inviteCodeId === codeId || value?.plainCode?.startsWith(details?.inviteCodes?.find(code => code.id === codeId)?.codePrefix || '\u0000') ? null : value); const refreshed = await classroomApi.getClassroomDetails(classId); setDetails(refreshed.classroom || refreshed); }, 'Đã thu hồi mã mời.')} /></>}
        {classTab === 'assignments' && assignmentList()}
        {classTab === 'students' && (!details ? !detailsError && <p role="status">Đang tải thành viên…</p> : <TeacherStudentList students={details.students || []} columns={<><th>Học sinh</th><th>Tài khoản</th><th>Email</th><th>Ngày tham gia</th></>} renderRow={s => <tr key={s.studentId}><td><strong>{s.fullName}</strong></td><td>{s.username}</td><td>{s.email || '—'}</td><td>{date(s.joinedAt)}</td></tr>} />)}
        {['gradebook', 'skills'].includes(classTab) && (assignmentFailures.some(c => c.id === classId) ? <p role="status">Cần tải đủ bài giao của lớp trước khi tổng hợp kết quả.</p> : aggregateLoading ? <p role="status">Đang tổng hợp kết quả các bài đã giao…</p> : classReports ? <ClassAggregate mode={classTab} reports={classReports} students={details?.students || []} onOpen={openReport} /> : <button onClick={aggregate}>Tải lại báo cáo lớp</button>)}
      </> : activeTab === 'teacher-classes' ? <TeacherClassDirectory controls={classDirectoryControls} setControls={setClassDirectoryControls} classes={classes} assignments={assignments}
        incomplete={assignmentFailures.length > 0} onOpen={openClass} onCreate={() => setCreatingClass(true)} readOnly={readOnly} busy={busy} /> : <>
        {!readOnly && <TeacherLocalDrafts userId={currentUser.id} classes={classes} onResume={id => { setReportId(null); setComposerId(id); }} />}
        <TeacherOverview classes={classes} assignments={assignments} onOpenClass={openClass}
          onOpenAssignment={openReport} onCreateClass={() => setCreatingClass(true)} onCreateExam={() => startComposer()}
          busy={busy} readOnly={readOnly} incomplete={assignmentFailures.length > 0} />
      </>}
    </>}
    {creatingClass && <div className="tw-overlay"><form ref={workspaceDialogRef} tabIndex={-1} className="tw-dialog" role="dialog" aria-modal="true" aria-labelledby="tw-create-title" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); act(async () => { const r = await classroomApi.createClassroom({ name: data.get('name').trim(), grade: Number(data.get('grade')), academicYear: data.get('year').trim() }); setCreatingClass(false); await load(); if (r.classroom?.id) { openClass(r.classroom.id); setInvite({ classId: r.classroom.id, plainCode: r.classroom.inviteCode, expiresAt: r.classroom.codeExpiresAt, maxUses: 50 }); } }, 'Đã tạo lớp học.'); }}>{error && <p className="tw-error" role="alert">{error}</p>}<div className="tw-section-heading"><h2 id="tw-create-title">Tạo lớp học</h2><button type="button" disabled={busy} onClick={() => setCreatingClass(false)} aria-label="Đóng"><X size={18} /></button></div><fieldset className="tw-regrade-fields" disabled={busy}><label>Tên lớp<input name="name" required maxLength={120} placeholder="Ví dụ: Toán 9A1" /></label><div className="tw-form-grid"><label>Khối<select name="grade" defaultValue="9">{[6, 7, 8, 9].map(g => <option key={g}>{g}</option>)}</select></label><label>Năm học<input name="year" required defaultValue="2026-2027" /></label></div></fieldset><p className="tw-muted">Sau khi tạo, chia sẻ mã mời để học sinh tham gia lớp.</p><button className="tw-primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo lớp và mã mời'}</button></form></div>}
    {confirm && <div className="tw-overlay"><div ref={workspaceDialogRef} tabIndex={-1} className="tw-dialog" role="dialog" aria-modal="true" aria-labelledby="tw-delete-title"><h2 id="tw-delete-title">Xóa “{confirm.title}”?</h2><p>{confirm.className} · {confirm.totalSubmissions || 0}/{confirm.totalStudents || 0} bài đã nộp.</p>{error && <p className="tw-error" role="alert">{error}</p>}<p>Bài giao và dữ liệu bài nộp liên quan sẽ bị xóa. Thao tác này không thể hoàn tác.</p><div className="tw-actions"><button disabled={busy} onClick={() => setConfirm(null)}>Giữ lại</button><button className="tw-danger" disabled={busy} onClick={() => act(async () => { await assignmentApi.deleteAssignment(confirm.classId, confirm.id); setConfirm(null); await load(); }, 'Đã xóa bài.')}>{busy ? 'Đang xóa…' : 'Xóa bài'}</button></div></div></div>}
  </div>;
}

function RecentAssignments({ rows, onOpen }) { return <div className="tw-surface tw-recent">{!rows.length ? <Empty title="Chưa có bài đã giao">Các bài đã giao sẽ xuất hiện tại đây.</Empty> : rows.map(a => <button key={a.id} onClick={() => onOpen(a)}><span className="tw-file-icon"><FileText size={20} /></span><span><strong>{a.title}</strong><small>{a.className} · Hạn nộp {date(a.dueDate)}</small></span><span className="tw-badge">{a.totalSubmissions}/{a.totalStudents} đã nộp</span><ChevronRight size={17} /></button>)}</div>; }
function InviteCodes({ details, onRevoke, readOnly, busy, loading, failed }) {
  const [pending, setPending] = useState(null);
  return <details className="tw-surface tw-invite-history"><summary>Quản lý mã mời</summary>{loading ? <p role="status">Đang tải mã mời…</p> : failed ? <p>Thử tải lại thông tin lớp để xem mã mời.</p> : details?.inviteCodes?.length ? details.inviteCodes.map(c => {
    const expired = Date.parse(c.expiresAt) < Date.now(), exhausted = c.usedCount >= c.maxUses;
    return <div className="tw-invite-line" key={c.id}><span>{c.codePrefix}••••• · {c.usedCount}/{c.maxUses} lượt · {c.isRevoked ? 'Đã thu hồi' : expired ? 'Đã hết hạn' : exhausted ? 'Đã hết lượt sử dụng' : `Hết hạn ${date(c.expiresAt)}`}</span>{!readOnly && !c.isRevoked && !expired && !exhausted && (pending === c.id ? <div className="tw-invite-confirm"><p>Thu hồi mã {c.codePrefix}•••••? Học sinh mới sẽ không thể dùng mã này. Thành viên hiện tại vẫn ở trong lớp.</p><div className="tw-actions"><button disabled={busy} onClick={() => setPending(null)}>Giữ mã</button><button className="tw-danger" disabled={busy} onClick={() => onRevoke(c.id)}>Xác nhận thu hồi</button></div></div> : <button disabled={busy} onClick={() => setPending(c.id)}>Thu hồi</button>)}</div>;
  }) : <p>Chưa có mã mời. Dùng “Tạo mã mời” để mời học sinh.</p>}</details>;
}

function ClassAggregate({ mode, reports, students, onOpen }) {
  if (!reports.length) return <Empty title="Chưa có dữ liệu kết quả">Giao bài để bắt đầu theo dõi điểm và kỹ năng của lớp.</Empty>;
  if (mode === 'gradebook') return <TeacherStudentList title="Sổ điểm lớp" students={students} columns={<><th>Học sinh</th>{reports.map(r => <th key={r.assignment.id}><button onClick={() => onOpen(r.assignment)}>{r.assignment.title}</button></th>)}</>} renderRow={s => <tr key={s.studentId}><td>{s.fullName}</td>{reports.map(r => <td key={r.assignment.id}><button onClick={() => onOpen(r.assignment, 'results', s.studentId)}>{score(r.roster.find(x => x.studentId === s.studentId)?.score)}</button></td>)}</tr>}><button onClick={() => downloadCsv('so-diem-lop.csv', [['Học sinh', ...reports.map(r => r.assignment.title)], ...students.map(s => [s.fullName, ...reports.map(r => r.roster.find(x => x.studentId === s.studentId)?.score ?? 'Chưa nộp')])])}><Download size={16} />Xuất toàn bộ CSV</button></TeacherStudentList>;
  const skills = new Map();
  reports.forEach(r => r.questionAnalytics.filter(q => q.gradingMode !== 'EXCLUDE').forEach(q => { const key = q.skillTitle, old = skills.get(key) || { correct: 0, total: 0, questions: 0 }; skills.set(key, { correct: old.correct + q.correctAnswers, total: old.total + q.totalAnswers, questions: old.questions + 1 }); }));
  if (!skills.size) return <div className="tw-skills-empty"><Empty title="Chưa có dữ liệu kỹ năng">Các bài đã giao chưa có câu hỏi được tính trong tổng hợp kỹ năng. Hãy kiểm tra nội dung và chế độ chấm của bài giao; câu không tính điểm được loại khỏi báo cáo này.</Empty></div>;
  return <div className="tw-surface"><h2>Kết quả theo kỹ năng</h2><p className="tw-muted">Chỉ tổng hợp bài giáo viên đã giao. Tỷ lệ đúng là kết quả quan sát, chưa phải ước lượng độ thành thạo.</p>{[...skills].map(([name, s]) => <div className="tw-skill-row" key={name}><div><strong>{name}</strong><small>{s.questions} câu · {s.total} lượt trả lời</small></div><progress max="100" value={s.total ? s.correct / s.total * 100 : 0} /><strong>{s.total ? `${Math.round(s.correct / s.total * 100)}% đúng` : 'Chưa đủ dữ liệu'}</strong></div>)}</div>;
}

function ExamEditor({ initial, classes, onBack, onSave, draftKey }) {
  const source = initial.source;
  const [storageError, setStorageError] = useState(false);
  useEffect(() => { const warn = () => setStorageError(true); window.addEventListener('math-draft-error', warn); return () => window.removeEventListener('math-draft-error', warn); }, []);
  const [document, setDocument] = useDraftState(draftKey + ':document', source?.assignment.document || null);
  const [title, setTitle, titleStorageError] = useDraftState(draftKey + ':title', source?.assignment.title || ''), [classId, setClassId] = useDraftState(draftKey + ':classId', initial.classId || classes.find(c => c.isActive)?.id || '');
  const [description, setDescription] = useDraftState(draftKey + ':description', source?.assignment.description || ''), [minutes, setMinutes] = useDraftState(draftKey + ':minutes', source?.assignment.durationMinutes ?? 45), [due, setDue] = useDraftState(draftKey + ':due', '');
  const [mode, setMode] = useDraftState(draftKey + ':mode', 'TEST'), [policy, setPolicy] = useDraftState(draftKey + ':policy', 'MANUAL'), [solutions, setSolutions] = useDraftState(draftKey + ':solutions', false), [folder, setFolder] = useDraftState(draftKey + ':folder', source?.assignment.settings?.folder || '');
  const [trackTabSwitches, setTrackTabSwitches] = useDraftState(draftKey + ':trackTabSwitches', source?.assignment.settings?.trackTabSwitches ?? true);
  const [bank, setBank] = useState([]), [ids, setIds] = useDraftState(draftKey + ':ids', []), [custom, setCustom] = useDraftState(draftKey + ':custom', () => source ? source.questions.map((q, i) => ({ ...asEditable(q), id: `custom_reuse_${i}` })) : []);
  const [counts, setCounts] = useDraftState(draftKey + ':counts', () => source ? countQuestions([], [], source.questions) : { ...DEFAULT_QUESTION_COUNTS });
  const [step, setStep] = useRouteState('step', 1), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [bankError, setBankError] = useState(''), [error, setError] = useState('');
  async function loadBank() { setLoading(true); setBankError(''); try { const r = await assignmentApi.getQuestionBank(); setBank(Array.isArray(r) ? r : r.questions || []); } catch (e) { setBankError(e.message); } finally { setLoading(false); } }
  useEffect(() => { loadBank(); }, []);
  const actual = countQuestions(bank, ids, custom), ready = title.trim() && Object.keys(counts).every(k => counts[k] !== '' && Number(counts[k]) === actual[k] && Number(counts[k]) >= 0) && ids.length + custom.length > 0 && (!custom.some(q => q.id?.startsWith('custom_document_')) || !!document);
  const missingReason = !title.trim() ? 'Chưa có tên đề. Nhập tên ở đầu trang hoặc chọn tệp để tự đặt tên.' : !ids.length && !custom.length ? 'Chưa có câu hỏi. Thêm câu hỏi để tiếp tục.' : !Object.keys(counts).every(k => counts[k] !== '' && Number(counts[k]) === actual[k] && Number(counts[k]) >= 0) ? 'Số câu đã chọn chưa khớp số lượng yêu cầu. Kiểm tra bảng cấu trúc đề.' : !ready ? 'Cần tải lại tệp đề gốc trước khi tiếp tục.' : '';
  const settingsError = !classes.some(c => c.id === classId && c.isActive) ? 'Chọn một lớp đang hoạt động để nhận bài.' : minutes === '' || !Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 360 ? 'Thời lượng phải là số nguyên từ 0 đến 360 phút; 0 là không giới hạn.' : policy === 'AFTER_DUE' && !due ? 'Chọn hạn nộp để hiện điểm sau hạn nộp.' : due && !Number.isFinite(new Date(due).getTime()) ? 'Hạn nộp chưa hợp lệ.' : '';
  const validateStep = () => {
    const message = !ready ? missingReason : settingsError;
    if (!message) return true;
    setError(message);
    requestAnimationFrame(() => window.document.querySelector(!ready && !title.trim() ? '#teacher-exam-title' : '.tw-exam-editor [role="alert"]')?.focus());
    return false;
  };
  function continueStep() {
    if (!ready) { setError(missingReason); if (!title.trim()) documentTitleFocus(); return; }
    if (step === 2 && !validateStep()) return;
    setError(''); setStep(step + 1);
  }
  function documentTitleFocus() { window.document.getElementById('teacher-exam-title')?.focus(); }
  async function save(draft) {
    if (!ready) { setError('Nhập tên đề và chọn đủ số câu đã thiết lập.'); return; }
    if (!validateStep()) return;
    setBusy(true); setError('');
    try { await assignmentApi.createAssignment(classId, { title: title.trim(), description, durationMinutes: Number(minutes), ...(due ? { dueDate: new Date(due).toISOString() } : {}), questionCounts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])), questionIds: ids, customQuestions: custom.map(asEditable), status: draft ? 'DRAFT' : 'PUBLISHED', settings: { mode, trackTabSwitches, resultsPolicy: policy, published: false, showSolutions: solutions, folder, ...(document ? { documentId: document.id } : {}) } }); Object.keys(localStorage).filter(key => key.startsWith(draftKey + ':') || key === draftKey.replace('exam-draft:', 'exam-source:')).forEach(key => localStorage.removeItem(key)); await onSave(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="tw-exam-editor">{(storageError || titleStorageError) && <p role="alert">Không thể lưu bản nháp trên trình duyệt. Hãy lưu nháp trên máy chủ trước khi rời trang.</p>}<button className="tw-back" disabled={busy} onClick={onBack}><ArrowLeft size={16} />Quay lại</button><header className="tw-header"><div><span className="tw-overline">Thư viện đề / {source ? 'Dùng lại đề' : 'Soạn đề'}</span><h1>Không gian soạn đề</h1></div></header><Tabs items={[[1, '01 · Nội dung & đáp án'], [2, '02 · Thiết lập giao bài'], [3, '03 · Kiểm tra & xác nhận']]} value={step} onChange={v => { if (v === 1 || (v === 2 && ready) || (v === 3 && validateStep())) { setError(''); setStep(v); } else if (v !== 3) setError(missingReason); }} />{error && <p className="tw-error" role="alert" tabIndex={-1}>{error}</p>}
    {step === 1 && <><label className="tw-title-input"><span>Tên đề</span><input id="teacher-exam-title" required aria-describedby="teacher-title-hint" value={title} maxLength={200} onChange={e => { setTitle(e.target.value); setError(''); }} placeholder="Ví dụ: Phương trình bậc hai — 45 phút" /><small id="teacher-title-hint">Tên được tự điền từ tệp nếu để trống. Thầy/cô có thể sửa lại.</small></label><TeacherExamComposer draftKey={draftKey} bank={bank} loading={loading} loadError={bankError} counts={counts} setCounts={setCounts} selectedIds={ids} setSelectedIds={setIds} custom={custom} setCustom={setCustom} onRetry={loadBank} onSuggestTitle={suggested => { setTitle(previous => previous.trim() ? previous : suggested); setError(''); }} document={document} setDocument={setDocument} /></>}
    {step === 2 && <div className="tw-surface"><div className="tw-form-grid"><label>Lớp nhận bài<select value={classId} onChange={e => setClassId(e.target.value)}>{classes.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Chuyên đề / Thư mục<input value={folder} maxLength={120} onChange={e => setFolder(e.target.value)} placeholder="Ví dụ: Chương 4 — Phương trình" /></label><label>Chế độ<select value={mode} onChange={e => { const practice = e.target.value === 'PRACTICE'; setMode(e.target.value); setPolicy(practice ? 'IMMEDIATE' : 'MANUAL'); setSolutions(practice); }}><option value="TEST">Bài kiểm tra</option><option value="PRACTICE">Bài luyện tập</option></select></label><label>Thời lượng (phút, 0 = tự do)<input type="number" min="0" max="360" value={minutes} onChange={e => setMinutes(e.target.value)} /></label><label>Hạn nộp<input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></label><label>Hiện điểm<select value={policy} onChange={e => setPolicy(e.target.value)}><option value="MANUAL">Khi giáo viên công bố</option><option value="IMMEDIATE">Ngay sau khi nộp</option><option value="AFTER_DUE">Sau hạn nộp</option></select></label><label className="tw-check"><input type="checkbox" checked={trackTabSwitches} onChange={e => setTrackTabSwitches(e.target.checked)} />Kiểm tra thoát tab</label><label className="tw-check"><input type="checkbox" checked={solutions} onChange={e => setSolutions(e.target.checked)} />Cho xem đáp án/lời giải khi được xem điểm</label></div><label>Hướng dẫn làm bài<textarea value={description} onChange={e => setDescription(e.target.value)} /></label><p className="tw-notice">{trackTabSwitches ? 'Ghi nhận số lần thoát tab, thời điểm và thời lượng. Học sinh được cảnh báo mỗi lần rời tab.' : 'Đã tắt kiểm tra thoát tab cho bài này.'}</p></div>}
    {step === 3 && <div className="tw-surface"><h2>{title}</h2><p>{classes.find(c => c.id === classId)?.name} · {ids.length + custom.length} câu · {minutes === '0' || minutes === 0 ? 'Không giới hạn thời gian' : `${minutes} phút`}</p>{document && <ExamDocumentView document={document} />}<p>Hạn nộp: {date(due)}</p><p>Kiểm tra thoát tab: {trackTabSwitches ? 'Bật' : 'Tắt'}</p><p>Hiện điểm: {policy === 'MANUAL' ? 'Giáo viên công bố' : policy === 'IMMEDIATE' ? 'Sau khi nộp' : 'Sau hạn nộp'} · {solutions ? 'Kèm đáp án/lời giải' : 'Ẩn đáp án/lời giải'}</p>{[...bank.filter(q => ids.includes(q.id)), ...custom].map((q, i) => <details className="tw-question" key={q.id}><summary>Câu {i + 1} · {QUESTION_LABELS[q.questionType || 'SINGLE_CHOICE']}</summary><MathRenderer content={q.content} /><MathQuestionResult answerKey question={{ ...q, options: (q.options || []).map(o => ({ ...o, key: o.key || o.optionKey, isCorrect: o.isCorrect ?? o.key === q.correctOption })) }} /><MathRenderer content={q.explanation || ''} /></details>)}</div>}
    <footer className="tw-editor-footer"><div><span>{ids.length + custom.length} câu đã chọn</span>{(missingReason || (step > 1 && settingsError)) && <p className="tw-error" role="status" style={{ margin: '4px 0 0' }}>{missingReason || settingsError}</p>}</div><div className="tw-actions"><button disabled={busy || !ready} onClick={() => save(true)}>Lưu nháp</button>{step > 1 && <button disabled={busy} onClick={() => setStep(step - 1)}>Trở lại</button>}{step < 3 ? <button className="tw-primary" disabled={busy} onClick={continueStep}>Tiếp tục <ChevronRight size={16} /></button> : <button className="tw-primary" disabled={busy || !ready || (policy === 'AFTER_DUE' && !due) || !Number.isInteger(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 360} onClick={() => save(false)}>{busy ? 'Đang lưu…' : 'Xác nhận giao bài'}</button>}</div></footer>
  </section>;
}

export function AssignmentReport({ data, tab, setTab, onBack, onRefresh, readOnly }) {
  const { assignment: a, roster, questions, questionAnalytics, history } = data;
  const [studentId, setStudentId] = useState(data.selectedStudentId || null), [questionId, setQuestionId] = useState(null), [group, setGroup] = useState('ALL');
  const [editing, setEditing] = useState(false), [editQuestions, setEditQuestions] = useState([]), [reason, setReason] = useState(''), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [publishReview, setPublishReview] = useState(false);
  const [resultControls, setResultControls] = useState({ query: '', filter: 'ALL', sort: 'SCORE_ASC', page: 1, size: 10 });
  const [analysisControls, setAnalysisControls] = useState({ query: '', topic: '', filter: 'ALL', sort: 'MISS', page: 1 });
  const insights = React.useMemo(() => buildReportInsights(data), [data]);
  const visible = a.settings?.published === true || (a.settings?.resultsPolicy || 'IMMEDIATE') === 'IMMEDIATE' || (a.settings?.resultsPolicy === 'AFTER_DUE' && a.dueDate && Date.parse(a.dueDate) <= Date.now());
  const openQuestion = id => { setTab('analytics'); setQuestionId(id); setGroup('ALL'); };
  const s = a.settings || {}, student = roster.find(r => r.studentId === studentId), question = questions.find(q => q.id === questionId), analytics = questionAnalytics.find(q => q.questionId === questionId);
  const [settings, setSettings] = useState({ title: a.title, folder: s.folder || '', mode: s.mode || 'TEST', resultsPolicy: s.resultsPolicy || 'IMMEDIATE', trackTabSwitches: s.trackTabSwitches ?? (s.mode !== 'PRACTICE'), showSolutions: s.showSolutions !== false, published: s.published === true });
  async function run(task, message) { setBusy(true); setError(''); setNotice(''); try { await task(); if (message) setNotice(message); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); } }
  useEffect(() => { if (error && !publishReview) window.document.querySelector('.ar-report>.tw-error')?.focus(); }, [error, publishReview]);
  async function saveSettings(extra = {}) { await run(async () => { await assignmentApi.updateSettings(a.classId, a.id, { ...settings, title: settings.title.trim(), ...extra }); await onRefresh(); setSettings(v => ({ ...v, ...extra })); }, 'Đã lưu thiết lập trên máy chủ.'); }
  function beginEdit() { setEditQuestions(questions.map(q => ({ id: q.id, ...asEditable(q), points: q.points || 1, gradingMode: q.gradingMode || 'NORMAL' }))); setEditing(true); setPreview(null); setReason(''); }
  function changeQuestion(i, patch) { setPreview(null); setEditQuestions(qs => qs.map((q, j) => j === i ? { ...q, ...patch } : q)); }
  const questionDialogRef = useModalFocus(!!(question && analytics) && !student, () => setQuestionId(null),
    () => window.document.querySelector('.ar-report>.tw-tabs [aria-current="page"]'));
  const submitted = insights.submitted;
  return <section className="ar-report"><button className="tw-back" onClick={onBack}><ArrowLeft size={16} />Quay lại danh sách</button><header className="tw-header"><div><span className="tw-overline">Bài tập / Phiên bản {a.revision}</span><h1>{a.title}</h1><p>{status(a)} · {a.durationMinutes ? `${a.durationMinutes} phút` : 'Tự do'} · Hạn nộp {date(a.dueDate)}</p></div><div className="tw-actions"><button onClick={() => downloadCsv('ket-qua-bai-tap.csv', [['Học sinh', 'Tài khoản', 'Trạng thái', 'Điểm', 'Thời gian (giây)', 'Số lần rời màn hình', 'Thời gian rời (giây)', 'Tải lại trang'], ...roster.map(r => [r.fullName, r.username, r.isSubmitted ? 'Đã nộp' : 'Chưa nộp', r.score, r.timeSpentSeconds, r.activity.count, r.activity.seconds, r.activity.reloads])])}><Download size={16} />Xuất toàn bộ</button>{!readOnly && <button className="tw-primary" disabled={busy || visible} onClick={() => { setError(''); setPublishReview(true); }}>{visible ? 'Điểm đang hiển thị' : 'Kiểm tra & công bố'}</button>}</div></header>
    {error && <p className="tw-error" tabIndex={-1} role="alert">{error}</p>}{notice && <p className="tw-notice" role="status">{notice}</p>}
    <Tabs items={[[ 'results', 'Kết quả'], ['paper', 'Đề & đáp án'], ['analytics', 'Phân tích từng câu'], ['settings', 'Thiết lập']]} value={tab} onChange={v => { setTab(v); setStudentId(null); setQuestionId(null); }} />
    {tab === 'results' && <AssignmentResultsPanel controls={resultControls} setControls={setResultControls} data={data} insights={insights} onStudent={setStudentId} onQuestion={openQuestion} onAnalytics={() => setTab('analytics')} onPublishReview={() => { setError(''); setPublishReview(true); }} visible={visible} readOnly={readOnly} />}
    {tab === 'analytics' && <AssignmentAnalyticsPanel controls={analysisControls} setControls={setAnalysisControls} data={data} insights={insights} onQuestion={openQuestion} />}
    {publishReview && <ReportPublishReview data={data} insights={insights} editing={editing} busy={busy} error={error} onClose={() => setPublishReview(false)} onPaper={() => { setPublishReview(false); setTab('paper'); }} onAnalytics={() => { setPublishReview(false); setTab('analytics'); }} onConfirm={async () => {
      const saved = await run(async () => { await assignmentApi.updateSettings(a.classId, a.id, { published: true }); await onRefresh(); setSettings(v => ({ ...v, published: true })); }, 'Đã công bố điểm cho học sinh.');
      if (saved) setPublishReview(false);
    }} />}
    {tab === 'paper' && <>{a.document && <ExamDocumentView document={a.document} />}<div className="tw-section-heading"><div><h2>Nội dung đề và đáp án</h2><p>{a.totalStudents} học sinh được giao · Phiên bản {a.revision}</p></div>{!readOnly && !editing && <button onClick={beginEdit}>Chỉnh sửa đề / Đáp án</button>}</div>{editing ? <div className="tw-surface"><p className="tw-notice">Khi đã có người bắt đầu, nội dung và cấu trúc câu được giữ nguyên. Đáp án mới áp dụng cho lần giao này; đề trong ngân hàng và lớp khác không đổi.</p><fieldset className="tw-regrade-fields" disabled={busy}><label className="tw-regrade-jump">Đi tới câu cần sửa<select defaultValue="" onChange={e => { const item = window.document.getElementById(`tw-edit-question-${e.target.value}`); if (item) { item.open = true; item.scrollIntoView({ block: 'start', behavior: 'smooth' }); item.querySelector('summary')?.focus(); } }}><option value="" disabled>Chọn câu hỏi</option>{editQuestions.map((q,i)=><option key={q.id} value={i}>Câu {i+1} · {QUESTION_LABELS[q.questionType]}</option>)}</select></label>{editQuestions.map((q, i) => <details className="tw-question tw-edit-question" id={`tw-edit-question-${i}`} key={q.id} open={i===0}><summary>Câu {i + 1} · {QUESTION_LABELS[q.questionType]} · {q.gradingMode === 'EXCLUDE' ? 'Không tính điểm' : q.gradingMode === 'FULL_CREDIT' ? 'Cho điểm toàn bộ' : 'Chấm theo đáp án'}</summary><label>Nội dung<textarea disabled={roster.some(r => r.status !== 'NOT_STARTED')} value={q.content} onChange={e => changeQuestion(i, { content: e.target.value })} /></label>{q.questionType === 'SINGLE_CHOICE' && <>{q.options.map(o => <div key={o.key} className="tw-option"><span>{o.key}.</span><input aria-label={`Nội dung phương án ${o.key} câu ${i + 1}`} disabled={roster.some(r => r.status !== 'NOT_STARTED')} value={o.content} onChange={e => changeQuestion(i, { options: q.options.map(x => x.key === o.key ? { ...x, content: e.target.value } : x) })} /></div>)}<label>Đáp án đúng<select value={q.correctOption} onChange={e => changeQuestion(i, { correctOption: e.target.value })}>{q.options.map(o => <option key={o.key}>{o.key}</option>)}</select></label></>}{q.questionType === 'TRUE_FALSE' && q.statements.map((st, j) => <label className="tw-tf-edit" key={st.key}><span>{st.key}) <MathRenderer content={st.content} /></span><select value={String(st.isCorrect)} onChange={e => changeQuestion(i, { statements: q.statements.map((x, k) => k === j ? { ...x, isCorrect: e.target.value === 'true' } : x) })}><option value="true">Đúng</option><option value="false">Sai</option></select></label>)}{q.questionType === 'SHORT_ANSWER' && <><label>Đáp án chấp nhận (mỗi dòng một đáp án)<textarea value={q.shortAnswer.acceptedAnswers.join('\n')} onChange={e => changeQuestion(i, { shortAnswer: { ...q.shortAnswer, acceptedAnswers: e.target.value.split('\n') } })} /></label>{q.shortAnswer.mode === 'NUMERIC' && <label>Sai số tuyệt đối<input type="number" min="0" step="any" value={q.shortAnswer.tolerance ?? 1e-9} onChange={e => changeQuestion(i, { shortAnswer: { ...q.shortAnswer, tolerance: Number(e.target.value) } })} /></label>}</>}<div className="tw-form-grid"><label>Trọng số điểm<input type="number" min="0.01" max="100" step="0.01" value={q.points} onChange={e => changeQuestion(i, { points: Number(e.target.value) })} /></label><label>Xử lý câu hỏi<select value={q.gradingMode} onChange={e => changeQuestion(i, { gradingMode: e.target.value })}><option value="NORMAL">Chấm theo đáp án</option><option value="FULL_CREDIT">Cho tất cả điểm câu này</option><option value="EXCLUDE">Loại câu, quy đổi lại thang 10</option></select></label></div><label>Lời giải<textarea value={q.explanation} onChange={e => changeQuestion(i, { explanation: e.target.value })} /></label></details>)}<label>Lý do cập nhật<textarea maxLength={1000} value={reason} onChange={e => { setReason(e.target.value); setPreview(null); }} placeholder="Ví dụ: Điều chỉnh đáp án câu 4 do nhập nhầm." /></label></fieldset><div className="tw-actions"><button disabled={busy} onClick={() => { setEditing(false); setPreview(null); }}>Hủy chỉnh sửa</button><button disabled={busy || !reason.trim()} onClick={() => run(async () => setPreview(await assignmentApi.regrade(a.classId, a.id, { questions: editQuestions, reason, revision: a.revision, apply: false })))}>Xem trước ảnh hưởng</button></div>{preview && <RegradeImpact key={JSON.stringify(preview)} preview={preview} roster={roster} title={a.title} visible={visible} busy={busy} onApply={() => run(async () => { await assignmentApi.regrade(a.classId, a.id, { questions: editQuestions, reason, revision: a.revision, apply: true }); setEditing(false); setPreview(null); await onRefresh(); }, 'Đã cập nhật đáp án và tự chấm lại toàn bộ bài nộp.')} />}</div> : <><div className="tw-paper-tools"><label className="tw-paper-jump">Đi tới câu<select defaultValue="" onChange={event => { const item = window.document.getElementById(`tw-paper-question-${event.target.value}`); if(item){item.open=true;item.scrollIntoView({block:'start',behavior:'smooth'});item.querySelector('summary')?.focus();} }}><option value="" disabled>Chọn câu hỏi</option>{questions.map((q,index)=><option key={q.id} value={index}>Câu {q.orderIndex} · {QUESTION_LABELS[q.questionType]}</option>)}</select></label><div className="tw-actions"><button type="button" onClick={()=>window.document.querySelectorAll('.tw-paper-question').forEach(item=>item.open=true)}>Mở tất cả</button><button type="button" onClick={()=>window.document.querySelectorAll('.tw-paper-question').forEach(item=>item.open=false)}>Thu gọn tất cả</button></div></div>{questions.map((q,index) => <details id={`tw-paper-question-${index}`} className="tw-surface tw-question tw-paper-question" key={q.id} open={index===0}><summary>Câu {q.orderIndex} · {QUESTION_LABELS[q.questionType]} · {q.points} điểm trọng số</summary><MathRenderer content={q.content} /><MathQuestionResult answerKey question={{ ...q, options: q.options.map(o => ({ ...o, key: o.optionKey })) }} /><MathRenderer content={q.explanation || ''} /></details>)}</>}<details className="tw-surface"><summary>Lịch sử cập nhật</summary>{history.length ? history.map(h => <div className="tw-history" key={h.id}><strong>{h.action === 'ASSIGNMENT_REGRADED' ? 'Cập nhật đề và tính lại điểm' : 'Cập nhật thiết lập'}</strong><small>{date(h.createdAt)}</small><p>{h.metadata?.reason || `Trạng thái: ${h.metadata?.status || '—'}`}</p></div>) : <p>Chưa có thay đổi.</p>}</details></>}
    {tab === 'settings' && <form className="tw-surface" onSubmit={e => { e.preventDefault(); saveSettings(); }}><h2>Thiết lập bài giao</h2><fieldset className="tw-regrade-fields" disabled={busy || readOnly}><div className="tw-form-grid"><label>Tên bài<input required maxLength={200} value={settings.title} disabled={readOnly} onChange={e => setSettings(v => ({ ...v, title: e.target.value }))} /></label><label>Chuyên đề / Thư mục<input maxLength={120} value={settings.folder} disabled={readOnly} onChange={e => setSettings(v => ({ ...v, folder: e.target.value }))} /></label><label>Hiện điểm<select value={settings.resultsPolicy} disabled={readOnly} onChange={e => setSettings(v => ({ ...v, resultsPolicy: e.target.value }))}><option value="IMMEDIATE">Ngay sau nộp</option><option value="AFTER_DUE" disabled={!a.dueDate}>Sau hạn nộp</option><option value="MANUAL">Giáo viên công bố</option></select></label><label className="tw-check"><input type="checkbox" disabled={readOnly} checked={settings.trackTabSwitches} onChange={e => setSettings(v => ({ ...v, trackTabSwitches: e.target.checked }))} />Kiểm tra thoát tab</label><label className="tw-check"><input type="checkbox" disabled={readOnly} checked={settings.showSolutions} onChange={e => setSettings(v => ({ ...v, showSolutions: e.target.checked }))} />Cho xem đáp án và lời giải khi được xem điểm</label></div></fieldset><p className="tw-muted">{a.dueDate ? `Hạn nộp hiện tại: ${date(a.dueDate)}.` : 'Bài chưa có hạn nộp nên không thể chọn “Sau hạn nộp”.'} Đóng nhận bài không đồng nghĩa công bố điểm. Công bố điểm không tự mở lời giải.</p>{!readOnly && <div className="tw-actions"><button type="submit" className="tw-primary" disabled={busy}>Lưu thiết lập</button><button type="button" disabled={busy} onClick={() => saveSettings({ status: a.status === 'PUBLISHED' ? 'CLOSED' : 'PUBLISHED' })}>{a.status === 'DRAFT' ? 'Phát hành đề cho lớp' : a.status === 'PUBLISHED' ? 'Đóng nhận bài' : 'Mở lại nhận bài'}</button></div>}</form>}
    {student && <ExamResultDialog teacher onClose={() => setStudentId(null)} data={{
      assignmentTitle: student.fullName,
      className: '', score: student.score, submittedAt: student.submittedAt,
      timeSpentSeconds: student.timeSpentSeconds || 0,
      correctCount: questions.filter(q => student.answers.find(x => x.questionId === q.id)?.isCorrect).length,
      totalQuestions: questions.length,
      questions: questions.map(q => {
        const ans = student.answers.find(x => x.questionId === q.id);
        return { ...q, isCorrect: ans?.isCorrect, pointsAwarded: ans?.pointsAwarded || 0,
          response: ans?.response, studentSelectedKey: ans?.selectedOptionKey,
          gradingDetails: ans?.gradingDetails,
          options: (q.options || []).map(o => ({ ...o, key: o.optionKey || o.key })) };
      })
    }}><section className="exam-result-activity"><h3>Nhật ký rời màn hình</h3><p>{student.activity.count} lần · Tổng thời lượng ghi nhận {duration(student.activity.seconds)} · {student.activity.reloads} lần tải lại</p><p className="tw-muted">Trình duyệt ghi nhận trang bị ẩn. Đây là dữ liệu tham khảo, không tự kết luận gian lận. Lượt chưa có thời điểm quay lại được đánh dấu riêng.</p>{student.activity.visits.length > 0 && <details className="exam-result-activity-details"><summary>Xem chi tiết {student.activity.visits.length} lượt ghi nhận</summary>{student.activity.visits.map((v, i) => <div className="tw-history" key={i}><strong>Lần {i + 1}</strong><p>Rời: {date(v.leftAt)} → {v.returnedAt ? date(v.returnedAt) : 'Chưa xác định thời điểm quay lại'}</p><small>{v.seconds == null ? 'Chưa xác định thời lượng' : duration(v.seconds)}</small></div>)}</details>}</section></ExamResultDialog>}
    {question && analytics && <div className="tw-overlay" style={student ? { display: 'none' } : undefined}><div ref={questionDialogRef} tabIndex={-1} className="tw-drawer" role="dialog" aria-modal="true" aria-labelledby="tw-question-title"><div className="tw-section-heading"><h2 id="tw-question-title">Câu {question.orderIndex} · {analytics.accuracyPercentage}% đúng</h2><button aria-label="Đóng chi tiết câu" onClick={() => setQuestionId(null)}><X size={20} /></button></div><MathRenderer content={question.content} /><MathQuestionResult answerKey question={{ ...question, options: question.options.map(o => ({ ...o, key: o.optionKey })) }} /><MathRenderer content={question.explanation || ''} />{!!analytics.distribution.length && <><h3>Phân bố lựa chọn đáp án</h3>{analytics.distribution.map(d => <button className="tw-answer-bar" aria-pressed={group === d.key} key={d.key} onClick={() => setGroup(d.key)}><strong>{d.key}</strong><progress max={Math.max(1, submitted.length)} value={d.count} /><span>{d.count} học sinh</span></button>)}</>}{analytics.statements.map(st => <p key={st.key}>Ý {st.key}: {st.correct}/{submitted.length} trả lời đúng</p>)}{analytics.shortAnswers.map(d => <button className="tw-answer-bar" aria-pressed={group === `SHORT:${d.value}`} key={d.value} onClick={() => setGroup(`SHORT:${d.value}`)}><span>{d.value}</span><span>{d.count} học sinh</span></button>)}<Tabs items={[[ 'ALL', 'Tất cả đã nộp'], ['CORRECT', 'Đúng'], ['WRONG', 'Sai'], ['BLANK', 'Bỏ trống']]} value={group} onChange={setGroup} /><TeacherStudentList key={question.id + group} title="Học sinh trong nhóm câu trả lời" emptyTitle="Nhóm này chưa có học sinh" emptyDescription="Thử nhóm trả lời khác để tiếp tục đối chiếu." students={submitted.filter(r => { const ans = r.answers.find(x => x.questionId === question.id), blank = !ans?.selectedOptionKey && !ans?.response?.shortAnswer?.trim() && !Object.keys(ans?.response?.trueFalseAnswers || {}).length; return group === 'ALL' || (group === 'CORRECT' && ans?.isCorrect) || (group === 'WRONG' && !blank && !ans?.isCorrect) || (group === 'BLANK' && blank) || ans?.selectedOptionKey === group || (group.startsWith('SHORT:') && ans?.response?.shortAnswer?.trim() === group.slice(6)); })} columns={<><th>Học sinh</th><th>Câu trả lời</th><th>Kết quả</th></>} renderRow={r => { const ans = r.answers.find(x => x.questionId === question.id); return <tr key={r.studentId}><td><button onClick={() => setStudentId(r.studentId)}>{r.fullName}</button></td><td>{answerText(question, ans)}</td><td>{ANSWER_STATE_LABELS[answerState({ ...question, ...ans })]}</td></tr>; }} />{!readOnly && <button onClick={() => { setQuestionId(null); setTab('paper'); beginEdit(); }}>Sửa đáp án và tính lại điểm</button>}</div></div>}
  </section>;
}
function answerText(q, ans) { if (q.questionType === 'TRUE_FALSE') return Object.entries(ans?.response?.trueFalseAnswers || {}).map(([key, value]) => `${key}: ${value ? 'Đúng' : 'Sai'}`).join(' · ') || 'Bỏ trống'; return ans?.selectedOptionKey || ans?.response?.shortAnswer || 'Bỏ trống'; }
