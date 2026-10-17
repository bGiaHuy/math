import React from 'react';
import BrandLogo from './BrandLogo';
import {
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
  Key
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
  { id: 'teacher-classes', label: 'Quản lý Lớp học', icon: Users },
  { id: 'teacher-analytics', label: 'Can thiệp sư phạm', icon: BarChart3 }
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
    menuItems = role === 'ADMIN' ? [...ADMIN_MENU, { ...TEACHER_MENU[0], label: 'Quan sát lớp học' }] : ADMIN_MENU;
  }

  return (
    <aside className="app-sidebar">
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
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              data-tab={item.id}
              aria-label={item.label}
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

      {/* User Profile Pill & Actions in Top Navbar */}
      {currentUser && (
        <div className="user-profile-pill" title={syncText}>
          <div className="user-avatar-circle">
            <User size={15} />
          </div>
          <span className="user-name">
            {currentUser.fullName || currentUser.username}
          </span>
          <span className="user-role-badge">
            {formatRoleName(currentUser.role)}
          </span>

          {/* Legal / Privacy Trigger */}
          <button
            type="button"
            className="btn-logout"
            title="Quy định bảo mật (Draft)"
            onClick={onOpenLegal}
            aria-label="Quy định bảo mật"
          >
            <FileText size={15} />
          </button>

          {/* Session Management Trigger */}
          <button
            type="button"
            className="btn-logout"
            title="Quản lý phiên đăng nhập"
            onClick={onOpenSessions}
            style={{ color: '#2dd4bf' }}
            aria-label="Quản lý phiên đăng nhập"
          >
            <ShieldAlert size={15} />
          </button>

          {/* Change Password Trigger */}
          <button
            type="button"
            className="btn-logout"
            title="Đổi mật khẩu"
            onClick={onOpenChangePassword}
            style={{ color: '#fb923c' }}
            aria-label="Đổi mật khẩu"
          >
            <Key size={15} />
          </button>

          {/* Logout Trigger */}
          <button
            type="button"
            className="btn-logout"
            title="Đăng xuất"
            onClick={onLogout}
            aria-label="Đăng xuất"
          >
            <LogOut size={15} />
          </button>
        </div>
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
