// src/App.tsx
import { Routes, Route } from 'react-router-dom';

// Public pages
import { Landing } from './pages/Landing';
import { Terms } from './pages/legal/Terms';
import { Privacy } from './pages/legal/Privacy';

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

// Wellness
import { WellnessPlanPage } from './pages/wellness/WellnessPlanPage';

// Medications
import { MedicationChecker } from './pages/medications/MedicationChecker';

// Symptoms
import { SymptomMapper } from './pages/symptoms/SymptomMapper';

// Doctor Prep
import { DoctorPrep } from './pages/doctorprep/DoctorPrep';

// Progress
import { ProgressTracking } from './pages/progress/ProgressTracking';

// Settings
import { Settings } from './pages/settings/Settings';

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

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

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
      <Route path="/labs" element={<ProtectedRoute><LabHistory /></ProtectedRoute>} />
      <Route path="/labs/upload" element={<ProtectedRoute><LabUpload /></ProtectedRoute>} />
      <Route path="/labs/upload/manual" element={<ProtectedRoute><LabUpload /></ProtectedRoute>} />
      <Route path="/labs/:drawId" element={<ProtectedRoute><LabDetail /></ProtectedRoute>} />

      {/* Features */}
      <Route path="/wellness" element={<ProtectedRoute><WellnessPlanPage /></ProtectedRoute>} />
      <Route path="/medications" element={<ProtectedRoute><MedicationChecker /></ProtectedRoute>} />
      <Route path="/symptoms" element={<ProtectedRoute><SymptomMapper /></ProtectedRoute>} />
      <Route path="/doctor-prep" element={<ProtectedRoute><DoctorPrep /></ProtectedRoute>} />
      <Route path="/progress" element={<ProtectedRoute><ProgressTracking /></ProtectedRoute>} />
      <Route path="/insurance" element={<ProtectedRoute><PageStub title="Insurance Guide" /></ProtectedRoute>} />

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
  );
}

export default App;
