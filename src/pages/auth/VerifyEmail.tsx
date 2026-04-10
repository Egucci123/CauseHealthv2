// src/pages/auth/VerifyEmail.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { SuccessBanner } from '../../components/auth/AuthComponents';
import { useAuthStore } from '../../store/authStore';

export const VerifyEmail = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [countdown, setCountdown] = useState(0);
  const [resent, setResent]       = useState(false);

  const email = (location.state as { email?: string })?.email ?? '';

  const { isAuthenticated, isOnboarded } = useAuthStore();
  useEffect(() => {
    if (isAuthenticated) {
      navigate(isOnboarded ? '/dashboard' : '/onboarding', { replace: true });
    }
  }, [isAuthenticated, isOnboarded, navigate]);

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (!email || countdown > 0) return;
    setResent(true);
    startCountdown();
  };

  return (
    <AuthLayout title="Check your email." subtitle="We sent a verification link to confirm your account." maxWidth="sm">
      <div className="space-y-6">
        <div className="bg-clinical-cream rounded-lg p-6">
          <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold mb-2">
            Verification sent to
          </p>
          <p className="text-authority text-xl text-clinical-charcoal font-semibold">
            {email || 'your email address'}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold">
            Next steps
          </p>
          <ol className="text-body text-clinical-stone text-sm space-y-3">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 bg-primary-container rounded-full flex items-center justify-center">
                <span className="text-precision text-[0.6rem] text-white font-bold">1</span>
              </span>
              Open the email from CauseHealth.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 bg-primary-container rounded-full flex items-center justify-center">
                <span className="text-precision text-[0.6rem] text-white font-bold">2</span>
              </span>
              Click the "Verify email" button in the email
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 bg-primary-container rounded-full flex items-center justify-center">
                <span className="text-precision text-[0.6rem] text-white font-bold">3</span>
              </span>
              You'll be automatically signed in and taken to onboarding
            </li>
          </ol>
        </div>

        {email && email.includes('gmail') && (
          <a
            href="https://mail.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 border border-outline-variant/20 bg-clinical-cream text-clinical-charcoal text-sm font-body py-3 hover:bg-clinical-cream/80 transition-colors"
            style={{ borderRadius: '6px' }}
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            Open Gmail
          </a>
        )}

        {resent && <SuccessBanner message="Verification email resent. Check your inbox." />}

        <div className="flex flex-col gap-3 pt-2 border-t border-outline-variant/10">
          <button
            onClick={handleResend}
            disabled={countdown > 0 || !email}
            className={`
              text-precision text-[0.68rem] tracking-widest uppercase font-bold text-center
              ${countdown > 0
                ? 'text-clinical-stone/40 cursor-not-allowed'
                : 'text-primary-container hover:underline cursor-pointer'
              }
            `}
          >
            {countdown > 0 ? `Resend in ${countdown}s` : "Didn't receive it? Resend"}
          </button>
          <a href="/login" className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase text-center hover:text-clinical-charcoal transition-colors">
            Back to sign in
          </a>
        </div>
      </div>
    </AuthLayout>
  );
};
