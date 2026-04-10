// src/lib/subscription.ts
import { useAuthStore } from '../store/authStore';

export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled' | 'trialing';

export function useSubscription() {
  const profile = useAuthStore(s => s.profile);
  const status: SubscriptionStatus = (profile?.subscriptionTier as SubscriptionStatus) ?? 'free';
  const isPro = status === 'active' || status === 'trialing';
  const isPastDue = status === 'past_due';
  return { status, isPro, isPastDue };
}

export const PRO_FEATURES = {
  AI_ANALYSIS: 'AI Analysis', UNLIMITED_LABS: 'Unlimited Lab Uploads',
  WELLNESS_PLAN: 'Wellness Plan', DOCTOR_PREP: 'Doctor Prep Documents',
  MEDICATION_CHECKER: 'Medication Checker', SYMPTOM_ANALYSIS: 'Symptom Analysis',
  PROGRESS_TRACKING: 'Progress Tracking', PDF_EXPORT: 'PDF Export',
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;
