// src/pages/auth/ForgotPassword.tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { ErrorBanner, SuccessBanner } from '../../components/auth/AuthComponents';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type FormData = z.infer<typeof schema>;

export const ForgotPassword = () => {
  const { resetPassword } = useAuthStore();
  const [serverError, setServerError]   = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [countdown, setCountdown]       = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const { error } = await resetPassword(data.email);

    if (error) {
      setServerError(error);
      return;
    }

    setSuccessEmail(data.email);
    startCountdown();
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    const email = getValues('email');
    await resetPassword(email);
    startCountdown();
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send a reset link to your email."
      maxWidth="sm"
    >
      {successEmail ? (
        <div className="space-y-6">
          <SuccessBanner message={`Reset link sent to ${successEmail}. Check your inbox and spam folder.`} />

          <div className="bg-clinical-cream rounded-lg p-6 space-y-2">
            <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold">
              Next steps
            </p>
            <ol className="text-body text-clinical-stone text-sm space-y-2 list-decimal list-inside">
              <li>Check your email inbox</li>
              <li>Click the reset link in the email</li>
              <li>Create a new password</li>
            </ol>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleResend}
              disabled={countdown > 0}
              className={`
                text-precision text-[0.68rem] tracking-widest uppercase font-bold
                ${countdown > 0
                  ? 'text-clinical-stone/40 cursor-not-allowed'
                  : 'text-primary-container hover:underline cursor-pointer'
                }
              `}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend email'}
            </button>
            <a href="/login" className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase text-center hover:text-clinical-charcoal transition-colors">
              Back to sign in
            </a>
          </div>
        </div>
      ) : (
        <>
          <ErrorBanner message={serverError} />
          {serverError && <div className="mb-4" />}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              hint="Enter the email address associated with your account."
              {...register('email')}
            />
            <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full justify-center">
              Send Reset Link
            </Button>
          </form>

          <p className="text-body text-clinical-stone text-sm text-center mt-6">
            <a href="/login" className="text-primary-container hover:underline">Back to sign in</a>
          </p>
        </>
      )}
    </AuthLayout>
  );
};
