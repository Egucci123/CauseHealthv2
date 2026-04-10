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

      <p className="text-body text-clinical-stone text-sm text-center mt-6">
        Don't have an account?{' '}
        <a href="/register" className="text-primary-container hover:underline font-medium">Create one free</a>
      </p>
    </AuthLayout>
  );
};
