// src/store/authStore.ts
import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { useLabUploadStore } from './labUploadStore';

interface AuthStore {
  user:         User | null;
  session:      Session | null;
  profile:      Profile | null;
  loading:      boolean;
  initialized:  boolean;

  isAuthenticated:  boolean;
  isOnboarded:      boolean;
  displayName:      string;

  initialize:       () => Promise<void>;
  signUp:           (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => Promise<{ error: string | null }>;
  signIn:           (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut:          () => Promise<void>;
  resetPassword:    (email: string) => Promise<{ error: string | null }>;
  updatePassword:   (password: string) => Promise<{ error: string | null }>;
  fetchProfile:     () => Promise<void>;
  updateProfile:    (data: Partial<Profile>) => Promise<{ error: string | null }>;
  clearAuth:        () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user:        null,
  session:     null,
  profile:     null,
  loading:     false,
  initialized: false,

  get isAuthenticated() { return !!get().user; },
  get isOnboarded()     { return !!get().profile?.onboardingCompleted; },
  get displayName() {
    const p = get().profile;
    if (p?.firstName) return `${p.firstName} ${p.lastName ?? ''}`.trim();
    return get().user?.email ?? '';
  },

  initialize: async () => {
    set({ loading: true });

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        set({ user: session.user, session });
        try { await get().fetchProfile(); } catch (e) { console.warn('Profile fetch failed:', e); }
      }
    } catch (e) {
      console.warn('Auth init error:', e);
    } finally {
      set({ loading: false, initialized: true });
    }

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        set({ user: session.user, session });
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          try { await get().fetchProfile(); } catch (e) { console.warn('Profile fetch failed:', e); }
        }
      } else {
        get().clearAuth();
      }
    });
    // Store subscription for cleanup — prevents listener stacking in StrictMode
    (globalThis as any).__authSub?.unsubscribe?.();
    (globalThis as any).__authSub = authSub;
  },

  signUp: async ({ email, password, firstName, lastName }) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name:  lastName,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    set({ loading: false });
    if (error) return { error: error.message };
    return { error: null };
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    if (error) return { error: 'Email or password is incorrect.' };
    return { error: null };
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    get().clearAuth();
    // Clear all other stores to prevent data leak between users
    useLabUploadStore.getState().reset();
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    return { error: null };
  },

  fetchProfile: async () => {
    const user = get().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Failed to fetch profile:', error.message);
      return;
    }

    if (data) {
      set({
        profile: {
          id:                  data.id,
          createdAt:           data.created_at,
          updatedAt:           data.updated_at,
          firstName:           data.first_name,
          lastName:            data.last_name,
          dateOfBirth:         data.date_of_birth,
          sex:                 data.sex,
          heightCm:            data.height_cm,
          weightKg:            data.weight_kg,
          subscriptionTier:    data.subscription_status ?? data.subscription_tier,
          onboardingCompleted: data.onboarding_completed,
          primaryGoals:        data.primary_goals,
        },
      });
    }
  },

  updateProfile: async (data) => {
    const user = get().user;
    if (!user) return { error: 'Not authenticated' };

    const dbData: Record<string, unknown> = {};
    if (data.firstName           !== undefined) dbData.first_name           = data.firstName;
    if (data.lastName            !== undefined) dbData.last_name            = data.lastName;
    if (data.dateOfBirth         !== undefined) dbData.date_of_birth        = data.dateOfBirth;
    if (data.sex                 !== undefined) dbData.sex                  = data.sex;
    if (data.heightCm            !== undefined) dbData.height_cm            = data.heightCm;
    if (data.weightKg            !== undefined) dbData.weight_kg            = data.weightKg;
    if (data.onboardingCompleted !== undefined) dbData.onboarding_completed = data.onboardingCompleted;
    if (data.primaryGoals        !== undefined) dbData.primary_goals        = data.primaryGoals;

    const { error } = await supabase
      .from('profiles')
      .update(dbData)
      .eq('id', user.id);

    if (error) return { error: error.message };
    await get().fetchProfile();
    return { error: null };
  },

  clearAuth: () => {
    set({ user: null, session: null, profile: null });
  },
}));
