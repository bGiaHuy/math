import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Copy,
  Check,
  Maximize2,
  X,
  AlertCircle,
  RefreshCw,
  Clock,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  Calendar,
  Layers,
  ChevronRight,
  FileText,
  BarChart2,
  Trash2,
  Search,
  CheckCircle2,
  Award,
  HelpCircle,
  Send,
  Eye,
  Download,
  Upload,
  Bot,
  FileCode
} from 'lucide-react';
import { classroomApi, assignmentApi, adminApi } from '../lib/apiClient';
import MathRenderer from './MathRenderer';
import QuestionBankView from './QuestionBankView';
import TeacherExamComposer, { DEFAULT_QUESTION_COUNTS, countQuestions, QUESTION_LABELS } from './TeacherExamComposer';

const COGNITIVE_LEVEL_MAP = {
  REMEMBERING: 'Nhận biết',
  UNDERSTANDING: 'Thông hiểu',
  APPLYING: 'Vận dụng',
  ADVANCED_APPLYING: 'Vận dụng cao',
  ANALYZING: 'Vận dụng cao'
};

export const AI_EXAM_PROMPT_TEMPLATE = `Soạn đề Toán theo tài liệu và số lượng từng loại được yêu cầu. Chỉ trả JSON {title, description, durationMinutes, questions}.
Mỗi câu có skillId phù hợp từ danh mục, questionType, content, explanation và difficulty: EASY (Dễ), MEDIUM (Trung bình), HARD (Khó), VERY_HARD (Rất khó). Phân loại theo nội dung thực tế; không ép ma trận chuyên đề, mức nhận thức, tỷ lệ hoặc vị trí độ khó.
SINGLE_CHOICE có 4 options {key:A/B/C/D,content}, correctOption. TRUE_FALSE có 4 statements {key:a/b/c/d,content,isCorrect:boolean}. SHORT_ANSWER có shortAnswer {mode,acceptedAnswers,instructions,tolerance,caseSensitive}; ghi rõ cách nhập, đơn vị và làm tròn.
Không đủ dữ kiện thì báo thiếu, không tạo câu giả. Công thức dùng LaTeX đúng JSON.`;


