// supabase/functions/record-consent/index.ts
//
// Records a consent event into consent_log. The legal record of truth.
//
// Auth: requires the user's JWT (you can only consent on your own behalf).
//
// Body shape (all optional fields are best-effort; required fields enforced):
//   {
//     consent_type:    ConsentType,           // required, see ALLOWED_TYPES
//     presented_at:    ISO string,            // optional; default = now()
//
//     // Versioning — at least one of these is required.
//     // New callers pass text_version (semantic version of checkbox_text);
//     // legacy callers pass policy_version. We mirror whichever is missing
//     // so both columns are always populated.
//     text_version?:   string,
//     policy_version?: string,
//
//     // v6 additions — required for v6 consent types, optional for legacy.
//     checkbox_text?:  string,                // EXACT label the user clicked
//     page_url?:       string,                // route path where captured
//     metadata?:       Record<string, unknown>, // jsonb side data
//   }
//
// Side effects (per the v6 spec): for certain consent_types we also
// upsert into user_eligibility. Failures here are logged as warnings —
// the consent_log row is the legal record and must always succeed first.
//
// Response: 201 + { id, accepted_at } on success, 4xx/5xx on failure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Closed set of consent types accepted by this function. Mirrors
// src/lib/legal/consentTypes.ts on the client. When you add a new
// type there, add it here too.
const ALLOWED_TYPES = new Set<string>([
  // v1 (legacy — still in production)
  'terms',
  'ai_processing',
  'health_data_authorization',
  'mhmda_wa_authorization',
  'age_18_plus',
  // v6 additions
  'tos_scroll_and_accept',
  'privacy_scroll_and_accept',
  'arbitration_class_waiver',
  'state_residency_certify',
  'clinician_relationship',
  'sensitive_health_consent',
  'eu_geoblock_certify',
  'output_ack_share_with_clin',
  'output_ack_not_clinical',
  'output_ack_liability_limited',
  'clinician_name_entered',
  'auto_renewal_disclosure',
  'arbitration_optout',
]);

// Consent types that, taken together at the same text_version, mark the
// output-acknowledgment gate complete. When all four are present we set
// user_eligibility.output_ack_completed_at.
const OUTPUT_GATE_TYPES = [
  'output_ack_share_with_clin',
  'output_ack_not_clinical',
  'output_ack_liability_limited',
  'clinician_name_entered',
];

