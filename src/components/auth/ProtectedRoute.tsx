// src/components/auth/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireOnboarding?: boolean;
}

// Full-screen loading state — prevents the "black flash + redirect + remount" glitch
// during initial auth hydration on protected routes.
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

  // Wait for auth to hydrate before deciding anything — fixes the "load → black → load" flash
  if (!initialized || loading) {
    return <AuthLoading />;
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?redirectTo=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  // If user is loaded but profile hasn't fetched yet, wait — don't render the page
  // with a null profile (causes blank state) and don't redirect to onboarding (causes flash).
  if (requireOnboarding && !profile) {
    return <AuthLoading />;
  }

  if (requireOnboarding && profile && !profile.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isOnboarded, initialized } = useAuthStore();
  if (!initialized) return <AuthLoading />;
  if (isAuthenticated) {
    return <Navigate to={isOnboarded ? '/dashboard' : '/onboarding'} replace />;
  }

  return <>{children}</>;
};