export default function TeacherClassroomsView({ currentUser }) {
  const readOnly = currentUser?.role === 'ADMIN';
  const [showBank, setShowBank] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedClassDetails, setSelectedClassDetails] = useState(null);
  const [students, setStudents] = useState([]);
  const [classSubTab, setClassSubTab] = useState('assignments'); // 'assignments' | 'students'

  // Assignments State
  const [assignments, setAssignments] = useState([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [fullscreenCode, setFullscreenCode] = useState(null);
  const [confirmRevokeCodeId, setConfirmRevokeCodeId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [freshInvite, setFreshInvite] = useState(null);

  // Modal create class
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [className, setClassName] = useState('');
  const [classGrade, setClassGrade] = useState(9);
  const [academicYear, setAcademicYear] = useState('2026-2027');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Modal create assignment / exam
  const [showCreateExamModal, setShowCreateExamModal] = useState(false);
  const [examTitle, setExamTitle] = useState('');
  const [examDescription, setExamDescription] = useState('');
  const [trackTabSwitches, setTrackTabSwitches] = useState(true);
  const [examDuration, setExamDuration] = useState(15);
  const [examDueDate, setExamDueDate] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [questionCounts, setQuestionCounts] = useState({ ...DEFAULT_QUESTION_COUNTS });
  const [questionBankError, setQuestionBankError] = useState('');
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isCreatingExam, setIsCreatingExam] = useState(false);
  const [createExamError, setCreateExamError] = useState('');
  const [customQuestions, setCustomQuestions] = useState([]);
  const [showAiPromptModal, setShowAiPromptModal] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  // Scoreboard Modal
  const [scoreboardAssignmentId, setScoreboardAssignmentId] = useState(null);
  const [scoreboardData, setScoreboardData] = useState(null);
  const [isLoadingScoreboard, setIsLoadingScoreboard] = useState(false);

  const fetchClassrooms = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await classroomApi.getTeacherClassrooms();
      const list = Array.isArray(data) ? data : (data.classrooms || []);
      setClassrooms(list);
      if (list.length > 0 && !selectedClassId) {
        setSelectedClassId(list[0].id);
      }
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách lớp học.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClassDetails = async (classId) => {
    if (!classId) return;
    setIsLoadingDetails(true);
    try {
      const [detailsData, studentsData, assignmentsData] = await Promise.all([
        classroomApi.getClassroomDetails(classId),
        classroomApi.getClassroomStudents(classId),
        assignmentApi.getClassAssignments(classId).catch(() => ({ assignments: [] }))
      ]);
      setSelectedClassDetails(detailsData.classroom || detailsData || null);
      setStudents(Array.isArray(studentsData) ? studentsData : (studentsData.students || []));
      setAssignments(assignmentsData.assignments || []);
    } catch (err) {
      setError(err.message || 'Không thể tải chi tiết lớp học.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const fetchAssignments = async (classId) => {
    if (!classId) return;
    setIsLoadingAssignments(true);
    try {
      const res = await assignmentApi.getClassAssignments(classId);
      setAssignments(res.assignments || []);
    } catch (err) {
      // Silently catch
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  useEffect(() => {
    fetchClassrooms();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchClassDetails(selectedClassId);
    }
  }, [selectedClassId]);

  // Load published questions for exam creator
  const loadAvailableQuestions = async () => {
    setIsLoadingQuestions(true);
    setQuestionBankError('');
    try {
      const res = await assignmentApi.getQuestionBank();
      setAvailableQuestions(res.questions || res || []);
    } catch (err) {
      setQuestionBankError(err.message || 'Không thể tải ngân hàng câu hỏi.');
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const handleOpenCreateExamModal = () => {
    if (readOnly) return;
    setExamTitle(`Kiểm tra ${examDuration > 0 ? `${examDuration} phút` : 'chủ đề'} - ${selectedClassDetails?.name || 'Lớp'}`);
    setExamDescription('Đọc kỹ từng phần: chọn một đáp án, đánh dấu đúng/sai từng ý hoặc nhập câu trả lời ngắn.');
    setQuestionCounts({ ...DEFAULT_QUESTION_COUNTS });
    setSelectedQuestionIds([]);
    setCustomQuestions([]);
    setCreateExamError('');
    setShowCreateExamModal(true);
    loadAvailableQuestions();
  };

  const handleDownloadSampleTemplate = async () => {
    try {
      const res = await assignmentApi.getSampleExamTemplate();
      const data = res?.result || res || {};
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'de-thi-mau-adaptive.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message || 'Không tải được mẫu ma trận. Hãy thử lại.' });
    }
  };

  const handleCopyAiPrompt = async () => {
    try {
      const [matrix, template] = await Promise.all([assignmentApi.getBlueprint(), assignmentApi.getSampleExamTemplate()]);
      await navigator.clipboard.writeText(AI_EXAM_PROMPT_TEMPLATE + '\n' + JSON.stringify({ questionCounts, availableSkills: template.questions.map(q => ({ skillId: q.skillId })) }, null, 2));
      setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 2500);
    } catch (err) { setActionNotice({ type: 'error', text: err.message || 'Không tải được ma trận.' }); }
  };

  const handleCreateAssignment = async (e) => {
    if (readOnly) return;
    e.preventDefault();
    if (!examTitle.trim()) {
      setCreateExamError('Vui lòng nhập tiêu đề đề thi.');
      return;
    }
    const totalCount = selectedQuestionIds.length + customQuestions.length;
    if (totalCount === 0) {
      setCreateExamError('Vui lòng thêm ít nhất 1 câu hỏi cho đề thi (tự tạo, nhập từ AI hoặc chọn từ ngân hàng).');
      return;
    }

    const actualCounts = countQuestions(availableQuestions, selectedQuestionIds, customQuestions);
    const invalidType = Object.keys(DEFAULT_QUESTION_COUNTS).find(type => !Number.isInteger(Number(questionCounts[type])) || Number(questionCounts[type]) < 0 || Number(questionCounts[type]) > 200 || actualCounts[type] !== Number(questionCounts[type]));
    if (invalidType) {
      setCreateExamError(`Số câu ${QUESTION_LABELS[invalidType]} chưa khớp: đã chọn ${actualCounts[invalidType]}, cần ${questionCounts[invalidType] || 0}.`);
      return;
    }
    setIsCreatingExam(true);
    setCreateExamError('');
    try {
      await assignmentApi.createAssignment(selectedClassId, {
        title: examTitle.trim(),
        description: examDescription.trim() || undefined,
        durationMinutes: Number(examDuration),
        settings: { trackTabSwitches },
        dueDate: examDueDate ? new Date(examDueDate).toISOString() : undefined,
        questionCounts: Object.fromEntries(Object.entries(questionCounts).map(([type, value]) => [type, Number(value)])),
        questionIds: selectedQuestionIds.length > 0 ? selectedQuestionIds : undefined,
        customQuestions: customQuestions.length > 0
          ? customQuestions.map(q => ({
              questionType: q.questionType || 'SINGLE_CHOICE',
              content: q.content,
              options: q.options,
              correctOption: q.correctOption,
              statements: q.statements,
              shortAnswer: q.shortAnswer,
              explanation: q.explanation || undefined,
              cognitiveLevel: q.cognitiveLevel,
              skillId: q.skillId,
              difficulty: q.difficulty
            }))
          : undefined
      });
      setShowCreateExamModal(false);
      setCustomQuestions([]);
      setSelectedQuestionIds([]);
      setActionNotice({ type: 'success', text: `Đã phát hành đề kiểm tra mới gồm ${totalCount} câu cho lớp thành công!` });
      await fetchAssignments(selectedClassId);
    } catch (err) {
      setCreateExamError(err.message || 'Không thể tạo đề thi.');
    } finally {
      setIsCreatingExam(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (readOnly) return;
    if (!window.confirm('Thầy/cô có chắc chắn muốn xóa đề kiểm tra này khỏi lớp?')) return;
    try {
      await assignmentApi.deleteAssignment(selectedClassId, assignmentId);
      setActionNotice({ type: 'success', text: 'Đã xóa đề kiểm tra thành công.' });
      await fetchAssignments(selectedClassId);
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message || 'Không thể xóa đề thi.' });
    }
  };

  const handleOpenScoreboard = async (assignmentId) => {
    setScoreboardAssignmentId(assignmentId);
    setIsLoadingScoreboard(true);
    setScoreboardData(null);
    try {
      const data = await assignmentApi.getAssignmentSubmissions(selectedClassId, assignmentId);
      setScoreboardData(data);
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message || 'Không thể tải bảng điểm.' });
      setScoreboardAssignmentId(null);
    } finally {
      setIsLoadingScoreboard(false);
    }
  };

  const handleCreateClass = async (e) => {
    if (readOnly) return;
    e.preventDefault();
    if (!className.trim()) {
      setCreateError('Vui lòng nhập tên lớp học.');
      return;
    }

    setIsCreating(true);
    setCreateError('');
    try {
      const res = await classroomApi.createClassroom({
        name: className.trim(),
        grade: Number(classGrade),
        academicYear: academicYear.trim()
      });
      setShowCreateModal(false);
      setClassName('');
      await fetchClassrooms();
      if (res.classroom?.id) {
        setSelectedClassId(res.classroom.id);
        if (res.classroom.inviteCode) {
          const details = await classroomApi.getClassroomDetails(res.classroom.id);
          setFreshInvite({ classId: res.classroom.id, id: details.inviteCodes?.[0]?.id, code: res.classroom.inviteCode });
        }
      }
    } catch (err) {
      setCreateError(err.message || 'Không thể tạo lớp học mới.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateCode = async (classId) => {
    if (readOnly) return;
    setActionNotice(null);
    try {
      const response = await classroomApi.generateInviteCode(classId, {
        maxUses: 45,
        expiresInDays: 30
      });
      setFreshInvite({ classId, id: response.inviteCodeId, code: response.plainCode });
      setActionNotice({ type: 'success', text: 'Đã sinh mã mời mới thành công!' });
      await fetchClassDetails(classId);
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message || 'Không thể tạo mã mời mới.' });
    }
  };

  const handleRevokeCode = async (classId, codeId) => {
    if (readOnly) return;
    setActionNotice(null);
    try {
      await classroomApi.revokeInviteCode(classId, codeId);
      if (freshInvite?.id === codeId) setFreshInvite(null);
      setConfirmRevokeCodeId(null);
      setActionNotice({ type: 'success', text: 'Đã thu hồi mã mời thành công.' });
      await fetchClassDetails(classId);
    } catch (err) {
      setActionNotice({ type: 'error', text: err.message || 'Không thể thu hồi mã mời.' });
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setActionNotice({ type: 'error', text: 'Không thể sao chép tự động. Vui lòng chọn và sao chép mã hiển thị.' });
    }
  };

  const selectedClass = classrooms.find((c) => c.id === selectedClassId);
  const activeInviteCode = selectedClassDetails?.inviteCodes?.find(
    (c) => !c.isRevoked && new Date(c.expiresAt) > new Date()
  ) || selectedClassDetails?.activeInviteCode || selectedClass?.activeInviteCode;
  const visibleInviteCode = (freshInvite && activeInviteCode && activeInviteCode.id === freshInvite.id &&
    selectedClassDetails?.id === freshInvite.classId) ? freshInvite.code : (activeInviteCode?.code || null);
  const currentDisplayCode = visibleInviteCode || activeInviteCode?.code || null;

  const composerCounts = countQuestions(availableQuestions, selectedQuestionIds, customQuestions);
  const composerReady = Object.keys(DEFAULT_QUESTION_COUNTS).every(type => questionCounts[type] !== '' && Number.isInteger(Number(questionCounts[type])) && Number(questionCounts[type]) >= 0 && Number(questionCounts[type]) <= 200 && composerCounts[type] === Number(questionCounts[type])) && selectedQuestionIds.length + customQuestions.length > 0;


  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px 0' }}>
      {readOnly && <p role="status" style={{ padding: '12px 16px', background: '#eef2ff', borderRadius: 8 }}>Chế độ quan sát: Admin chỉ xem lớp học và kết quả. Giáo viên phụ trách tự quyết định hoạt động của lớp, không cần Admin duyệt.</p>}
      <button type="button" onClick={() => setShowBank(v => !v)}>{showBank ? 'Đóng ngân hàng câu hỏi' : 'Ngân hàng câu hỏi'}</button>
      {showBank && <QuestionBankView currentUser={currentUser} />}
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
            Quản Lý Lớp Học & Đề Thi Giáo Viên
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
            Tạo lớp học, phát mã mời an toàn, tạo đề kiểm tra và theo dõi bảng điểm học sinh.
          </p>
        </div>

        <button
          type="button"
          disabled={readOnly}
                        onClick={() => setShowCreateModal(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            backgroundColor: '#047857',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(4, 120, 87, 0.25)'
          }}
        >
          <Plus size={18} />
          <span>Tạo lớp học mới</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#b91c1c',
            fontSize: '0.88rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <div>Đang tải danh sách lớp học của thầy/cô...</div>
        </div>
      ) : classrooms.length === 0 ? (
        <div
          style={{
            backgroundColor: '#fffdf7',
            border: '2px dashed #cbd5e1',
            borderRadius: '8px',
            padding: '60px 20px',
            textAlign: 'center',
            boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.08)'
          }}
        >
          <Users size={48} color="#94a3b8" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
            Thầy/cô chưa có lớp học nào
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '460px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Bắt đầu bằng việc tạo lớp đầu tiên để sinh mã mời học sinh tham gia học tập và làm bài kiểm tra.
          </p>
          <button
            type="button"
            disabled={readOnly}
                        onClick={() => setShowCreateModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              backgroundColor: '#047857',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.92rem',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            <span>Tạo lớp học ngay</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Class list column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Danh sách lớp ({classrooms.length})
            </div>

            {classrooms.map((cls) => {
              const isSelected = cls.id === selectedClassId;
              return (
                <div
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  style={{
                    backgroundColor: isSelected ? '#fffdf7' : '#ffffff',
                    border: isSelected ? '2px solid #10b981' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? '4px 4px 0 rgba(16, 185, 129, 0.2)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                      {cls.name}
                    </div>
                    <ChevronRight size={16} color={isSelected ? '#10b981' : '#94a3b8'} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '0.78rem', color: '#64748b' }}>
                    <span>Khối {cls.grade}</span>
                    <span>•</span>
                    <span>{cls.academicYear}</span>
                    <span>•</span>
                    <span>{cls.studentCount || 0} học sinh</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Details & Action Column */}
          {isLoadingDetails ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <div>Đang tải thông tin chi tiết lớp...</div>
            </div>
          ) : selectedClassDetails ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top card: Crockford Invite Code banner */}
              <div
                style={{
                  backgroundColor: '#fffdf7',
                  border: '2px solid #131a2a',
                  borderRadius: '8px',
                  padding: '24px',
                  boxShadow: '8px 8px 0 rgba(19, 26, 42, 0.16)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                  <div>
                    <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
                      {selectedClassDetails.name}
                    </h2>
                    <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
                      Năm học: {selectedClassDetails.academicYear} · Khối: {selectedClassDetails.grade} · Sĩ số: {students.length} học sinh · Đề thi: {assignments.length} đề
                    </div>
                  </div>

                  {currentDisplayCode && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setFullscreenCode(currentDisplayCode)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          backgroundColor: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          cursor: 'pointer'
                        }}
                        title="Chiếu lên máy chiếu toàn màn hình cho cả lớp"
                      >
                        <Maximize2 size={14} />
                        <span>Chiếu máy chiếu</span>
                      </button>
                    </div>
                  )}
                </div>

                {actionNotice && (
                  <div
                    role="alert"
                    style={{
                      marginTop: '14px',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      fontSize: '0.84rem',
                      fontWeight: 500,
                      backgroundColor: actionNotice.type === 'error' ? '#fef2f2' : '#ecfdf5',
                      color: actionNotice.type === 'error' ? '#b91c1c' : '#047857',
                      border: `1px solid ${actionNotice.type === 'error' ? '#fecaca' : '#a7f3d0'}`
                    }}
                  >
                    {actionNotice.text}
                  </div>
                )}

                {/* Invite code block */}
                <div
                  style={{
                    marginTop: '18px',
                    padding: '16px 20px',
                    backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#064e3b', textTransform: 'uppercase' }}>
                      Mã mời học sinh (Crockford Base32)
                    </div>
                    <div className="teacher-invite-code" style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.15em', color: '#064e3b', marginTop: '2px' }}>
                      {currentDisplayCode || (activeInviteCode ? `${activeInviteCode.codePrefix || 'CODE'}•••••` : 'CHƯA CÓ MÃ')}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#064e3b', marginTop: '2px' }}>
                      {activeInviteCode
                        ? `Hết hạn: ${new Date(activeInviteCode.expiresAt).toLocaleDateString('vi-VN')} · Đã dùng: ${activeInviteCode.usedCount || 0}/${activeInviteCode.maxUses || 50} lượt`
                        : 'Mã mời đã hết hạn hoặc chưa được tạo.'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {activeInviteCode ? (
                      <>
                        {currentDisplayCode ? (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(currentDisplayCode)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              backgroundColor: '#047857',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              cursor: 'pointer'
                            }}
                          >
                            {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copiedCode ? 'Đã sao chép!' : 'Sao chép mã'}</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#475569' }}>Mã đầy đủ chỉ hiển thị khi vừa tạo. Hãy sinh mã mới để chia sẻ.</span>
                        )}

                        {confirmRevokeCodeId === activeInviteCode.id ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.78rem', color: '#be123c', fontWeight: 600 }}>Thu hồi mã?</span>
                            <button
                              type="button"
                              disabled={readOnly}
                        onClick={() => handleRevokeCode(selectedClassDetails.id, activeInviteCode.id)}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#e11d48',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              Xác nhận
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRevokeCodeId(null)}
                              style={{
                                padding: '6px 10px',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                cursor: 'pointer'
                              }}
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={readOnly}
                        onClick={() => setConfirmRevokeCodeId(activeInviteCode.id)}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: '#fff1f2',
                              border: '1px solid #fecdd3',
                              color: '#be123c',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Thu hồi
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleGenerateCode(selectedClassDetails.id)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#047857',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        Sinh mã mời mới
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '14px', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={15} color="#059669" />
                  <span>
                    <strong>Bảo vệ ranh giới dữ liệu (D-04):</strong> Giáo viên chỉ theo dõi độ thành thạo chung và bài tập đã giao. Sổ tay lỗi sai và bài tự luyện riêng tư của học sinh được bảo mật hoàn toàn.
                  </span>
                </div>
              </div>

              {/* Sub-tabs switcher: Assignments vs Students */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                <button
                  type="button"
                  onClick={() => setClassSubTab('assignments')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: classSubTab === 'assignments' ? '#0f766e' : '#f1f5f9',
                    color: classSubTab === 'assignments' ? '#ffffff' : '#475569',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <FileText size={16} />
                  <span>Đề kiểm tra & Bài tập ({assignments.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setClassSubTab('students')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: classSubTab === 'students' ? '#0f766e' : '#f1f5f9',
                    color: classSubTab === 'students' ? '#ffffff' : '#475569',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Users size={16} />
                  <span>Danh sách học sinh ({students.length})</span>
                </button>
              </div>

              {/* TAB 1: ASSIGNMENTS & TESTS */}
              {classSubTab === 'assignments' && (
                <div
                  style={{
                    backgroundColor: '#fffdf7',
                    border: '2px solid #131a2a',
                    borderRadius: '8px',
                    padding: '24px',
                    boxShadow: '8px 8px 0 rgba(19, 26, 42, 0.16)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                        Đề kiểm tra đã giao ({assignments.length})
                      </h3>
                      <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                        Học sinh trong lớp sẽ nhìn thấy các đề kiểm tra này và làm bài có bấm giờ.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={handleDownloadSampleTemplate}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '9px 14px',
                          backgroundColor: '#f8fafc',
                          color: '#0f766e',
                          border: '1.5px solid #0f766e',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          cursor: 'pointer'
                        }}
                        title="Tải định dạng file JSON mẫu để import đề thi hoặc cung cấp cho AI"
                      >
                        <Download size={15} />
                        <span>Tải đề mẫu (.json)</span>
                      </button>

                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setShowAiPromptModal(true)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '9px 14px',
                          backgroundColor: '#f0fdfa',
                          color: '#0d9488',
                          border: '1.5px solid #2dd4bf',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          cursor: 'pointer'
                        }}
                        title="Xem và sao chép câu lệnh Prompt chuẩn để đưa vào ChatGPT / Claude / Gemini"
                      >
                        <Bot size={15} />
                        <span>Prompt mẫu cho AI</span>
                      </button>

                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={handleOpenCreateExamModal}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '9px 16px',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(15, 118, 110, 0.2)'
                        }}
                      >
                        <Plus size={16} />
                        <span>Tạo đề kiểm tra mới</span>
                      </button>
                    </div>
                  </div>

                  {isLoadingAssignments ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      <div>Đang tải đề thi...</div>
                    </div>
                  ) : assignments.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
                      <FileText size={36} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                      <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>Lớp chưa có đề kiểm tra nào</div>
                      <p style={{ fontSize: '0.84rem', color: '#64748b', maxWidth: '420px', margin: '0 auto 16px' }}>
                        Thầy/cô hãy nhấn <strong>"Tạo đề kiểm tra mới"</strong> để chọn câu hỏi từ ngân hàng hoặc sinh đề tự động giao cho lớp.
                      </p>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={handleOpenCreateExamModal}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        + Tạo đề thi đầu tiên
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {assignments.map(a => (
                        <div
                          key={a.id}
                          style={{
                            padding: '16px 20px',
                            backgroundColor: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '14px'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: '260px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{a.title}</strong>
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, backgroundColor: '#e0f2fe', color: '#0369a1' }}>
                                ⏱️ {a.durationMinutes > 0 ? `${a.durationMinutes} phút` : 'Tự do'}
                              </span>
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#475569' }}>
                                📝 {a.questionCount} câu hỏi
                              </span>
                            </div>

                            {a.description && (
                              <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
                                {a.description}
                              </p>
                            )}

                            <div style={{ display: 'flex', gap: '14px', marginTop: '8px', fontSize: '0.8rem', color: '#475569', flexWrap: 'wrap' }}>
                              <span>
                                <strong>{a.totalSubmissions}/{a.totalStudents}</strong> học sinh đã nộp
                              </span>
                              {a.averageScore !== null && (
                                <span style={{ color: '#0f766e', fontWeight: 700 }}>
                                  Điểm TB lớp: {a.averageScore}/10
                                </span>
                              )}
                              {a.dueDate && (
                                <span style={{ color: '#94a3b8' }}>
                                  Hạn nộp: {new Date(a.dueDate).toLocaleDateString('vi-VN')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenScoreboard(a.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                color: '#15803d',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                cursor: 'pointer'
                              }}
                            >
                              <BarChart2 size={15} />
                              <span>Bảng điểm & Chi tiết</span>
                            </button>

                            <button
                              type="button"
                              disabled={readOnly}
                              onClick={() => handleDeleteAssignment(a.id)}
                              style={{
                                padding: '8px',
                                backgroundColor: '#fff1f2',
                                border: '1px solid #fecdd3',
                                color: '#e11d48',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                              title="Xóa đề thi"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: STUDENTS ROSTER */}
              {classSubTab === 'students' && (
                <div
                  style={{
                    backgroundColor: '#fffdf7',
                    border: '2px solid #131a2a',
                    borderRadius: '8px',
                    padding: '24px',
                    boxShadow: '8px 8px 0 rgba(19, 26, 42, 0.16)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                      Danh Sách Học Sinh Trong Lớp ({students.length})
                    </h3>
                  </div>

                  {students.length === 0 ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                      Chưa có học sinh nào tham gia lớp này. Thầy/cô hãy chia sẻ mã mời ở trên để học sinh nhập mã vào lớp.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                            <th style={{ padding: '10px' }}>STT</th>
                            <th style={{ padding: '10px' }}>Họ và tên</th>
                            <th style={{ padding: '10px' }}>Tên đăng nhập</th>
                            <th style={{ padding: '10px' }}>Email</th>
                            <th style={{ padding: '10px' }}>Ngày tham gia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((stu, index) => (
                            <tr key={stu.id || index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px', color: '#94a3b8' }}>{index + 1}</td>
                              <td style={{ padding: '10px', fontWeight: 700, color: '#0f172a' }}>{stu.fullName}</td>
                              <td style={{ padding: '10px', color: '#475569', fontFamily: 'monospace' }}>{stu.username}</td>
                              <td style={{ padding: '10px', color: '#64748b' }}>{stu.email || '—'}</td>
                              <td style={{ padding: '10px', color: '#64748b' }}>
                                {stu.joinedAt ? new Date(stu.joinedAt).toLocaleDateString('vi-VN') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE EXAM / ASSIGNMENT */}
      {/* ========================================================================= */}
      {showCreateExamModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              maxWidth: '860px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffdf7' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  Tạo Đề Kiểm Tra Mới — {selectedClassDetails?.name}
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                  Chọn câu hỏi chuẩn từ Ngân hàng câu hỏi của hệ thống để giao cho học sinh.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateExamModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {createExamError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.86rem', marginBottom: '16px' }}>
                  {createExamError}
                </div>
              )}

              {/* Basic Details Form */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Tiêu đề bài kiểm tra <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder="Ví dụ: Kiểm tra 15 phút - Rút gọn căn thức"
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 600 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Thời lượng làm bài
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[15, 45, 60, 90, 0].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setExamDuration(mins)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '4px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          border: examDuration === mins ? '2px solid #0f766e' : '1px solid #cbd5e1',
                          backgroundColor: examDuration === mins ? '#f0fdf4' : '#ffffff',
                          color: examDuration === mins ? '#0f766e' : '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        {mins === 0 ? 'Tự do' : `${mins}p`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Hạn nộp bài (tùy chọn)
                  </label>
                  <input
                    type="date"
                    value={examDueDate}
                    onChange={(e) => setExamDueDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Hướng dẫn / Ghi chú cho học sinh
                  </label>
                  <input
                    type="text"
                    value={examDescription}
                    onChange={(e) => setExamDescription(e.target.value)}
                    placeholder="Ví dụ: Đọc kỹ đề bài, tính toán cẩn thận ra giấy nháp trước khi chọn đáp án."
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

<label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><input type="checkbox" checked={trackTabSwitches} onChange={e => setTrackTabSwitches(e.target.checked)} />Kiểm tra thoát tab</label>
              <TeacherExamComposer bank={availableQuestions} loading={isLoadingQuestions} loadError={questionBankError}
                counts={questionCounts} setCounts={setQuestionCounts} selectedIds={selectedQuestionIds} setSelectedIds={setSelectedQuestionIds}
                custom={customQuestions} setCustom={setCustomQuestions} onRetry={loadAvailableQuestions} />
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffdf7' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                Tổng cộng: <strong style={{ color: '#0f766e' }}>{selectedQuestionIds.length + customQuestions.length}</strong> câu hỏi
                {customQuestions.length > 0 && ` (${customQuestions.length} tự tạo/AI, ${selectedQuestionIds.length} từ ngân hàng)`}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateExamModal(false)}
                  disabled={isCreatingExam}
                  style={{ padding: '9px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.88rem', cursor: 'pointer' }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleCreateAssignment}
                  disabled={isCreatingExam || !composerReady || !examTitle.trim()}
                  style={{
                    padding: '9px 20px',
                    backgroundColor: !composerReady || !examTitle.trim() ? '#94a3b8' : '#0f766e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: !composerReady || !examTitle.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isCreatingExam ? 'Đang phát hành...' : 'Phát hành đề thi cho lớp'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL AI PROMPT & FORMAT GUIDANCE */}
      {/* ========================================================================= */}
      {showAiPromptModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              maxWidth: '780px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f0fdfa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '8px', backgroundColor: '#ccfbf1', borderRadius: '8px', color: '#0f766e' }}>
                  <Bot size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Prompt Chuẩn Tạo Đề Thi Trắc Nghiệm Bằng AI
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0' }}>
                    Sử dụng với ChatGPT, Claude hoặc Google Gemini để tạo đề đúng 100% định dạng hệ thống
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiPromptModal(false)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {/* Instructions steps */}
              <div style={{ marginBottom: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                  Quy trình 4 bước tạo đề nhanh bằng AI:
                </h4>
                <ol style={{ fontSize: '0.84rem', color: '#334155', paddingLeft: '18px', margin: 0, lineHeight: 1.6 }}>
                  <li>Nhấn nút <strong>"Sao chép Prompt"</strong> bên dưới.</li>
                  <li>Dán vào ChatGPT / Claude / Gemini và đính kèm nội dung đề bài (hoặc file tài liệu, sách giáo khoa).</li>
                  <li>Nhận kết quả JSON do AI tạo ra (sao chép toàn bộ hoặc lưu file <code>.json</code>).</li>
                  <li>Mở <strong>"Tạo đề kiểm tra mới"</strong> → Chọn tab <strong>"Nhập từ AI / File JSON"</strong> → Dán vào để hệ thống tự động kiểm tra và nhập đề!</li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleCopyAiPrompt}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 18px',
                    backgroundColor: copiedPrompt ? '#15803d' : '#0f766e',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer'
                  }}
                >
                  {copiedPrompt ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedPrompt ? 'Đã sao chép vào bộ nhớ tạm!' : 'Sao chép Prompt'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadSampleTemplate}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 18px',
                    backgroundColor: '#ffffff',
                    color: '#0f766e',
                    border: '1.5px solid #0f766e',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={16} />
                  <span>Tải file đề mẫu (.json)</span>
                </button>
              </div>

              {/* Prompt Text Display */}
              <div style={{ position: 'relative' }}>
                <pre
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                    maxHeight: '320px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace'
                  }}
                >
                  {AI_EXAM_PROMPT_TEMPLATE}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setShowAiPromptModal(false)}
                style={{ padding: '8px 18px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.86rem', cursor: 'pointer' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SCOREBOARD & SUBMISSIONS */}
      {/* ========================================================================= */}
      {scoreboardAssignmentId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              maxWidth: '920px',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffdf7' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  Bảng Điểm: {scoreboardData?.assignment?.title || 'Đề kiểm tra'}
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                  Thời lượng: {scoreboardData?.assignment?.durationMinutes ? `${scoreboardData.assignment.durationMinutes} phút` : 'Tự do'} · Lớp: {selectedClassDetails?.name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScoreboardAssignmentId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {isLoadingScoreboard ? (
                <div style={{ padding: '50px', textAlign: 'center', color: '#64748b' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                  <div>Đang tải kết quả bài làm của lớp...</div>
                </div>
              ) : scoreboardData ? (
                <div>
                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '22px' }}>
                    <div style={{ padding: '14px 18px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Số bài đã nộp</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#14532d', marginTop: '4px' }}>
                        {scoreboardData.assignment.submittedCount} / {scoreboardData.assignment.totalStudents}
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>Điểm trung bình lớp</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0c4a6e', marginTop: '4px' }}>
                        {scoreboardData.assignment.averageScore} <span style={{ fontSize: '1rem', fontWeight: 600 }}>/ 10</span>
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px', backgroundColor: '#fffdf7', border: '1px solid #fed7aa', borderRadius: '8px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Tỷ lệ nộp bài</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#9a3412', marginTop: '4px' }}>
                        {scoreboardData.assignment.totalStudents > 0
                          ? Math.round((scoreboardData.assignment.submittedCount / scoreboardData.assignment.totalStudents) * 100)
                          : 0}%
                      </div>
                    </div>
                  </div>

                  {/* Student Scores Table */}
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
                      Bảng Điểm Từng Học Sinh
                    </h4>

                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                            <th style={{ padding: '10px 14px' }}>Họ và tên</th>
                            <th style={{ padding: '10px 14px' }}>Tài khoản</th>
                            <th style={{ padding: '10px 14px' }}>Trạng thái</th>
                            <th style={{ padding: '10px 14px' }}>Điểm số</th>
                            <th style={{ padding: '10px 14px' }}>Số câu đúng</th>
                            <th style={{ padding: '10px 14px' }}>Thời gian làm</th>
                            <th style={{ padding: '10px 14px' }}>Thời điểm nộp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scoreboardData.roster.map((stu, i) => (
                            <tr key={stu.studentId || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>{stu.fullName}</td>
                              <td style={{ padding: '10px 14px', color: '#64748b', fontFamily: 'monospace' }}>{stu.username}</td>
                              <td style={{ padding: '10px 14px' }}>
                                {stu.isSubmitted ? (
                                  <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d' }}>
                                    ✓ Đã nộp
                                  </span>
                                ) : (
                                  <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#64748b' }}>
                                    Chưa nộp
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.95rem', color: stu.isSubmitted ? '#0f766e' : '#94a3b8' }}>
                                {stu.score !== null ? `${stu.score}/10` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#475569' }}>
                                {stu.correctCount !== null ? `${stu.correctCount}/${stu.totalQuestions}` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                {stu.timeSpentSeconds !== null ? `${Math.floor(stu.timeSpentSeconds / 60)}p ${stu.timeSpentSeconds % 60}s` : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', color: '#64748b' }}>
                                {stu.submittedAt ? new Date(stu.submittedAt).toLocaleString('vi-VN') : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Question Accuracy Analytics */}
                  {scoreboardData.questionAnalytics && scoreboardData.questionAnalytics.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                        Phân Tích Tỷ Lệ Làm Đúng Từng Câu Hỏi
                      </h4>
                      <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '14px' }}>
                        Giúp thầy cô nhận diện các câu hỏi mà học sinh hay mắc bẫy hoặc kỹ năng còn yếu.
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {scoreboardData.questionAnalytics.map((qa) => {
                          const isLow = qa.accuracyPercentage < 50;
                          return (
                            <div
                              key={qa.questionId}
                              style={{
                                padding: '12px 16px',
                                border: isLow ? '1px solid #fde68a' : '1px solid #e2e8f0',
                                backgroundColor: isLow ? '#fffbeb' : '#ffffff',
                                borderRadius: '6px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <strong style={{ color: '#0f172a', fontSize: '0.88rem' }}>Câu {qa.orderIndex}:</strong>
                                  <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#475569' }}>
                                    {qa.skillTitle || 'Toán 9'}
                                  </span>
                                  {isLow && (
                                    <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 700 }}>
                                      ⚠️ Tỷ lệ đúng thấp
                                    </span>
                                  )}
                                </div>

                                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: isLow ? '#b45309' : '#059669' }}>
                                  {qa.accuracyPercentage}% ({qa.correctAnswers}/{qa.totalAnswers} đúng)
                                </span>
                              </div>

                              <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${qa.accuracyPercentage}%`,
                                    height: '100%',
                                    backgroundColor: isLow ? '#f59e0b' : '#10b981',
                                    borderRadius: '3px'
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#fffdf7' }}>
              <button
                type="button"
                onClick={() => setScoreboardAssignmentId(null)}
                style={{ padding: '8px 18px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
              >
                Đóng bảng điểm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE CLASS */}
      {/* ========================================================================= */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                Tạo Lớp Học Mới
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {createError && (
              <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateClass}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Tên lớp học <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Toán 9A1 - Chuyên Đề Đại Số"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Khối lớp
                  </label>
                  <select
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                    value={classGrade}
                    onChange={(e) => setClassGrade(Number(e.target.value))}
                    disabled={isCreating}
                  >
                    <option value={6}>Khối 6</option>
                    <option value={7}>Khối 7</option>
                    <option value={8}>Khối 8</option>
                    <option value={9}>Khối 9</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Năm học
                  </label>
                  <input
                    type="text"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                  style={{ padding: '10px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', fontSize: '0.88rem' }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  style={{ padding: '10px 20px', background: '#047857', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
                >
                  {isCreating ? 'Đang tạo...' : 'Tạo lớp và mở mã mời'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projector Fullscreen Code Modal */}
      {fullscreenCode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: '#0f172a',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '30px'
          }}
        >
          <button
            type="button"
            onClick={() => setFullscreenCode(null)}
            style={{
              position: 'absolute',
              top: '30px',
              right: '30px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#ffffff',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={28} />
          </button>

          <div style={{ textAlign: 'center', maxWidth: '800px' }}>
            <div style={{ fontSize: '1.5rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '20px' }}>
              Mã Tham Gia Lớp Học
            </div>
            <div
              style={{
                fontSize: 'clamp(4rem, 15vw, 8rem)',
                fontWeight: 900,
                fontFamily: 'monospace',
                letterSpacing: '0.2em',
                color: '#34d399',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '4px dashed #10b981',
                borderRadius: '16px',
                padding: '30px 60px',
                margin: '0 auto 30px'
              }}
            >
              {fullscreenCode}
            </div>
            <p style={{ fontSize: '1.3rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              Học sinh đăng nhập tài khoản ➔ Chọn <strong>Lớp học</strong> ➔ Nhập mã trên để vào lớp.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
