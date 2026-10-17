import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  School,
  Check,
  Users,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  Calendar,
  BookOpen,
  Clock,
  Play,
  Award,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  X,
  FileText,
  HelpCircle,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import { classroomApi, studentApi, assignmentApi } from '../lib/apiClient';
import { recordStudyActivity } from '../lib/calendarSyncService';
import MathRenderer from './MathRenderer';
import { EXAM_PARTS, orderExamQuestions } from './examDisplay';
import MathQuestionResponse, { MathQuestionResult, isQuestionAnswered, toAssignmentAnswers, fromAssignmentAnswers } from './MathQuestionResponse';

export default function ClassroomView() {
  const [classCode, setClassCode] = useState('');
  const [joinedClasses, setJoinedClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [classAssignments, setClassAssignments] = useState([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Exam Taking State
  const [takingAssignmentId, setTakingAssignmentId] = useState(null);
  const [examData, setExamData] = useState(null);
  const [isLoadingExam, setIsLoadingExam] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [examDisplayMode, setExamDisplayMode] = useState(() => {
    try { return localStorage.getItem('math-exam-display-mode') === 'all' ? 'all' : 'single'; } catch { return 'single'; }
  });
  const examQuestionRefs = useRef({});
  const changeExamDisplay = (mode) => {
    setExamDisplayMode(mode);
    try { localStorage.setItem('math-exam-display-mode', mode); } catch {}
  };
  const [userAnswers, setUserAnswers] = useState({}); // { [questionId]: optionKey }
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(null);
  const [totalTimeSpentSeconds, setTotalTimeSpentSeconds] = useState(0);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [isSubmittingExam, setIsSubmittingExam] = useState(false);
  const timerRef = useRef(null);
  const answersRef = useRef({});
  const elapsedRef = useRef(0);
  const submitLockRef = useRef(false);
  const saveChainRef = useRef(Promise.resolve());
  const clockRef = useRef({ loadedAt: 0, elapsedAtLoad: 0, deadline: null });
  const autoSubmitAttemptedRef = useRef(false);
  const submitExamRef = useRef(null);
  const [draftSaveState, setDraftSaveState] = useState('');
  const answeredCount = examData?.questions.filter(q => isQuestionAnswered(q, userAnswers[q.id])).length || 0;
  answersRef.current = userAnswers;
  elapsedRef.current = totalTimeSpentSeconds;

  // Exam Result State
  const [viewingResultAssignmentId, setViewingResultAssignmentId] = useState(null);
  const [examResultData, setExamResultData] = useState(null);
  const [isLoadingResult, setIsLoadingResult] = useState(false);

  // 1. Fetch joined classes
  const fetchStudentClasses = async () => {
    setIsLoadingClasses(true);
    setErrorMessage('');
    try {
      const data = await studentApi.getProfile();
      const classes = data.joinedClassrooms || [];
      setJoinedClasses(classes);
      if (classes.length > 0 && !selectedClassId) {
        setSelectedClassId(classes[0].id);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Không thể tải thông tin lớp học.');
    } finally {
      setIsLoadingClasses(false);
    }
  };

  useEffect(() => {
    fetchStudentClasses();
  }, []);

  // 2. Fetch assignments when selected class changes
  const fetchAssignmentsForClass = async (classId) => {
    if (!classId) return;
    setIsLoadingAssignments(true);
    try {
      const res = await assignmentApi.getClassAssignments(classId);
      setClassAssignments(res.assignments || []);
    } catch (err) {
      // Non-critical if class has no assignments or fails
      setClassAssignments([]);
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  useEffect(() => {
    if (selectedClassId) {
      fetchAssignmentsForClass(selectedClassId);
    }
  }, [selectedClassId]);

  // Crockford normalization: uppercase, I/L -> 1, O -> 0, strip hyphens/spaces
  const cleanCrockford = (raw) => {
    return raw
      .toUpperCase()
      .replace(/[\s-]/g, '')
      .replace(/[IL]/g, '1')
      .replace(/O/g, '0');
  };

  const handleJoinClass = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const normalized = cleanCrockford(classCode);
    if (!normalized || normalized.length < 4) {
      setErrorMessage('Mã lớp học cần có ít nhất 4 ký tự Crockford (ví dụ: KTR2QX79).');
      return;
    }

    setIsJoining(true);
    try {
      const res = await classroomApi.joinClassroom(normalized);
      setSuccessMessage(res.message || 'Tham gia lớp học thành công!');
      setClassCode('');
      await fetchStudentClasses();
    } catch (err) {
      setErrorMessage(err.message || 'Không thể tham gia lớp học.');
    } finally {
      setIsJoining(false);
    }
  };

  // 3. Start Exam Taking
  const handleStartExam = async (assignmentId) => {
    setExamData(null);
    setTakingAssignmentId(assignmentId);
    setIsLoadingExam(true);
    autoSubmitAttemptedRef.current = false;
    answersRef.current = {};
    elapsedRef.current = 0;
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setTotalTimeSpentSeconds(0);
    setShowConfirmSubmit(false);

    try {
      const res = await assignmentApi.getAssignmentForTaking(assignmentId);
      const assignment = { ...res.assignment, questions: orderExamQuestions(res.assignment.questions) };
      if (assignment.isSubmitted) {
        setTakingAssignmentId(null);
        handleViewResult(assignmentId);
        return;
      }
      const restoredAnswers = fromAssignmentAnswers(assignment.draftAnswers);
      answersRef.current = restoredAnswers;
      setUserAnswers(restoredAnswers);
      const loadedAt = Date.now();
      const deadline = assignment.durationMinutes > 0 ? (assignment.startedAt ? new Date(assignment.startedAt).getTime() : loadedAt) + assignment.durationMinutes * 60000 : null;
      clockRef.current = { loadedAt, elapsedAtLoad: assignment.timeSpentSeconds || 0, deadline };
      elapsedRef.current = assignment.timeSpentSeconds || 0;
      setTotalTimeSpentSeconds(assignment.timeSpentSeconds || 0);
      setDraftSaveState(assignment.draftAnswers?.length ? 'Đã khôi phục câu trả lời đã lưu' : 'Câu trả lời được lưu tự động');
      setExamData(assignment);

      // Setup countdown timer if duration is specified
      if (assignment.durationMinutes && assignment.durationMinutes > 0) {
        setTimeRemainingSeconds(Math.max(0, assignment.durationMinutes * 60 - (assignment.startedAt ? Math.floor((Date.now() - new Date(assignment.startedAt).getTime()) / 1000) : 0)));
      } else {
        setTimeRemainingSeconds(null);
      }
    } catch (err) {
      alert(err.message || 'Không thể tải nội dung đề thi.');
      setTakingAssignmentId(null);
    } finally {
      setIsLoadingExam(false);
    }
  };

  // Compute from wall time so background tabs cannot extend a timed exam.
  useEffect(() => {
    if (!takingAssignmentId || !examData || isLoadingExam || isSubmittingExam) return;
    const tick = () => {
      const clock = clockRef.current;
      const now = Date.now();
      const elapsed = clock.elapsedAtLoad + Math.max(0, Math.floor((now - clock.loadedAt) / 1000));
      elapsedRef.current = elapsed;
      setTotalTimeSpentSeconds(elapsed);
      const remaining = clock.deadline === null ? null : Math.max(0, Math.ceil((clock.deadline - now) / 1000));
      setTimeRemainingSeconds(remaining);
      if (remaining === 0 && !autoSubmitAttemptedRef.current && !submitLockRef.current) {
        autoSubmitAttemptedRef.current = true;
        submitExamRef.current?.(true);
      }
    };
    timerRef.current = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timerRef.current);
  }, [takingAssignmentId, examData, isLoadingExam, isSubmittingExam]);

  useEffect(() => {
    if (!takingAssignmentId || !examData || isLoadingExam || isSubmittingExam || submitLockRef.current) return;
    setDraftSaveState('Đang lưu câu trả lời...');
    let active = true;
    const timeout = setTimeout(() => {
      if (submitLockRef.current) return;
      const payload = { answers: toAssignmentAnswers(answersRef.current), timeSpentSeconds: elapsedRef.current };
      saveChainRef.current = saveChainRef.current.catch(() => {}).then(() => assignmentApi.saveDraft(takingAssignmentId, payload))
        .then(() => { if (active) setDraftSaveState('Đã lưu câu trả lời'); })
        .catch(() => { if (active) setDraftSaveState('Chưa lưu được. Giữ trang mở và kiểm tra kết nối.'); });
    }, 600);
    return () => { active = false; clearTimeout(timeout); };
  }, [userAnswers, takingAssignmentId, examData, isLoadingExam, isSubmittingExam]);

  const handleSelectOption = (questionId, optionKey) => {
    const next = { ...answersRef.current, [questionId]: optionKey };
    answersRef.current = next;
    setUserAnswers(next);
  };

  const handleSubmitExam = async (isAutoSubmit = false) => {
    if (!takingAssignmentId || !examData || submitLockRef.current) return;
    submitLockRef.current = true;
    setIsSubmittingExam(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const answersPayload = toAssignmentAnswers(answersRef.current);

    try {
      await saveChainRef.current.catch(() => {});
      const res = await assignmentApi.submitAssignment(takingAssignmentId, {
        answers: answersPayload,
        timeSpentSeconds: elapsedRef.current
      });

      const finishedAssignmentId = takingAssignmentId;
      setTakingAssignmentId(null);
      setExamData(null);
      setShowConfirmSubmit(false);

      // Refresh class assignments
      if (selectedClassId) {
        fetchAssignmentsForClass(selectedClassId);
      }

      // Record real-time study session
      recordStudyActivity('default_student', {
        minutes: Math.max(15, Math.round(elapsedRef.current / 60)),
        activity: 'Nộp bài tập lớp học'
      });

      // Automatically open results
      handleViewResult(finishedAssignmentId);
    } catch (err) {
      alert(err.message || 'Lỗi khi nộp bài thi. Vui lòng thử lại!');
    } finally {
      submitLockRef.current = false;
      setIsSubmittingExam(false);
    }
  };

  submitExamRef.current = handleSubmitExam;

  // 4. View Exam Results
  const handleViewResult = async (assignmentId) => {
    setViewingResultAssignmentId(assignmentId);
    setIsLoadingResult(true);
    try {
      const res = await assignmentApi.getAssignmentResult(assignmentId);
      setExamResultData({...res.result, questions: orderExamQuestions(res.result.questions)});
    } catch (err) {
      alert(err.message || 'Không thể tải kết quả bài thi.');
      setViewingResultAssignmentId(null);
    } finally {
      setIsLoadingResult(false);
    }
  };

  const formatTimer = (seconds) => {
    if (seconds === null) return 'Không giới hạn';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedClass = joinedClasses.find((c) => c.id === selectedClassId) || joinedClasses[0];

  return (
    <div className="classroom-page-container animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
      <div className="classroom-header-block">
        <h1 className="classroom-heading">Lớp Học Của Em</h1>
        <p className="classroom-subheading">
          Tham gia lớp của thầy/cô bằng mã mời Crockford Base32, theo dõi đề thi và kiểm tra bài tập được giao.
        </p>
      </div>

      {/* Card 1: Enter Teacher Code */}
      <div className="classroom-input-card" style={{ marginBottom: '24px' }}>
        <div className="card-top-titles">
          <h2 className="input-card-title">Vào lớp của giáo viên</h2>
          <p className="input-card-subtitle">
            Nhập mã lớp gồm 8 ký tự do giáo viên cung cấp (ví dụ: KTR2QX79).
          </p>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#b91c1c',
              fontSize: '0.88rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              color: '#15803d',
              fontSize: '0.88rem',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <Check size={18} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleJoinClass} className="class-code-form">
          <div className="code-input-group">
            <span className="code-prefix-label">MÃ LỚP:</span>
            <input
              type="text"
              className="class-code-input"
              placeholder="KTR2QX79"
              value={classCode}
              onChange={(e) => {
                setClassCode(e.target.value.toUpperCase());
                if (errorMessage) setErrorMessage('');
              }}
              disabled={isJoining}
              maxLength={12}
              autoComplete="off"
            />
          </div>

          <button type="submit" className="btn-find-class" disabled={isJoining || !classCode.trim()}>
            {isJoining ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang kiểm tra...</span>
              </>
            ) : (
              <>
                <Search size={16} />
                <span>Tham gia lớp</span>
              </>
            )}
          </button>
        </form>

        {/* Transparent privacy notice (Gate 0 D-04) */}
        <div
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '6px',
            fontSize: '0.82rem',
            color: '#1e40af',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}
        >
          <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>
            <strong>Minh bạch dữ liệu học sinh (D-04):</strong> Thầy cô chỉ theo dõi kết quả các bài kiểm tra được giao và mức độ thành thạo kỹ năng chung. Sổ tay lỗi sai cá nhân và nhật ký tự luyện riêng tư tuyệt đối không chia sẻ cho giáo viên.
          </span>
        </div>
      </div>

      {/* Card 2: Joined Classrooms & Assignments Section */}
      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>
          Lớp học em đã tham gia ({joinedClasses.length})
        </h3>

        {isLoadingClasses ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <div>Đang kiểm tra lớp học của bạn...</div>
          </div>
        ) : joinedClasses.length === 0 ? (
          <div className="classroom-empty-card">
            <div className="empty-house-icon-wrapper">
              <School size={36} className="empty-house-icon" />
            </div>
            <h3 className="empty-classroom-title">Em chưa tham gia lớp học nào</h3>
            <p className="empty-classroom-description">
              Tham gia lớp để thầy/cô giao bài kiểm tra và theo dõi tiến độ. Việc tham gia lớp là không bắt buộc — em vẫn có thể tự học theo lộ trình cá nhân.
            </p>
          </div>
        ) : (
          <div>
            {/* Class Tabs if multiple */}
            {joinedClasses.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '18px', paddingBottom: '4px' }}>
                {joinedClasses.map((cls) => {
                  const isSelected = cls.id === (selectedClass?.id || selectedClassId);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => setSelectedClassId(cls.id)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #0f172a' : '1px solid #cbd5e1',
                        backgroundColor: isSelected ? '#10b981' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#334155',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: isSelected ? '3px 3px 0 #0f172a' : 'none'
                      }}
                    >
                      {cls.name} · Khối {cls.grade}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Class Header Info */}
            {selectedClass && (
              <div
                style={{
                  backgroundColor: '#fffdf7',
                  border: '2px solid #131a2a',
                  borderRadius: '8px',
                  padding: '20px 24px',
                  boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.14)',
                  marginBottom: '20px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                        {selectedClass.name}
                      </span>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '12px',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          backgroundColor: '#dcfce7',
                          color: '#15803d'
                        }}
                      >
                        ĐÃ THAM GIA
                      </span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#475569', marginTop: '4px' }}>
                      Giáo viên: <strong>{selectedClass.teacherName}</strong> · Khối {selectedClass.grade} · Năm học: {selectedClass.academicYear}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchAssignmentsForClass(selectedClass.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={13} className={isLoadingAssignments ? 'animate-spin' : ''} />
                    <span>Làm mới bài tập</span>
                  </button>
                </div>
              </div>
            )}

            {/* Section: Assigned Tests & Quizzes */}
            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} color="#10b981" />
                  <span>Đề kiểm tra & Bài tập được giao ({classAssignments.length})</span>
                </h4>
              </div>

              {isLoadingAssignments ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                  <div>Đang tải danh sách bài tập...</div>
                </div>
              ) : classAssignments.length === 0 ? (
                <div
                  style={{
                    backgroundColor: '#fffdf7',
                    border: '2px dashed #cbd5e1',
                    borderRadius: '8px',
                    padding: '36px 20px',
                    textAlign: 'center'
                  }}
                >
                  <BookOpen size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 700, color: '#334155', fontSize: '1rem' }}>
                    Chưa có bài kiểm tra hoặc bài tập nào
                  </div>
                  <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
                    Khi thầy/cô giao đề kiểm tra mới, đề sẽ hiển thị tại đây để bạn làm bài.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {classAssignments.map((assignment) => {
                    const isSubmitted = assignment.isSubmitted;
                    const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date();

                    return (
                      <div
                        key={assignment.id}
                        style={{
                          backgroundColor: '#fffdf7',
                          border: '2px solid #131a2a',
                          borderRadius: '8px',
                          padding: '18px 22px',
                          boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '16px'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '260px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                              {assignment.title}
                            </span>
                            {isSubmitted ? (
                              <span
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  backgroundColor: '#dcfce7',
                                  color: '#15803d',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                <CheckCircle size={13} />
                                <span>ĐÃ NỘP: {assignment.studentScore}/10 ĐIỂM</span>
                              </span>
                            ) : isOverdue ? (
                              <span
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  backgroundColor: '#fee2e2',
                                  color: '#b91c1c'
                                }}
                              >
                                ĐÃ HẾT HẠN
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: '12px',
                                  fontSize: '0.74rem',
                                  fontWeight: 700,
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e'
                                }}
                              >
                                CHƯA NỘP
                              </span>
                            )}
                          </div>

                          {assignment.description && (
                            <div style={{ fontSize: '0.84rem', color: '#475569', marginTop: '4px' }}>
                              {assignment.description}
                            </div>
                          )}

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.78rem', color: '#64748b', marginTop: '8px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <HelpCircle size={14} />
                              <strong>{assignment.questionCount}</strong> câu hỏi
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={14} />
                              {assignment.durationMinutes ? `${assignment.durationMinutes} phút` : 'Tự do thời gian'}
                            </span>
                            {assignment.dueDate && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={14} />
                                Hạn nộp: {new Date(assignment.dueDate).toLocaleString('vi-VN')}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          {isSubmitted ? (
                            <button
                              type="button"
                              onClick={() => handleViewResult(assignment.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                backgroundColor: '#f0fdf4',
                                color: '#15803d',
                                border: '1.5px solid #86efac',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer'
                              }}
                            >
                              <BookOpen size={15} />
                              <span>Xem lại bài làm</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartExam(assignment.id)}
                              disabled={isOverdue}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '9px 20px',
                                backgroundColor: isOverdue ? '#e2e8f0' : '#10b981',
                                color: isOverdue ? '#94a3b8' : '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: 800,
                                fontSize: '0.88rem',
                                cursor: isOverdue ? 'not-allowed' : 'pointer',
                                boxShadow: isOverdue ? 'none' : '0 2px 6px rgba(16, 185, 129, 0.3)'
                              }}
                            >
                              <Play size={15} />
                              <span>Bắt đầu làm bài</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: EXAM TAKING INTERFACE */}
      {takingAssignmentId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#fffdf7',
              border: '2px solid #131a2a',
              borderRadius: '10px',
              maxWidth: '860px',
              width: '100%',
              maxHeight: '94vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '16px 16px 0 rgba(19, 26, 42, 0.3)',
              overflow: 'hidden'
            }}
          >
            {isLoadingExam || !examData ? (
              <div style={{ padding: '80px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                <div style={{ fontWeight: 600 }}>Đang nạp đề kiểm tra...</div>
              </div>
            ) : (
              <>
                {/* Header Bar */}
                <div
                  style={{
                    padding: '16px 24px',
                    borderBottom: '2px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      {examData.title}
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Lớp: <strong>{examData.className}</strong> · Tổng số: <strong>{examData.questions.length}</strong> câu
                    </div>
                  </div>

                  {/* Timer Display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {timeRemainingSeconds !== null && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          fontWeight: 800,
                          fontSize: '0.92rem',
                          backgroundColor: timeRemainingSeconds < 300 ? '#fef2f2' : '#f0fdf4',
                          color: timeRemainingSeconds < 300 ? '#b91c1c' : '#15803d',
                          border: `1.5px solid ${timeRemainingSeconds < 300 ? '#fecaca' : '#bbf7d0'}`
                        }}
                      >
                        <Clock size={16} />
                        <span>{formatTimer(timeRemainingSeconds)}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowConfirmSubmit(true)}
                      style={{
                        padding: '8px 18px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.86rem',
                        cursor: 'pointer'
                      }}
                    >
                      Nộp bài
                    </button>
                  </div>
                </div>

                <div role="group" aria-label="Cách hiển thị đề" style={{display:'flex',gap:8,padding:'12px 24px',flexWrap:'wrap'}}>
                  {[['single','Focus'],['all','Hiển thị đề']].map(([mode,label]) => <button key={mode} type="button" aria-pressed={examDisplayMode === mode} onClick={() => changeExamDisplay(mode)} style={{padding:'8px 14px',border:'1px solid #94a3b8',borderRadius:6,background:examDisplayMode === mode ? '#047857' : '#fff',color:examDisplayMode === mode ? '#fff' : '#334155'}}>{label}</button>)}
                </div>
                {/* Question Navigator Pills */}
                <div
                  style={{
                    padding: '10px 24px',
                    backgroundColor: '#f8fafc',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: '6px',
                    overflowX: 'auto'
                  }}
                >
                  {examData.questions.map((q, idx) => {
                    const isAnswered = isQuestionAnswered(q, userAnswers[q.id]);
                    const isCurrent = idx === currentQuestionIndex;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => { setCurrentQuestionIndex(idx); if (examDisplayMode === 'all') examQuestionRefs.current[q.id]?.scrollIntoView({behavior:'smooth',block:'start'}); }}
                        style={{
                          width: '32px',
                          height: '32px',
                          minWidth: '32px',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          border: isCurrent ? '2px solid #0f172a' : '1px solid #cbd5e1',
                          backgroundColor: isAnswered ? '#10b981' : '#ffffff',
                          color: isAnswered ? '#ffffff' : '#334155',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isCurrent ? '2px 2px 0 #0f172a' : 'none'
                        }}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>

                {/* Question Content & Multiple Choice Body */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                  {examData.questions.map((question, index) => {
                    if (examDisplayMode === 'single' && index !== currentQuestionIndex) return null;
                    const type = question.questionType || 'SINGLE_CHOICE';
                    const firstOfPart = index === 0 || (examData.questions[index - 1].questionType || 'SINGLE_CHOICE') !== type;
                    return <section key={question.id} ref={element => { examQuestionRefs.current[question.id] = element; }} aria-label={`Câu ${index + 1}`} style={{marginBottom:28,scrollMarginTop:12}}>
                      {(firstOfPart || examDisplayMode === 'single') && <h3 style={{fontSize:'1.05rem',color:'#047857',paddingBottom:12,borderBottom:'2px solid #d1fae5'}}>{EXAM_PARTS.find(part => part.type === type)?.title}</h3>}
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'14px 0',fontSize:'.85rem'}}><strong>Câu {index + 1} / {examData.questions.length}</strong><span>Chủ đề: {question.skillTitle}</span></div>
                      <div style={{fontSize:'1.1rem',lineHeight:1.6,padding:16,border:'1px solid #e2e8f0',borderRadius:8,marginBottom:18}}><MathRenderer content={question.content} /></div>
                      <MathQuestionResponse question={question} answer={userAnswers[question.id]} disabled={isSubmittingExam || timeRemainingSeconds === 0} onChange={value => handleSelectOption(question.id,value)} />
                    </section>;
                  })}
                  {timeRemainingSeconds === 0 && <p role="alert">Đã hết thời gian. Nếu kết nối bị gián đoạn, bấm nộp lại; hệ thống chấm câu trả lời đã lưu.</p>}
                  <p role="status" style={{marginTop:16,color:'#64748b',fontSize:'.84rem'}}>{draftSaveState}</p>
                </div>

                {/* Footer Navigation */}
                <div
                  style={{
                    padding: '16px 24px',
                    borderTop: '2px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0 || examDisplayMode === 'all'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: currentQuestionIndex === 0 ? '#94a3b8' : '#334155',
                      cursor: currentQuestionIndex === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <ChevronLeft size={16} />
                    <span>Câu trước</span>
                  </button>

                  <div style={{ fontSize: '0.84rem', color: '#64748b' }}>
                    Đã chọn:{' '}
                    <strong>
                      {answeredCount} / {examData.questions.length}
                    </strong>{' '}
                    câu
                  </div>

                  {examDisplayMode === 'single' && currentQuestionIndex < examData.questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 18px',
                        backgroundColor: '#10b981',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      <span>Câu tiếp theo</span>
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowConfirmSubmit(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 20px',
                        backgroundColor: '#059669',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '0.86rem',
                        color: '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      <CheckCircle size={16} />
                      <span>Hoàn tất & Nộp bài</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CONFIRM SUBMIT MODAL */}
      {showConfirmSubmit && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#fffdf7',
              border: '2px solid #131a2a',
              borderRadius: '8px',
              maxWidth: '440px',
              width: '100%',
              padding: '24px',
              boxShadow: '12px 12px 0 rgba(19, 26, 42, 0.25)'
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
              Xác Nhận Nộp Bài Thi
            </h3>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, marginBottom: '16px' }}>
              Em đã trả lời <strong>{answeredCount}</strong> trên tổng số <strong>{examData?.questions.length}</strong> câu hỏi.
              {answeredCount < (examData?.questions.length || 0) && (
                <span style={{ color: '#b91c1c', display: 'block', marginTop: '6px' }}>
                  ⚠️ Chú ý: Còn {examData.questions.length - answeredCount} câu chưa có đáp án!
                </span>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowConfirmSubmit(false)}
                disabled={isSubmittingExam}
                style={{
                  padding: '8px 14px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer'
                }}
              >
                Tiếp tục làm bài
              </button>

              <button
                type="button"
                onClick={() => handleSubmitExam(false)}
                disabled={isSubmittingExam}
                style={{
                  padding: '8px 18px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {isSubmittingExam ? 'Đang chấm điểm...' : 'Nộp bài ngay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXAM RESULT & DETAILED STEP-BY-STEP EXPLANATION */}
      {viewingResultAssignmentId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#fffdf7',
              border: '2px solid #131a2a',
              borderRadius: '10px',
              maxWidth: '860px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '16px 16px 0 rgba(19, 26, 42, 0.3)',
              overflow: 'hidden'
            }}
          >
            {isLoadingResult || !examResultData ? (
              <div style={{ padding: '80px', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                <div>Đang tải kết quả bài làm...</div>
              </div>
            ) : (
              <>
                {/* Header Bar */}
                <div
                  style={{
                    padding: '18px 24px',
                    borderBottom: '2px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                      Kết Quả Bài Làm: {examResultData.assignmentTitle}
                    </h3>
                    <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                      Lớp: <strong>{examResultData.className}</strong> · Nộp lúc: {new Date(examResultData.submittedAt).toLocaleString('vi-VN')}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setViewingResultAssignmentId(null);
                      setExamResultData(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#64748b',
                      padding: '6px'
                    }}
                  >
                    <X size={22} />
                  </button>
                </div>

                {/* Body Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                  {/* Score & Metric Summary Card */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      border: '2px solid #131a2a',
                      borderRadius: '8px',
                      padding: '20px 24px',
                      boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.12)',
                      marginBottom: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      flexWrap: 'wrap',
                      gap: '16px',
                      textAlign: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Điểm số (Thang 10)
                      </div>
                      <div style={{ fontSize: '2.4rem', fontWeight: 900, color: examResultData.score >= 8 ? '#059669' : examResultData.score >= 5 ? '#d97706' : '#dc2626' }}>
                        {examResultData.score} <span style={{ fontSize: '1.1rem', color: '#64748b' }}>/ 10</span>
                      </div>
                    </div>

                    <div style={{ height: '40px', width: '1px', backgroundColor: '#e2e8f0' }} />

                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Số câu đúng
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                        {examResultData.correctCount} / {examResultData.totalQuestions}
                      </div>
                    </div>

                    <div style={{ height: '40px', width: '1px', backgroundColor: '#e2e8f0' }} />

                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                        Thời gian hoàn thành
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#475569', marginTop: '4px' }}>
                        {Math.floor(examResultData.timeSpentSeconds / 60)}p {examResultData.timeSpentSeconds % 60}s
                      </div>
                    </div>
                  </div>

                  {/* Mistake notebook auto-sync reminder */}
                  <div
                    style={{
                      padding: '12px 16px',
                      backgroundColor: '#eff6ff',
                      border: '1px solid #bfdbfe',
                      borderRadius: '6px',
                      fontSize: '0.84rem',
                      color: '#1e40af',
                      marginBottom: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <BookOpen size={18} style={{ flexShrink: 0 }} />
                    <span>
                      <strong>Đồng bộ Sổ tay lỗi sai:</strong> Các câu làm sai trong bài kiểm tra này đã được tự động ghi vào <strong>Sổ tay lỗi sai</strong> của bạn để luyện tập khắc phục lỗ hổng kiến thức!
                    </span>
                  </div>

                  {/* Detailed Question Review List */}
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>
                    Chi tiết từng câu hỏi & Lời giải
                  </h4>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {examResultData.questions.map((q, idx) => (
                      <div
                        key={q.id}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '8px',
                          padding: '18px 22px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>
                            Câu {idx + 1}: {q.skillTitle}
                          </span>
                          {q.isCorrect ? (
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                backgroundColor: '#dcfce7',
                                color: '#15803d',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <CheckCircle size={13} />
                              <span>ĐÚNG (+{q.pointsAwarded ?? 1} điểm thô)</span>
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '3px 10px',
                                borderRadius: '12px',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                backgroundColor: '#fee2e2',
                                color: '#b91c1c',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <XCircle size={13} />
                              <span>{q.pointsAwarded > 0 ? `ĐÚNG MỘT PHẦN (+${q.pointsAwarded} điểm thô)` : 'CHƯA ĐÚNG (0 điểm thô)'}</span>
                            </span>
                          )}
                        </div>

                        {/* Question Content */}
                        <div style={{ fontSize: '1.02rem', fontWeight: 600, color: '#1e293b', marginBottom: '14px', lineHeight: 1.5 }}>
                          <MathRenderer content={q.content} />
                        </div>

                        <MathQuestionResult question={q} />

                        {/* Step-by-step Solution */}
                        {q.explanation && (
                          <div
                            style={{
                              padding: '12px 16px',
                              backgroundColor: '#fffbeb',
                              border: '1px solid #fde68a',
                              borderRadius: '6px',
                              fontSize: '0.88rem',
                              color: '#92400e',
                              marginTop: '10px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '6px' }}>
                              <Lightbulb size={16} />
                              <span>Lời giải chi tiết & Phương pháp giải:</span>
                            </div>
                            <div style={{ lineHeight: 1.5, color: '#78350f' }}>
                              <MathRenderer content={q.explanation} />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: '14px 24px',
                    borderTop: '2px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    justifyContent: 'flex-end'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setViewingResultAssignmentId(null);
                      setExamResultData(null);
                    }}
                    style={{
                      padding: '8px 24px',
                      backgroundColor: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: 'pointer'
                    }}
                  >
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
