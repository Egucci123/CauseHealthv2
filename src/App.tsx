// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { ScrollToTop } from './components/ScrollToTop';

// Public pages
import { Landing } from './pages/Landing';
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

      {/* 404 */}
      <Route path="*" element={
        <div className="min-h-screen bg-[#131313] flex items-center justify-center">
          <div className="text-center">
            <p className="text-authority text-6xl text-white font-bold mb-4">404</p>
            <p className="text-body text-on-surface-variant mb-8">Page not found.</p>
            <a href="/" className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Return home</a>
          </div>
        </div>
      } />
    </Routes>
    </>
  );
}

export default App;
