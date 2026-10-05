import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Analytics } from '@vercel/analytics/react';
import LandingPage from './components/LandingPage';
import RegisterPage from './components/RegisterPage';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import OnboardingWizard from './components/OnboardingWizard';
import NotFoundView from './components/NotFoundView';
import ModernLoadingState from './components/ModernLoadingState';
import { authApi, studentApi } from './lib/apiClient';

// Code-split heavy role-specific and feature views
const DiagnosticTest = lazy(() => import('./components/DiagnosticTest'));
const ProfileCompetencyView = lazy(() => import('./components/ProfileCompetencyView'));
const LearningPathView = lazy(() => import('./components/LearningPathView'));
const MistakeNotebookView = lazy(() => import('./components/MistakeNotebookView'));
const ClassroomView = lazy(() => import('./components/ClassroomView'));
const MissionsView = lazy(() => import('./components/MissionsView'));
const TeacherPendingView = lazy(() => import('./components/TeacherPendingView'));
const TeacherClassroomsView = lazy(() => import('./components/TeacherClassroomsView'));
const AdminPortalView = lazy(() => import('./components/AdminPortalView'));
const SessionManagementModal = lazy(() => import('./components/SessionManagementModal'));
const LegalNoticeModal = lazy(() => import('./components/LegalNoticeModal'));
const ChangePasswordModal = lazy(() => import('./components/ChangePasswordModal'));

