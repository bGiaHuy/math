import React, { useEffect, useRef } from 'react';
import BrandLogo from './BrandLogo';
import {
  ChevronDown,
  Home,
  TrendingUp,
  Compass,
  CheckSquare,
  BookX,
  Users,
  ShieldCheck,
  UserCheck,
  FileQuestion,
  History,
  Clock3,
  BarChart3,
  User,
  LogOut,
  ShieldAlert,
  FileText,
  Key,
  GraduationCap
} from 'lucide-react';

export const STUDENT_MENU = [
  { id: 'dashboard', label: 'Trang chính', icon: Home },
  { id: 'profile', label: 'Hồ sơ năng lực', icon: TrendingUp },
  { id: 'learning-path', label: 'Lộ trình học', icon: Compass },
  { id: 'diagnostic', label: 'Kiểm tra chẩn đoán', icon: CheckSquare },
  { id: 'mistakes', label: 'Sổ tay lỗi sai', icon: BookX },
  { id: 'review', label: 'Ôn kiến thức', icon: History },
  { id: 'classroom', label: 'Lớp học của em', icon: Users }
];

export const TEACHER_APPLICANT_MENU = [
  { id: 'teacher-pending', label: 'Hồ sơ chờ duyệt', icon: Clock3 }
];

export const TEACHER_MENU = [
  { id: 'teacher-overview', label: 'Tổng quan', icon: Home },
  { id: 'teacher-classes', label: 'Lớp học', icon: Users },
  { id: 'teacher-library', label: 'Thư viện đề', icon: FileText },
  { id: 'teacher-bank', label: 'Ngân hàng câu hỏi', icon: FileQuestion }
];

export const ADMIN_MENU = [
  { id: 'admin-overview', label: 'Tổng quan hệ thống', icon: ShieldCheck },
  { id: 'admin-users', label: 'Quản lý tài khoản', icon: Users },
  { id: 'admin-questions', label: 'Ngân hàng câu hỏi', icon: FileQuestion },
  { id: 'admin-audit', label: 'Nhật ký kiểm toán', icon: History }
];

export default function Sidebar({
  activeTab,
  onSelectTab,
  currentUser,
  onLogout,
  onOpenSessions,
  onOpenLegal,
  onOpenChangePassword,
  progress = null
}) {
  const role = currentUser?.role || 'STUDENT';
  const accountRef = useRef(null);
  const navRef = useRef(null);
  useEffect(() => {
    if (accountRef.current) accountRef.current.open = false;
    const nav = navRef.current, active = nav?.querySelector('[aria-current="page"]');
    if (active && nav) {
      const item = active.getBoundingClientRect(), bounds = nav.getBoundingClientRect();
      if (item.left < bounds.left || item.right > bounds.right) nav.scrollLeft += item.left - bounds.left - 8;
    }
  }, [activeTab]);
  useEffect(() => {
    const close = event => { if (!accountRef.current?.contains(event.target) && accountRef.current) accountRef.current.open = false; };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const formatRoleName = (r) => {
    switch (r) {
      case 'STUDENT':
        return 'HỌC SINH';
      case 'TEACHER':
        return 'GIÁO VIÊN';
      case 'TEACHER_APPLICANT':
        return 'GV CHỜ DUYỆT';
      case 'ADMIN':
        return 'QUẢN TRỊ VIÊN';
      case 'CONTENT_AUTHOR':
        return 'TÁC GIẢ NỘI DUNG';
      case 'CONTENT_REVIEWER':
        return 'THẨM ĐỊNH VIÊN';
      default:
        return 'THÀNH VIÊN';
    }
  };

  const syncText =
    role === 'STUDENT'
      ? 'Dữ liệu học tập và năng lực được đồng bộ trực tiếp với máy chủ cơ sở dữ liệu.'
      : role === 'TEACHER_APPLICANT'
      ? 'Hồ sơ của bạn đang được Ban Quản trị xác minh danh tính.'
      : role === 'TEACHER'
      ? 'Dữ liệu thành thạo kỹ năng của lớp được bảo vệ theo nguyên tắc quyền riêng tư.'
      : 'Mọi thao tác quản trị và kiểm duyệt nội dung đều được ghi nhật ký kiểm toán bất biến.';

  let menuItems = STUDENT_MENU;
  if (role === 'TEACHER_APPLICANT') {
    menuItems = TEACHER_APPLICANT_MENU;
  } else if (role === 'TEACHER') {
    menuItems = TEACHER_MENU;
  } else if (role === 'ADMIN' || role === 'CONTENT_AUTHOR' || role === 'CONTENT_REVIEWER') {
    menuItems = role === 'ADMIN' ? [...ADMIN_MENU, { ...TEACHER_MENU[1], label: 'Quan sát lớp học' }] : ADMIN_MENU.filter(item => ['admin-overview', 'admin-questions'].includes(item.id));
  }

  return (
    <aside className={`app-sidebar ${role === 'TEACHER' ? 'teacher-sidebar' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-brand">
        <BrandLogo 
          size={34} 
          isDark={true}
          subtitle={
            role === 'TEACHER'
              ? 'Teacher Portal'
              : role === 'TEACHER_APPLICANT'
              ? 'Verification'
              : role === 'ADMIN'
              ? 'Admin Console'
              : 'Student Studio'
          }
        />
      </div>

      {/* Navigation List */}
      {role === 'TEACHER' && <p className="teacher-nav-caption">KHÔNG GIAN LÀM VIỆC</p>}
      <nav ref={navRef} className="sidebar-nav" aria-label="Điều hướng chính">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              data-tab={item.id}
              aria-label={item.label}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} className="sidebar-item-icon" />
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {role === 'TEACHER' && <div className="teacher-sidebar-context"><GraduationCap size={20} aria-hidden="true" /><span><strong>Toán THCS</strong>Lớp 6 · 7 · 8 · 9</span></div>}

      {/* User Profile Pill & Actions in Top Navbar */}
      {currentUser && (
        <details ref={accountRef} className="account-menu" onKeyDown={event => {
          if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
        }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
          <summary className="user-profile-pill" aria-label="Tài khoản của bạn">
            <span className="user-avatar-circle"><User size={17} /></span>
            <span className="user-name">{currentUser.fullName || currentUser.username}</span>
            <ChevronDown size={15} />
          </summary>
          <div className="account-panel">
            <div className="account-heading"><strong>{currentUser.fullName || currentUser.username}</strong><span>{formatRoleName(currentUser.role)}</span></div>
            <button type="button" onClick={onOpenSessions}><ShieldAlert size={17} />Phiên đăng nhập</button>
            <button type="button" onClick={onOpenChangePassword}><Key size={17} />Đổi mật khẩu</button>
            <button type="button" onClick={onOpenLegal}><FileText size={17} />Quy định bảo mật</button>
            <button type="button" className="account-logout" onClick={onLogout}><LogOut size={17} />Đăng xuất</button>
          </div>
        </details>
      )}

      {/* Onboarding Wizard Progress Bar along bottom border */}
      {progress && (
        <div className="navbar-progress-track">
          <div
            className="navbar-progress-bar"
            style={{ width: `${(progress.step / progress.total) * 100}%` }}
          />
        </div>
      )}
    </aside>
  );
}
