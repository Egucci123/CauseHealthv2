// src/lib/subscription.ts
// Single source of truth for subscription state.
// Tiers: free | pro | comp.  Status: inactive | active | past_due | canceled | trialing.
import { useAuthStore } from '../store/authStore';
import type { SubscriptionTier, SubscriptionStatus as ApiSubscriptionStatus } from '../types';

// Legacy alias kept for components that imported the old type from this file.
export type SubscriptionStatus = ApiSubscriptionStatus;

export interface SubscriptionState {
  tier: SubscriptionTier;
  status: ApiSubscriptionStatus;
  expiresAt: string | null;
  compCode: string | null;
  isPro: boolean;        // entitled to all Pro features (paid OR comp, status active, not expired)
  isComp: boolean;       // unlocked via master code, not paying
  isPaying: boolean;     // actually paying via Stripe
  isPastDue: boolean;    // payment failed, grace period
}

export function useSubscription(): SubscriptionState {
  const profile = useAuthStore(s => s.profile);
  const tier: SubscriptionTier = profile?.subscriptionTier ?? 'free';
  const status: ApiSubscriptionStatus = profile?.subscriptionStatus ?? 'inactive';
  const expiresAt = profile?.subscriptionExpiresAt ?? null;
  const compCode = profile?.compCodeUsed ?? null;

  const notExpired = !expiresAt || new Date(expiresAt) > new Date();
  const activeOrTrial = status === 'active' || status === 'trialing';
  const isPro = (tier === 'pro' || tier === 'comp') && activeOrTrial && notExpired;
  const isComp = tier === 'comp' && isPro;
  const isPaying = tier === 'pro' && isPro;
  const isPastDue = status === 'past_due';

  return { tier, status, expiresAt, compCode, isPro, isComp, isPaying, isPastDue };
}

export const PRO_FEATURES = {
  AI_ANALYSIS: 'AI Analysis', UNLIMITED_LABS: 'Unlimited Lab Uploads',
  WELLNESS_PLAN: 'Wellness Plan', DOCTOR_PREP: 'Doctor Prep Documents',
  MEDICATION_CHECKER: 'Medication Checker', SYMPTOM_ANALYSIS: 'Symptom Analysis',
  PROGRESS_TRACKING: 'Progress Tracking', PDF_EXPORT: 'PDF Export',
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;
