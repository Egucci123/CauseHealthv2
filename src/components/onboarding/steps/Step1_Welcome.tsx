// src/components/onboarding/steps/Step1_Welcome.tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingShell } from '../OnboardingShell';
import { Input, Select } from '../../ui/Input';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { useAuthStore } from '../../../store/authStore';

const schema = z.object({
  firstName: z.string().min(2, 'Required'), lastName: z.string().min(2, 'Required'),
  dateOfBirth: z.string().optional(), sex: z.string().optional(),
  heightFt: z.string().optional(), heightIn: z.string().optional(),
  weightLbs: z.string().optional(), locationState: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

export const Step1_Welcome = () => {
  const { nextStep, updateStep1, firstName, lastName, sex } = useOnboardingStore();
  const { profile } = useAuthStore();

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: firstName || profile?.firstName || '', lastName: lastName || profile?.lastName || '', sex: sex || '' },
  });

  useEffect(() => {
    if (profile?.firstName && !firstName) { setValue('firstName', profile.firstName); setValue('lastName', profile.lastName ?? ''); }
  }, [profile, firstName, setValue]);

  const onNext = handleSubmit(async (data) => { updateStep1(data); await nextStep(); });

  return (
    <OnboardingShell stepKey="step-1" title="Let's start with you." description="This helps us personalize your analysis to your body, not a population average." onNext={onNext} showBack={false}>
      <div className="space-y-5">
        <div className="bg-[#131313] rounded-[10px] p-5 mb-8">
          <p className="text-body text-on-surface-variant text-sm leading-relaxed">Everything you share is encrypted and private. We never sell your data. You can delete it at any time.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="First Name" placeholder="Evan" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last Name" placeholder="Johnson" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Date of Birth" type="date" hint="Used to apply age-specific optimal ranges." {...register('dateOfBirth')} />
          <Select label="Biological Sex" options={[{ value: '', label: 'Select...' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Prefer not to say' }]} hint="Affects hormone optimal ranges." {...register('sex')} />
        </div>
        <div>
          <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Height (optional)</label>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="5" type="number" hint="Feet" {...register('heightFt')} />
            <Input placeholder="11" type="number" hint="Inches" {...register('heightIn')} />
          </div>
        </div>
        <Input label="Weight — lbs (optional)" type="number" placeholder="185" hint="Used to calculate BMI for metabolic risk assessment." {...register('weightLbs')} />
        <Select label="State (optional)" options={[{ value: '', label: 'Select state...' }, ...US_STATES.map(s => ({ value: s, label: s }))]} hint="For future provider matching features." {...register('locationState')} />
      </div>
    </OnboardingShell>
  );
};
