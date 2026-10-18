import React, { useEffect, useState } from 'react';
import { TeacherPagination, teacherSearch } from './TeacherListControls';
export default function TeacherStudentList({ students, children, renderRow, columns, title = 'Danh sách học sinh', emptyTitle = 'Lớp chưa có học sinh', emptyDescription = 'Tạo và chia sẻ mã mời để học sinh tham gia lớp.' }) {
 const [query,setQuery]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>setPage(1),[query]);
 const matching=students.filter(s=>teacherSearch(`${s.fullName} ${s.username} ${s.email||''}`).includes(teacherSearch(query)));
 const current=Math.min(page,Math.max(1,Math.ceil(matching.length/10))),rows=matching.slice((current-1)*10,current*10);
 return <section className="tw-surface tw-student-list"><div className="tw-section-heading"><h2>{title}</h2>{children}</div><label className="tw-list-search">Tìm học sinh<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên, tài khoản hoặc email; có thể gõ không dấu"/></label><div className="tw-table-wrap tw-bounded-table" tabIndex={0} aria-label={title}><table><thead><tr>{columns}</tr></thead><tbody>{rows.map(renderRow)}</tbody></table></div>{!rows.length&&<div className="tw-empty"><h3>{students.length?'Không tìm thấy học sinh':emptyTitle}</h3><p>{students.length?'Thử tên khác hoặc xóa tìm kiếm.':emptyDescription}</p>{query&&<button type="button" onClick={()=>setQuery('')}>Xóa tìm kiếm</button>}</div>}<TeacherPagination page={current} total={matching.length} onChange={setPage} label="học sinh"/></section>;
}
