import useModalFocus from './useModalFocus';
import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Monitor, Smartphone, Globe, LogOut, CheckCircle, RefreshCw } from 'lucide-react';
import { authApi } from '../lib/apiClient';

function formatClientDevice(ua) {
  if (!ua || ua === 'Unknown') return 'Thiết bị không xác định';
  if (ua === 'node') return 'Công cụ tự động (Node.js Script)';

  let browser = 'Trình duyệt web';
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Google Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Apple Safari';
  else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';

  let os = '';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('iPhone')) os = 'iPhone';
  else if (ua.includes('iPad')) os = 'iPad';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return os ? `${browser} (${os})` : browser;
}

function formatClientIp(ip) {
  if (!ip) return 'Không xác định';
  return ip.split(',')[0].trim();
}

export default function SessionManagementModal({ isOpen, onClose, onSessionRevoked }) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokingId, setRevokingId] = useState(null);
  const [isConfirmingLogoutAll, setIsConfirmingLogoutAll] = useState(false);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await authApi.getSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách phiên đăng nhập.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
      setIsConfirmingLogoutAll(false);
    }
  }, [isOpen]);

  const dialogRef = useModalFocus(isOpen, () => { if (!isLoading) onClose(); });
  if (!isOpen) return null;

  const handleRevokeSession = async (sessionId, isCurrent) => {
    setRevokingId(sessionId);
    setError('');
    try {
      await authApi.revokeSession(sessionId);
      if (isCurrent) {
        onSessionRevoked?.(true);
        onClose();
        return;
      }
      await fetchSessions();
    } catch (err) {
      setError(err.message || 'Không thể thu hồi phiên đăng nhập.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAll = async () => {
    setIsLoading(true);
    setIsConfirmingLogoutAll(false);
    try {
      await authApi.logoutAll();
      onSessionRevoked?.(true);
      onClose();
    } catch (err) {
      setError(err.message || 'Không thể đăng xuất tất cả các phiên.');
      setIsLoading(false);
    }
  };

  return (
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Phiên đăng nhập" className="account-dialog session-dialog"
        style={{
          backgroundColor: '#fffdf7',
          border: '2px solid #131a2a',
          borderRadius: '8px',
          maxWidth: '620px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
          boxShadow: '12px 12px 0 rgba(19, 26, 42, 0.25)',
          position: 'relative'
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#475569'
          }}
          aria-label="Đóng"
        >
          <X size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <ShieldAlert size={24} color="#f0642f" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
            Phiên đăng nhập
          </h2>
        </div>

        <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
          Danh sách các thiết bị và trình duyệt đang duy trì phiên hoạt động với tài khoản của bạn. Bạn có thể chủ động thu hồi từng phiên hoặc đăng xuất toàn bộ để bảo mật.
        </p>

        {error && (
          <div role="alert"
            style={{
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#b91c1c',
              fontSize: '0.85rem',
              marginBottom: '16px'
            }}
          >
            {error}
          </div>
        )}

        <div className="session-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
            Tổng số phiên: {sessions.length}
          </span>
          <div className="session-actions" style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={fetchSessions}
              disabled={isLoading}
              style={{
                display: 'flex',
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
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>

            {isConfirmingLogoutAll ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: '#be123c', fontWeight: 600 }}>Đăng xuất tất cả?</span>
                <button
                  type="button"
                  onClick={handleLogoutAll}
                  disabled={isLoading}
                  style={{
                    padding: '5px 10px',
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
                  onClick={() => setIsConfirmingLogoutAll(false)}
                  style={{
                    padding: '5px 10px',
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
                onClick={() => setIsConfirmingLogoutAll(true)}
                disabled={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  backgroundColor: '#fff1f2',
                  border: '1px solid #fecdd3',
                  color: '#be123c',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                <LogOut size={13} />
                <span>Đăng xuất tất cả thiết bị</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div role="status" style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
            <div>Đang tải danh sách phiên...</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!error && sessions.length === 0 && <p role="status">Chưa có phiên đăng nhập để hiển thị. Chọn Làm mới để kiểm tra lại.</p>}
            {sessions.map((sess) => {
              const isMobile = /mobile|iphone|ipad|android/i.test(sess.userAgent || '');
              return (
                <div
                  key={sess.id}
                  className="session-device"
                  style={{
                    padding: '14px',
                    border: sess.isCurrent ? '2px solid #10b981' : '1px solid #e2e8f0',
                    borderRadius: '6px',
                    backgroundColor: sess.isCurrent ? '#f0fdf4' : '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '6px',
                        backgroundColor: sess.isCurrent ? '#dcfce7' : '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: sess.isCurrent ? '#15803d' : '#475569',
                        flexShrink: 0
                      }}
                    >
                      {isMobile ? <Smartphone size={20} /> : <Monitor size={20} />}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>
                          {formatClientDevice(sess.userAgent)}
                        </span>
                        {sess.isCurrent && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              backgroundColor: '#087f62',
                              color: '#ffffff',
                              borderRadius: '12px'
                            }}
                          >
                            <CheckCircle size={11} />
                            Phiên hiện tại
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '3px' }}>
                        IP: {formatClientIp(sess.ipAddress)} · Hoạt động: {new Date(sess.lastSeenAt || sess.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRevokeSession(sess.id, sess.isCurrent)}
                    disabled={revokingId === sess.id}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      backgroundColor: sess.isCurrent ? '#fef2f2' : '#ffffff',
                      border: '1px solid #fca5a5',
                      color: '#b91c1c',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    {revokingId === sess.id ? 'Đang hủy...' : sess.isCurrent ? 'Đăng xuất' : 'Thu hồi'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
