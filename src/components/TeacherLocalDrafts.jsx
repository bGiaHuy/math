import React, { useEffect, useState } from 'react';
import { FileText, ArrowRight } from 'lucide-react';
import { TeacherPagination } from './TeacherListControls';
export function readLocalExamDrafts(storage, userId) {
  const prefix=`exam-source:${userId}:`, drafts=[];
  for(let i=0;i<storage.length;i++){
    const key=storage.key(i);if(!key?.startsWith(prefix))continue;
    const id=key.slice(prefix.length),root=`exam-draft:${userId}:${id}:`;
    try{
      const source=JSON.parse(storage.getItem(key));if(!source||typeof source!=='object')continue;
      const title=JSON.parse(storage.getItem(root+'title')||'null');
      const custom=JSON.parse(storage.getItem(root+'custom')||'[]'),ids=JSON.parse(storage.getItem(root+'ids')||'[]');
      const json=JSON.parse(storage.getItem(root+'json')||'""'),answerRows=JSON.parse(storage.getItem(root+'document-answers')||'[]');
      const manual=JSON.parse(storage.getItem(root+'draft')||'null');
      if ((title !== null && typeof title !== 'string') || !Array.isArray(custom) || !Array.isArray(ids) || !Array.isArray(answerRows) || typeof json !== 'string') continue;
      if(!title?.trim()&&!custom.length&&!ids.length&&!json?.trim()&&!answerRows.length&&!manual?.content?.trim()&&!source.source)continue;
      drafts.push({id,title:title?.trim()||source.source?.assignment?.title||'Đề chưa đặt tên',classId:source.classId,count:custom.length+ids.length});
    }catch{/* A broken draft must not prevent opening other drafts. */}
  }
  return drafts.reverse();
}
export default function TeacherLocalDrafts({userId,classes,onResume}){
 const [drafts,setDrafts]=useState([]),[page,setPage]=useState(1);
 useEffect(()=>{const load=()=>{try{setDrafts(readLocalExamDrafts(localStorage,userId));}catch{setDrafts([]);}};load();window.addEventListener('storage',load);window.addEventListener('focus',load);return()=>{window.removeEventListener('storage',load);window.removeEventListener('focus',load);};},[userId]);
 if(!drafts.length)return null;
 const current=Math.min(page,Math.max(1,Math.ceil(drafts.length/5)));
 return <section className="tw-local-drafts" aria-labelledby="tw-local-drafts-title"><header><div><h2 id="tw-local-drafts-title">Tiếp tục đề đang soạn</h2><p>Bản nháp trên trình duyệt này, chưa được giao cho học sinh.</p></div><span>{drafts.length} bản nháp</span></header>{drafts.slice((current-1)*5,current*5).map(d=><button type="button" key={d.id} onClick={()=>onResume(d.id)}><FileText size={20}/><span><strong>{d.title}</strong><small>{classes.find(c=>c.id===d.classId)?.name||'Cần chọn lớp'} · {d.count} câu đã thêm</small></span><span>Soạn tiếp <ArrowRight size={16}/></span></button>)}{drafts.length>5&&<TeacherPagination page={current} total={drafts.length} pageSize={5} onChange={setPage} label="bản nháp"/>}</section>;
}
