import React, { useState, useEffect, Suspense, lazy } from 'react';
import LandingPage from './components/LandingPage';
import RegisterPage from './components/RegisterPage';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import MathTutorWidget from './components/MathTutorWidget';
import DashboardView from './components/DashboardView';
import OnboardingWizard from './components/OnboardingWizard';
import NotFoundView from './components/NotFoundView';
import ModernLoadingState from './components/ModernLoadingState';
import { authApi, studentApi } from './lib/apiClient';
import {saveMathNavigation,readRoute,resolveRoute,writeRoute} from './lib/mathNavigation';
import { recordStudyActivity } from './lib/calendarSyncService';
import { CalendarDays, ChevronRight } from 'lucide-react';

// Code-split heavy role-specific and feature views
const DiagnosticTest = lazy(() => import('./components/DiagnosticTest'));
const ProfileCompetencyView = lazy(() => import('./components/ProfileCompetencyView'));
const LearningPathView = lazy(() => import('./components/LearningPathView'));
const MistakeNotebookView = lazy(() => import('./components/MistakeNotebookView'));
const MathReviewView = lazy(() => import('./components/MathReviewView'));
const MathPracticeView = lazy(() => import('./components/MathPracticeView'));
const ClassroomView = lazy(() => import('./components/ClassroomView'));
const MissionsView = lazy(() => import('./components/MissionsView'));
const TeacherPendingView = lazy(() => import('./components/TeacherPendingView'));
const TeacherClassroomsView = lazy(() => import('./components/TeacherWorkspace'));
const AdminPortalView = lazy(() => import('./components/AdminPortalView'));
const SessionManagementModal = lazy(() => import('./components/SessionManagementModal'));
const LegalNoticeModal = lazy(() => import('./components/LegalNoticeModal'));
const ChangePasswordModal = lazy(() => import('./components/ChangePasswordModal'));

