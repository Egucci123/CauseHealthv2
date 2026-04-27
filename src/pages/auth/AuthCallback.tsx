// src/pages/auth/AuthCallback.tsx
// Handles the OAuth redirect after Google sign-in and magic-link verification.
// Visually identical to the ProtectedRoute loading state so there's no
// jarring black-to-cream flash between sign-in and onboarding.
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export const AuthCallback = () => {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const process = async () => {
      // Faster initial poll — most sessions resolve in <300ms.
      // Backoff if not found, max ~4s total.
      const delays = [150, 300, 500, 1000, 2000];
      for (const delay of delays) {
        await new Promise((r) => setTimeout(r, delay));
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await useAuthStore.getState().initialize();
          const profile = useAuthStore.getState().profile;
          navigate(profile?.onboardingCompleted ? '/dashboard' : '/onboarding', { replace: true });
          return;
        }
      }
      navigate('/login', { replace: true });
    };

    process();
  }, [navigate]);

  // Match the ProtectedRoute AuthLoading visual exactly — same bg, same spinner,
  // same label — so the transition is seamless.
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-clinical-cream">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-primary-container/30 border-t-primary-container animate-spin" />
        <p className="text-precision text-[0.6rem] font-bold text-clinical-stone tracking-widest uppercase">Signing you in</p>
      </div>
    </div>
  );
};
