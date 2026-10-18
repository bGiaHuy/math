import React from 'react';
import { LogOut, User, ShieldAlert, FileText, Key } from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function Navbar({
  pageTitle,
  currentUser,
  onNavigate,
  onLogout,
  onOpenSessions,
  onOpenLegal,
  onOpenChangePassword,
  showFullNav = false,
  progress = null
}) {
  const formatRoleName = (role) => {
    switch (role) {
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

  if (showFullNav) {
    // Landing page navbar
    return (
      <header className="landing-navbar">
        <div className="landing-nav-container">
          <div className="brand-logo">
            <BrandLogo size={36} />
          </div>
          <div className="landing-nav-actions">
            <button
              type="button"
              className="btn-nav-link"
              onClick={onOpenLegal}
              style={{ fontSize: '0.82rem', color: '#64748b' }}
            >
              Điều khoản & Bảo mật (Draft)
            </button>
            <button
              className="btn-nav-link"
              onClick={() => onNavigate('register', { mode: 'login' })}
            >
              Đăng nhập
            </button>
            <button
              className="btn-nav-primary"
              onClick={() => onNavigate('register', { mode: 'signup' })}
            >
              Đăng ký
            </button>
          </div>
        </div>
      </header>
    );
  }

  // Logged-in header (Dashboard, Wizard, Quiz, etc.)
  return (
    <header className="app-top-header">
      <div className="header-left">
        <span className="header-title">{pageTitle || 'AdaptiveMath'}</span>
      </div>

      {progress && (
        <div className="wizard-progress-container">
          <div className="wizard-progress-track">
            <div
              className="wizard-progress-bar"
              style={{ width: `${(progress.step / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="header-right">
        {currentUser ? (
          <div className="user-profile-pill">
            <div className="user-avatar-circle">
              <User size={16} />
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
              style={{ color: '#64748b' }}
              aria-label="Quy định bảo mật"
            >
              <FileText size={16} />
            </button>

            {/* Session Management Trigger */}
            <button
              className="btn-logout"
              title="Quản lý phiên đăng nhập"
              onClick={onOpenSessions}
              style={{ color: '#0f766e' }}
              aria-label="Quản lý phiên đăng nhập"
            >
              <ShieldAlert size={16} />
            </button>

            {/* Change Password Trigger */}
            <button
              className="btn-logout"
              title="Đổi mật khẩu"
              onClick={onOpenChangePassword}
              style={{ color: '#ea580c' }}
              aria-label="Đổi mật khẩu"
            >
              <Key size={16} />
            </button>

            {/* Logout Trigger */}
            <button
              className="btn-logout"
              title="Đăng xuất"
              onClick={onLogout}
              aria-label="Đăng xuất"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="guest-actions">
            <button
              className="btn-nav-primary"
              onClick={() => onNavigate('register', { mode: 'login' })}
            >
              Đăng nhập
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
