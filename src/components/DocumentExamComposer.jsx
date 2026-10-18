import { useDraftState } from '../lib/navigationState';
import React, { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { assignmentApi } from '../lib/apiClient';
import ExamDocumentView from './ExamDocumentView';
import { normalizeTeacherQuestion, QUESTION_LABELS } from './teacherQuestionHelpers';

function createSheet(counts) {
  const rows = []; let number = 0;
  for (const type of Object.keys(QUESTION_LABELS)) for (let i = 0; i < Number(counts[type]); i++) {
    const index = ++number;
    rows.push({ id: `custom_document_${crypto.randomUUID()}`, questionType: type, content: `Câu ${index} trong đề gốc.`, cognitiveLevel: 'REMEMBERING', difficulty: 'EASY', explanation: '',
      ...(type === 'SINGLE_CHOICE' ? { options: ['A','B','C','D'].map(key => ({ key, content: key })), correctOption: '' } : type === 'TRUE_FALSE' ? { statements: ['a','b','c','d'].map(key => ({ key, content: `Ý ${key} trong câu ${index} của đề gốc.`, isCorrect: null })) } : { shortAnswer: { mode: 'NUMERIC', acceptedAnswers: [], tolerance: 1e-9, instructions: 'Nhập số hoặc phân số, không kèm đơn vị hay ký hiệu %.', caseSensitive: false } }) });
  }
  return rows;
}
export default function DocumentExamComposer({ draftKey, counts, document, setDocument, custom, selectedIds, setCustom, setSelectedIds }) {
  const input = useRef(null);
  const [rows, setRows, draftError] = useDraftState(draftKey + ':document-answers', () => custom.filter(q => q.id?.startsWith('custom_document_')));
  const [pendingFile, setPendingFile] = useState(null), [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function upload(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Tệp tối đa 10 MB.'); if (input.current) input.current.value = ''; return; }
    if (!/\.(pdf|docx|png|jpe?g|webp)$/i.test(file.name)) { setError('Chọn tệp PDF, DOCX, PNG, JPEG hoặc WebP.'); if (input.current) input.current.value = ''; return; }
    setBusy(true); setError(''); setNotice('');
    try { const data = new FormData(); data.append('file', file); const r = await assignmentApi.uploadDocument(data); setDocument(r.document); setRows([]); setPendingFile(null); setNotice('Đã tải đề. Tạo phiếu trả lời và nhập đáp án cho tệp mới.'); setCustom(current => current.filter(q => !q.id.startsWith('custom_document_'))); }
    catch (e) { setError(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  function chooseFile(file) {
    if (!file) return;
    if (document && rows.length) { setPendingFile(file); setError(''); if (input.current) input.current.value = ''; return; }
    upload(file);
  }
  function change(index, patch) { setCustom(current => current.filter(q => !q.id.startsWith('custom_document_'))); setRows(current => current.map((q, i) => i === index ? { ...q, ...patch } : q)); setNotice('Đáp án đang chỉnh sửa. Bấm “Áp dụng phiếu trả lời” trước khi tiếp tục.'); }
  function initialize() {
    const n = Object.values(counts).reduce((n, v) => n + Number(v), 0);
    if (!n || n > 200 || Object.values(counts).some(v => v === '' || !Number.isInteger(Number(v)) || Number(v) < 0)) { setError('Chọn tổng từ 1 đến 200 câu với số lượng nguyên không âm.'); return; }
    setCustom(current => current.filter(q => !q.id.startsWith('custom_document_'))); setRows(createSheet(counts)); setConfirmReset(false); setError(''); setNotice('Nhập đáp án đúng cho từng câu rồi áp dụng phiếu trả lời.');
  }
  function apply() {
    setError('');
    try {
      if (Object.keys(QUESTION_LABELS).some(type => rows.filter(q => q.questionType === type).length !== Number(counts[type]))) throw new Error('Số câu đã thay đổi. Tạo lại phiếu trả lời theo số lượng mới.');
      if (!rows.length) throw new Error('Tạo phiếu trả lời trước.');
      const questions = rows.map((q, i) => { try { return { ...normalizeTeacherQuestion(q), id: q.id }; } catch { throw new Error(`Câu ${i + 1}: hãy nhập đủ đáp án hợp lệ.`); } });
      if (selectedIds.length || custom.some(q => !q.id.startsWith('custom_document_'))) throw new Error('Đề đang có câu từ nguồn khác. Bỏ các câu đó trước khi áp dụng phiếu trả lời từ tệp.');
      setSelectedIds([]); setCustom(questions); setNotice(`Đã áp dụng ${questions.length} câu và đáp án. Có thể tiếp tục thiết lập giao bài.`);
    } catch (e) { setError(e.message); }
  }
  return <section className="tec-document-workspace" aria-label="Đề gốc và phiếu đáp án">{draftError && <p role="alert">{draftError}</p>}<p>Tải đề dành cho học sinh, không chứa đáp án/lời giải. Đề gốc hiển thị ở vùng chính; phiếu trả lời nằm bên phải khi làm bài.</p><div className="document-upload-actions"><input ref={input} type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" aria-label="Tải đề gốc PDF Word hoặc ảnh" hidden onChange={e => chooseFile(e.target.files?.[0])} /><button type="button" disabled={busy} onClick={() => input.current?.click()}><Upload size={17} />{busy ? 'Đang tải đề…' : document ? 'Thay tệp đề gốc' : 'Tải đề PDF / Word / Ảnh'}</button>{document && <><span className="document-upload-name">{document.fileName}</span><button type="button" disabled={busy} onClick={() => setDocument(null)} aria-label="Bỏ tệp đề gốc"><X size={16} /></button></>}</div><small>PDF, DOCX, PNG, JPEG, WebP · Tối đa 10 MB. Dùng PDF để giữ bố cục toán và hình vẽ chính xác.</small>{pendingFile && <section className="document-change-confirm" aria-label="Xác nhận thay đề gốc"><h3>Thay tệp đề gốc?</h3><p>Thay bằng “{pendingFile.name}” sẽ xóa phiếu đáp án của tệp hiện tại sau khi tải thành công. Nếu tải lỗi, đề và đáp án hiện tại được giữ lại.</p><div className="tw-actions"><button type="button" disabled={busy} onClick={() => setPendingFile(null)}>Giữ đề hiện tại</button><button type="button" disabled={busy} onClick={() => upload(pendingFile)}>Thay tệp và tạo lại phiếu</button></div></section>}{error && <p className="tec-error" role="alert">{error}</p>}{notice && <p className="tw-notice" role="status">{notice}</p>}{document && <ExamDocumentView document={document}><h3>Đáp án để hệ thống chấm</h3><p className="document-key-note">Số câu lấy từ cấu trúc đề phía trên. Câu hỏi theo thứ tự ba phần: lựa chọn, đúng/sai, trả lời ngắn.</p><button type="button" disabled={busy} onClick={() => rows.length ? setConfirmReset(true) : initialize()}>{rows.length ? 'Tạo lại phiếu theo số câu' : 'Tạo phiếu trả lời'}</button>{confirmReset && <section className="document-change-confirm" aria-label="Xác nhận tạo lại phiếu"><p>Tạo lại phiếu sẽ xóa các đáp án đang nhập. Chỉ tiếp tục nếu muốn nhập lại theo số câu hiện tại.</p><div className="tw-actions"><button type="button" onClick={() => setConfirmReset(false)}>Giữ đáp án</button><button type="button" onClick={initialize}>Xác nhận tạo lại phiếu</button></div></section>}{rows.map((q, i) => <div className="document-answer-question" key={q.id}><strong>Câu {i + 1} · {QUESTION_LABELS[q.questionType]}</strong>{q.questionType === 'SINGLE_CHOICE' ? <div className="document-key-choice">{['A','B','C','D'].map(key => <label key={key}><input type="radio" name={`document-key-${q.id}`} aria-label={`Đáp án ${key} câu ${i + 1}`} checked={q.correctOption === key} onChange={() => change(i, { correctOption: key })} />{key}</label>)}</div> : q.questionType === 'TRUE_FALSE' ? <div className="document-key-tf">{q.statements.map((st, j) => <label key={st.key}>Ý {st.key}<select value={st.isCorrect === null ? '' : String(st.isCorrect)} onChange={e => change(i, { statements: q.statements.map((x, k) => k === j ? { ...x, isCorrect: e.target.value === '' ? null : e.target.value === 'true' } : x) })}><option value="">Chọn đáp án</option><option value="true">Đúng</option><option value="false">Sai</option></select></label>)}</div> : <><label>Cách chấm<select value={q.shortAnswer.mode} onChange={e => change(i, { shortAnswer: { ...q.shortAnswer, mode: e.target.value } })}><option value="NUMERIC">Số / Phân số</option><option value="TEXT">Văn bản</option></select></label><label>Đáp án (mỗi dòng một đáp án)<textarea value={q.shortAnswer.acceptedAnswers.join('\n')} onChange={e => change(i, { shortAnswer: { ...q.shortAnswer, acceptedAnswers: e.target.value.split('\n') } })} /></label><label>Hướng dẫn nhập<textarea value={q.shortAnswer.instructions} onChange={e => change(i, { shortAnswer: { ...q.shortAnswer, instructions: e.target.value } })} /></label></>}</div>)}{!!rows.length && <button type="button" className="tw-primary" onClick={apply}>Áp dụng phiếu trả lời</button>}</ExamDocumentView>}</section>;
}
