import React, { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle, AlertCircle, Loader2, ArrowRight, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import MathRenderer from './MathRenderer';
import MathQuestionResponse, { isQuestionAnswered, MathQuestionResult, QUESTION_TYPE_LABELS, toAssignmentAnswers, fromAssignmentAnswers } from './MathQuestionResponse';
import { diagnosticApi } from '../lib/apiClient';

const TYPE_ORDER = ['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'];
const SECTION_TITLES = { SINGLE_CHOICE: 'Phần I — Trắc nghiệm nhiều lựa chọn', TRUE_FALSE: 'Phần II — Trắc nghiệm đúng / sai', SHORT_ANSWER: 'Phần III — Trả lời ngắn' };
const formatTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
export default function DiagnosticTest({ onFinishTest, onPauseTest }) {
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [mode, setMode] = useState('focus');
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [completedResult, setCompletedResult] = useState(null);
  const answersRef = useRef({});
  const deadlineRef = useRef(null);
  const saveChainRef = useRef(Promise.resolve());
  const lockRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const submitRef = useRef(null);

  const save = async () => {
    const payload = { attemptId: attempt.attemptId, answers: toAssignmentAnswers(answersRef.current) };
    const operation = saveChainRef.current.catch(() => {}).then(() => diagnosticApi.saveDraft(payload));
    saveChainRef.current = operation;
    await operation;
  };
  const start = async () => {
    setLoading(true); setError('');
    try {
      const data = await diagnosticApi.startAttempt();
      const questions = [...(data.questions || [])].sort((a, b) => TYPE_ORDER.indexOf(a.questionType || 'SINGLE_CHOICE') - TYPE_ORDER.indexOf(b.questionType || 'SINGLE_CHOICE'));
      if (!questions.length) throw new Error('Ngân hàng chưa có đủ câu hỏi cho bài kiểm tra đầu vào.');
      const restored = fromAssignmentAnswers(data.draftAnswers);
      answersRef.current = restored;
      setAnswers(restored); setIndex(0);
      setRemaining(data.timeRemainingSeconds ?? data.timeLimitSeconds ?? 2700);
      deadlineRef.current = Date.now() + (data.timeRemainingSeconds ?? data.timeLimitSeconds ?? 2700) * 1000;
      autoSubmittedRef.current = false;
      setAttempt({ ...data, questions });
      setSaveStatus(data.isResumed ? 'Đã khôi phục bài và đáp án đã lưu' : 'Câu trả lời được lưu tự động');
    } catch (err) { setError(err.message || 'Không thể mở bài kiểm tra.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    diagnosticApi.getLatestState().then(async data => {
      if (!active) return;
      if (data.status === 'COMPLETED') setCompletedResult(data.result);
      else if (data.status === 'IN_PROGRESS') await start();
    }).catch(err => { if (active) setError(err.message || 'Không thể tải bài đã lưu.'); })
      .finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, []);
  const changeAnswer = (questionId, value) => {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next; setAnswers(next);
  };
  const submit = async (automatic = false) => {
    if (!attempt || lockRef.current) return;
    lockRef.current = true; setSubmitting(true); setError('');
    try {
      try { await save(); } catch (err) { if (!automatic) throw err; }
      await diagnosticApi.submitAttempt(attempt.attemptId);
      const results = await diagnosticApi.getAttemptResult(attempt.attemptId);
      setCompletedResult(results); setConfirmSubmit(false);
    } catch (err) { setError(err.message || 'Không thể nộp bài. Đáp án vẫn đang hiển thị để em thử lại.'); }
    finally { lockRef.current = false; setSubmitting(false); }
  };
  submitRef.current = submit;
  useEffect(() => {
    if (!attempt || completedResult) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true; submitRef.current(true);
      }
    };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [attempt, completedResult]);
  useEffect(() => {
    if (!attempt || completedResult || submitting || remaining === 0) return;
    setSaveStatus('Đang lưu câu trả lời...'); let active = true;
    const timer = setTimeout(() => save().then(() => { if (active) setSaveStatus('Đã lưu câu trả lời'); })
      .catch(() => { if (active) setSaveStatus('Chưa lưu được. Giữ trang mở và thử lại.'); }), 600);
    return () => { active = false; clearTimeout(timer); };
  }, [answers, attempt, completedResult, submitting]);
  const leave = async () => {
    if (lockRef.current) return;
    lockRef.current = true; setSubmitting(true); setError('');
    try { await save(); onPauseTest(); }
    catch (err) { setError(err.message || 'Chưa lưu được. Vui lòng thử lại trước khi rời bài.'); }
    finally { lockRef.current = false; setSubmitting(false); }
  };
  if (restoring) return <div className="diagnostic-card" role="status">Đang tải bài và kết quả đã lưu...</div>;
  if (completedResult) {
    const rawPoints = (completedResult.answers || []).reduce((sum, item) => sum + (item.pointsAwarded ?? Number(item.isCorrect)), 0);
    const score = completedResult.totalAnswered ? Math.round(rawPoints / completedResult.totalAnswered * 100) : 0;
    return <div className="diagnostic-view-root animate-fade-in">
      <section className="diagnostic-card" aria-label="Kết quả bài kiểm tra đầu vào">
        <h1>Đã nộp bài kiểm tra đầu vào</h1>
        <p><strong>{score}%</strong> · {completedResult.correctCount}/{completedResult.totalAnswered} câu hoàn toàn đúng.</p>
        <p>Câu đúng / sai: đúng 1/2/3/4 ý được 10%/25%/50%/100% điểm câu. Các câu có trọng số bằng nhau khi tính tỷ lệ điểm.</p>
        <button type="button" className="btn-quiz-submit" onClick={() => onFinishTest(completedResult)}>
          Xem hồ sơ năng lực và lộ trình <ArrowRight size={16} />
        </button>
      </section>
      {(completedResult.answers || []).map((item, index) => <section key={item.questionId} className="diagnostic-card" style={{ marginTop: 18 }}>
        <h2>Câu {index + 1} · {QUESTION_TYPE_LABELS[item.questionType || 'SINGLE_CHOICE']}</h2>
        <p>{item.skillTitle} · {item.pointsAwarded ?? Number(item.isCorrect)}/1 điểm thô{item.isTimeout ? ' · Hết giờ' : ''}</p>
        <p role="status" style={{fontWeight:700,color:item.isCorrect ? '#047857' : item.pointsAwarded > 0 ? '#b45309' : '#b91c1c'}}>{item.isCorrect ? 'Đúng' : item.pointsAwarded > 0 ? 'Đúng một phần' : 'Sai hoặc chưa trả lời'}</p>
        <MathRenderer content={item.content} />
        <MathQuestionResult question={{ ...item, studentSelectedKey: item.selectedOptionKey }} />
        {item.explanation && <details><summary>Lời giải</summary><MathRenderer content={item.explanation} /></details>}
      </section>)}
    </div>;
  }

  const answeredCount = attempt?.questions.filter(question => isQuestionAnswered(question, answers[question.id])).length || 0;
  const renderQuestion = (question, questionIndex) => <section className="diagnostic-card" key={question.id} style={{ marginTop: 16 }}>
    <div className="question-meta-row"><strong>Câu {questionIndex + 1}</strong><span>{question.skillTitle}</span>
      <span className="question-type-badge">{question.difficultyLabel || question.cognitiveLevel}</span></div>
    <div className="question-text-box question-content-box"><MathRenderer content={question.content} /></div>
    {attempt.lockedQuestionIds?.includes(question.id) && <p role="note">Câu này đã nộp trong phiên trước; đáp án được giữ nguyên và không thể chỉnh sửa.</p>}
    <MathQuestionResponse question={question} answer={answers[question.id]} onChange={value => changeAnswer(question.id, value)} disabled={submitting || remaining === 0 || attempt.lockedQuestionIds?.includes(question.id)} />
  </section>;
  if (!attempt) return <div className="diagnostic-landing-view animate-fade-in"><section className="diagnostic-intro-card">
    <h1 className="intro-card-heading">Bài kiểm tra đầu vào</h1>
    <p className="intro-card-description">Đề gồm 12 câu nhiều lựa chọn, 4 câu đúng / sai (mỗi câu 4 ý) và 6 câu trả lời ngắn. Em có thể làm từng câu ở chế độ Từng câu hoặc xem Toàn bộ đề. Đáp án và thời gian được giữ nguyên khi chuyển chế độ.</p>
    <p>Thời gian: 45 phút. Đáp án được lưu tự động; thời gian vẫn chạy khi rời bài.</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn-start-diagnostic" onClick={start} disabled={loading}>{loading ? 'Đang mở bài...' : 'Bắt đầu / tiếp tục làm bài'}</button>
  </section></div>;
  return <div className="diagnostic-view-root animate-fade-in">
    <div className="diagnostic-status-bar">
      <div><div className="status-label">ĐÃ TRẢ LỜI</div><strong>{answeredCount}/{attempt.questions.length}</strong></div>
      <div className={`status-value timer-display ${remaining <= 60 ? 'timer-warning' : ''}`}><Clock size={16} />{formatTime(remaining)}</div>
      <button type="button" className="btn-quiz-skip" onClick={() => setMode(mode === 'focus' ? 'paper' : 'focus')}>{mode === 'focus' ? 'Toàn bộ đề' : 'Từng câu'}</button>
      <button type="button" className="btn-quiz-skip" onClick={leave} disabled={submitting || remaining === 0}><Pause size={14} /> Lưu và rời bài</button>
    </div>
    <p role="status">Chế độ: {mode === 'focus' ? 'Từng câu' : 'Toàn bộ đề'} · {saveStatus}</p>
    {error && <div role="alert"><AlertCircle size={16} />{error}{remaining === 0 && <button type="button" onClick={() => submit(true)} disabled={submitting}>Thử nộp lại</button>}</div>}
    {mode === 'focus' ? <>
      <h2>{SECTION_TITLES[attempt.questions[index].questionType || 'SINGLE_CHOICE']}</h2>
      {renderQuestion(attempt.questions[index], index)}
      <div className="question-actions-bar"><button type="button" className="btn-quiz-skip" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} />Câu trước</button>
        <span>Câu {index + 1}/{attempt.questions.length}</span><button type="button" className="btn-quiz-skip" disabled={index === attempt.questions.length - 1} onClick={() => setIndex(index + 1)}>Câu tiếp<ChevronRight size={16} /></button></div>
      <nav aria-label="Chuyển câu hỏi" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0' }}>{attempt.questions.map((q, i) => <button type="button" key={q.id} aria-current={i === index ? 'step' : undefined} aria-label={`Câu ${i + 1}${isQuestionAnswered(q, answers[q.id]) ? ', đã trả lời' : ', chưa hoàn thành'}`} onClick={() => setIndex(i)} className="btn-quiz-skip">{i + 1}{isQuestionAnswered(q, answers[q.id]) ? ' ✓' : ''}</button>)}</nav>
    </> : TYPE_ORDER.map(type => <div key={type}><h2>{SECTION_TITLES[type]}</h2>{attempt.questions.map((q, i) => (q.questionType || 'SINGLE_CHOICE') === type ? renderQuestion(q, i) : null)}</div>)}
    <div className="question-actions-bar"><button type="button" className="btn-quiz-submit" disabled={submitting} onClick={() => setConfirmSubmit(true)}>{submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}Nộp bài</button></div>
    {confirmSubmit && <section className="diagnostic-card" role="dialog" aria-modal="true" aria-label="Xác nhận nộp bài"><h2>Nộp bài kiểm tra?</h2><p>Đã trả lời đầy đủ {answeredCount}/{attempt.questions.length} câu. Các câu và ý còn trống được tính 0 điểm.</p><button type="button" className="btn-quiz-skip" onClick={() => setConfirmSubmit(false)} disabled={submitting}>Tiếp tục làm</button><button type="button" className="btn-quiz-submit" onClick={() => submit()} disabled={submitting}>Xác nhận nộp bài</button></section>}
  </div>;
}
