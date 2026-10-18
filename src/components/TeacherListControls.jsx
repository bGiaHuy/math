import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export function TeacherPagination({ page, total, pageSize = 10, onChange, label = 'mục' }) {
  const pages = Math.max(1, Math.ceil(total / pageSize)), current = Math.min(page, pages);
  return <nav className="tw-pagination" aria-label={`Phân trang ${label}`}><span role="status">{total ? `${(current-1)*pageSize+1}–${Math.min(current*pageSize,total)} / ${total} ${label}` : `0 ${label}`}</span><div><button type="button" aria-label={`Trang ${label} trước`} disabled={current<=1} onClick={()=>onChange(current-1)}><ChevronLeft size={16}/></button><span>Trang {current}/{pages}</span><button type="button" aria-label={`Trang ${label} sau`} disabled={current>=pages} onClick={()=>onChange(current+1)}><ChevronRight size={16}/></button></div></nav>;
}
export const teacherSearch = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLocaleLowerCase('vi').trim();

// Use a shorter first page on phones while preserving an explicit teacher choice.
export function useTeacherPageSize() {
 const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:650px)').matches);
 const [chosen,setChosen]=useState(null);
 useEffect(()=>{const media=window.matchMedia('(max-width:650px)'),change=()=>setCompact(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
 return [chosen || (compact ? 5 : 10),setChosen];
}
export function TeacherPageSize({value,onChange,label = 'câu'}) {
 return <label className="tw-page-size">Số {label} mỗi trang<select value={value} onChange={event=>onChange(Number(event.target.value))}>{[5,10,20].map(size=><option key={size} value={size}>{size} {label}</option>)}</select></label>;
}
