import React, { useState, useEffect } from 'react';
import { BookX, CheckCircle, RefreshCw, AlertCircle, Check, MessageSquare, Edit3, Filter } from 'lucide-react';
import MathRenderer from './MathRenderer';
import { MathQuestionResult } from './MathQuestionResponse';
import { studentApi, diagnosticApi } from '../lib/apiClient';

const COGNITIVE_LEVEL_MAP = {
  REMEMBERING: 'Nhận biết',
  UNDERSTANDING: 'Thông hiểu',
  APPLYING: 'Vận dụng',
  ADVANCED_APPLYING: 'Vận dụng cao'
};

export default function MistakeNotebookView({ onStartPractice }) {
  const [mistakes, setMistakes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockedByDiagnostic, setBlockedByDiagnostic] = useState(false);
  const [isEndingAttempt, setIsEndingAttempt] = useState(false);
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'UNMASTERED' | 'MASTERED'
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState('');

  const fetchMistakes = async () => {
    setIsLoading(true);
    setError('');
    setBlockedByDiagnostic(false);
    setActionError('');
    try {
      const isMasteredParam = filterMode === 'ALL' ? undefined : filterMode === 'MASTERED';
      const data = await studentApi.getMistakes(isMasteredParam);
      setMistakes(data.mistakes || []);
    } catch (err) {
      setBlockedByDiagnostic(err.code === 'DIAGNOSTIC_IN_PROGRESS');
      setError(err.message || 'Không thể tải sổ tay lỗi sai.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMistakes();
  }, [filterMode]);

  const handleEndAttempt = async () => {
    setIsEndingAttempt(true);
    setActionError('');
    try {
      await diagnosticApi.abandonCurrentAttempt();
      await fetchMistakes();
    } catch (err) {
      setActionError(err.message || 'Chưa thể kết thúc lượt kiểm tra. Hãy thử lại.');
    } finally {
      setIsEndingAttempt(false);
    }
  };

  const handleToggleMastered = async (mistake) => {
    setIsUpdating(true);
    setActionError('');
    try {
      await studentApi.updateMistake(mistake.id, {
        isMastered: !mistake.isMastered
      });
      await fetchMistakes();
    } catch (err) {
      setActionError(err.message || 'Không thể cập nhật trạng thái lỗi sai.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveNote = async (mistakeId) => {
    setIsUpdating(true);
    setActionError('');
    try {
      await studentApi.updateMistake(mistakeId, {
        userNotes: noteText.trim() || undefined
      });
      setEditingNoteId(null);
      await fetchMistakes();
    } catch (err) {
      setActionError(err.message || 'Không thể lưu ghi chú.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '20px' }}>
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>Đang đồng bộ sổ tay lỗi sai từ máy chủ...</div>
        </div>
      </div>
    );
  }

  if (blockedByDiagnostic) {
    return (
      <section role="status" style={{ maxWidth: '700px', margin: '40px auto', padding: '24px', background: '#fffdf7', border: '1px solid #d6d3d1', borderRadius: '8px', textAlign: 'center' }}>
        <BookX size={32} style={{ margin: '0 auto 12px' }} />
        <h3>Sổ tay tạm đóng khi bài kiểm tra chưa kết thúc</h3>
        <p style={{ margin: '12px 0' }}>{error}</p>
        <p style={{ marginBottom: '20px' }}>Kết thúc lượt đang dở sẽ không ghi điểm lượt này. Kết quả và năng lực từ các bài đã nộp vẫn được giữ nguyên.</p>
        {actionError && <p role="alert">{actionError}</p>}
        <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <button className="btn-secondary" onClick={onStartPractice} disabled={isEndingAttempt}>Quay lại bài kiểm tra</button>
          <button className="btn-primary" onClick={handleEndAttempt} disabled={isEndingAttempt}>{isEndingAttempt ? 'Đang kết thúc...' : 'Kết thúc lượt đang dở và mở sổ tay'}</button>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: '700px', margin: '40px auto', padding: '20px' }}>
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
          <AlertCircle size={32} color="#dc2626" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#991b1b', marginBottom: '8px' }}>
            Không thể tải sổ tay lỗi sai
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#7f1d1d', marginBottom: '16px' }}>{error}</p>
          <button
            type="button"
            onClick={fetchMistakes}
            style={{ padding: '8px 16px', backgroundColor: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  if (mistakes.length === 0 && filterMode === 'ALL') {
    return (
      <div className="empty-state-view-wrapper animate-fade-in">
        <div className="empty-state-card">
          <div className="empty-state-icon-box purple-tint">
            <BookX size={32} className="empty-icon text-purple" />
          </div>
          <h2 className="empty-state-title">Sổ tay lỗi sai còn trống</h2>
          <p className="empty-state-desc">
            Mỗi câu trả lời sai trong bài kiểm tra chẩn đoán hoặc tự luyện sẽ tự động được ghi nhận tại đây kèm đáp án đúng và lời giải chi tiết để bạn ôn tập.
          </p>
          <button className="btn-empty-action" onClick={onStartPractice}>
            Bắt đầu làm bài kiểm tra
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mistakes-page animate-fade-in" style={{ maxWidth: '960px', margin: '0 auto' }}>
      {actionError && (
        <div
          role="alert"
          style={{
            marginBottom: '16px',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.86rem',
            fontWeight: 500,
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca'
          }}
        >
          {actionError}
        </div>
      )}

      <div className="mistakes-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
            Sổ tay lỗi sai ({mistakes.length} câu)
          </h2>
          <p style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '4px' }}>
            Tự động đồng bộ từ các câu trả lời chưa đúng · Xem lại bẫy tư duy và lời giải chi tiết.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '6px' }}>
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: filterMode === 'ALL' ? '#ffffff' : 'transparent',
              color: filterMode === 'ALL' ? '#0f172a' : '#64748b',
              boxShadow: filterMode === 'ALL' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            Tất cả
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('UNMASTERED')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: filterMode === 'UNMASTERED' ? '#ffffff' : 'transparent',
              color: filterMode === 'UNMASTERED' ? '#b91c1c' : '#64748b',
              boxShadow: filterMode === 'UNMASTERED' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            Chưa sửa được
          </button>

          <button
            type="button"
            onClick={() => setFilterMode('MASTERED')}
            style={{
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              backgroundColor: filterMode === 'MASTERED' ? '#ffffff' : 'transparent',
              color: filterMode === 'MASTERED' ? '#15803d' : '#64748b',
              boxShadow: filterMode === 'MASTERED' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
            }}
          >
            Đã thành thạo
          </button>
        </div>
      </div>

      <div className="mistakes-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {mistakes.map((item) => {
          const q = item.question || item || {};
          const isMastered = item.isMastered;
          const topic = q.skillTitle || q.chapter || item.skillTitle || item.chapter || 'Toán 9';
          const rawLevel = q.cognitiveLevel || item.cognitiveLevel;
          const levelText = COGNITIVE_LEVEL_MAP[rawLevel] || rawLevel || 'Thông hiểu';
          const content = q.content || item.content || '';
          const explanation = q.explanation || item.explanation || '';
          const options = q.options || item.options || [];
          const correctKey = q.correctOptionKey || item.correctOptionKey || (options.find(o => o.isCorrect)?.key) || '';

          return (
            <details
              key={item.id}
              className="mistake-item-card"
              style={{
                backgroundColor: '#fffdf7',
                border: isMastered ? '2px solid #86efac' : '2px solid #131a2a',
                borderRadius: '8px',
                padding: '20px 24px',
                boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.12)'
              }}
            >
              <summary className="mistake-index-summary"><span>{topic} · {isMastered ? "Đã sửa được" : "Cần ôn lại"}</span><MathRenderer content={content} /><small>{item.selectedOptionKey ? "Xem bài làm và lời giải" : "Chưa trả lời · Xem lại câu hỏi"}</small></summary>
              <div className="mistake-card-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="mistake-topic-tag" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f766e', backgroundColor: '#ccfbf1', padding: '2px 8px', borderRadius: '4px' }}>
                    {topic}
                  </span>
                  <span className="mistake-level-tag" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                    [{levelText}]
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleMastered(item)}
                  disabled={isUpdating}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: '16px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: isMastered ? '#dcfce7' : '#f1f5f9',
                    color: isMastered ? '#15803d' : '#64748b'
                  }}
                >
                  <Check size={13} />
                  <span>{isMastered ? 'Đã khắc phục xong' : 'Đánh dấu đã sửa được'}</span>
                </button>
              </div>

              {/* Question content */}
              <div className="mistake-question-content" style={{ fontSize: '0.98rem', fontWeight: 600, color: '#0f172a', marginBottom: '14px', overflowX: 'auto' }}>
                <MathRenderer content={content} />
              </div>

              {item.questionType && item.questionType !== 'SINGLE_CHOICE' && (
                <MathQuestionResult question={{ ...item.question, ...item }} />
              )}

              {/* Options display with correct/selected highlighting */}
              {options.length > 0 && (
                <div
                  className="mistake-options-grid"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '8px',
                    marginBottom: '14px'
                  }}
                >
                  {options.map((opt, optIdx) => {
                    const optKey = opt.key || opt.optionKey || opt.id || String.fromCharCode(65 + optIdx);
                    const optContent = opt.content || opt.text || '';
                    const isSelected = optKey === item.selectedOptionKey;
                    const isCorrect = optKey === correctKey || opt.isCorrect;
                    let border = '1px solid #e2e8f0';
                    let bg = '#ffffff';
                    let badgeBg = '#f1f5f9';
                    let badgeColor = '#475569';

                    if (isCorrect) {
                      border = '2px solid #10b981';
                      bg = '#f0fdf4';
                      badgeBg = '#10b981';
                      badgeColor = '#ffffff';
                    } else if (isSelected) {
                      border = '2px solid #ef4444';
                      bg = '#fef2f2';
                      badgeBg = '#ef4444';
                      badgeColor = '#ffffff';
                    }

                    return (
                      <div
                        key={optKey}
                        style={{
                          padding: '8px 12px',
                          border,
                          backgroundColor: bg,
                          borderRadius: '6px',
                          fontSize: '0.9rem',
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'center'
                        }}
                      >
                        <span
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            backgroundColor: badgeBg,
                            color: badgeColor,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            flexShrink: 0
                          }}
                        >
                          {optKey}
                        </span>
                        <div style={{ flex: 1 }}>
                          <MathRenderer content={optContent} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Badges: Selected vs Correct */}
              {(!item.questionType || item.questionType === 'SINGLE_CHOICE') && <div className="mistake-answers-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <div
                  className={item.selectedOptionKey ? 'answer-badge wrong' : 'answer-badge unanswered'}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    borderRadius: '4px',
                    fontSize: '0.84rem',
                    fontWeight: 600
                  }}
                >
                  Đáp án bạn chọn: {item.selectedOptionKey || 'Chưa trả lời'}
                </div>

                <div
                  className="answer-badge correct"
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    borderRadius: '4px',
                    fontSize: '0.84rem',
                    fontWeight: 600
                  }}
                >
                  Đáp án đúng: {correctKey}
                </div>
              </div>

              }

              {/* Detailed Explanation */}
              {explanation && (
                <details
                  className="mistake-explanation-box"
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    fontSize: '0.88rem',
                    color: '#334155',
                    lineHeight: 1.5,
                    overflowX: 'auto',
                    marginBottom: '12px'
                  }}
                >
                  <summary>Xem lời giải chi tiết</summary>
                  <MathRenderer content={explanation} />
                </details>
              )}

              {/* User personal note */}
              <div style={{ marginTop: '10px', borderTop: '1px dashed #e2e8f0', paddingTop: '10px' }}>
                {editingNoteId === item.id ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      aria-label="Ghi chú cá nhân"
                      placeholder="Ghi chú cá nhân (ví dụ: Chú ý đổi dấu khi chuyển vế)..."
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.84rem' }}
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveNote(item.id)}
                      disabled={isUpdating}
                      style={{ padding: '6px 12px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Lưu
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNoteId(null)}
                      style={{ padding: '6px 10px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', color: '#64748b' }}>
                    <span>
                      {item.userNotes ? (
                        <>
                          <strong style={{ color: '#0f172a' }}>Ghi chú của bạn: </strong>
                          <span>{item.userNotes}</span>
                        </>
                      ) : (
                        <em>Chưa có ghi chú cá nhân</em>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteId(item.id);
                        setNoteText(item.userNotes || '');
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: '#0f766e', cursor: 'pointer', fontWeight: 600 }}
                    >
                      <Edit3 size={13} />
                      <span>{item.userNotes ? 'Sửa ghi chú' : 'Thêm ghi chú'}</span>
                    </button>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
