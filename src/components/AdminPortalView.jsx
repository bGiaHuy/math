import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  UserCheck,
  FileQuestion,
  History,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  Filter,
  Eye,
  Lock,
  Unlock,
  Key,
  Calendar,
  Layers,
  School,
  Search,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  BookOpen
} from 'lucide-react';
import { adminApi, curriculumApi } from '../lib/apiClient';

export const isMockAccount = (user) => {
  if (!user) return false;
  const username = (user.username || '').toLowerCase();
  const fullName = (user.fullName || '').toLowerCase();
  const email = (user.email || '').toLowerCase();
  const mockUsernames = ['admin', 'thaynam', 'duc_nguyen', 'teacher_pending', 'co_thu_trang', 'hocsinh_demo', 'student_demo'];
  if (mockUsernames.includes(username)) return true;
  if (fullName.includes('mock') || fullName.includes('mẫu')) return true;
  if (email.includes('demo') || email.includes('mock') || email.includes('applicant')) return true;
  return false;
};

export default function AdminPortalView({ currentUser, defaultTab = 'overview' }) {
  const [activeSubTab, setActiveSubTab] = useState(defaultTab === 'applicants' ? 'users' : defaultTab); // 'overview' | 'users' | 'classrooms' | 'questions' | 'audit'

  useEffect(() => { setActiveSubTab(defaultTab === 'applicants' ? 'users' : defaultTab); }, [defaultTab]);

  // Overview State
  const [overview, setOverview] = useState(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);

  // Users Management State
  const [usersList, setUsersList] = useState([]);
  const [usersPagination, setUsersPagination] = useState({ total: 0, page: 1, limit: 15, totalPages: 1 });
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUserForReset, setSelectedUserForReset] = useState(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordFeedback, setResetPasswordFeedback] = useState(null);
  const [userBeingToggled, setUserBeingToggled] = useState(null);

  // Classrooms Management State
  const [classroomsList, setClassroomsList] = useState([]);
  const [isLoadingClassrooms, setIsLoadingClassrooms] = useState(false);
  const [classroomSearch, setClassroomSearch] = useState('');

  // Questions State
  const [questions, setQuestions] = useState([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [questionStatusFilter, setQuestionStatusFilter] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [reviewAction, setReviewAction] = useState('PUBLISHED'); // 'PUBLISHED' | 'DRAFT'
  const [reviewComments, setReviewComments] = useState('');
  const [isReviewingQuestion, setIsReviewingQuestion] = useState(false);
  const [skillsList, setSkillsList] = useState([]);

  // Create Question Modal
  const [showCreateQModal, setShowCreateQModal] = useState(false);
  const [newQSkillId, setNewQSkillId] = useState('');
  const [newQLevel, setNewQLevel] = useState('REMEMBERING');
  const [newQContent, setNewQContent] = useState('');
  const [newQExplanation, setNewQExplanation] = useState('');
  const [newQOptions, setNewQOptions] = useState([
    { optionKey: 'A', content: '', isCorrect: true },
    { optionKey: 'B', content: '', isCorrect: false },
    { optionKey: 'C', content: '', isCorrect: false },
    { optionKey: 'D', content: '', isCorrect: false }
  ]);
  const [isCreatingQ, setIsCreatingQ] = useState(false);
  const [createQError, setCreateQError] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // General Notification
  const [feedback, setFeedback] = useState(null);

  const fetchOverview = async () => {
    setIsLoadingOverview(true);
    try {
      const data = await adminApi.getOverview();
      setOverview(data);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Không thể tải số liệu tổng quan.' });
    } finally {
      setIsLoadingOverview(false);
    }
  };

  const fetchQuestions = async () => {
    setIsLoadingQuestions(true);
    try {
      const data = await adminApi.getQuestions(questionStatusFilter || undefined);
      const list = Array.isArray(data) ? data : (data?.questions || []);
      setQuestions(list);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Không thể tải danh sách câu hỏi.' });
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const fetchAuditLogs = async () => {
    setIsLoadingAudit(true);
    try {
      const data = await adminApi.getAuditLogs(50);
      const list = Array.isArray(data) ? data : (data?.logs || data?.auditLogs || []);
      setAuditLogs(list);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Không thể tải nhật ký kiểm toán.' });
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const fetchUsers = async (page = 1) => {
    setIsLoadingUsers(true);
    try {
      const data = await adminApi.getUsers({
        page,
        limit: 15,
        role: userRoleFilter || undefined,
        status: userStatusFilter || undefined,
        search: userSearchQuery.trim() || undefined
      });
      setUsersList(data.users || []);
      setUsersPagination(data.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Không thể tải danh sách người dùng.' });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchClassrooms = async () => {
    setIsLoadingClassrooms(true);
    try {
      const data = await adminApi.getAllClassrooms();
      setClassroomsList(data.classrooms || []);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Không thể tải danh sách lớp học.' });
    } finally {
      setIsLoadingClassrooms(false);
    }
  };

  const handleToggleUserStatus = async (user) => {
    const newStatus = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const actionText = newStatus === 'SUSPENDED' ? 'khóa tài khoản' : 'mở khóa tài khoản';
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} của ${user.fullName || user.username}? Khi khóa, toàn bộ phiên đăng nhập đang hoạt động của người dùng sẽ bị hủy ngay lập tức.`)) {
      return;
    }
    setUserBeingToggled(user.id);
    try {
      await adminApi.updateUserStatus(user.id, newStatus);
      setFeedback({
        type: 'success',
        message: `Đã ${newStatus === 'SUSPENDED' ? 'khóa' : 'kích hoạt lại'} tài khoản ${user.username} thành công. Phiên đăng nhập đã được hủy.`
      });
      await fetchUsers(usersPagination.page);
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Không thể cập nhật trạng thái người dùng.' });
    } finally {
      setUserBeingToggled(null);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedUserForReset) return;
    if (!newPasswordInput || newPasswordInput.length < 8) {
      setResetPasswordFeedback({ type: 'error', message: 'Mật khẩu mới phải có tối thiểu 8 ký tự.' });
      return;
    }
    setIsResettingPassword(true);
    setResetPasswordFeedback(null);
    try {
      await adminApi.resetUserPassword(selectedUserForReset.id, newPasswordInput);
      setResetPasswordFeedback({
        type: 'success',
        message: `Đã đặt lại mật khẩu cho ${selectedUserForReset.username} thành công! Mật khẩu mới là: ${newPasswordInput}`
      });
      setFeedback({
        type: 'success',
        message: `Đặt lại mật khẩu cho ${selectedUserForReset.username} thành công. Phiên đăng nhập cũ đã bị hủy.`
      });
    } catch (err) {
      setResetPasswordFeedback({ type: 'error', message: err.message || 'Lỗi khi đặt lại mật khẩu.' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const fetchSkills = async () => {
    try {
      const data = await curriculumApi.getSkills(9);
      const flattened = [];
      (data.chapters || []).forEach((c) => {
        (c.skills || []).forEach((s) => flattened.push(s));
      });
      setSkillsList(flattened);
      if (flattened.length > 0 && !newQSkillId) {
        setNewQSkillId(flattened[0].id);
      }
    } catch {
      // Non-critical
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'overview') fetchOverview();
    else if (activeSubTab === 'users') fetchUsers(1);
    else if (activeSubTab === 'classrooms') fetchClassrooms();
    else if (activeSubTab === 'questions') fetchQuestions();
    else if (activeSubTab === 'audit') fetchAuditLogs();
  }, [activeSubTab, questionStatusFilter, userRoleFilter, userStatusFilter]);

  const handleReviewQuestion = async () => {
    if (!selectedQuestion) return;
    setIsReviewingQuestion(true);
    try {
      await adminApi.reviewQuestion(selectedQuestion.id, {
        status: reviewAction,
        comments: reviewComments || undefined
      });
      setFeedback({
        type: 'success',
        message: `Đã cập nhật trạng thái câu hỏi sang ${reviewAction} thành công.`
      });
      setSelectedQuestion(null);
      setReviewComments('');
      await fetchQuestions();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi thẩm định câu hỏi.' });
    } finally {
      setIsReviewingQuestion(false);
    }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    setCreateQError('');
    if (!newQContent.trim()) {
      setCreateQError('Vui lòng nhập nội dung câu hỏi.');
      return;
    }
    if (!newQOptions.some((o) => o.isCorrect)) {
      setCreateQError('Vui lòng chọn ít nhất 1 đáp án đúng.');
      return;
    }

    setIsCreatingQ(true);
    try {
      await adminApi.createQuestion({
        skillId: newQSkillId,
        cognitiveLevel: newQLevel,
        content: newQContent.trim(),
        explanation: newQExplanation.trim() || undefined,
        options: newQOptions
      });
      setShowCreateQModal(false);
      setNewQContent('');
      setNewQExplanation('');
      setCreateQError('');
      setFeedback({
        type: 'success',
        message: 'Tạo câu hỏi mới thành công ở trạng thái DRAFT. Đang chờ reviewer khác thẩm định (Maker-Checker).'
      });
      await fetchQuestions();
    } catch (err) {
      setCreateQError(err.message || 'Không thể tạo câu hỏi.');
    } finally {
      setIsCreatingQ(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '10px 0' }}>
      {/* Top Title & Sub-tabs */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
          Trung Tâm Quản Trị Hệ Thống & Kiểm Duyệt Nội Dung
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '4px' }}>
          Quản lý người dùng, phê duyệt giáo viên ứng tuyển, biên tập câu hỏi Maker-Checker và kiểm tra nhật ký kiểm toán.
        </p>

        {/* Sub-nav Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', marginTop: '20px', paddingBottom: '2px' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: activeSubTab === 'overview' ? '#10b981' : '#64748b',
              borderBottom: activeSubTab === 'overview' ? '3px solid #10b981' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <ShieldCheck size={16} />
            <span>Tổng quan hệ thống</span>
          </button>



          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: activeSubTab === 'users' ? '#10b981' : '#64748b',
              borderBottom: activeSubTab === 'users' ? '3px solid #10b981' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Users size={16} />
            <span>Quản lý người dùng</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('classrooms')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: activeSubTab === 'classrooms' ? '#10b981' : '#64748b',
              borderBottom: activeSubTab === 'classrooms' ? '3px solid #10b981' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <School size={16} />
            <span>Quản lý lớp học</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('questions')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: activeSubTab === 'questions' ? '#10b981' : '#64748b',
              borderBottom: activeSubTab === 'questions' ? '3px solid #10b981' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FileQuestion size={16} />
            <span>Ngân hàng câu hỏi</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('audit')}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              color: activeSubTab === 'audit' ? '#10b981' : '#64748b',
              borderBottom: activeSubTab === 'audit' ? '3px solid #10b981' : '3px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <History size={16} />
            <span>Nhật ký kiểm toán (Audit Logs)</span>
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '6px',
            color: feedback.type === 'success' ? '#15803d' : '#b91c1c',
            fontSize: '0.88rem',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* SUBTAB: OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div>
          {isLoadingOverview ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Đang tải số liệu hệ thống...</div>
            </div>
          ) : overview ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '18px' }}>
              <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '20px', boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.12)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Học sinh đang học</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>{overview.studentsCount || 0}</div>
                <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '4px' }}>Khối 9 ôn thi vào 10</div>
              </div>

              <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '20px', boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.12)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Giáo viên đã xác thực</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>{overview.verifiedTeachersCount || 0}</div>
                <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: '4px' }}>Hệ thống tự động duyệt giáo viên</div>
              </div>

              <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '20px', boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.12)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Câu hỏi đã xuất bản</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>{overview.publishedQuestionsCount || 0}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>Bản nháp / Đang duyệt: {overview.draftQuestionsCount || 0}</div>
              </div>

              <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '20px', boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.12)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Lượt thi chẩn đoán (CAT)</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>{overview.diagnosticAttemptsCount || 0}</div>
                <div style={{ fontSize: '0.78rem', color: '#0f766e', marginTop: '4px' }}>Ước lượng năng lực θ tự động</div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* SUBTAB: QUESTIONS (Maker-Checker) */}
      {activeSubTab === 'questions' && (
        <div>
          {/* Action bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Filter size={16} color="#64748b" />
              <select
                value={questionStatusFilter}
                onChange={(e) => setQuestionStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="DRAFT">Bản nháp (DRAFT)</option>
                <option value="IN_REVIEW">Chờ thẩm định (IN_REVIEW)</option>
                <option value="PUBLISHED">Đã xuất bản (PUBLISHED)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateQModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              <Plus size={16} />
              <span>Thêm câu hỏi mới</span>
            </button>
          </div>

          {/* Maker-Checker notice */}
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '12px 16px', marginBottom: '20px', fontSize: '0.82rem', color: '#1e40af' }}>
            <strong>Quy tắc Maker-Checker:</strong> Tác giả câu hỏi không thể tự phê duyệt câu hỏi của chính mình. Người duyệt bắt buộc phải là một Quản trị viên hoặc Reviewer khác.
          </div>

          {isLoadingQuestions ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Đang tải ngân hàng câu hỏi...</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {questions.map((q) => {
                const isAuthor = q.authorId === currentUser?.id;
                return (
                  <div
                    key={q.id}
                    style={{
                      backgroundColor: '#fffdf7',
                      border: '2px solid #131a2a',
                      borderRadius: '8px',
                      padding: '16px 20px',
                      boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: q.status === 'PUBLISHED' ? '#dcfce7' : q.status === 'IN_REVIEW' ? '#fef3c7' : '#f1f5f9',
                              color: q.status === 'PUBLISHED' ? '#15803d' : q.status === 'IN_REVIEW' ? '#92400e' : '#475569'
                            }}
                          >
                            {q.status}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            Mức: <strong>{q.cognitiveLevel}</strong> · Kỹ năng: <strong>{q.skill?.title || q.skillId}</strong> · Phiên bản: v{q.versionNumber}
                          </span>
                        </div>

                        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#0f172a', marginTop: '8px', lineHeight: 1.5 }}>
                          {q.content}
                        </div>
                      </div>

                      <div>
                        {q.status !== 'PUBLISHED' && (
                          <button
                            type="button"
                            onClick={() => setSelectedQuestion(q)}
                            style={{
                              padding: '6px 12px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              backgroundColor: '#10b981',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Thẩm định
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Question Review Modal */}
          {selectedQuestion && (
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
                  backgroundColor: '#fffdf7',
                  border: '2px solid #131a2a',
                  borderRadius: '8px',
                  maxWidth: '560px',
                  width: '100%',
                  padding: '28px',
                  boxShadow: '12px 12px 0 rgba(19, 26, 42, 0.2)'
                }}
              >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                  Thẩm Định Câu Hỏi (Maker-Checker Review)
                </h3>

                <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', margin: '14px 0', fontSize: '0.88rem' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{selectedQuestion.content}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '6px' }}>
                    Người tạo: {selectedQuestion.authorId}
                  </div>
                </div>

                {/* Maker-Checker violation check */}
                {selectedQuestion.authorId === currentUser?.id ? (
                  <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '16px' }}>
                    <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
                    Bạn là tác giả câu hỏi này. Theo quy chuẩn kiểm toán Maker-Checker, bạn không thể tự duyệt câu hỏi của chính mình.
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                        Quyết định thẩm định
                      </label>
                      <select
                        value={reviewAction}
                        onChange={(e) => setReviewAction(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      >
                        <option value="PUBLISHED">Phê duyệt & Xuất bản (PUBLISHED)</option>
                        <option value="DRAFT">Yêu cầu sửa lại (Trả về DRAFT)</option>
                      </select>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                        Ý kiến thẩm định
                      </label>
                      <textarea
                        style={{ width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        placeholder="Ghi chú thẩm định..."
                        value={reviewComments}
                        onChange={(e) => setReviewComments(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedQuestion(null)}
                    style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Đóng
                  </button>
                  {selectedQuestion.authorId !== currentUser?.id && (
                    <button
                      type="button"
                      onClick={handleReviewQuestion}
                      disabled={isReviewingQuestion}
                      style={{ padding: '8px 18px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {isReviewingQuestion ? 'Đang lưu...' : 'Lưu kết quả thẩm định'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Create Question Modal */}
          {showCreateQModal && (
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
                  backgroundColor: '#fffdf7',
                  border: '2px solid #131a2a',
                  borderRadius: '8px',
                  maxWidth: '680px',
                  width: '100%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  padding: '28px',
                  boxShadow: '12px 12px 0 rgba(19, 26, 42, 0.2)'
                }}
              >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
                  Tạo Câu Hỏi Mới Vào Ngân Hàng
                </h3>

                {createQError && (
                  <div
                    role="alert"
                    style={{
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      marginBottom: '16px',
                      fontSize: '0.86rem',
                      fontWeight: 500
                    }}
                  >
                    {createQError}
                  </div>
                )}

                <form onSubmit={handleCreateQuestion}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Kỹ năng / Chủ đề *
                      </label>
                      <select
                        value={newQSkillId}
                        onChange={(e) => setNewQSkillId(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      >
                        {skillsList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code}: {s.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                        Mức độ nhận thức *
                      </label>
                      <select
                        value={newQLevel}
                        onChange={(e) => setNewQLevel(e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      >
                        <option value="REMEMBERING">Nhận biết (REMEMBERING)</option>
                        <option value="UNDERSTANDING">Thông hiểu (UNDERSTANDING)</option>
                        <option value="APPLYING">Vận dụng (APPLYING)</option>
                        <option value="ADVANCED_APPLYING">Vận dụng cao</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Nội dung câu hỏi (hỗ trợ LaTeX $...$) *
                    </label>
                    <textarea
                      style={{ width: '100%', minHeight: '80px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      placeholder="Ví dụ: Rút gọn biểu thức $\sqrt{245}$ ta được:"
                      value={newQContent}
                      onChange={(e) => setNewQContent(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                      4 Lựa chọn trắc nghiệm (Tích chọn đáp án đúng)
                    </label>
                    {newQOptions.map((opt, idx) => (
                      <div key={opt.optionKey} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, width: '20px' }}>{opt.optionKey}:</span>
                        <input
                          type="text"
                          style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          placeholder={`Nội dung phương án ${opt.optionKey}`}
                          value={opt.content}
                          onChange={(e) => {
                            const updated = [...newQOptions];
                            updated[idx].content = e.target.value;
                            setNewQOptions(updated);
                          }}
                          required
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="correctOption"
                            checked={opt.isCorrect}
                            onChange={() => {
                              const updated = newQOptions.map((o, i) => ({
                                ...o,
                                isCorrect: i === idx
                              }));
                              setNewQOptions(updated);
                            }}
                          />
                          <span>Đúng</span>
                        </label>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
                      Lời giải chi tiết & Bẫy tư duy
                    </label>
                    <textarea
                      style={{ width: '100%', minHeight: '60px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      placeholder="Giải thích từng bước cho học sinh..."
                      value={newQExplanation}
                      onChange={(e) => setNewQExplanation(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowCreateQModal(false)}
                      style={{ padding: '8px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingQ}
                      style={{ padding: '8px 20px', background: '#10b981', color: '#ffffff', border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      {isCreatingQ ? 'Đang tạo...' : 'Tạo câu hỏi (DRAFT)'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: AUDIT LOGS (Readonly) */}
      {activeSubTab === 'audit' && (
        <div
          style={{
            backgroundColor: '#fffdf7',
            border: '2px solid #131a2a',
            borderRadius: '8px',
            padding: '24px',
            boxShadow: '8px 8px 0 rgba(19, 26, 42, 0.16)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a' }}>
                Nhật Ký Kiểm Toán Bất Biến (Security Audit Trail)
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                Ghi nhận các sự kiện quan trọng: Đăng nhập, Duyệt giáo viên, Tạo câu hỏi, Tham gia lớp. Chỉ đọc (Read-only).
              </p>
            </div>

            <button
              type="button"
              onClick={fetchAuditLogs}
              disabled={isLoadingAudit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={13} className={isLoadingAudit ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>
          </div>

          {isLoadingAudit ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
              <div>Đang tải nhật ký kiểm toán...</div>
            </div>
          ) : auditLogs.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
              Chưa có bản ghi nhật ký kiểm toán nào.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>Thời gian</th>
                    <th style={{ padding: '10px' }}>Hành động</th>
                    <th style={{ padding: '10px' }}>Người thực hiện</th>
                    <th style={{ padding: '10px' }}>Đối tượng</th>
                    <th style={{ padding: '10px' }}>Địa chỉ IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', color: '#64748b' }}>
                        {new Date(log.createdAt).toLocaleString('vi-VN')}
                      </td>
                      <td style={{ padding: '10px', fontWeight: 600, color: '#0f766e' }}>
                        {log.action}
                      </td>
                      <td style={{ padding: '10px', color: '#0f172a' }}>
                        {log.actor?.fullName || log.actor?.username || log.actorUserId}
                      </td>
                      <td style={{ padding: '10px', color: '#475569' }}>
                        {log.targetEntity}: {log.targetEntityId?.substring(0, 8)}...
                      </td>
                      <td style={{ padding: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: USER MANAGEMENT */}
      {activeSubTab === 'users' && (
        <div>
          {/* Filter & Search Bar */}
          <div
            style={{
              backgroundColor: '#fffdf7',
              border: '2px solid #131a2a',
              borderRadius: '8px',
              padding: '16px 20px',
              boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px'
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchUsers(1);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Tìm theo họ tên, username hoặc email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '0.86rem'
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Tìm kiếm
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
              >
                <option value="">Tất cả vai trò</option>
                <option value="STUDENT">Học sinh (STUDENT)</option>
                <option value="TEACHER">Giáo viên (TEACHER)</option>
                <option value="CONTENT_REVIEWER">Người duyệt đề (REVIEWER)</option>
                <option value="ADMIN">Quản trị viên (ADMIN)</option>
              </select>

              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value)}
                style={{ padding: '8px 12px', border: '1.5px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem' }}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                <option value="SUSPENDED">Đã bị khóa (SUSPENDED)</option>
              </select>

              <button
                type="button"
                onClick={() => fetchUsers(usersPagination.page)}
                disabled={isLoadingUsers}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f1f5f9',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#475569'
                }}
              >
                <RefreshCw size={14} className={isLoadingUsers ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>
          </div>

          {/* Security Notice */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              fontSize: '0.82rem',
              color: '#1e40af',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Bảo mật phiên đăng nhập (JWT Invalidation):</strong> Khi quản trị viên khóa tài khoản hoặc đặt lại mật khẩu, hệ thống sẽ tự động tăng <code>permissionVersion</code>, lập tức hủy phiên đăng nhập JWT hiện tại của người dùng trên mọi thiết bị.
            </span>
          </div>

          {isLoadingUsers ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Đang tải danh sách người dùng...</div>
            </div>
          ) : usersList.length === 0 ? (
            <div style={{ backgroundColor: '#fffdf7', border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Không tìm thấy người dùng nào phù hợp với bộ lọc.
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#fffdf7',
                border: '2px solid #131a2a',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.14)',
                overflowX: 'auto'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px 12px' }}>Người dùng</th>
                    <th style={{ padding: '10px 12px' }}>Email</th>
                    <th style={{ padding: '10px 12px' }}>Vai trò</th>
                    <th style={{ padding: '10px 12px' }}>Trạng thái</th>
                    <th style={{ padding: '10px 12px' }}>Ngày tham gia</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Thao tác quản trị</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    const isSuspended = user.status === 'SUSPENDED';

                    return (
                      <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>
                              {user.fullName || user.username}
                            </span>
                            {isMockAccount(user) && (
                              <span
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.66rem',
                                  fontWeight: 800,
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  letterSpacing: '0.03em'
                                }}
                              >
                                MOCK DATA
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            @{user.username}
                          </div>
                        </td>

                        <td style={{ padding: '12px', color: '#334155' }}>
                          {user.email}
                        </td>

                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor:
                                user.role === 'ADMIN'
                                  ? '#fee2e2'
                                  : user.role === 'TEACHER'
                                  ? '#dcfce7'
                                  : user.role === 'CONTENT_REVIEWER'
                                  ? '#f3e8ff'
                                  : '#e0f2fe',
                              color:
                                user.role === 'ADMIN'
                                  ? '#b91c1c'
                                  : user.role === 'TEACHER'
                                  ? '#15803d'
                                  : user.role === 'CONTENT_REVIEWER'
                                  ? '#7e22ce'
                                  : '#0369a1'
                            }}
                          >
                            {user.role}
                          </span>
                        </td>

                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: isSuspended ? '#fee2e2' : '#dcfce7',
                              color: isSuspended ? '#b91c1c' : '#15803d'
                            }}
                          >
                            {user.status}
                          </span>
                        </td>

                        <td style={{ padding: '12px', color: '#64748b', fontSize: '0.8rem' }}>
                          {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                        </td>

                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserForReset(user);
                                setNewPasswordInput('');
                                setResetPasswordFeedback(null);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 10px',
                                backgroundColor: '#f0fdf4',
                                border: '1px solid #86efac',
                                borderRadius: '4px',
                                color: '#15803d',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <Key size={13} />
                              <span>Đổi mật khẩu</span>
                            </button>

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleToggleUserStatus(user)}
                                disabled={userBeingToggled === user.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '6px 10px',
                                  backgroundColor: isSuspended ? '#f0fdf4' : '#fff1f2',
                                  border: `1px solid ${isSuspended ? '#86efac' : '#fecdd3'}`,
                                  borderRadius: '4px',
                                  color: isSuspended ? '#15803d' : '#be123c',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                {isSuspended ? <Unlock size={13} /> : <Lock size={13} />}
                                <span>{isSuspended ? 'Mở khóa' : 'Khóa'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid #e2e8f0',
                  fontSize: '0.84rem',
                  color: '#64748b'
                }}
              >
                <div>
                  Trang <strong>{usersPagination.page}</strong> / <strong>{usersPagination.totalPages || 1}</strong> (Tổng {usersPagination.total} người dùng)
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => fetchUsers(usersPagination.page - 1)}
                    disabled={usersPagination.page <= 1 || isLoadingUsers}
                    style={{
                      padding: '5px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      cursor: usersPagination.page <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <ChevronLeft size={14} />
                    <span>Trước</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fetchUsers(usersPagination.page + 1)}
                    disabled={usersPagination.page >= usersPagination.totalPages || isLoadingUsers}
                    style={{
                      padding: '5px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      cursor: usersPagination.page >= usersPagination.totalPages ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>Sau</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Reset Password Modal */}
          {selectedUserForReset && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px'
              }}
            >
              <div
                style={{
                  backgroundColor: '#fffdf7',
                  border: '2px solid #131a2a',
                  borderRadius: '8px',
                  maxWidth: '460px',
                  width: '100%',
                  padding: '24px',
                  boxShadow: '10px 10px 0 rgba(19, 26, 42, 0.25)'
                }}
              >
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  Đặt Lại Mật Khẩu
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                  Người dùng: <strong>{selectedUserForReset.fullName || selectedUserForReset.username}</strong> ({selectedUserForReset.email})
                </p>

                {resetPasswordFeedback && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: resetPasswordFeedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${resetPasswordFeedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                      borderRadius: '6px',
                      color: resetPasswordFeedback.type === 'success' ? '#15803d' : '#b91c1c',
                      fontSize: '0.84rem',
                      marginBottom: '16px'
                    }}
                  >
                    {resetPasswordFeedback.message}
                  </div>
                )}

                <form onSubmit={handleResetPassword}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                        Mật khẩu mới (tối thiểu 8 ký tự) *
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewPasswordInput('Adaptive@' + Math.floor(100000 + Math.random() * 900000))}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#0284c7',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        Tạo ngẫu nhiên
                      </button>
                    </div>

                    <input
                      type="text"
                      placeholder="Ví dụ: Adaptive@2026!"
                      value={newPasswordInput}
                      onChange={(e) => setNewPasswordInput(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '6px',
                        fontSize: '0.9rem'
                      }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserForReset(null);
                        setResetPasswordFeedback(null);
                      }}
                      style={{
                        padding: '8px 14px',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Đóng
                    </button>

                    <button
                      type="submit"
                      disabled={isResettingPassword}
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
                      {isResettingPassword ? 'Đang cập nhật...' : 'Xác nhận đặt lại'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB: CLASSROOMS OVERSIGHT */}
      {activeSubTab === 'classrooms' && (
        <div>
          {/* Top Summary Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '18px', boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tổng số lớp học</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{classroomsList.length}</div>
              <div style={{ fontSize: '0.76rem', color: '#059669', marginTop: '2px' }}>Đang hoạt động trên toàn hệ thống</div>
            </div>

            <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '18px', boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Lượt học sinh tham gia</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                {classroomsList.reduce((acc, c) => acc + (c.studentsCount || 0), 0)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#0284c7', marginTop: '2px' }}>Đã gia nhập qua mã Crockford</div>
            </div>

            <div style={{ backgroundColor: '#fffdf7', border: '2px solid #131a2a', borderRadius: '8px', padding: '18px', boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Bài kiểm tra & Bài tập</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
                {classroomsList.reduce((acc, c) => acc + (c.assignmentsCount || 0), 0)}
              </div>
              <div style={{ fontSize: '0.76rem', color: '#d97706', marginTop: '2px' }}>Được các giáo viên biên soạn & giao</div>
            </div>
          </div>

          {/* Search bar */}
          <div
            style={{
              backgroundColor: '#fffdf7',
              border: '2px solid #131a2a',
              borderRadius: '8px',
              padding: '14px 18px',
              boxShadow: '4px 4px 0 rgba(19, 26, 42, 0.12)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <Search size={16} color="#64748b" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Tìm theo tên lớp học, mã mời hoặc giáo viên..."
                value={classroomSearch}
                onChange={(e) => setClassroomSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 34px',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.86rem'
                }}
              />
            </div>

            <button
              type="button"
              onClick={fetchClassrooms}
              disabled={isLoadingClassrooms}
              style={{
                padding: '8px 14px',
                backgroundColor: '#f1f5f9',
                border: '1.5px solid #cbd5e1',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.84rem',
                fontWeight: 600,
                color: '#475569'
              }}
            >
              <RefreshCw size={13} className={isLoadingClassrooms ? 'animate-spin' : ''} />
              <span>Làm mới danh sách</span>
            </button>
          </div>

          {isLoadingClassrooms ? (
            <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div>Đang tải dữ liệu lớp học toàn hệ thống...</div>
            </div>
          ) : classroomsList.length === 0 ? (
            <div style={{ backgroundColor: '#fffdf7', border: '2px dashed #cbd5e1', borderRadius: '8px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
              Chưa có lớp học nào được tạo trên hệ thống.
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#fffdf7',
                border: '2px solid #131a2a',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '6px 6px 0 rgba(19, 26, 42, 0.14)',
                overflowX: 'auto'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px 12px' }}>Tên lớp học</th>
                    <th style={{ padding: '10px 12px' }}>Mã mời (Crockford)</th>
                    <th style={{ padding: '10px 12px' }}>Giáo viên phụ trách</th>
                    <th style={{ padding: '10px 12px' }}>Khối lớp & Năm học</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Sĩ số</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Đề kiểm tra</th>
                    <th style={{ padding: '10px 12px' }}>Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {classroomsList
                    .filter((c) => {
                      if (!classroomSearch.trim()) return true;
                      const q = classroomSearch.toLowerCase();
                      return (
                        c.name.toLowerCase().includes(q) ||
                        c.code.toLowerCase().includes(q) ||
                        (c.teacher?.fullName && c.teacher.fullName.toLowerCase().includes(q))
                      );
                    })
                    .map((cls) => (
                      <tr key={cls.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px', fontWeight: 700, color: '#0f172a' }}>
                          {cls.name}
                        </td>

                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              padding: '2px 8px',
                              backgroundColor: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '0.82rem',
                              color: '#0f766e'
                            }}
                          >
                            {cls.code}
                          </span>
                        </td>

                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>
                              {cls.teacher?.fullName || 'Chưa cập nhật'}
                            </span>
                            {isMockAccount(cls.teacher) && (
                              <span
                                style={{
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  fontSize: '0.64rem',
                                  fontWeight: 800,
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a'
                                }}
                              >
                                MOCK DATA
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            {cls.teacher?.email}
                          </div>
                        </td>

                        <td style={{ padding: '12px', color: '#475569' }}>
                          Khối {cls.grade} · {cls.academicYear}
                        </td>

                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                              fontWeight: 700,
                              fontSize: '0.78rem'
                            }}
                          >
                            {cls.studentsCount} học sinh
                          </span>
                        </td>

                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              backgroundColor: '#f0fdf4',
                              color: '#15803d',
                              fontWeight: 700,
                              fontSize: '0.78rem'
                            }}
                          >
                            {cls.assignmentsCount} đề thi
                          </span>
                        </td>

                        <td style={{ padding: '12px', color: '#64748b', fontSize: '0.8rem' }}>
                          {new Date(cls.createdAt).toLocaleDateString('vi-VN')}
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
  );
}
