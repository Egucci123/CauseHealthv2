// src/lib/supabase.ts
// Single Supabase client instance — import this everywhere

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = supabaseUrl
  && supabaseKey
  && !supabaseUrl.includes('your_supabase')
  && !supabaseKey.includes('your_supabase');

if (!isConfigured) {
  console.warn(
    'Supabase not configured. Copy .env.example to .env.local and fill in your project values. Auth features will not work.'
  );
}

// Use placeholder URL if not configured — createClient needs valid URL format
export const supabase = createClient(
  isConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isConfigured ? supabaseKey : 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export const isSupabaseConfigured = !!isConfigured;

export type SupabaseClient = typeof supabase;
