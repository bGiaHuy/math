import React,{useId,useState} from 'react';
import {chapterCompetency} from '../lib/mathCompetency';
import './math-competency-radar.css';

function shortLines(value){const words=value.split(/\s+/),lines=[''];for(const word of words){const i=lines.length-1;if(lines[i]&&(lines[i]+' '+word).length>19)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;}return lines.slice(0,2).map((s,i)=>i===1&&lines.length>2?s.replace(/.$/,'…'):s);}
export default function MathCompetencyRadar({skills,target,onChapter}){
 const id=useId(),groups=chapterCompetency(skills),[selected,setSelected]=useState('');
 if(!groups.length)return null;
 const shown=groups;
 const current=shown.find(g=>g.chapter===selected)||shown[0];
 const count=Math.max(3,shown.length),point=(i,r)=>{const a=(i*360/count-90)*Math.PI/180;return [250+Math.cos(a)*r,230+Math.sin(a)*r];};
 const polygon=r=>Array.from({length:count},(_,i)=>point(i,r).join(',')).join(' ');
 const measured=shown.flatMap((g,i)=>g.score===null?[]:[{...g,p:point(i,g.score*1.35)}]);
 return <section className="math-competency-radar math-radar-v2" aria-labelledby={id}>
  <header className="math-radar-heading"><div><h4 id={id}>Bản đồ năng lực của bạn</h4><p>Chọn chương để xem kết quả và mức độ đánh giá.</p></div><span className="math-radar-badge">{groups.filter(g=>g.score!==null).length} / {groups.length} chương có dữ liệu</span></header>
  <div className={shown.length>6?"math-radar-layout math-radar-many":"math-radar-layout"}><div className="math-radar-figure"><svg viewBox="0 0 500 470" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
   <title id={`${id}-title`}>Năng lực Toán theo chương</title><desc id={`${id}-desc`}>{shown.map(g=>g.chapter+': '+(g.score===null?'chưa đánh giá':g.score+'% trung bình, '+g.assessed+'/'+g.total+' kỹ năng có dữ liệu')).join('; ')}. Các điểm có dữ liệu được nối để dễ quan sát; trục trống không có nghĩa là điểm 0.</desc>
   <polygon points={polygon(135)} fill="#fffdf9"/>{[20,40,60,80,100].map(v=><polygon key={v} points={polygon(v*1.35)} fill="none" stroke={v===100?"#4b3929":"#9b856d"} strokeWidth={v===100?3.5:1.6}/>)}
   <polygon points={polygon(target*1.35)} fill="none" stroke="#a8792b" strokeDasharray="5 5"/>
   {shown.map((g,i)=>{const edge=point(i,135);return <line key={g.chapter} x1="250" y1="230" x2={edge[0]} y2={edge[1]} stroke="#534334" strokeWidth="2.5"/>;})}
   {measured.length>=3&&<polygon points={measured.map(g=>g.p.join(',')).join(' ')} fill="#edaa5955" stroke="#d47d2c" strokeWidth="3" strokeLinejoin="round"/>}
   {measured.length===2&&<line x1={measured[0].p[0]} y1={measured[0].p[1]} x2={measured[1].p[0]} y2={measured[1].p[1]} stroke="#d47d2c" strokeWidth="3"/>}
   {measured.map(g=><g key={g.chapter}><title>{g.chapter}: {g.score}%</title>{current.chapter===g.chapter&&<circle cx={g.p[0]} cy={g.p[1]} r="11" fill="#f5d681"/>}<circle cx={g.p[0]} cy={g.p[1]} r="5.5" fill="#534334" stroke="#fff" strokeWidth="2"/></g>)}
   {shown.map((g,i)=>{const pos=point(i,192),lines=shortLines(g.chapter);if(shown.length>6)return <g key={g.chapter}><title>{g.chapter}: {g.score===null?"Chưa đánh giá":g.score+"%"}</title><circle cx={pos[0]} cy={pos[1]} r="14" fill={g.chapter===current.chapter?"#f5d681":"#fffcf6"} stroke="#534334" strokeWidth="1.8"/><text x={pos[0]} y={pos[1]+4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#352a20">{i+1}</text></g>;return <g key={g.chapter}><title>{g.chapter}</title><rect x={pos[0]-74} y={pos[1]-24} width="148" height="48" rx="24" fill={g.chapter===current.chapter?'#f5d681':'#fffcf6'} stroke="#534334" strokeWidth="2.5"/><text x={pos[0]} y={pos[1]+(lines.length===1?4:-4)} textAnchor="middle" fontSize="12" fontWeight="700" fill="#352a20">{lines.map((line,n)=><tspan key={n} x={pos[0]} dy={n?15:0}>{line}</tspan>)}</text><text x={pos[0]} y={pos[1]+43} textAnchor="middle" fontSize="12" fill="#725136">{g.score===null?'Chưa đánh giá':g.score+'%'}</text></g>;})}
  </svg><p className="math-radar-legend">Vòng trong → ngoài: 20 · 40 · 60 · 80 · 100%. Vạch đứt: mục tiêu {target}%.</p></div>
  <div className="math-radar-side"><div className="math-radar-tabs" aria-label="Chọn chương để xem chi tiết">{shown.map(g=><button key={g.chapter} type="button" aria-pressed={current.chapter===g.chapter} onClick={()=>setSelected(g.chapter)}><strong>{shown.length>6?shown.indexOf(g)+1+". ":""}{g.chapter}</strong><span>{g.score===null?'Chưa có dữ liệu':g.score+'%'}</span></button>)}</div><div className="math-radar-detail" aria-live="polite"><div><h5>{current.chapter}</h5><strong>{current.score===null?'—':current.score+'%'}</strong></div><p>{current.score===null?'Chưa có dữ liệu đánh giá chương này.':'Trung bình các kỹ năng đã có dữ liệu trong chương.'}</p><p>{current.assessed}/{current.total} kỹ năng có dữ liệu · {current.confirmed}/{current.total} kỹ năng đủ bằng chứng.</p>{current.assessed>0&&current.confirmed<current.total&&<p className="math-radar-provisional">Kết quả còn tạm tính hoặc chưa bao phủ toàn bộ chương.</p>}<button type="button" onClick={()=>onChapter(current.chapter)}>Xem kỹ năng trong chương →</button></div></div></div>
  <p className="math-radar-footnote">Phần trống là chưa đánh giá, không phải 0 điểm. Diện tích vùng tô không phải điểm năng lực tổng hợp.</p>
 </section>;
}
