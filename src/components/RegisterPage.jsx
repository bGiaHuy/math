import React, { useState } from 'react';
import { ArrowLeft, Check, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { authApi } from '../lib/apiClient';

export default function RegisterPage({
  initialMode = 'signup',
  onCompleteRegistration,
  onNavigateHome
}) {
  const [mode, setMode] = useState(initialMode); // 'signup' | 'login'
  const [role, setRole] = useState('student'); // 'student' | 'teacher'

  // Student Sign-up Fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  // Teacher Sign-up Fields
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');

  // Login Fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const clearErrors = () => {
    setErrorMessage('');
    setFieldErrors({});
  };

  const handleStudentSignup = async (e) => {
    e.preventDefault();
    clearErrors();

    // Client-side validations
    const errors = {};
    if (!fullName.trim()) errors.fullName = 'Vui lòng nhập họ và tên của bạn.';
    if (!username.trim()) {
      errors.username = 'Vui lòng chọn tên đăng nhập.';
    } else if (username.length < 3) {
      errors.username = 'Tên đăng nhập phải có ít nhất 3 ký tự.';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = 'Tên đăng nhập chỉ bao gồm chữ cái, số và dấu gạch dưới (_).';
    }

    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 8) {
      errors.password = 'Mật khẩu cần ít nhất 8 ký tự.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      await authApi.registerStudent({
        fullName: fullName.trim(),
        username: username.trim(),
        email: email.trim() || undefined,
        password,
        parentEmail: parentEmail.trim() || undefined
      });

      // Automatically login to establish HttpOnly session cookie
      const loginRes = await authApi.login(username.trim(), password);
      onCompleteRegistration(loginRes.user);
    } catch (err) {
      setErrorMessage(err.message || 'Đăng ký không thành công. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTeacherSignup = async (e) => {
    e.preventDefault();
    clearErrors();

    const errors = {};
    if (!fullName.trim()) errors.fullName = 'Vui lòng nhập họ và tên giáo viên.';
    if (!email.trim()) {
      errors.email = 'Vui lòng nhập email công tác.';
    } else if (!email.includes('@')) {
      errors.email = 'Email không hợp lệ (ví dụ: thaynam@thcs.edu.vn).';
    }

    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu.';
    } else if (password.length < 8) {
      errors.password = 'Mật khẩu cần ít nhất 8 ký tự.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);
    try {
      await authApi.registerTeacher({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        schoolName: schoolName.trim() || undefined,
        city: city.trim() || undefined
      });

      // Automatically login to establish HttpOnly session cookie
      const loginRes = await authApi.login(email.trim(), password);
      onCompleteRegistration(loginRes.user);
    } catch (err) {
      setErrorMessage(err.message || 'Nộp hồ sơ giáo viên không thành công. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    clearErrors();

    if (!identifier.trim()) {
      setFieldErrors({ identifier: 'Vui lòng nhập tên đăng nhập hoặc email.' });
      return;
    }
    if (!loginPassword) {
      setFieldErrors({ loginPassword: 'Vui lòng nhập mật khẩu.' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.login(identifier.trim(), loginPassword);
      onCompleteRegistration(res.user);
    } catch (err) {
      setErrorMessage(err.message || 'Tên đăng nhập hoặc mật khẩu không chính xác.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-root">
      <div className="auth-card-container">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-card-title">
              {mode === 'signup' ? 'Tạo tài khoản' : 'Đăng nhập'}
            </h1>
            <p className="auth-card-subtitle">
              {mode === 'signup'
                ? 'Chọn vai trò của bạn, phần còn lại chỉ mất một phút.'
                : 'Đăng nhập với phiên bảo mật HttpOnly để tiếp tục.'}
            </p>
          </div>

          {/* Inline Error Message */}
          {errorMessage && (
            <div
              className="auth-error-banner"
              role="alert"
              aria-live="polite"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '12px 14px',
                marginBottom: '18px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#b91c1c',
                fontSize: '0.88rem',
                lineHeight: 1.4
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>Lỗi xử lý: </strong>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Role selector on Signup */}
          {mode === 'signup' && (
            <div className="role-selection-grid">
              <div
                className={`role-card ${role === 'student' ? 'selected' : ''}`}
                onClick={() => {
                  setRole('student');
                  clearErrors();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setRole('student');
                    clearErrors();
                  }
                }}
              >
                <div className="role-header-row">
                  <span className="role-name">Học sinh</span>
                  {role === 'student' && (
                    <div className="role-check-indicator">
                      <Check size={14} />
                    </div>
                  )}
                </div>
                <p className="role-description">
                  Học theo lộ trình riêng, làm bài chẩn đoán và tham gia lớp bằng mã.
                </p>
              </div>

              <div
                className={`role-card ${role === 'teacher' ? 'selected' : ''}`}
                onClick={() => {
                  setRole('teacher');
                  clearErrors();
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setRole('teacher');
                    clearErrors();
                  }
                }}
              >
                <div className="role-header-row">
                  <span className="role-name">Giáo viên</span>
                  {role === 'teacher' && (
                    <div className="role-check-indicator">
                      <Check size={14} />
                    </div>
                  )}
                </div>
                <p className="role-description">
                  Hệ thống tự động duyệt tài khoản. Tạo lớp học và mời học sinh tham gia.
                </p>
              </div>
            </div>
          )}

          {/* Forms */}
          {mode === 'signup' && role === 'student' && (
            <form onSubmit={handleStudentSignup} className="auth-form" noValidate>
              <div className="form-group">
                <label className="form-label">Họ và tên học sinh *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fullName ? 'has-error' : ''}`}
                  placeholder="Ví dụ: Nguyễn Minh Đức"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="name"
                />
                {fieldErrors.fullName && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.fullName}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Tên đăng nhập * (dùng để đăng nhập)</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.username ? 'has-error' : ''}`}
                  placeholder="Ví dụ: duc_nguyen9"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldErrors.username) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="username"
                />
                {fieldErrors.username && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.username}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Email học sinh (tùy chọn)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="hocsinh@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Mật khẩu * (ít nhất 8 ký tự)</label>
                <input
                  type="password"
                  className={`form-input ${fieldErrors.password ? 'has-error' : ''}`}
                  placeholder="Nhập mật khẩu an toàn"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                {fieldErrors.password && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.password}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Email phụ huynh (tùy chọn - nhận báo cáo học tập)</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="phuhuynh@example.com"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <button type="submit" className="btn-auth-submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Đang tạo tài khoản...</span>
                  </>
                ) : (
                  <span>Tạo tài khoản Học sinh</span>
                )}
              </button>
            </form>
          )}

          {mode === 'signup' && role === 'teacher' && (
            <form onSubmit={handleTeacherSignup} className="auth-form" noValidate>
              <div className="form-group">
                <label className="form-label">Họ và tên giáo viên *</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.fullName ? 'has-error' : ''}`}
                  placeholder="Ví dụ: Thầy Nguyễn Văn Nam"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.fullName) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="name"
                />
                {fieldErrors.fullName && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.fullName}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Email công tác * (dùng để đăng nhập)</label>
                <input
                  type="email"
                  className={`form-input ${fieldErrors.email ? 'has-error' : ''}`}
                  placeholder="thaynam@thcs-chuvanan.edu.vn"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Mật khẩu * (ít nhất 8 ký tự)</label>
                <input
                  type="password"
                  className={`form-input ${fieldErrors.password ? 'has-error' : ''}`}
                  placeholder="Nhập mật khẩu an toàn"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                {fieldErrors.password && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.password}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Trường công tác (tùy chọn)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: THCS Chu Văn An"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Tỉnh / Thành phố (tùy chọn)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Hà Nội"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={isLoading}
                />
              </div>

              <button type="submit" className="btn-auth-submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Đang nộp hồ sơ...</span>
                  </>
                ) : (
                  <span>Nộp hồ sơ Giáo viên</span>
                )}
              </button>
            </form>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="auth-form" noValidate>
              <div className="form-group">
                <label className="form-label">Tên đăng nhập hoặc Email</label>
                <input
                  type="text"
                  className={`form-input ${fieldErrors.identifier ? 'has-error' : ''}`}
                  placeholder="Nhập tên đăng nhập hoặc email"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (fieldErrors.identifier) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="username"
                />
                {fieldErrors.identifier && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.identifier}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Mật khẩu</label>
                <input
                  type="password"
                  className={`form-input ${fieldErrors.loginPassword ? 'has-error' : ''}`}
                  placeholder="Nhập mật khẩu của bạn"
                  value={loginPassword}
                  onChange={(e) => {
                    setLoginPassword(e.target.value);
                    if (fieldErrors.loginPassword) clearErrors();
                  }}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                {fieldErrors.loginPassword && (
                  <span className="form-field-error" style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>
                    {fieldErrors.loginPassword}
                  </span>
                )}
              </div>

              <button type="submit" className="btn-auth-submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Đang xác thực...</span>
                  </>
                ) : (
                  <span>Đăng nhập hệ thống</span>
                )}
              </button>
            </form>
          )}

          <div className="auth-footer-links">
            {mode === 'signup' ? (
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setMode('login');
                  clearErrors();
                }}
              >
                Đã có tài khoản? <strong>Đăng nhập</strong>
              </button>
            ) : (
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => {
                  setMode('signup');
                  clearErrors();
                }}
              >
                Chưa có tài khoản? <strong>Tạo tài khoản mới</strong>
              </button>
            )}

            <button
              type="button"
              className="auth-back-link"
              onClick={onNavigateHome}
            >
              <ArrowLeft size={15} />
              <span>Về trang giới thiệu</span>
            </button>
          </div>
        </div>

        <p className="auth-screen-bottom-note">
          AdaptiveMath · Nền tảng học Toán THCS bám sát chương trình GDPT 2018
        </p>
      </div>
    </div>
  );
}
