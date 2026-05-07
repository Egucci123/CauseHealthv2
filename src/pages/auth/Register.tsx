// src/pages/auth/Register.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../../components/auth/AuthLayout';
import {
  GoogleButton, AuthDivider, PasswordField,
  PasswordStrength, AuthCheckbox, ErrorBanner,
} from '../../components/auth/AuthComponents';
import { MagicLinkForm } from '../../components/auth/MagicLinkForm';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';

// Terms / Privacy / AI-processing / Health-data-authorization consent is
// captured AFTER signup via ConsentGate (three audited screens, IP-stamped
// server-side, written to consent_log). We deliberately do NOT collect
// consent inline here — bundling it with account creation violates GDPR
// Recital 32 (separate consent moments) and Washington MHMDA standalone-
// authorization requirements.
const schema = z.object({
  firstName:       z.string().min(2, 'First name must be at least 2 characters'),
  lastName:        z.string().min(2, 'Last name must be at least 2 characters'),
  email:           z.string().email('Please enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  // Age gate. Terms require 18+ and we have no parental-consent flow for
  // minors. The DOB collected in onboarding (Step 1) re-validates this with
  // an actual birthdate; this checkbox is the upfront attestation so a
  // minor can't get through signup at all.
  ageConfirmed:    z.boolean().refine(v => v, 'You must be 18 or older to use CauseHealth.'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export const Register = () => {
  const navigate = useNavigate();
  const { signUp, signInWithGoogle } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordVal, setPasswordVal] = useState('');
  const [confirmVal, setConfirmVal] = useState('');
  const [showMagicLink, setShowMagicLink] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const ageConfirmed = watch('ageConfirmed');

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const { error } = await signUp({
      email:     data.email,
      password:  data.password,
      firstName: data.firstName,
      lastName:  data.lastName,
    });

    if (error) {
      setServerError(error);
      return;
    }

    // Email confirmation off — user is authenticated immediately, go to onboarding
    // To re-enable: change this to navigate('/auth/verify-email', { state: { email: data.email } });
    navigate('/onboarding', { replace: true });
  };

  const handleGoogle = async () => {
    setServerError(null);
    const { error } = await signInWithGoogle();
    if (error) setServerError(error);
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start with one lab report — free."
    >
      <GoogleButton label="Continue with Google" onClick={handleGoogle} />

      <button
        type="button"
        onClick={() => setShowMagicLink((v) => !v)}
        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 border border-outline-variant/20 hover:border-primary-container/40 bg-clinical-white transition-colors"
        style={{ borderRadius: '6px' }}
      >
        <span className="material-symbols-outlined text-primary-container text-[18px]">mail</span>
        <span className="text-body text-clinical-charcoal text-sm font-medium">{showMagicLink ? 'Hide email link' : 'Sign up with email link'}</span>
      </button>

      {showMagicLink && (
        <div className="mt-3">
          <MagicLinkForm onClose={() => setShowMagicLink(false)} />
        </div>
      )}

      <AuthDivider />

      <ErrorBanner message={serverError} />
      {serverError && <div className="mb-4" />}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            placeholder="Evan"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <Input
            label="Last Name"
            placeholder="Johnson"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>

        <Input
          label="Email Address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <PasswordField
            label="Password"
            value={passwordVal}
            onChange={(val) => {
              setPasswordVal(val);
              setValue('password', val, { shouldValidate: true });
            }}
            error={errors.password?.message}
            autoComplete="new-password"
          />
          <PasswordStrength password={passwordVal} />
        </div>

        <PasswordField
          label="Confirm Password"
          value={confirmVal}
          onChange={(val) => {
            setConfirmVal(val);
            setValue('confirmPassword', val, { shouldValidate: true });
          }}
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
        />

        <div className="pt-1">
          <AuthCheckbox
            checked={ageConfirmed ?? false}
            onChange={(val) => setValue('ageConfirmed', val, { shouldValidate: true })}
            error={errors.ageConfirmed?.message}
          >
            I confirm I am 18 years of age or older.
          </AuthCheckbox>
        </div>

        <p className="text-precision text-[0.65rem] text-clinical-stone/70 tracking-wide leading-relaxed">
          By creating an account you'll be asked to review and accept our{' '}
          <a href="/terms" className="text-primary-container hover:underline">Terms</a>,{' '}
          <a href="/privacy" className="text-primary-container hover:underline">Privacy Policy</a>,
          and health-data authorization on the next screen.
        </p>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          className="w-full justify-center mt-2"
        >
          Create Account
        </Button>
      </form>

      <p className="text-body text-clinical-stone text-sm text-center mt-6">
        Already have an account?{' '}
        <a href="/login" className="text-primary-container hover:underline font-medium">Sign in</a>
      </p>
    </AuthLayout>
  );
};
