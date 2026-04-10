// src/pages/auth/ResetPassword.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { PasswordField, PasswordStrength, ErrorBanner, SuccessBanner } from '../../components/auth/AuthComponents';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';

const schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export const ResetPassword = () => {
  const navigate = useNavigate();
  const { updatePassword } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);
  const [validToken, setValidToken]   = useState<boolean | null>(null);
  const [passwordVal, setPasswordVal] = useState('');
  const [confirmVal, setConfirmVal]   = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setValidToken(!!session);
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidToken(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const {
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    const { error } = await updatePassword(data.password);

    if (error) {
      setServerError(error);
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate('/login'), 3000);
  };

  if (validToken === null) {
    return (
      <AuthLayout title="Verifying reset link..." maxWidth="sm">
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
        </div>
      </AuthLayout>
    );
  }

  if (!validToken) {
    return (
      <AuthLayout title="Reset link expired" maxWidth="sm">
        <div className="space-y-6">
          <ErrorBanner message="This reset link has expired or is invalid. Reset links are valid for 1 hour." />
          <a href="/forgot-password" className="block">
            <Button variant="primary" size="md" className="w-full justify-center">
              Request a new reset link
            </Button>
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create new password" subtitle="Choose a strong password for your account." maxWidth="sm">
      {success ? (
        <div className="space-y-4">
          <SuccessBanner message="Password updated successfully. Redirecting to sign in..." />
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-primary-container border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      ) : (
        <>
          <ErrorBanner message={serverError} />
          {serverError && <div className="mb-4" />}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <PasswordField
                label="New Password"
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
              label="Confirm New Password"
              value={confirmVal}
              onChange={(val) => {
                setConfirmVal(val);
                setValue('confirmPassword', val, { shouldValidate: true });
              }}
              error={errors.confirmPassword?.message}
              autoComplete="new-password"
            />

            <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full justify-center">
              Update Password
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
};
