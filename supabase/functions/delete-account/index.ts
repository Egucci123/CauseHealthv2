// supabase/functions/delete-account/index.ts
//
// Hard-deletes a user account. Used by the "Delete Account" button in the
// Settings → Privacy panel.
//
// What it does:
//   1. Authenticates the caller via JWT
//   2. Wipes every row keyed by their user_id across the data tables
//   3. Deletes the auth.users row via the admin API (this is the part the
//      client SDK can't do — needs the service-role key)
//
// Why an edge function: the Supabase client can't delete an auth.users row
// from the browser (security: that requires the service role). So we expose
// a minimal endpoint that authenticates the caller, then runs the admin
// delete with their own user_id.
//
// CCPA / GDPR compliance: this satisfies the "right to deletion" requirement.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tables that hold user data — wipe rows where user_id matches before
// deleting the auth row. Order matters for FK constraints.
const TABLES_TO_WIPE = [
  'chat_messages',
  'detections',
  'priority_alerts',
  'user_supplements',
  'doctor_prep_documents',
  'wellness_plans',
  'lab_values',     // FK -> lab_draws + user_id
  'lab_draws',
  'symptoms',
  'medications',
  'conditions',
  'profiles',       // last before auth row
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // ── Authenticate caller ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return new Response(JSON.stringify({ error: 'Missing Authorization' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Use anon client + the user's JWT to verify identity
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const uid = user.id;
    console.log(`[delete-account] hard-deleting uid=${uid.slice(0, 8)}...`);

    // ── Wipe data tables ───────────────────────────────────────────────
    // Use service-role client so RLS doesn't get in the way.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    for (const table of TABLES_TO_WIPE) {
      const { error } = await admin.from(table).delete().eq('user_id', uid);
      if (error) console.warn(`[delete-account] ${table} wipe warn:`, error.message);
    }

    // ── Delete auth user (the part the client can't do) ────────────────
    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr) {
      console.error(`[delete-account] auth.admin.deleteUser failed:`, authErr.message);
      return new Response(JSON.stringify({ error: 'Account data wiped, but auth deletion failed. Contact support.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[delete-account] complete uid=${uid.slice(0, 8)}...`);
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[delete-account] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
