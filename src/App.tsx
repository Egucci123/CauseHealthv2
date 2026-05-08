// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { ScrollToTop } from './components/ScrollToTop';

// Public pages
import { Landing } from './pages/Landing';
import { Share } from './pages/Share';
import { Terms } from './pages/legal/Terms';
import { Privacy } from './pages/legal/Privacy';
import { Disclaimer } from './pages/legal/Disclaimer';
import { About } from './pages/company/About';
import { Contact } from './pages/company/Contact';
import { Blog } from './pages/company/Blog';

// Auth pages
import { Register } from './pages/auth/Register';
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import { VerifyEmail } from './pages/auth/VerifyEmail';
import { AuthCallback } from './pages/auth/AuthCallback';

// Onboarding
import { Onboarding } from './pages/onboarding/Onboarding';

// Dashboard
import { Dashboard } from './pages/Dashboard';

// Lab pages
import { LabUpload } from './pages/labs/LabUpload';
import { LabHistory } from './pages/labs/LabHistory';
import { LabDetail } from './pages/labs/LabDetail';
import { LabsIndex } from './pages/labs/LabsIndex';

// Wellness
import { WellnessPlanPage } from './pages/wellness/WellnessPlanPage';

// Medications
// Medications page consolidated into the Doctor Prep "Medications" tab (May 2026).
// Keeping the redirect so old links / bookmarks still work.

// Symptoms page consolidated into Wellness Plan (April 2026 product change).

// Doctor Prep
import { DoctorPrepPage } from './pages/doctorprep/DoctorPrep';

// Chat
import { HealthChat } from './pages/chat/HealthChat';

// Settings
import { Settings } from './pages/settings/Settings';

// Glossary
import { Glossary } from './pages/Glossary';

// Layout
import { AppShell } from './components/layout/AppShell';

// Route guards
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/ProtectedRoute';
import { useAuthStore } from './store/authStore';
import { useNavigate } from 'react-router-dom';

// 404 — uses SPA navigation (no full reload), and the destination depends
// on whether the user is signed in. A logged-in user with a typo in a URL
// gets a "back to dashboard" CTA; a public user gets "back home". Plus a
// "go back" option that walks browser history so a tap lands on the page
// they actually came from. Never a dead-end.
const NotFound = () => {
  const navigate = useNavigate();
  const userId = useAuthStore(s => s.user?.id);
  const homeLabel = userId ? 'Back to Dashboard' : 'Back to Home';
  const homePath = userId ? '/dashboard' : '/';
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(homePath, { replace: true });
  };
  return (
    <div className="min-h-screen bg-[#131313] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <p className="text-authority text-6xl text-white font-bold mb-2">404</p>
        <p className="text-body text-on-surface-variant mb-1 text-base">Page not found.</p>
        <p className="text-precision text-[0.65rem] text-on-surface-variant/60 mb-8 break-all">
          {window.location.pathname}
        </p>
        <div className="flex flex-col gap-2 max-w-xs mx-auto">
          <button
            onClick={() => navigate(homePath, { replace: true })}
            className="w-full bg-primary-container hover:bg-[#2D6A4F] text-white text-precision text-[0.68rem] font-bold tracking-widest uppercase py-3 rounded-[8px] transition-colors"
          >
            {homeLabel}
          </button>
          <button
            onClick={goBack}
            className="w-full bg-white/5 border border-white/10 text-on-surface-variant text-precision text-[0.65rem] font-bold tracking-widest uppercase py-2.5 rounded-[8px] hover:bg-white/10 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
};

// Insurance stub — only remaining stub page
const PageStub = ({ title }: { title: string }) => (
  <AppShell pageTitle={title}>
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">construction</span>
        <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">{title}</p>
        <p className="text-body text-clinical-stone">Coming soon.</p>
      </div>
    </div>
  </AppShell>
);

// Visible chip rendered above the app on staging/preview deploys so testers
// can never confuse staging with prod. Driven by VITE_APP_ENV=staging.
const StagingBanner = () => {
  if (import.meta.env.VITE_APP_ENV !== 'staging') return null;
  return (
    <div style={{position:'fixed',top:0,left:0,right:0,zIndex:9999,background:'#D4A574',color:'#131313',textAlign:'center',padding:'4px 8px',fontSize:'11px',fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase'}}>
      Staging Environment — Test Data Only
    </div>
  );
};

function App() {
  return (
    <>
    <StagingBanner />
    <ScrollToTop />
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/share" element={<Share />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/disclaimer" element={<Disclaimer />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/blog" element={<Blog />} />

      {/* Auth */}
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/verify-email" element={<VerifyEmail />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Onboarding */}
      <Route path="/onboarding" element={<ProtectedRoute requireOnboarding={false}><Onboarding /></ProtectedRoute>} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

      {/* Labs */}
      <Route path="/labs" element={<ProtectedRoute><LabsIndex /></ProtectedRoute>} />
      <Route path="/labs/history" element={<ProtectedRoute><LabHistory /></ProtectedRoute>} />
      <Route path="/labs/upload" element={<ProtectedRoute><LabUpload /></ProtectedRoute>} />
      <Route path="/labs/upload/manual" element={<ProtectedRoute><LabUpload /></ProtectedRoute>} />
      <Route path="/labs/:drawId" element={<ProtectedRoute><LabDetail /></ProtectedRoute>} />

      {/* Features */}
      <Route path="/wellness" element={<ProtectedRoute><WellnessPlanPage /></ProtectedRoute>} />
      <Route path="/medications" element={<Navigate to="/doctor-prep" replace />} />
      {/* /symptoms route removed — symptoms now surface in the Wellness Plan with how-addressed details. */}
      <Route path="/symptoms" element={<Navigate to="/wellness" replace />} />
      <Route path="/doctor-prep" element={<ProtectedRoute><DoctorPrepPage /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><HealthChat /></ProtectedRoute>} />
      <Route path="/progress" element={<Navigate to="/wellness" replace />} />
      <Route path="/insurance" element={<ProtectedRoute><PageStub title="Insurance Guide" /></ProtectedRoute>} />
      <Route path="/glossary" element={<ProtectedRoute><Glossary /></ProtectedRoute>} />

      {/* Settings */}
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      {/* 404 catch-all — see NotFound above. */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}

export default App;
