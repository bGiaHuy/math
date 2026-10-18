import ExamTopicPicker from './ExamTopicPicker';
import ComposerSupport, { AiQuestionSkeleton } from './ComposerSupport';
import ExamMethodSelector, { EXAM_METHODS } from './ExamMethodSelector';
import { useRouteState, useDraftState } from '../lib/navigationState';
import DocumentExamComposer from './DocumentExamComposer';
import React, { useEffect, useState } from 'react';
import { assignmentApi, curriculumApi } from '../lib/apiClient';
const difficultyLabels = { EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', VERY_HARD: 'Rất khó' };
import MathRenderer from './MathRenderer';
import './TeacherExamComposer.css';

import { QUESTION_LABELS, DEFAULT_QUESTION_COUNTS, types, fresh, getQuestionType, countQuestions, normalizeTeacherQuestion } from './teacherQuestionHelpers';
export { QUESTION_LABELS, DEFAULT_QUESTION_COUNTS, countQuestions } from './teacherQuestionHelpers';
const identity = q => String(q.content || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
function Preview({ question }) {
  const correctOption = question.correctOption || question.options?.find(option => option.isCorrect)?.optionKey || question.options?.find(option => option.isCorrect)?.key;
  return <div className="tec-preview"><MathRenderer content={question.content} />
    {getQuestionType(question) === 'SINGLE_CHOICE' && question.options?.map(o => <div key={o.key || o.optionKey}>{o.key || o.optionKey}. <MathRenderer content={o.content} /></div>)}
    {getQuestionType(question) === 'TRUE_FALSE' && question.statements?.map(s => <div key={s.key}>{s.key}) <MathRenderer content={s.content} /> <strong>{s.isCorrect ? 'Đúng' : 'Sai'}</strong></div>)}
    {question.shortAnswer?.instructions && <p>Hướng dẫn nhập: {question.shortAnswer.instructions}</p>}
    {question.shortAnswer && <p>Đáp án: {question.shortAnswer.acceptedAnswers.join(' hoặc ')}</p>}
    {correctOption && <p>Đáp án: {correctOption}</p>}
    {question.explanation && <div>Lời giải: <MathRenderer content={question.explanation} /></div>}
  </div>;
}
export default function TeacherExamComposer({ draftKey, bank, loading, loadError, counts, setCounts, selectedIds, setSelectedIds, custom, setCustom, onRetry, onSuggestTitle = () => {}, document = null, setDocument = () => {} }) {
  const [skills, setSkills] = useState([]);

  useEffect(() => { curriculumApi.getSkills(9).then(data => setSkills((data.chapters || []).flatMap(c => c.skills.map(s => ({ ...s, chapter: c.chapter }))))).catch(() => setSkills([])); }, []);
  const [tab, setTab] = useRouteState('composerTab', document ? 'document' : 'ai');
  const [selectedMethod, setSelectedMethod] = useRouteState('method', document ? 'document' : 'ai');
  const [methodOpened, setMethodOpened] = useRouteState('methodOpened', true);
  const openMethod = method => { setTab(method); setSelectedMethod(method); setMethodOpened(true); setError(''); };
  const [selectedTopics, setSelectedTopics] = useDraftState((draftKey || 'exam-composer') + ':topics', []);
  const [randomLoading, setRandomLoading] = useState(false);
  const [confirmRandom, setConfirmRandom] = useState(false);
  const [randomNotice, setRandomNotice] = useState('');
  const [questionNotice, setQuestionNotice] = useState('');
  const [draft, setDraft] = useDraftState((draftKey || 'exam-composer') + ':draft', fresh); const [answerText, setAnswerText] = useDraftState((draftKey || 'exam-composer') + ':answerText', ''); const [error, setError] = useState(''); const [json, setJson] = useDraftState((draftKey || 'exam-composer') + ':json', '');
  useEffect(() => { if (error) { setQuestionNotice(''); window.document.querySelector('.tec-error')?.focus(); } }, [error]);
  const [editingId, setEditingId] = useDraftState((draftKey || 'exam-composer') + ':editingId', null);
  const [aiFile, setAiFile] = useState(null); const [aiInstructions, setAiInstructions] = useDraftState((draftKey || 'exam-composer') + ':aiInstructions', ''); const [aiLoading, setAiLoading] = useState(false); const [aiNotice, setAiNotice] = useState('');
  useEffect(() => {
    if (!aiLoading) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [aiLoading]);
  async function generateAi() {
    setError('');
    if (!aiFile) { setError('Hãy chọn tài liệu để tạo đề.'); return; }
    setAiNotice('');
    if (types.every(type => actual[type] >= Number(counts[type]))) { setError('Đề đã đủ câu. Bỏ câu muốn thay trước khi bổ sung từ AI; các câu khác được giữ lại.'); return; }
    setAiLoading(true);
    try {
      const data = new FormData(); data.append('file', aiFile); data.append('counts', JSON.stringify(Object.fromEntries(types.map(t => [t, Math.max(0, Number(counts[t]) - actual[t])])))); data.append('instructions', aiInstructions);
      const result = await assignmentApi.aiPreview(data);
      onSuggestTitle(aiFile.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Đề kiểm tra từ tài liệu');
      const remaining = Object.fromEntries(types.map(type => [type, Number(counts[type]) - actual[type]]));
      const existing = new Set(allSelected.map(identity));
      const additions = result.questions.filter(question => { const type = getQuestionType(question), key = identity(question); if (!remaining[type] || existing.has(key)) return false; remaining[type]--; existing.add(key); return true; });
      if (!additions.length) throw new Error('Không có câu mới phù hợp để bổ sung. Các câu đã chọn vẫn được giữ lại.');
      addQuestions(additions); setAiNotice(`Đã thêm ${additions.length} câu từ AI, giữ nguyên ${allSelected.length} câu đã có. Hãy kiểm tra cấu trúc và đáp án trước khi giao.`);
    } catch (err) { setError(err.message || 'Không thể tạo đề AI.'); } finally { setAiLoading(false); }
  }
  const actual = countQuestions(bank, selectedIds, custom);
  const allSelected = [...selectedIds.map(id => bank.find(q => q.id === id)).filter(Boolean), ...custom].sort((a, b) => types.indexOf(getQuestionType(a)) - types.indexOf(getQuestionType(b)));
  const topics = [...new Map(bank.filter(q => q.skillId || q.skill?.id).map(q => [q.skillId || q.skill.id, { id: q.skillId || q.skill.id, title: q.skill?.title || q.skill?.chapter || 'Chuyên đề', chapter: q.skill?.chapter }])).values()];
  async function randomPreview() {
    setConfirmRandom(false); setError(''); setRandomNotice(''); setRandomLoading(true);
    try {
      if (!selectedTopics.length) throw new Error('Hãy chọn ít nhất một chuyên đề.');
      const result = await assignmentApi.randomPreview({ questionCounts: DEFAULT_QUESTION_COUNTS, skillIds: selectedTopics });
      if (result.questionIds.some(id => !bank.some(q => q.id === id))) throw new Error('Ngân hàng vừa thay đổi. Tải lại ngân hàng rồi lấy đề ngẫu nhiên.');
      if (result.questionIds.length !== 22 || new Set(result.questionIds).size !== 22) throw new Error('Không thể tạo đủ 22 câu khác nhau. Hãy thử lại.');
      setCounts({ ...DEFAULT_QUESTION_COUNTS });
      setCustom([]); setDocument(null); setSelectedIds(result.questionIds); setEditingId(null); setDraft(fresh()); setAnswerText(''); setQuestionNotice('');
      setRandomNotice('Đã tạo đủ 22 câu theo ma trận và chuyên đề đã chọn. Xem đề và đáp án bên dưới, sau đó bấm giao đề cho lớp.');
      window.requestAnimationFrame(() => window.document.querySelector('.tec-selected')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (err) { setError(err.message || 'Không thể lấy đề ngẫu nhiên.'); }
    finally { setRandomLoading(false); }
  }
  function addQuestions(items, { replaceEditing = false } = {}) {
    const normalized = items.map(normalizeTeacherQuestion); const existing = new Set(allSelected.filter(q => !replaceEditing || q.id !== editingId).map(identity)); const added = { ...actual }; const edited = replaceEditing && custom.find(q => q.id === editingId); if (edited) added[edited.questionType]--;
    normalized.forEach(q => { if (existing.has(identity(q))) throw new Error('Câu hỏi bị trùng nội dung trong đề.'); existing.add(identity(q)); if (++added[q.questionType] > Number(counts[q.questionType])) throw new Error(`Đã đủ số câu ${QUESTION_LABELS[q.questionType]}. Tăng số lượng trước khi thêm.`); });
    setCustom(prev => [...prev.filter(q => !replaceEditing || q.id !== editingId), ...normalized.map(q => ({ ...q, id: `custom_${crypto.randomUUID()}` }))]); if (replaceEditing) setEditingId(null); setQuestionNotice(edited ? 'Đã lưu chỉnh sửa câu trong đề.' : `Đã thêm ${normalized.length} câu vào đề. Các câu đã có được giữ lại.`);
  }
  return <section className="tec" aria-label="Cấu trúc và câu hỏi của đề">
    <div className="tec-main"><fieldset disabled={aiLoading || randomLoading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <ExamMethodSelector selected={selectedMethod} onSelect={method => { if (methodOpened) openMethod(method); else setSelectedMethod(method); }} onContinue={() => openMethod(selectedMethod)} questionCount={allSelected.length} opened={methodOpened && tab === selectedMethod} />
    {methodOpened && <div className="tec-method-workspace-heading"><h3>{EXAM_METHODS.find(method => method.id === tab)?.title}</h3><span>{allSelected.length} câu trong đề</span></div>}

    {questionNotice && <p className="tw-notice" role="status">{questionNotice}</p>}
    {error && <p role="alert" tabIndex={-1} className="tec-error">{error}</p>}
    {methodOpened && tab === 'ai' && <fieldset className="tec-counts"><legend>Số câu muốn tạo</legend>{types.map(type => <label key={type}>{QUESTION_LABELS[type]}<input type="number" min="0" max="40" value={counts[type]} onChange={event => setCounts(prev => ({ ...prev, [type]: Math.max(0, Math.min(40, Math.floor(Number(event.target.value)))) }))} /></label>)}</fieldset>}
    {methodOpened && tab === 'bank' && <div className="tec-bank-workspace">
      <p className="tec-bank-intro">Chọn chuyên đề, hệ thống sẽ tự soạn toàn bộ đề 22 câu từ ngân hàng để thầy cô xem lại trước khi giao cho lớp.</p>
      <fieldset className="tec-counts"><legend>Ma trận đề 22 câu</legend><p>12 câu nhiều lựa chọn · 4 câu đúng / sai · 6 câu trả lời ngắn.</p><p>9 câu Dễ · 7 câu Trung bình · 4 câu Khó · 2 câu Rất khó.</p></fieldset>
      <ExamTopicPicker topics={topics} selected={selectedTopics} onChange={value => { setSelectedTopics(value); setRandomNotice(''); }} />
      <div className="tec-random"><button type="button" disabled={loading || !!loadError || randomLoading || !selectedTopics.length} onClick={() => allSelected.length || document ? setConfirmRandom(true) : randomPreview()}>{randomLoading ? 'Đang soạn đủ 22 câu…' : 'Lấy đề ngẫu nhiên từ ngân hàng'}</button><small>Mỗi lần tạo sẽ thay toàn bộ câu trong bản đề hiện tại. Chỉ lấy câu thuộc chuyên đề đã chọn và đúng ma trận; nếu ngân hàng chưa đủ, hệ thống sẽ báo để chọn thêm chuyên đề. Đề chỉ được gửi khi thầy cô bấm giao cho lớp.</small></div>
      {confirmRandom && <div className="document-change-confirm" role="group" aria-label="Xác nhận thay đề hiện tại"><strong>Thay toàn bộ đề hiện tại?</strong><p>{allSelected.length} câu đã chọn{document ? ' và tài liệu đính kèm' : ''} sẽ được thay khi tạo thành công. Nếu có lỗi, đề hiện tại vẫn được giữ.</p><div className="tw-actions"><button type="button" onClick={() => setConfirmRandom(false)}>Giữ đề hiện tại</button><button type="button" onClick={randomPreview}>Tạo đề mới và thay thế</button></div></div>}
      {randomLoading && <p role="status">Đang chọn câu hỏi theo ma trận và kiểm tra đề…</p>}
      {randomNotice && <p className="tw-notice" role="status">{randomNotice}</p>}
      {loading ? <p role="status">Đang tải ngân hàng câu hỏi…</p> : loadError ? <div role="alert"><p>{loadError}</p><button type="button" onClick={onRetry}>Tải lại ngân hàng</button></div> : !selectedTopics.length && <p>Chọn ít nhất một chuyên đề để tạo đề.</p>}
    </div>}
    {methodOpened && tab === 'document' && <DocumentExamComposer draftKey={draftKey} counts={counts} document={document} setDocument={setDocument} custom={custom} selectedIds={selectedIds} setCustom={setCustom} setSelectedIds={setSelectedIds} />}
    {methodOpened && tab === 'ai' && <div className="tec-author">{aiNotice && <p className="tw-notice" role="status">{aiNotice}</p>}<p>PDF, Word hoặc PowerPoint · tối đa 10 MB · tạo câu hỏi theo tài liệu và phân loại Dễ, Trung bình, Khó, Rất khó.</p><label>Tài liệu nguồn<input type="file" accept=".pdf,.docx,.pptx" disabled={aiLoading} onChange={e => { const file = e.target.files?.[0]; setAiFile(null); if (file && file.size > 10 * 1024 * 1024) setError('Tệp tối đa 10 MB.'); else { setAiFile(file || null); if (file) onSuggestTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Đề kiểm tra từ tài liệu'); setError(''); } }} /></label><label>Yêu cầu thêm<textarea maxLength={3000} disabled={aiLoading} value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} placeholder="Ví dụ: Chỉ tạo câu về phương trình bậc hai trong tài liệu, dùng bối cảnh gần gũi học sinh." /></label><small>Tài liệu được gửi đến dịch vụ AI. Kiểm tra câu hỏi và đáp án trước khi giao.</small><details><summary>Lưu ý về tài liệu và bản nháp</summary><p>Chấp nhận tài liệu mọi môn, kể cả Database Systems. AI giữ nội dung môn học, không yêu cầu ma trận Toán. Độ khó được đánh giá riêng cho từng câu. Tệp scan cần nhận dạng chữ trước. Bản nháp lưu trên trình duyệt; sau khi tải lại cần chọn lại tệp. Yêu cầu AI đang chạy không tiếp tục sau khi tải lại.</p></details><button type="button" disabled={aiLoading || !aiFile} onClick={generateAi}>{aiLoading ? 'AI đang đọc tài liệu và tạo đề…' : 'Tạo đề từ tài liệu'}</button><AiQuestionSkeleton loading={aiLoading} /></div>}
    {methodOpened && tab === 'manual' && <div className="tec-author"><div className="tec-upload-strip"><button className="tec-upload-button" type="button" onClick={() => { openMethod('document'); }}>Tải đề PDF / Word / Ảnh</button><p>Hiển thị đề gốc ở vùng chính, câu hỏi và ô trả lời ở thanh bên phải.</p></div>{editingId && <p>Đang sửa câu đã chọn. <button type="button" onClick={() => { setEditingId(null); setDraft(fresh()); setAnswerText(''); }}>Hủy chỉnh sửa</button></p>}<div className="tec-filters"><label>Loại câu<select value={draft.questionType} onChange={e => { setDraft(fresh(e.target.value)); setAnswerText(''); setError(''); }}>{types.map(t => <option key={t} value={t}>{QUESTION_LABELS[t]}</option>)}</select></label><label>Chuyên đề kiến thức<select aria-label="Chuyên đề câu tự soạn" value={draft.skillId || ''} onChange={e => setDraft({ ...draft, skillId: e.target.value })}><option value="">Không phân loại chuyên đề (tùy chọn)</option>{skills.map(s => <option key={s.id} value={s.id}>{s.chapter} · {s.title}</option>)}</select></label><label>Mức độ<select value={draft.cognitiveLevel} onChange={e => setDraft({ ...draft, cognitiveLevel: e.target.value })}><option value="REMEMBERING">Nhận biết</option><option value="UNDERSTANDING">Thông hiểu</option><option value="APPLYING">Vận dụng</option><option value="ADVANCED_APPLYING">Vận dụng cao</option></select></label><label>Độ khó<select aria-label="Độ khó câu tự soạn" value={draft.difficulty || ''} onChange={e => setDraft({ ...draft, difficulty: e.target.value })}><option value="">Chọn độ khó</option>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label>Nội dung câu hỏi<textarea value={draft.content} onChange={e => setDraft({ ...draft, content: e.target.value })} placeholder="Dùng $...$ cho công thức toán" /></label>
      {draft.questionType === 'SINGLE_CHOICE' && <fieldset><legend>Bốn phương án (chọn đáp án đúng)</legend>{draft.options.map((o, index) => <label className="tec-answer-row tec-answer-choice" key={o.key}><input aria-label={`Đáp án đúng ${o.key}`} type="radio" name="manual-correct" checked={draft.correctOption === o.key} onChange={() => setDraft({ ...draft, correctOption: o.key })} /><span>{o.key}</span><input aria-label={`Nội dung phương án ${o.key}`} value={o.content} onChange={e => setDraft({ ...draft, options: draft.options.map((option, i) => i === index ? { ...option, content: e.target.value } : option) })} /></label>)}</fieldset>}
      {draft.questionType === 'TRUE_FALSE' && <fieldset><legend>Bốn ý đúng/sai</legend>{draft.statements.map((s, index) => <div className="tec-answer-row tec-answer-boolean" key={s.key}><span>{s.key})</span><input aria-label={`Nội dung ý ${s.key}`} value={s.content} onChange={e => setDraft({ ...draft, statements: draft.statements.map((item, i) => i === index ? { ...item, content: e.target.value } : item) })} /><select aria-label={`Đáp án ý ${s.key}`} value={String(s.isCorrect)} onChange={e => setDraft({ ...draft, statements: draft.statements.map((item, i) => i === index ? { ...item, isCorrect: e.target.value === 'true' } : item) })}><option value="true">Đúng</option><option value="false">Sai</option></select></div>)}</fieldset>}
      {draft.questionType === 'SHORT_ANSWER' && <fieldset><legend>Đáp án và cách chấm</legend><label>Hướng dẫn cách nhập câu trả lời<textarea maxLength={1000} value={draft.shortAnswer.instructions || ''} onChange={e => setDraft({ ...draft, shortAnswer: { ...draft.shortAnswer, instructions: e.target.value } })} placeholder="Ví dụ: Nhập số làm tròn đến 2 chữ số thập phân, không ghi đơn vị; phần trăm nhập 25, không ghi %. Văn bản: ghi rõ số từ/ký tự." /></label><label>Cách chấm<select value={draft.shortAnswer.mode} onChange={e => setDraft({ ...draft, shortAnswer: { ...draft.shortAnswer, mode: e.target.value } })}><option value="NUMERIC">Giá trị số hoặc phân số</option><option value="TEXT">Văn bản</option></select></label><label>Đáp án chấp nhận (mỗi dòng một đáp án)<textarea value={answerText} onChange={e => setAnswerText(e.target.value)} /></label>{draft.shortAnswer.mode === 'NUMERIC' ? <label>Sai số tuyệt đối<input type="number" min="0" step="any" value={draft.shortAnswer.tolerance} onChange={e => setDraft({ ...draft, shortAnswer: { ...draft.shortAnswer, tolerance: Number(e.target.value) } })} /><small>Nhận dấu phẩy, dấu chấm và phân số a/b. Không nhập đơn vị.</small></label> : <label><input type="checkbox" checked={draft.shortAnswer.caseSensitive} onChange={e => setDraft({ ...draft, shortAnswer: { ...draft.shortAnswer, caseSensitive: e.target.checked } })} /> Phân biệt chữ hoa / thường</label>}</fieldset>}
      <label>Lời giải<textarea value={draft.explanation} onChange={e => setDraft({ ...draft, explanation: e.target.value })} /></label>{draft.content && <details><summary>Xem trước</summary><Preview question={draft.questionType === 'SHORT_ANSWER' ? { ...draft, shortAnswer: { ...draft.shortAnswer, acceptedAnswers: answerText.split('\n').map(a => a.trim()).filter(Boolean) } } : draft} /></details>}<button type="button" onClick={() => { try { setError(''); if (!draft.difficulty) throw new Error('Chọn độ khó cho câu hỏi.'); if (draft.questionType === 'SHORT_ANSWER' && !draft.shortAnswer.instructions?.trim()) throw new Error('Hãy ghi hướng dẫn định dạng trả lời: số chữ, dấu %, đơn vị và làm tròn nếu có.'); addQuestions([{ ...draft, shortAnswer: { ...draft.shortAnswer, acceptedAnswers: answerText.split('\n').map(a => a.trim()).filter(Boolean) } }], { replaceEditing: true }); setDraft(fresh(draft.questionType)); setAnswerText(''); } catch (err) { setError(err.message); } }}>{editingId ? 'Lưu chỉnh sửa câu' : 'Thêm câu vào đề'}</button></div>}
    {methodOpened && tab === 'json' && <div className="tec-author"><p>Nhập đối tượng có mảng questions theo ba loại câu. Nội dung và đáp án sẽ được kiểm tra trước khi thêm.</p><details><summary>Xem cấu trúc mẫu ba loại</summary><pre>{JSON.stringify({ questions: [normalizeTeacherQuestion({ ...fresh(), content: '2 + 2 = ?', options: ['3', '4', '5', '6'].map((content, i) => ({ key: 'ABCD'[i], content })), correctOption: 'B' }), { questionType: 'TRUE_FALSE', content: 'Xét các khẳng định', statements: ['a', 'b', 'c', 'd'].map(key => ({ key, content: 'Nội dung ý', isCorrect: true })) }, { questionType: 'SHORT_ANSWER', content: 'Tính 1/2', shortAnswer: { mode: 'NUMERIC', acceptedAnswers: ['1/2'], tolerance: 1e-9 } }] }, null, 2)}</pre></details><label>Dữ liệu JSON<textarea rows="8" value={json} onChange={e => setJson(e.target.value)} /></label><button type="button" onClick={() => { try { setError(''); const data = JSON.parse(json.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('Cần mảng questions không rỗng.'); addQuestions(data.questions); setJson(''); } catch (err) { setError(err.message); } }}>Kiểm tra và thêm câu</button></div>}
    {allSelected.length > 0 && <div className="tec-selected"><h4>{tab === 'bank' ? 'Xem trước đề đã tạo' : 'Câu đã chọn / soạn'} ({allSelected.length} câu)</h4>{allSelected.map((q, i) => <details key={q.id} open={tab === 'bank' && i === 0 ? true : undefined}><summary>Câu {i + 1} · {QUESTION_LABELS[getQuestionType(q)]}</summary><Preview question={q} />{q.id.startsWith('custom_') && <div className="tec-filters"><label>Chuyên đề kiến thức<select aria-label={`Chuyên đề câu ${i + 1}`} value={q.skillId || ''} onChange={e => setCustom(rows => rows.map(row => row.id === q.id ? { ...row, skillId: e.target.value } : row))}><option value="">Không phân loại chuyên đề (tùy chọn)</option>{skills.map(s => <option key={s.id} value={s.id}>{s.chapter} · {s.title}</option>)}</select></label><label>Độ khó<select aria-label={`Độ khó câu ${i + 1}`} value={q.difficulty || ''} onChange={e => setCustom(rows => rows.map(row => row.id === q.id ? { ...row, difficulty: e.target.value } : row))}><option value="">Chọn độ khó</option>{Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{(!q.difficulty) && <p role="status">Chuyên đề là tùy chọn. Cần chọn độ khó trước khi lưu đề.</p>}</div>}{q.id.startsWith('custom_') && <button type="button" onClick={() => { setDraft({ ...fresh(q.questionType), ...q }); setAnswerText(q.shortAnswer?.acceptedAnswers?.join('\n') || ''); setEditingId(q.id); openMethod('manual'); }}>Chỉnh sửa câu</button>}{tab !== 'bank' && <button type="button" onClick={() => q.id.startsWith('custom_') ? setCustom(prev => prev.filter(item => item.id !== q.id)) : setSelectedIds(prev => prev.filter(id => id !== q.id))}>Bỏ câu khỏi đề</button>}</details>)}</div>}
    </fieldset></div><ComposerSupport counts={counts} skills={skills} actual={actual} questions={allSelected.map(q => ({ ...q, skill: q.skill || skills.find(s => s.id === q.skillId) }))} />
  </section>;
}
