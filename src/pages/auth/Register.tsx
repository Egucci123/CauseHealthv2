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
import { ALLOWED_US_STATES } from '../../lib/legal/blockedJurisdictions';
import { recordPostSignupConsents } from '../../lib/legal/recordSignupConsents';

// REGISTER FORM — collapsed v6 onboarding
// =======================================
// Per legal counsel reframe (v6 implementation spec, May 2026):
// the medical disclaimer / clinician relationship / sensitive-health
// authorization / state-residency cert can ALL be captured here as
// product fields rather than 8 separate post-signup checkbox screens.
//
// Fields collected here that double as legal attestations:
//   • State dropdown — implicit residency certification (excludes CA/
//     NY/IL/WA so blocked-state residents physically cannot proceed).
//     The submission-with-this-state IS the certification.
//   • Clinician name + practice — implicit established-clinician
//     attestation per ToS Section 3 eligibility.
//   • 18+ checkbox — age attestation.
//
// Captured AFTER signup (post-signup ConsentGate, now reduced to 2
// screens):
//   • ToS + Privacy scroll-and-accept (1 screen, collapses
//     ai_processing / health_data_authorization / sensitive_health /
//     mhmda_wa_authorization into the umbrella ToS).
//   • Standalone arbitration + class-action waiver checkbox (Berman
//     v. Freedom Financial — non-collapsible).
const schema = z.object({
  firstName:        z.string().min(2, 'First name must be at least 2 characters'),
  lastName:         z.string().min(2, 'Last name must be at least 2 characters'),
  email:            z.string().email('Please enter a valid email address'),
  password:         z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword:  z.string(),
  state:            z.string().min(2, 'Please pick your state').max(2, 'Pick your state'),
  clinicianName:    z.string().min(2, 'Add your doctor or clinician'),
  clinicianPractice:z.string().min(2, 'Add the practice or clinic name'),
  ageConfirmed:     z.boolean().refine(v => v, 'You must be 18 or older to use CauseHealth.'),
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

  const ageConfirmed = watch('ageConfirmed');
  const stateVal = watch('state');

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

    // Implicit consents captured by the form being submitted with
    // these specific values. Logged via the v6 consent_log API so the
    // legal record exists per the lawyer's spec — just collected via
    // form fields rather than separate checkbox screens.
    try {
      await recordPostSignupConsents({
        ageConfirmed: data.ageConfirmed,
        state: data.state,
        clinicianName: data.clinicianName.trim(),
        clinicianPractice: data.clinicianPractice.trim(),
      });
    } catch (e) {
      // Non-blocking — the post-signup ConsentGate will still capture
      // ToS + arbitration. We log this for debugging but don't refuse
      // the signup.
      console.warn('[Register] post-signup consent record failed:', e);
    }

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

        {/* Where do you live? — replaces the standalone state-residency
            checkbox screen. Dropdown contains only allowed US states;
            blocked states (CA / NY / IL / WA) are not in the list, so
            blocked-state residents physically can't pick one. */}
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
          <p className="text-precision text-[0.62rem] text-clinical-stone/70 mt-1">
            CauseHealth is currently available only outside California, New York, Illinois, and Washington State.
          </p>
        </div>

        {/* Who's your doctor? — replaces the standalone established-
            clinician attestation screen. The act of naming a clinician
            here IS the attestation per ToS §3. Pre-filled at output
            ack so the user just confirms or edits. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Your doctor"
            placeholder="Dr. Jane Doe"
            error={errors.clinicianName?.message}
            {...register('clinicianName')}
          />
          <Input
            label="Practice"
            placeholder="Penn Internal Medicine"
            error={errors.clinicianPractice?.message}
            {...register('clinicianPractice')}
          />
        </div>
        <p className="text-precision text-[0.62rem] text-clinical-stone/70 -mt-3">
          CauseHealth is designed to be reviewed with your doctor — not instead of them.
        </p>

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
          After signup you&apos;ll review and accept our{' '}
          <a href="/terms" className="text-primary-container hover:underline">Terms</a>{' '}
          and{' '}
          <a href="/privacy" className="text-primary-container hover:underline">Privacy Policy</a>,
          plus a one-line arbitration agreement (with a 30-day opt-out).
          Two short screens, then onboarding.
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
