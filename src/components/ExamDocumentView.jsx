import React, { useEffect, useState } from 'react';
import { assignmentApi } from '../lib/apiClient';
import './exam-document.css';

export default function ExamDocumentView({ document, children }) {
  const [html, setHtml] = useState(''), [error, setError] = useState('');
  const word = document?.mimeType?.includes('wordprocessingml');
  useEffect(() => {
    let active = true; setHtml(''); setError('');
    if (word && document?.id) assignmentApi.getDocument(document.id).then(d => { if (active) setHtml(d.previewHtml || ''); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [document?.id, word]);
  if (!document) return null;
  const url = assignmentApi.documentFileUrl(document.id);
  return <div className={`exam-document-layout ${children ? '' : 'exam-document-only'}`}>
    <section className="exam-document-source" aria-label="Đề gốc từ tệp">
      <header><strong>{document.fileName}</strong><a href={url} target="_blank" rel="noopener noreferrer">Mở tệp gốc</a></header>
      {error ? <p role="alert">{error}</p> : word ? html ? <iframe title="Nội dung đề Word" sandbox="" srcDoc={`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{font:16px/1.7 Arial,sans-serif;color:#222;padding:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #bbb;padding:6px}p{white-space:pre-wrap}</style></head><body>${html}</body></html>`} /> : <p role="status">Đang tải nội dung Word…</p> : document.mimeType === 'application/pdf' ? <iframe title="Nội dung đề PDF" src={`${url}#toolbar=1&navpanes=0`} /> : <div className="exam-document-image"><img src={url} alt={`Đề gốc: ${document.fileName}`} /></div>}
      {word && <small>Word được chuyển thành bản xem trên web. Xuất PDF nếu cần giữ nguyên bố cục và công thức.</small>}
    </section>
    {children && <aside className="exam-document-answers" aria-label="Phiếu trả lời">{children}</aside>}
  </div>;
}