function clientIpFrom(req: Request): string | null {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  ];
  for (const c of candidates) {
    if (c && c.length > 0 && c.length < 64) return c;
  }
  return null;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ── Authenticate caller ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return jsonResponse({ error: 'Missing Authorization' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: 'Invalid session' }, 401);

    // ── Parse + validate body ─────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      consent_type,
      presented_at,
      policy_version,
      text_version,
      checkbox_text,
      page_url,
      metadata,
    } = body ?? {};

    if (!consent_type || typeof consent_type !== 'string' || !ALLOWED_TYPES.has(consent_type)) {
      return jsonResponse({ error: 'Invalid consent_type' }, 400);
    }

    // Mirror version fields. At least one must be present; both end up
    // populated so existing readers (which query policy_version) and
    // new readers (text_version) both work.
    const tv = typeof text_version === 'string' && text_version.length > 0 ? text_version : null;
    const pv = typeof policy_version === 'string' && policy_version.length > 0 ? policy_version : null;
    const versionResolved = tv ?? pv;
    if (!versionResolved || versionResolved.length > 64) {
      return jsonResponse({ error: 'Invalid version (text_version or policy_version required)' }, 400);
    }
    const finalTextVersion = tv ?? versionResolved;
    const finalPolicyVersion = pv ?? versionResolved;

    const finalCheckboxText =
      typeof checkbox_text === 'string' && checkbox_text.length > 0
        ? checkbox_text.slice(0, 4000)
        : null;

    const finalPageUrl =
      typeof page_url === 'string' && page_url.length > 0 ? page_url.slice(0, 500) : null;

    const finalMetadata =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

    const presentedAt =
      typeof presented_at === 'string' && presented_at.length > 0
        ? presented_at
        : new Date().toISOString();

    // ── Capture request metadata ──────────────────────────────────────
    const ip = clientIpFrom(req);
    const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 500);
    const acceptedAt = new Date().toISOString();

    // ── Insert consent_log row (legal record of truth) ────────────────
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: consentRow, error: insertErr } = await admin
      .from('consent_log')
      .insert({
        user_id: user.id,
        consent_type,
        presented_at: presentedAt,
        accepted_at: acceptedAt,
        ip_address: ip,
        user_agent: userAgent,
        policy_version: finalPolicyVersion,
        text_version: finalTextVersion,
        checkbox_text: finalCheckboxText,
        page_url: finalPageUrl,
        metadata: finalMetadata,
      })
      .select('id, accepted_at')
      .single();

    if (insertErr) {
      console.error('[record-consent] insert failed:', insertErr);
      return jsonResponse({ error: `Failed to record consent: ${insertErr.message}` }, 500);
    }

    console.log(
      `[record-consent] ${consent_type} recorded for ${user.id.slice(0, 8)}... (v=${finalTextVersion})`,
    );

    // ── Side effects on user_eligibility (best-effort) ────────────────
    // The consent_log row is already saved above. If any of these fail,
    // the legal record stands; we just lose the fast-lookup state row
    // until the next event for this user fixes it.
    try {
      await applyEligibilitySideEffects(admin, {
        userId: user.id,
        consentType: consent_type as string,
        textVersion: finalTextVersion,
        ip,
        metadata: finalMetadata,
        acceptedAt,
      });
    } catch (sideErr) {
      console.warn('[record-consent] eligibility side-effect failed:', sideErr);
    }

    return jsonResponse({ id: consentRow.id, accepted_at: consentRow.accepted_at }, 201);
  } catch (err) {
    console.error('[record-consent] error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────
// SIDE EFFECTS — derive user_eligibility state from new consent rows
// ──────────────────────────────────────────────────────────────────────
//
// We UPSERT into user_eligibility based on the consent_type we just
// recorded. The row is the "current state" for the user; consent_log is
// the immutable history. If user_eligibility already has a value for
// the field we're about to write, we OVERWRITE — newer attestations
// win. (E.g., user updates clinician name across sessions.)
//
// Idempotency: re-recording the same consent_type just re-stamps the
// timestamp. No harm done.

async function applyEligibilitySideEffects(
  admin: ReturnType<typeof createClient>,
  args: {
    userId: string;
    consentType: string;
    textVersion: string;
    ip: string | null;
    metadata: Record<string, unknown>;
    acceptedAt: string;
  },
): Promise<void> {
  const { userId, consentType, ip, metadata, acceptedAt } = args;

  // Per-type writes — building up the partial we then UPSERT.
  const patch: Record<string, unknown> = { user_id: userId, updated_at: acceptedAt };

  switch (consentType) {
    case 'state_residency_certify': {
      const stateRaw = typeof metadata.state === 'string' ? metadata.state.trim().toUpperCase() : null;
      if (stateRaw && stateRaw.length === 2) {
        patch.certified_state = stateRaw;
        patch.state_certified_at = acceptedAt;
        patch.state_certified_ip = ip;
      }
      // If geo lookup hints were passed (the signup screen can pass
      // {country, region} from a server-side IP geolookup), record them
      // for the evidence trail.
      if (typeof metadata.geo_country === 'string') {
        patch.registration_geo_country = metadata.geo_country.slice(0, 8);
      }
      if (typeof metadata.geo_region === 'string') {
        patch.registration_geo_region = metadata.geo_region.slice(0, 32);
      }
      if (ip) patch.registration_ip = ip;
      break;
    }

    case 'clinician_relationship': {
      patch.has_clinician_certified = true;
      patch.clinician_certified_at = acceptedAt;
      break;
    }

    case 'clinician_name_entered': {
      const name = typeof metadata.name === 'string' ? metadata.name.trim().slice(0, 200) : null;
      const practice = typeof metadata.practice === 'string' ? metadata.practice.trim().slice(0, 200) : null;
      if (name) patch.clinician_name = name;
      if (practice) patch.clinician_practice = practice;
      patch.clinician_name_entered_at = acceptedAt;
      break;
    }

    case 'arbitration_optout': {
      // User emailed legal@causehealth.app with subject "Arbitration
      // Opt-Out" within their 30-day window. consent_log row is the
      // legal record; mirror flags to user_eligibility for fast lookup.
      patch.arbitration_opted_out = true;
      patch.arbitration_optout_at = acceptedAt;
      break;
    }

    case 'eu_geoblock_certify': {
      // No state on user_eligibility for this — the consent_log row IS
      // the evidence. Skip.
      return;
    }

    case 'auto_renewal_disclosure': {
      // No eligibility state for this. The consent_log row + Stripe
      // webhook are the operational record.
      return;
    }

    case 'output_ack_share_with_clin':
    case 'output_ack_not_clinical':
    case 'output_ack_liability_limited':
    case 'clinician_name_entered_ack': {
      // Handled by the gate-completion check below.
      break;
    }

    default:
      // Unhandled type → no eligibility side effect. The consent_log
      // row is the only record needed.
      return;
  }

  // First, upsert any per-type fields we just collected.
  if (Object.keys(patch).length > 2) {
    // > 2 means we set something beyond user_id + updated_at.
    const { error: upErr } = await admin
      .from('user_eligibility')
      .upsert(patch, { onConflict: 'user_id' });
    if (upErr) console.warn('[record-consent] eligibility upsert failed:', upErr);
  }

  // Second, if this consent might have completed the output-ack gate,
  // re-check whether all four required types are present at the latest
  // text_version. If yes, stamp output_ack_completed_at.
  const isOutputGateType =
    consentType === 'output_ack_share_with_clin' ||
    consentType === 'output_ack_not_clinical' ||
    consentType === 'output_ack_liability_limited' ||
    consentType === 'clinician_name_entered';
  if (isOutputGateType) {
    await maybeMarkOutputAckComplete(admin, userId, acceptedAt);
  }
}

async function maybeMarkOutputAckComplete(
  admin: ReturnType<typeof createClient>,
  userId: string,
  acceptedAt: string,
): Promise<void> {
  // Pull the latest row for each of the four required consent types
  // for this user. If we have all four, we're done.
  const { data, error } = await admin
    .from('consent_log_latest')
    .select('consent_type, text_version')
    .eq('user_id', userId)
    .in('consent_type', OUTPUT_GATE_TYPES);

  if (error) {
    console.warn('[record-consent] output-gate readback failed:', error);
    return;
  }

  const present = new Set((data ?? []).map((r: any) => r.consent_type));
  const allPresent = OUTPUT_GATE_TYPES.every((t) => present.has(t));
  if (!allPresent) return;

  const { error: stampErr } = await admin
    .from('user_eligibility')
    .upsert(
      {
        user_id: userId,
        output_ack_completed_at: acceptedAt,
        updated_at: acceptedAt,
      },
      { onConflict: 'user_id' },
    );
  if (stampErr) console.warn('[record-consent] output_ack_completed_at write failed:', stampErr);
}
