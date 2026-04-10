// src/pages/auth/AuthCallback.tsx
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
      // Give Supabase a moment to process the URL hash tokens
      // then check for a session up to 5 times
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 800));
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          // Session found — reinitialize auth store and redirect
          await useAuthStore.getState().initialize();
          const profile = useAuthStore.getState().profile;
          navigate(profile?.onboardingCompleted ? '/dashboard' : '/onboarding', { replace: true });
          return;
        }
      }
      // No session after retries — send to login
      navigate('/login', { replace: true });
    };

    process();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#131313] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
      <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase">
        Signing you in...
      </p>
    </div>
  );
};
