// src/components/auth/ProtectedRoute.tsx
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ConsentGate } from './ConsentGate';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

const AuthLoading = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-clinical-cream">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-primary-container/30 border-t-primary-container animate-spin" />
      <p className="text-precision text-[0.6rem] font-bold text-clinical-stone tracking-widest uppercase">Loading</p>
    </div>
  </div>
);

export const ProtectedRoute = ({
  children,
  requireOnboarding = true,
}: ProtectedRouteProps) => {
  const user = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  const initialized = useAuthStore(s => s.initialized);
  const loading = useAuthStore(s => s.loading);
  const location = useLocation();

  // Local override flag — flips true when the consent gate finishes,
  // so this render cycle proceeds without waiting for a profile refetch.
  const [consentJustCompleted, setConsentJustCompleted] = useState(false);

  if (!initialized || loading) return <AuthLoading />;

  if (!user) {
    return (
      <Navigate
        to={`/login?redirectTo=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  if (requireOnboarding && !profile) return <AuthLoading />;

  // ── CONSENT GATE ──────────────────────────────────────────────────
  // Until the user has logged all three required consents in consent_log
  // for the current CONSENT_POLICY_VERSION, route them through the
  // two-screen consent flow. Universal — every user, every protected
  // route, until fully consented. Re-fires automatically when policy
  // version changes (existing users re-consent on next login).
  if (profile && !consentJustCompleted) {
    return (
      <ConsentGate onConsented={() => setConsentJustCompleted(true)} />
    );
  }

  if (requireOnboarding && profile && !profile.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isOnboarded, initialized } = useAuthStore();
  const profile = useAuthStore(s => s.profile);
  if (!initialized) return <AuthLoading />;
  if (isAuthenticated) {
    if (!profile) return <AuthLoading />;
    return <Navigate to={isOnboarded ? '/dashboard' : '/onboarding'} replace />;
  }
  return <>{children}</>;
};
