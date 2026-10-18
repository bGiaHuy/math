import React from 'react';
import { ArrowUpRight, Plus, Search, Users } from 'lucide-react';
import { TeacherPagination, teacherSearch } from './TeacherListControls';

export default function TeacherClassDirectory({ classes, assignments, controls, setControls, incomplete, onOpen, onCreate, readOnly, busy }) {
  const { page,query,grade } = controls;
  const setPage=value=>setControls(previous=>({...previous,page:value}));
  const setQuery=value=>setControls(previous=>({...previous,query:value,page:1}));
  const setGrade=value=>setControls(previous=>({...previous,grade:value,page:1}));
  const matching = classes.filter(item => (!grade || String(item.grade) === grade) && teacherSearch(`${item.name} ${item.academicYear}`).includes(teacherSearch(query)));
  const current=Math.min(page,Math.max(1,Math.ceil(matching.length/10)));
  return <section className="tp-class-directory" aria-labelledby="tp-directory-title">
    <header className="tp-directory-heading"><div><h2 id="tp-directory-title">Các lớp phụ trách</h2><p>{classes.length} lớp · Chọn lớp để xem thành viên, bài tập và sổ điểm.</p></div>{!readOnly && <button className="tw-primary" disabled={busy} onClick={onCreate}><Plus size={17} />Tạo lớp</button>}</header>
    <div className="tp-directory-tools"><label><span>Tìm lớp</span><span className="tp-directory-search"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tên lớp hoặc năm học" /></span></label><label><span>Khối</span><select value={grade} onChange={event => setGrade(event.target.value)}><option value="">Tất cả khối</option>{[...new Set(classes.map(item => item.grade))].sort().map(value => <option key={value} value={value}>Khối {value}</option>)}</select></label></div>
    <div className="tp-directory-columns" aria-hidden="true"><span>Lớp học</span><span>Thành viên</span><span>Bài đã giao</span><span /></div>
    {matching.slice((current-1)*10,current*10).map(item => <button className="tp-class-row" key={item.id} onClick={() => onOpen(item.id)} disabled={busy}>
      <span className="tp-class-identity"><span className="tp-class-symbol"><Users size={22} aria-hidden="true" /></span><span><strong>{item.name}</strong><small>Toán {item.grade} · {item.academicYear}{item.isActive === false ? ' · Đã đóng' : ''}</small></span></span>
      <span className="tp-class-count"><strong>{item.studentCount ?? '—'}</strong><small>học sinh</small></span>
      <span className="tp-class-count"><strong>{incomplete ? '—' : assignments.filter(assignment => assignment.classId === item.id && assignment.status !== 'DRAFT').length}</strong><small>{incomplete ? 'chưa tải đủ' : 'bài đã giao'}</small></span>
      <span className="tp-class-open">Mở lớp <ArrowUpRight size={17} aria-hidden="true" /></span>
    </button>)}
    {!matching.length && <div className="tp-directory-empty"><h3>{classes.length ? 'Không có lớp phù hợp' : 'Tạo lớp học đầu tiên'}</h3><p>{classes.length ? 'Thử tên khác hoặc bỏ bộ lọc khối.' : 'Chia sẻ mã mời để học sinh tham gia, sau đó giao bài và theo dõi kết quả.'}</p>{classes.length ? <button onClick={() => { setQuery(''); setGrade(''); }}>Xóa bộ lọc</button> : !readOnly && <button onClick={onCreate} disabled={busy}>Tạo lớp học</button>}</div>}
    {matching.length > 10 && <TeacherPagination page={current} total={matching.length} onChange={setPage} label="lớp" />}
  </section>;
}
