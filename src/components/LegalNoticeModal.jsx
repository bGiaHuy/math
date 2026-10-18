import useModalFocus from './useModalFocus';
import React from 'react';
import { X, Shield, FileText, AlertTriangle, CheckCircle, Lock } from 'lucide-react';

export default function LegalNoticeModal({ isOpen, onClose }) {
  const dialogRef = useModalFocus(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay animate-fade-in"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div ref={dialogRef} tabIndex={-1}
        className="modal-content"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-modal-title"
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#fafaf9'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={22} color="#f0642f" />
            <div>
              <h2
                id="legal-modal-title"
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 700,
                  color: '#1c1917',
                  fontFamily: "'Playfair Display', Georgia, serif"
                }}
              >
                Chính Sách Bảo Mật & Điều Khoản Sử Dụng
              </h2>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: '2px',
                  padding: '2px 8px',
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em'
                }}
              >
                DỰ THẢO DRAFT · CHỜ KÝ DUYỆT PHÁP LÝ (GATE 0 D-02 / D-04)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            style={{
              padding: '6px',
              borderRadius: '6px',
              color: '#64748b',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Nội dung điều khoản và bảo mật dự thảo"
          style={{
            padding: '24px',
            overflowY: 'auto',
            fontSize: '0.9rem',
            lineHeight: 1.65,
            color: '#334155'
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start'
            }}
          >
            <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.84rem', color: '#92400e' }}>
              <strong>Lưu ý quan trọng cho phiên bản Controlled Pilot:</strong> Văn bản dưới đây là khung nguyên tắc bảo vệ dữ liệu được tích hợp sẵn bằng kỹ thuật. Tài liệu pháp lý có hiệu lực chính thức cần chữ ký phê duyệt từ Legal Officer và Academic Lead trước khi thu thập dữ liệu học sinh thật.
            </div>
          </div>

          <section style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} color="#0f766e" />
              1. Bảo Vệ Quyền Riêng Tư & Dữ Liệu Học Sinh (Gate 0 D-02)
            </h3>
            <p style={{ margin: '0 0 8px 0' }}>
              AdaptiveMath thu thập thông tin tối thiểu phục vụ chẩn đoán năng lực Toán THCS GDPT 2018 (họ tên, khối lớp, lịch sử làm bài chẩn đoán và câu sai). Mật khẩu được băm một chiều an toàn bằng thuật toán <strong>Argon2id</strong> chuẩn OWASP.
            </p>
            <p style={{ margin: '0 0 8px 0' }}>
              Hệ thống không thu thập số điện thoại hoặc vị trí địa lý của học sinh. Đối với học sinh dưới 15 tuổi, cơ chế đồng thuận từ phụ huynh (Parent Consent) được phân loại theo từng mốc kiểm soát của Gate 4.
            </p>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={16} color="#0f766e" />
              2. Ranh Giới Dữ Liệu Giữa Giáo Viên & Học Sinh (Gate 0 D-04)
            </h3>
            <p style={{ margin: '0 0 8px 0' }}>
              Hệ thống thực thi nghiêm ngặt ranh giới phân tách dữ liệu sư phạm:
            </p>
            <ul style={{ paddingLeft: '20px', margin: '0 0 8px 0' }}>
              <li style={{ marginBottom: '4px' }}>
                <strong>Dữ liệu giáo viên được xem:</strong> Danh sách học sinh trong lớp, tỷ lệ tham gia làm bài chẩn đoán, độ thành thạo chung của các chủ đề toán học theo chuẩn KNTT.
              </li>
              <li>
                <strong>Dữ liệu riêng tư được bảo vệ:</strong> Sổ tay lỗi sai cá nhân, các ghi chú tự học và nhật ký luyện tập chi tiết của học sinh <em>hoàn toàn không hiển thị</em> cho giáo viên để tránh tạo áp lực tâm lý không cần thiết.
              </li>
            </ul>
          </section>

          <section style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={16} color="#0f766e" />
              3. Cơ Chế Quản Lý Phiên & Bảo Mật Hệ Thống
            </h3>
            <p style={{ margin: '0' }}>
              Phiên đăng nhập được duy trì qua HttpOnly Session Cookie chống đánh cắp mã phiên. Người dùng có quyền xem danh sách phiên đang hoạt động trên các thiết bị và chủ động thu hồi phiên bất cứ lúc nào thông qua chức năng "Quản lý phiên đăng nhập".
            </p>
          </section>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #f1f5f9',
            backgroundColor: '#fafaf9',
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: '#1c1917',
              color: '#ffffff',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.88rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