export default function App() {
  const [unknownUrl, setUnknownUrl] = useState(() => Boolean(readRoute(window.location).unknown));
  // Navigation & User State
  const [currentView, setCurrentView] = useState('landing'); // 'landing' | 'register' | 'loading' | 'app' | 'onboarding'
  const [activeTab, updateActiveTab] = useState('dashboard');
  const setActiveTab = (tab) => { writeRoute(tab, practiceSkillId); updateActiveTab(tab); };
  const [practiceSkillId, setPracticeSkillId] = useState(null);
  const startPractice = (skillId) => { setPracticeSkillId(skillId); writeRoute('practice', skillId); updateActiveTab('practice'); };
  const [authMode, setAuthMode] = useState('signup');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [sessionError,setSessionError]=useState('');
  const [sessionRetry,setSessionRetry]=useState(0);
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
        return 'teacher-overview';
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
      setIsBootstrapping(true);
      setSessionError('');
      try {
        setIsBootstrapping(true);setSessionError('');
        const data = await authApi.getMe();
        if (isMounted && data.user) {
          setCurrentUser(data.user);
          setCurrentView('app');
          const navigation=resolveRoute(data.user,window.location,window.sessionStorage);
          if (navigation.unknown || navigation.forbidden) setUnknownUrl(true);
          else { updateActiveTab(navigation.tab); setPracticeSkillId(navigation.skillId || null); writeRoute(navigation.tab, navigation.skillId, true); }

          // If student, load student profile from server
          if (data.user.role === 'STUDENT') {
            try {
              const profData = await studentApi.getProfile();
              if (profData.profile) {
                setUserProfile(profData.profile);
              }
              if (profData.stats?.completedAssessments > 0) {
                setHasCompletedTest(true);
              }
            } catch {
              // Non-blocking if profile not yet completed
            }
          }
        }
      } catch (error) {
        if (isMounted) {
          if (error.status === 401) {
            setCurrentUser(null);
            setCurrentView('landing');
          } else {
            setSessionError('Chưa thể khôi phục phiên đăng nhập. Kiểm tra kết nối và thử lại.');
          }
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
  }, [sessionRetry]);

  useEffect(()=>{if(currentUser&&currentView==='app'&&!isBootstrapping&&!sessionError)saveMathNavigation(currentUser,activeTab,practiceSkillId,window.sessionStorage);},[currentUser,currentView,activeTab,practiceSkillId,isBootstrapping,sessionError]);

  useEffect(() => {
    const sync = () => {
      const route = currentUser ? resolveRoute(currentUser, window.location, window.sessionStorage) : readRoute(window.location);
      setUnknownUrl(Boolean(route.unknown || route.forbidden));
      if (currentUser && route.tab) { updateActiveTab(route.tab); setPracticeSkillId(route.skillId || null); }
    };
    const events = ['popstate', 'hashchange', 'math-route'];
    events.forEach(event => window.addEventListener(event, sync));
    return () => events.forEach(event => window.removeEventListener(event, sync));
  }, [currentUser]);

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
    const route = resolveRoute(userData, window.location, window.sessionStorage);
    setUnknownUrl(Boolean(route.unknown || route.forbidden));
    if (route.tab) { updateActiveTab(route.tab); setPracticeSkillId(route.skillId || null); writeRoute(route.tab, route.skillId, true); }
    setCurrentView('loading');
  };

  // Handler: Loading Screen Finished -> go to role home
  const handleLoadingFinished = () => {
    setCurrentView('app');

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
    recordStudyActivity(currentUser?.id, {
      minutes: Math.max(1, Math.ceil((results.answers || []).reduce((sum, a) => sum + (a.timeSpentSeconds || 0), 0) / 60)),
      activity: 'Hoàn thành bài kiểm tra chẩn đoán'
    });
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
    try { if (currentUser) sessionStorage.removeItem('math-navigation:' + currentUser.id); } catch {}
    setUserProfile(null);
    setHasCompletedTest(false);
    setTestResults(null);
    setMistakesList([]);
    setCurrentView('landing');
    updateActiveTab('dashboard');
    window.history.replaceState(null, '', '/');
    setUnknownUrl(false);
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
      case 'review':
        return 'Ôn kiến thức';
      case 'practice':
        return 'Luyện tập theo chủ đề';
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
      case 'admin-users':
        return 'Quản lý tài khoản';
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
    return <LoadingScreen onFinished={() => {}} duration={1200} />;
  }

  if(sessionError){return <main className="session-recovery" role="alert"><h1>Đang khôi phục phiên của bạn</h1><p>{sessionError}</p><button type="button" onClick={()=>setSessionRetry(value=>value+1)}>Thử lại</button></main>;}

  if (unknownUrl) {
    return (
      <NotFoundView
        isLoggedIn={Boolean(currentUser)}
        onNavigateHome={() => leaveUnknownUrl('landing')}
        onNavigateDashboard={() => leaveUnknownUrl('app')}
      />
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
      </>
    );
  }

  if (currentView === 'register') {
    return (
      <RegisterPage
        initialMode={authMode}
        onCompleteRegistration={handleCompleteAuth}
        onNavigateHome={() => setCurrentView('landing')}
      />
    );
  }

  if (currentView === 'loading') {
    return <LoadingScreen onFinished={handleLoadingFinished} />;
  }

  if (currentView !== 'app') {
    return (
      <NotFoundView
        isLoggedIn={Boolean(currentUser)}
        onNavigateHome={() => setCurrentView('landing')}
        onNavigateDashboard={() => {
          setCurrentView('app');
          setActiveTab('dashboard');
        }}
      />
    );
  }

  const role = currentUser?.role || 'STUDENT';

  // Role Shell Guards
  return (
    <div className={`app-container ${role === 'TEACHER' ? 'teacher-app-shell' : ''}`}>
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

      <a className="skip-to-content" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Đến nội dung chính</a>
      <div className="main-content-area">
        {role === 'TEACHER' && <header className="teacher-contextbar">
          <div className="teacher-context-trail"><span>Không gian giảng dạy</span><ChevronRight size={14} aria-hidden="true" /><strong>{{'teacher-overview':'Tổng quan','teacher-classes':'Lớp học','teacher-library':'Thư viện đề','teacher-bank':'Ngân hàng câu hỏi'}[activeTab] || 'Giảng dạy'}</strong></div>
          <time className="teacher-context-date" dateTime={new Date().toISOString().slice(0,10)}><CalendarDays size={16} aria-hidden="true" />{new Date().toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit'})}</time>
        </header>}
        {currentUser?.role === 'STUDENT' && <MathTutorWidget key={currentUser.id} userId={currentUser.id}/>}
        <main id="main-content" className="tab-viewport" tabIndex={-1}>
          <Suspense fallback={<ModernLoadingState message="Đang tải giao diện..." subMessage="Hệ thống đang chuẩn bị dữ liệu cho bạn" />}>
            {/* TEACHER APPLICANT VIEW */}
            {role === 'TEACHER_APPLICANT' && (
              <TeacherPendingView
                currentUser={currentUser}
                onRefreshUser={(updated) => setCurrentUser(updated)}
              />
            )}

            {/* VERIFIED TEACHER VIEWS */}
            {(role === 'TEACHER' || (role === 'ADMIN' && activeTab === 'teacher-classes')) && (
              <TeacherClassroomsView currentUser={currentUser} activeTab={activeTab} onNavigate={setActiveTab} />
            )}

            {/* ADMIN & CONTENT VIEWS */}
            {((role === 'ADMIN' && activeTab !== 'teacher-classes') || role === 'CONTENT_AUTHOR' || role === 'CONTENT_REVIEWER') && (
              <AdminPortalView
                onNavigate={setActiveTab}
                currentUser={currentUser}
                defaultTab={
                  activeTab === 'admin-users'
                    ? 'users'
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
                    hasCompletedTest={hasCompletedTest}
                    onStartPractice={startPractice}
                    onReview={() => setActiveTab('review')}
                    onNavigatePath={() => setActiveTab('learning-path')}
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
                    userId={currentUser.id}
                    onStartPractice={startPractice}
                    onReview={() => setActiveTab('review')}
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
                    hasCompletedTest={hasCompletedTest}
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
                {activeTab === 'review' && <MathReviewView />}
                {activeTab === 'practice' && <MathPracticeView skillId={practiceSkillId} userId={currentUser.id}
                  onExit={() => setActiveTab('learning-path')}
                  onComplete={(result) => {
                    recordStudyActivity(currentUser?.id, { minutes: result.minutes, activity: 'Hoàn thành luyện tập theo chủ đề' });
                  }} />}

                {!['onboarding', 'dashboard', 'profile', 'learning-path', 'diagnostic', 'missions', 'mistakes', 'review', 'practice', 'classroom'].includes(activeTab) && (
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
    </div>
  );
}
