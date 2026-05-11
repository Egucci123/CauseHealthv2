// src/pages/auth/Register.tsx
//
// v6.1 — radically simplified onboarding presentation. Same legal
// coverage, fewer scary screens.
//
// All consents that legally MUST exist still get logged. They just
// happen as part of one friendly registration form, not a multi-step
// consent gauntlet:
//
//   Form fields            →  Logged into consent_log
//   ─────────────────────────────────────────────────────
//   First/last name        →  (PII, not a consent)
//   Email + password       →  (auth)
//   State dropdown         →  state_residency_certify (+ eu_geoblock_certify
//                              since the dropdown is US-only)
//   "My doctor is" field   →  clinician_relationship + clinician_name_entered
//   18+ / ToS / Privacy    →  age_18_plus + terms
//                              (one user-facing checkbox, two log rows)
//   Arbitration            →  arbitration_class_waiver
//                              (Berman-required standalone — its own
//                               checkbox + own log row)
//   (implicit)             →  sensitive_health_consent
//
// After signup we fire the AAA-required arbitration notice email (once,
// idempotent) and navigate to /onboarding. The post-signup ConsentGate
// remains in the app shell as the fallback for Google SSO users (who
// bypass this form) and for future re-prompts when policy_version bumps.

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
import { ALLOWED_US_STATES } from '../../lib/legal/blockedJurisdictions';
import { recordPostSignupConsents } from '../../lib/legal/recordSignupConsents';
import { sendSignupConfirmationEmail } from '../../lib/legal/sendConfirmationEmail';

const schema = z.object({
  firstName:        z.string().min(2, 'First name must be at least 2 characters'),
  lastName:         z.string().min(2, 'Last name must be at least 2 characters'),
  email:            z.string().email('Please enter a valid email address'),
  password:         z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword:  z.string(),
  state:            z.string().min(2, 'Please pick your state').max(2, 'Pick your state'),
  clinicianName:    z.string().min(2, 'Tell us who your doctor is'),

  // Bundled: 18+ AND ToS/Privacy acceptance. Single checkbox in the UI,
  // two consent_log rows in the DB (age_18_plus + terms).
  ageAndTerms:      z.boolean().refine(v => v, 'You must be 18+ and agree to the Terms and Privacy Policy.'),

  // Standalone — Berman v. Freedom Financial requires this be its own
  // checkbox, unchecked by default, with operative language adjacent to
  // the box (not buried in a link).
  arbitration:      z.boolean().refine(v => v, 'You must agree to arbitration to use CauseHealth (you can opt out within 30 days).'),
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
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { state: '' } });

  const ageAndTerms  = watch('ageAndTerms');
  const arbitration  = watch('arbitration');
  const stateVal     = watch('state');

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

    // All eight legally-required consents recorded here. Best-effort —
    // failures are logged but don't block signup (the post-signup gate
    // is the safety net for terms + arbitration).
    try {
      await recordPostSignupConsents({
        ageConfirmed:      data.ageAndTerms,
        termsAccepted:     data.ageAndTerms,
        arbitrationAgreed: data.arbitration,
        state:             data.state,
        clinicianName:     data.clinicianName.trim(),
      });
    } catch (e) {
      console.warn('[Register] post-signup consent record failed:', e);
    }

    // Fire the AAA-required arbitration notice email. Idempotent +
    // fire-and-forget — does not block onboarding.
    sendSignupConfirmationEmail().catch((e) =>
      console.warn('[Register] confirmation email send failed:', e),
    );

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
      subtitle="Start with one lab report — $19."
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

        {/* State — dropdown blocks CA/NY/IL/WA by exclusion. No
            explanatory legal copy needed; the act of submitting with a
            non-blocked state is the certification. */}
        <div>
          <label
            htmlFor="reg-state"
            className="block text-precision text-[0.65rem] font-bold tracking-widest uppercase text-clinical-stone mb-2"
          >
            Where do you live?
          </label>
          <select
            id="reg-state"
            value={stateVal}
            onChange={(e) => setValue('state', e.target.value, { shouldValidate: true })}
            className="w-full px-3 py-2.5 border border-clinical-stone/40 rounded-md text-body text-[0.92rem] text-clinical-charcoal bg-clinical-white focus:outline-none focus:border-[#1E40AF] focus:ring-2 focus:ring-[#1E40AF]/30"
          >
            <option value="">Pick your state…</option>
            {ALLOWED_US_STATES.map((s) => (
              <option key={s.code} value={s.code}>{s.name}</option>
            ))}
          </select>
          {errors.state?.message && (
            <p className="text-body text-[0.78rem] text-[#C94F4F] mt-1">{errors.state.message}</p>
          )}
        </div>

        {/* Doctor — framed as personalization, not legal attestation.
            The act of entering a name IS the established-clinician
            certification per ToS §3 (logged invisibly). */}
        <Input
          label="My doctor is"
          placeholder="Dr. Jane Doe"
          error={errors.clinicianName?.message}
          {...register('clinicianName')}
        />

        {/* Two checkboxes — the minimum the law actually requires. */}
        <div className="pt-1 space-y-3">
          <AuthCheckbox
            checked={ageAndTerms ?? false}
            onChange={(val) => setValue('ageAndTerms', val, { shouldValidate: true })}
            error={errors.ageAndTerms?.message}
          >
            I&apos;m 18+ and agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-primary-container underline hover:no-underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary-container underline hover:no-underline">
              Privacy Policy
            </a>.
          </AuthCheckbox>

          <AuthCheckbox
            checked={arbitration ?? false}
            onChange={(val) => setValue('arbitration', val, { shouldValidate: true })}
            error={errors.arbitration?.message}
          >
            I agree to resolve disputes through individual arbitration instead of court (
            <a
              href="/terms#section-17"
              target="_blank"
              rel="noreferrer"
              className="text-primary-container underline hover:no-underline"
            >
              learn more
            </a>
            ). 30-day opt-out by email.
          </AuthCheckbox>
        </div>

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