export default function App() {
  const isUnknownUrl = () => {
    const path = window.location.pathname;
    const hash = window.location.hash;
    return (path !== '/' && path !== '/index.html') || (hash && hash !== '#' && hash !== '#/');
  };
  const [unknownUrl, setUnknownUrl] = useState(isUnknownUrl);

  useEffect(() => {
    const syncUrl = () => setUnknownUrl(isUnknownUrl());
    window.addEventListener('hashchange', syncUrl);
    window.addEventListener('popstate', syncUrl);
    return () => {
      window.removeEventListener('hashchange', syncUrl);
      window.removeEventListener('popstate', syncUrl);
    };
  }, []);
  // Navigation & User State
  const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'register' | 'loading' | 'app' | 'onboarding'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authMode, setAuthMode] = useState('signup');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Authenticated User State (Server-backed only)
  const [currentUser, setCurrentUser] = useState(null);

  // Student Data (fetched from API)
  const [userProfile, setUserProfile] = useState(null);
  const [hasCompletedTest, setHasCompletedTest] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [mistakesList, setMistakesList] = useState([]);
  const [wizardStep, setWizardStep] = useState(1);

  // Helper to determine starting tab by role
  const getDefaultTabForRole = (role) => {
    switch (role) {
      case 'TEACHER_APPLICANT':
        return 'teacher-pending';
      case 'TEACHER':
        return 'teacher-classes';
      case 'ADMIN':
      case 'CONTENT_AUTHOR':
      case 'CONTENT_REVIEWER':
        return 'admin-overview';
      case 'STUDENT':
      default:
        return 'dashboard';
    }
  };

  // Bootstrap session on app mount via GET /auth/me
  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      try {
        const data = await authApi.getMe();
        if (isMounted && data.user) {
          setCurrentUser(data.user);
          setCurrentView('app');
          setActiveTab(getDefaultTabForRole(data.user.role));

          // If student, load student profile from server
          if (data.user.role === 'STUDENT') {
            try {
              const profData = await studentApi.getProfile();
              if (profData.profile) {
                setUserProfile(profData.profile);
              }
              if (profData.stats?.completedAttemptsCount > 0) {
                setHasCompletedTest(true);
              }
            } catch {
              // Non-blocking if profile not yet completed
            }
          }
        }
      } catch {
        // No active session or 401: stay on landing
        if (isMounted) {
          setCurrentUser(null);
        }
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrapSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Handler: Start Register or Login
  const handleStartAuth = (mode = 'signup') => {
    setAuthMode(mode);
    setCurrentView('register');
  };

  const leaveUnknownUrl = (destination) => {
    window.history.replaceState(null, '', '/');
    setUnknownUrl(false);
    setCurrentView(destination);
    if (destination === 'app') setActiveTab(getDefaultTabForRole(currentUser?.role));
  };

  // Handler: Complete Auth (from Register/Login screen)
  const handleCompleteAuth = (userData) => {
    setCurrentUser(userData);
    setActiveTab(getDefaultTabForRole(userData?.role));
    setCurrentView('loading');
  };

  // Handler: Loading Screen Finished -> go to role home
  const handleLoadingFinished = () => {
    setCurrentView('app');
    if (currentUser?.role) {
      setActiveTab(getDefaultTabForRole(currentUser.role));
    }
  };

  // Handler: Start Onboarding Wizard
  const handleStartOnboarding = () => {
    setActiveTab('onboarding');
    setWizardStep(1);
  };

  // Handler: Finish Onboarding Wizard
  const handleFinishOnboarding = (profileData) => {
    setUserProfile(profileData);
    setActiveTab('diagnostic');
  };

  // Handler: Finish Diagnostic Test
  const handleFinishTest = (results) => {
    setHasCompletedTest(true);
    setTestResults(results);
    setActiveTab('profile');
  };

  // Handler: Pause / Exit Diagnostic Test
  const handlePauseTest = () => {
    setActiveTab('dashboard');
  };

  // Handler: Logout (clears DB session and cookie)
  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore network errors during logout
    }
    setCurrentUser(null);
    setUserProfile(null);
    setHasCompletedTest(false);
    setTestResults(null);
    setMistakesList([]);
    setCurrentView('landing');
    setActiveTab('dashboard');
  };

  // Helper page title for top navbar
  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'onboarding':
        return 'Thiết lập hồ sơ';
      case 'dashboard':
        return 'Bảng điều khiển học tập';
      case 'profile':
        return 'Hồ sơ năng lực';
      case 'learning-path':
        return 'Lộ trình học cá nhân';
      case 'diagnostic':
        return 'Kiểm tra chẩn đoán (CAT/IRT)';
      case 'missions':
        return 'Nhiệm vụ số';
      case 'mistakes':
        return 'Sổ tay lỗi sai';
      case 'classroom':
        return 'Lớp học của em';
      case 'teacher-pending':
        return 'Hồ sơ giáo viên chờ duyệt';
      case 'teacher-classes':
        return 'Quản lý lớp học';
      case 'teacher-analytics':
        return 'Báo cáo & Can thiệp sư phạm';
      case 'admin-overview':
        return 'Tổng quan hệ thống';
      case 'admin-applicants':
        return 'Duyệt giáo viên ứng tuyển';
      case 'admin-questions':
        return 'Ngân hàng câu hỏi (Maker-Checker)';
      case 'admin-audit':
        return 'Nhật ký kiểm toán hệ thống';
      default:
        return 'AdaptiveMath';
    }
  };

  // Bootstrapping Splash with dynamic rotating circular spinner
  if (isBootstrapping) {
    return (
      <>
        <LoadingScreen onFinished={() => {}} duration={1200} />
        <Analytics />
      </>
    );
  }

  if (unknownUrl) {
    return (
      <>
        <NotFoundView
          isLoggedIn={Boolean(currentUser)}
          onNavigateHome={() => leaveUnknownUrl('landing')}
          onNavigateDashboard={() => leaveUnknownUrl('app')}
        />
        <Analytics />
      </>
    );
  }

  // Render Public Screens
  if (currentView === 'landing') {
    return (
      <>
        <LandingPage
          onStartRegistration={() => handleStartAuth('signup')}
          onLogin={() => handleStartAuth('login')}
          onOpenLegal={() => setShowLegalModal(true)}
        />
        <LegalNoticeModal
          isOpen={showLegalModal}
          onClose={() => setShowLegalModal(false)}
        />
        <Analytics />
      </>
    );
  }

  if (currentView === 'register') {
    return (
      <>
        <RegisterPage
          initialMode={authMode}
          onCompleteRegistration={handleCompleteAuth}
          onNavigateHome={() => setCurrentView('landing')}
        />
        <Analytics />
      </>
    );
  }

  if (currentView === 'loading') {
    return (
      <>
        <LoadingScreen onFinished={handleLoadingFinished} />
        <Analytics />
      </>
    );
  }

  if (currentView !== 'app') {
    return (
      <>
        <NotFoundView
          isLoggedIn={Boolean(currentUser)}
          onNavigateHome={() => setCurrentView('landing')}
          onNavigateDashboard={() => {
            setCurrentView('app');
            setActiveTab('dashboard');
          }}
        />
        <Analytics />
      </>
    );
  }

  const role = currentUser?.role || 'STUDENT';

  // Role Shell Guards
  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab === 'onboarding' ? 'dashboard' : activeTab}
        onSelectTab={(tabId) => setActiveTab(tabId)}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenSessions={() => setShowSessionModal(true)}
        onOpenLegal={() => setShowLegalModal(true)}
        onOpenChangePassword={() => setShowPasswordModal(true)}
        progress={activeTab === 'onboarding' ? { step: wizardStep, total: 8 } : null}
      />

      <div className="main-content-area">
        <main className="tab-viewport">
          <Suspense fallback={<ModernLoadingState message="Đang tải giao diện..." subMessage="Hệ thống đang chuẩn bị dữ liệu cho bạn" />}>
            {/* TEACHER APPLICANT VIEW */}
            {role === 'TEACHER_APPLICANT' && (
              <TeacherPendingView
                currentUser={currentUser}
                onRefreshUser={(updated) => setCurrentUser(updated)}
              />
            )}

            {/* VERIFIED TEACHER VIEWS */}
            {role === 'TEACHER' && (
              <TeacherClassroomsView currentUser={currentUser} />
            )}

            {/* ADMIN & CONTENT VIEWS */}
            {(role === 'ADMIN' || role === 'CONTENT_AUTHOR' || role === 'CONTENT_REVIEWER') && (
              <AdminPortalView
                currentUser={currentUser}
                defaultTab={
                  activeTab === 'admin-applicants'
                    ? 'applicants'
                    : activeTab === 'admin-questions'
                    ? 'questions'
                    : activeTab === 'admin-audit'
                    ? 'audit'
                    : 'overview'
                }
              />
            )}

            {/* STUDENT VIEWS */}
            {role === 'STUDENT' && (
              <>
                {activeTab === 'onboarding' && (
                  <OnboardingWizard
                    currentUser={currentUser}
                    onComplete={handleFinishOnboarding}
                    onCancel={() => setActiveTab('dashboard')}
                    onStepChange={(step) => setWizardStep(step)}
                  />
                )}

                {activeTab === 'dashboard' && (
                  <DashboardView
                    userProfile={userProfile}
                    onStartSetup={handleStartOnboarding}
                    onStartDiagnostic={() => setActiveTab('diagnostic')}
                  />
                )}

                {activeTab === 'profile' && (
                  <ProfileCompetencyView
                    hasCompletedTest={hasCompletedTest}
                    testResults={testResults}
                    onStartDiagnostic={() => setActiveTab('diagnostic')}
                  />
                )}

                {activeTab === 'learning-path' && (
                  <LearningPathView
                    hasCompletedTest={hasCompletedTest}
                    userProfile={userProfile}
                    onStartDiagnostic={() => setActiveTab('diagnostic')}
                  />
                )}

                {activeTab === 'diagnostic' && (
                  <DiagnosticTest
                    onFinishTest={handleFinishTest}
                    onPauseTest={handlePauseTest}
                  />
                )}

                {activeTab === 'missions' && (
                  <MissionsView
                    onStartDiagnostic={() => setActiveTab('diagnostic')}
                    onNavigateTab={(tab) => setActiveTab(tab)}
                  />
                )}

                {activeTab === 'mistakes' && (
                  <MistakeNotebookView
                    mistakes={mistakesList}
                    onStartPractice={() => setActiveTab('diagnostic')}
                  />
                )}

                {activeTab === 'classroom' && <ClassroomView />}

                {!['onboarding', 'dashboard', 'profile', 'learning-path', 'diagnostic', 'missions', 'mistakes', 'classroom'].includes(activeTab) && (
                  <NotFoundView
                    isLoggedIn={true}
                    onNavigateDashboard={() => setActiveTab('dashboard')}
                  />
                )}
              </>
            )}
          </Suspense>
        </main>
      </div>

      {/* Session Management Modal */}
      {showSessionModal && (
        <Suspense fallback={null}>
          <SessionManagementModal
            isOpen={showSessionModal}
            onClose={() => setShowSessionModal(false)}
            onSessionRevoked={handleLogout}
          />
        </Suspense>
      )}

      {/* Legal & Privacy Policy Modal (Draft Gate 0 D-02) */}
      {showLegalModal && (
        <Suspense fallback={null}>
          <LegalNoticeModal
            isOpen={showLegalModal}
            onClose={() => setShowLegalModal(false)}
          />
        </Suspense>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <Suspense fallback={null}>
          <ChangePasswordModal
            isOpen={showPasswordModal}
            onClose={() => setShowPasswordModal(false)}
          />
        </Suspense>
      )}
      <Analytics />
    </div>
  );
}
