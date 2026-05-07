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
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
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

    // Hard ceiling — if anything hangs (getSession or fetchProfile), force
    // initialized: true after 4s so the user is never stuck on the spinner.
    // The auth listener below picks up the session whenever it arrives.
    const safetyTimer = setTimeout(() => {
      if (!get().initialized) {
        console.warn('[Auth] init hit 4s ceiling — forcing initialized=true');
        set({ loading: false, initialized: true });
      }
    }, 4000);

    try {
      // Race getSession against a 3s timeout — the call has no built-in timeout
      // and has been known to hang on cold/slow connections.
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>(resolve =>
          setTimeout(() => resolve({ data: { session: null } }), 3000)),
      ]);
      const session = (sessionResult as any).data?.session;

      if (session?.user) {
        set({ user: session.user, session });
        // fetchProfile in parallel with no-block — don't wait. Profile arrives
        // eventually via the auth listener and triggers a re-render naturally.
        get().fetchProfile().catch(e => console.warn('Profile fetch failed:', e));
      }
    } catch (e) {
      console.warn('Auth init error:', e);
    } finally {
      clearTimeout(safetyTimer);
      set({ loading: false, initialized: true });
    }

    // Lazy-import queryClient to avoid a circular module load at boot
    const { queryClient } = await import('../lib/queryClient');

    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // ── On any auth change, blow away ALL React Query cache. ──
      // Otherwise queries cached for a previous user/session can leak into the
      // new session — empty results from before signup get served as fact
      // after signup, and the user sees 'No labs' while their data is right
      // there in the DB.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        const prevUserId = get().user?.id;
        const newUserId = session?.user?.id;
        if (prevUserId !== newUserId) {
          queryClient.clear();
        }
      }
      if (session?.user) {
        // Skip the set() if user is already this exact user — avoids a needless
        // re-render that was contributing to the login-page flicker.
        const currentUserId = get().user?.id;
        if (currentUserId !== session.user.id) {
          set({ user: session.user, session });
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          try { await get().fetchProfile(); } catch (e) { console.warn('Profile fetch failed:', e); }
        }
      } else if (event === 'SIGNED_OUT') {
        // Only clear if there's actually something to clear. SIGNED_OUT fires
        // spuriously on first page load when stale localStorage tokens fail to
        // refresh — clearing already-null state was causing a redundant render
        // and a visible flicker between auth-loading -> idle -> idle-again.
        if (get().user || get().session || get().profile) {
          get().clearAuth();
        }
      }
      // INITIAL_SESSION + null is handled by initialize(); no action needed here.
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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Email or password is incorrect.' };
    return { error: null };
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // ALWAYS show the Google account picker. Without this, Google
        // silently auto-selects the most recently used account in the
        // browser session — which surprises users who have multiple
        // Google accounts. `prompt=select_account` forces the chooser.
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  signInWithMagicLink: async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // shouldCreateUser: defaults to true — magic link doubles as signup
      },
    });
    if (error) return { error: error.message };
    return { error: null };
  },

  signOut: async () => {
    // Race the network call against a 2s timeout so a slow/dead connection
    // can't trap the user logged in. Either way, blow away local state
    // afterward — the server-side token is short-lived and harmless if it
    // outlives the local session by a few seconds.
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 2000)),
      ]);
    } catch (e) {
      console.warn('[auth] signOut network call failed:', e);
    }
    get().clearAuth();
    useLabUploadStore.getState().reset();
    // Nuke any lingering supabase session keys in localStorage. signOut()
    // usually does this, but if it timed out or threw the keys can persist
    // and the next page mount will rehydrate the dead session.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
    // Hard-redirect to /login so the user sees an immediate response — no
    // dependence on a route component re-rendering off the cleared state.
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
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
          subscriptionTier:     data.subscription_tier ?? 'free',
          subscriptionStatus:   data.subscription_status ?? 'inactive',
          subscriptionExpiresAt: data.subscription_expires_at ?? null,
          compCodeUsed:         data.comp_code_used ?? null,
          uploadCredits:        data.upload_credits ?? 0,
          unlockPurchasedAt:    data.unlock_purchased_at ?? null,
          onboardingCompleted:  data.onboarding_completed,
          termsAcceptance:      data.terms_acceptance ?? null,
          primaryGoals:         data.primary_goals,
          familyHistory:        data.family_history ?? null,
          geneticTesting:       data.genetic_testing ?? null,
          lifestyle:            data.lifestyle ?? null,
          specificConcern:      data.specific_concern ?? null,
          triedBefore:          data.tried_before ?? null,
          hearAboutUs:          data.hear_about_us ?? null,
          lifeContext:          data.life_context ?? null,
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
    if (data.lifestyle           !== undefined) dbData.lifestyle             = data.lifestyle;
    if (data.lifeContext         !== undefined) dbData.life_context          = data.lifeContext;
    if (data.familyHistory       !== undefined) dbData.family_history        = data.familyHistory;
    if (data.geneticTesting      !== undefined) dbData.genetic_testing       = data.geneticTesting;
    if (data.specificConcern     !== undefined) dbData.specific_concern      = data.specificConcern;
    if (data.triedBefore         !== undefined) dbData.tried_before          = data.triedBefore;
    if (data.hearAboutUs         !== undefined) dbData.hear_about_us         = data.hearAboutUs;

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
