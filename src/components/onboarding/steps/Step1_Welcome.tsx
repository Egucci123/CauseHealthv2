// src/components/onboarding/steps/Step1_Welcome.tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { OnboardingShell } from '../OnboardingShell';
import { Input } from '../../ui/Input';
import { CustomSelect } from '../../ui/CustomSelect';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { useAuthStore } from '../../../store/authStore';

// DOB + sex are REQUIRED — they drive bio age, lab range tables, and
// percentile cohort lookups. Without them the analysis is wrong, not just
// less personal. Height/weight/state stay optional (BMI is nice-to-have).
//
// pregnancyStatus is REQUIRED for biological-female users — it gates the
// β-hCG-first ordering, pregnancy-safe supplement filters, and the
// hormonal-pattern interpretation. Male users skip the prompt and get
// 'not_applicable' stamped automatically by the store.
const schema = z.object({
  firstName: z.string().min(2, 'Required'),
  lastName: z.string().min(2, 'Required'),
  dateOfBirth: z.string().min(1, 'Required for age-specific lab ranges').refine(
    (v) => {
      if (!v) return false;
      const d = new Date(v);
      if (isNaN(d.getTime())) return false;
      const age = (Date.now() - d.getTime()) / 31_557_600_000;
      // 18+ enforced — Terms require it, and we have no parental-consent flow
      // for minors. <18 = hard block, surfaces a clear age-gate error.
      return age >= 18 && age <= 120;
    },
    { message: 'You must be 18 or older to use CauseHealth.' }
  ),
  sex: z.string().min(1, 'Required — drives hormone + CBC ranges'),
  pregnancyStatus: z.string().optional(),
  heightFt: z.string().optional(),
  heightIn: z.string().optional(),
  weightLbs: z.string().optional(),
  locationState: z.string().optional(),
}).refine(
  (d) => {
    // Female users MUST answer pregnancy. Male users skip — the store
    // stamps 'not_applicable' on save. "Other / prefer not to say" sex
    // also skips (we don't presume).
    if (d.sex === 'female') return !!d.pregnancyStatus;
    return true;
  },
  { message: 'Required — drives hormone-panel interpretation and pregnancy-safe supplement rules.', path: ['pregnancyStatus'] }
);
type FormData = z.infer<typeof schema>;

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

export const Step1_Welcome = () => {
  const store = useOnboardingStore();
  const { nextStep, updateStep1 } = store;
  const { profile } = useAuthStore();

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: store.firstName || profile?.firstName || '',
      lastName: store.lastName || profile?.lastName || '',
      dateOfBirth: store.dateOfBirth || profile?.dateOfBirth || '',
      sex: store.sex || profile?.sex || '',
      pregnancyStatus: store.pregnancyStatus || '',
      heightFt: store.heightFt || '',
      heightIn: store.heightIn || '',
      weightLbs: store.weightLbs || '',
    },
  });

  // Sync form when store updates (e.g. after loadSavedProgress restores data)
  useEffect(() => {
    if (store.firstName) setValue('firstName', store.firstName);
    if (store.lastName) setValue('lastName', store.lastName);
    if (store.dateOfBirth) setValue('dateOfBirth', store.dateOfBirth);
    if (store.sex) setValue('sex', store.sex);
    if (store.pregnancyStatus) setValue('pregnancyStatus', store.pregnancyStatus);
    if (store.heightFt) setValue('heightFt', store.heightFt);
    if (store.heightIn) setValue('heightIn', store.heightIn);
    if (store.weightLbs) setValue('weightLbs', store.weightLbs);
  }, [store.firstName, store.lastName, store.dateOfBirth, store.sex, store.pregnancyStatus, store.heightFt, store.heightIn, store.weightLbs, setValue]);

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
          <Input label="Date of Birth *" type="date" hint="Required — drives age-specific optimal lab ranges." error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
          <CustomSelect
            label="Biological Sex *"
            placeholder="Select..."
            hint="Required — drives hormone + CBC optimal ranges."
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Prefer not to say' },
            ]}
            value={watch('sex') ?? ''}
            onChange={(v) => {
              setValue('sex', v, { shouldValidate: true });
              // Clear pregnancy answer if user switches away from female.
              if (v !== 'female') setValue('pregnancyStatus', '', { shouldValidate: true });
            }}
            error={errors.sex?.message}
          />
        </div>

        {/* Pregnancy status — biological-female users only.
            Drives β-hCG-first ordering, pregnancy-safe supplement filters,
            and hormone-panel interpretation. Male / other users skip; the
            store stamps 'not_applicable' on save. */}
        {watch('sex') === 'female' && (
          <CustomSelect
            label="Pregnancy status *"
            placeholder="Select..."
            hint="Required for accurate hormone interpretation and to keep supplement recommendations pregnancy-safe."
            options={[
              { value: 'not_pregnant', label: 'Not pregnant, not trying' },
              { value: 'pregnant', label: 'Currently pregnant' },
              { value: 'trying', label: 'Trying to conceive (or could be pregnant)' },
              { value: 'breastfeeding', label: 'Breastfeeding / postpartum' },
              { value: 'prefer_not_to_say', label: 'Prefer not to say' },
            ]}
            value={watch('pregnancyStatus') ?? ''}
            onChange={(v) => setValue('pregnancyStatus', v as any, { shouldValidate: true })}
            error={errors.pregnancyStatus?.message}
          />
        )}

        <div>
          <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Height (optional)</label>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="5" type="number" hint="Feet" {...register('heightFt')} />
            <Input placeholder="11" type="number" hint="Inches" {...register('heightIn')} />
          </div>
        </div>
        <Input label="Weight — lbs (optional)" type="number" placeholder="185" hint="Used to calculate BMI for metabolic risk assessment." {...register('weightLbs')} />
        <CustomSelect
          label="State (optional)"
          placeholder="Select state..."
          hint="For future provider matching features."
          searchable
          options={US_STATES.map(s => ({ value: s, label: s }))}
          value={watch('locationState') ?? ''}
          onChange={(v) => setValue('locationState', v)}
        />
      </div>
    </OnboardingShell>
  );
};
