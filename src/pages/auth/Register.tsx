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
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../store/authStore';

const schema = z.object({
  firstName:       z.string().min(2, 'First name must be at least 2 characters'),
  lastName:        z.string().min(2, 'Last name must be at least 2 characters'),
  email:           z.string().email('Please enter a valid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  acceptTerms:     z.boolean().refine(v => v, 'You must accept the terms of service'),
  acceptPrivacy:   z.boolean().refine(v => v, 'You must accept the privacy policy'),
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const acceptTerms   = watch('acceptTerms');
  const acceptPrivacy = watch('acceptPrivacy');

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

    navigate('/auth/verify-email', { state: { email: data.email } });
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

        <div className="space-y-3 pt-2">
          <AuthCheckbox
            checked={acceptTerms ?? false}
            onChange={(val) => setValue('acceptTerms', val, { shouldValidate: true })}
            error={errors.acceptTerms?.message}
          >
            I agree to the{' '}
            <a href="/terms" className="text-primary-container hover:underline">Terms of Service</a>
          </AuthCheckbox>

          <AuthCheckbox
            checked={acceptPrivacy ?? false}
            onChange={(val) => setValue('acceptPrivacy', val, { shouldValidate: true })}
            error={errors.acceptPrivacy?.message}
          >
            I agree to the{' '}
            <a href="/privacy" className="text-primary-container hover:underline">Privacy Policy</a>
            {' '}and understand this is an educational tool, not medical advice.
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
