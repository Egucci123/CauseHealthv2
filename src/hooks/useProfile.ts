// src/hooks/useProfile.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export function useProfile() {
  const user = useAuthStore(s => s.user);
  return useQuery({
    queryKey: ['profile', user?.id], enabled: !!user?.id, staleTime: 15 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user!.id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { data, error } = await supabase.from('profiles').update(updates).eq('id', user!.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile', user?.id] }); },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You need to sign in first.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        // Send current origin so Stripe redirects back to the actual deployment
        // (Vercel preview, prod, or localhost) rather than a hard-coded APP_URL.
        body: JSON.stringify({ origin: window.location.origin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        const msg = json?.error || `Checkout failed (${res.status})`;
        throw new Error(msg);
      }
      return json.url as string;
    },
    onSuccess: (url) => { window.location.href = url; },
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('You need to sign in first.');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ origin: window.location.origin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        const msg = json?.error || `Portal failed (${res.status})`;
        throw new Error(msg);
      }
      return json.url as string;
    },
    onSuccess: (url) => { window.location.href = url; },
  });
}
