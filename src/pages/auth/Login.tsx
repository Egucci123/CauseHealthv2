// src/pages/auth/Login.tsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../../components/auth/AuthLayout';
import {
  GoogleButton, AuthDivider, PasswordField,
  AuthCheckbox, ErrorBanner,
} from '../../components/auth/AuthComponents';
import { MagicLinkForm } from '../../components/auth/MagicLinkForm';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';

const schema = z.object({
  email:      z.string().email('Please enter a valid email address'),
  password:   z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

export const Login = () => {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signInWithGoogle } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [passwordVal, setPasswordVal] = useState('');
  const [showMagicLink, setShowMagicLink] = useState(false);
  // Hide password form behind a toggle so iOS Safari's saved-password autofill
  // chooser doesn't auto-scroll the page past the Google + magic-link buttons
  // on mount. The chooser only appears once an autocomplete="current-password"
  // input is in the DOM.
  const [showPassword, setShowPassword] = useState(false);

  const redirectTo = searchParams.get('redirectTo') ?? '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const rememberMe = watch('rememberMe');

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const { error } = await signIn(data.email, data.password);

    if (error) {
      setServerError('Email or password is incorrect.');
      return;
    }

    navigate(decodeURIComponent(redirectTo), { replace: true });
  };

  const handleGoogle = async () => {
    setServerError(null);
    const { error } = await signInWithGoogle();
    if (error) setServerError(error);
  };

  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Sign in to your CauseHealth. account."
    >
      <GoogleButton label="Continue with Google" onClick={handleGoogle} />

      <button
        type="button"
        onClick={() => setShowMagicLink((v) => !v)}
        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 border border-outline-variant/20 hover:border-primary-container/40 bg-clinical-white transition-colors"
        style={{ borderRadius: '6px' }}
      >
        <span className="material-symbols-outlined text-primary-container text-[18px]">mail</span>
        <span className="text-body text-clinical-charcoal text-sm font-medium">{showMagicLink ? 'Hide email link' : 'Sign in with email link'}</span>
      </button>

      {showMagicLink && (
        <div className="mt-3">
          <MagicLinkForm onClose={() => setShowMagicLink(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 border border-outline-variant/20 hover:border-primary-container/40 bg-clinical-white transition-colors"
        style={{ borderRadius: '6px' }}
      >
        <span className="material-symbols-outlined text-primary-container text-[18px]">lock</span>
        <span className="text-body text-clinical-charcoal text-sm font-medium">{showPassword ? 'Hide password sign-in' : 'Sign in with password'}</span>
      </button>

      {showPassword && (
        <>
          <AuthDivider />

          <ErrorBanner message={serverError} />
          {serverError && <div className="mb-4" />}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Input
          label="Email Address"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">
              Password
            </label>
            <a
              href="/forgot-password"
              className="text-precision text-[0.68rem] text-primary-container hover:underline tracking-wide"
            >
              Forgot password?
            </a>
          </div>
          <PasswordField
            label=""
            value={passwordVal}
            onChange={(val) => {
              setPasswordVal(val);
              setValue('password', val, { shouldValidate: true });
            }}
            error={errors.password?.message}
            autoComplete="current-password"
          />
        </div>

        <AuthCheckbox
          checked={rememberMe ?? false}
          onChange={(val) => setValue('rememberMe', val)}
        >
          Remember me on this device
        </AuthCheckbox>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={isSubmitting}
          className="w-full justify-center"
        >
          Sign In
        </Button>
          </form>
        </>
      )}

      <p className="text-body text-clinical-stone text-sm text-center mt-6">
        Don't have an account?{' '}
        <a href="/register" className="text-primary-container hover:underline font-medium">Create one free</a>
      </p>
    </AuthLayout>
  );
};
