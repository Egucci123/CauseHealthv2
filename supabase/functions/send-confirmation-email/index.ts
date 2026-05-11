// supabase/functions/send-confirmation-email/index.ts
//
// Sends the post-signup confirmation email required by ToS §17.8:
//   "A post-registration confirmation email summarizes the arbitration
//    agreement, class-action waiver, and 30-day opt-out right and
//    deadline."
//
// Triggered by the frontend (ConsentGate) once the user has recorded
// both 'terms' and 'arbitration_class_waiver' consents.
//
// Idempotency: we stamp user_eligibility.signup_confirmation_email_sent_at
// on success. Re-invocations return 200 + { skipped: true } when that
// timestamp is already present. The frontend is fire-and-forget so it
// will retry on every gate-pass, and the no-op must be cheap.
//
// Mailer: Resend (https://resend.com) — set RESEND_API_KEY and
// CONFIRMATION_EMAIL_FROM secrets via `supabase secrets set`. If either
// env var is missing we log + return 200 + { skipped: true } so a
// half-configured prod doesn't break signup. The arbitration consent_log
// row remains the legal record — the email is the consumer-facing notice.
//
// Auth: requires the user's JWT. Email address is read server-side from
// auth.users so the client never has to pass it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ARBITRATION_OPT_OUT_DEADLINE_DAYS = 30;

function buildEmail(args: {
  firstName: string | null;
  accountEmail: string;
  deadlineDateISO: string;
}): { subject: string; html: string; text: string } {
  const { firstName, accountEmail, deadlineDateISO } = args;
  const greetingName = firstName && firstName.trim().length > 0 ? firstName.trim() : 'there';
  const deadline = new Date(deadlineDateISO);
  const deadlinePretty = deadline.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const subject = 'Your CauseHealth account — important arbitration notice';

  const text = `Hi ${greetingName},

Your CauseHealth account is active.

By creating your account you agreed to resolve any disputes with CauseHealth through individual binding arbitration rather than in court, as described in Section 17 of our Terms of Service. You also waived the right to participate in any class action lawsuit.

You have the right to opt out. If you don't want to be bound by the arbitration agreement, email legal@causehealth.com with the subject line "Arbitration Opt-Out" and your account email address (${accountEmail}) before ${deadlinePretty}.

If you do nothing, the arbitration agreement applies to your account.

Full text: https://causehealth.app/terms#section-17

— The CauseHealth team`;

  // Plain-text-style HTML so it renders cleanly in any email client.
  // Per founder direction: no design, just legible plain content with
  // working links.
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1F2A37;line-height:1.55;font-size:15px;">
    <p>Hi ${greetingName},</p>
    <p>Your CauseHealth account is active.</p>
    <p>
      By creating your account you agreed to resolve any disputes with CauseHealth through <strong>individual binding arbitration</strong> rather than in court, as described in Section 17 of our Terms of Service. You also waived the right to participate in any class action lawsuit.
    </p>
    <p>
      <strong>You have the right to opt out.</strong> If you don&apos;t want to be bound by the arbitration agreement, email <a href="mailto:legal@causehealth.com?subject=Arbitration%20Opt-Out" style="color:#1E40AF;">legal@causehealth.com</a> with the subject line <strong>&quot;Arbitration Opt-Out&quot;</strong> and your account email address (${accountEmail}) before <strong>${deadlinePretty}</strong>.
    </p>
    <p>If you do nothing, the arbitration agreement applies to your account.</p>
    <p>
      Full text: <a href="https://causehealth.app/terms#section-17" style="color:#1E40AF;">Section 17 of the Terms of Service</a>
    </p>
    <p style="color:#5B6573;">— The CauseHealth team</p>
  </body>
</html>`;

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    const FROM_ADDRESS = Deno.env.get('CONFIRMATION_EMAIL_FROM') ?? 'CauseHealth <legal@causehealth.com>';

    // ── Authenticate caller ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return jsonResponse({ error: 'Missing Authorization' }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user || !user.email) {
      return jsonResponse({ error: 'Invalid session' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Idempotency check ─────────────────────────────────────────────
    // Re-invocation is cheap: if signup_confirmation_email_sent_at is
    // already stamped, we return 200 + skipped.
    const { data: eligRow } = await admin
      .from('user_eligibility')
      .select('signup_confirmation_email_sent_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (eligRow?.signup_confirmation_email_sent_at) {
      return jsonResponse({ ok: true, skipped: true, reason: 'already_sent' }, 200);
    }

    // ── Compute opt-out deadline ──────────────────────────────────────
    // 30 days from account creation. We use auth.users.created_at as the
    // anchor so users who delay accepting the gate still get an accurate
    // deadline.
    const createdAt = user.created_at ?? new Date().toISOString();
    const deadline = new Date(createdAt);
    deadline.setUTCDate(deadline.getUTCDate() + ARBITRATION_OPT_OUT_DEADLINE_DAYS);

    // First-name lookup is best-effort. We try the profiles table; on
    // miss, fall back to the auth metadata; on miss, just 'there'.
    let firstName: string | null = null;
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('first_name')
        .eq('id', user.id)
        .maybeSingle();
      if (profile && typeof profile.first_name === 'string') {
        firstName = profile.first_name;
      }
    } catch (_) { /* swallow */ }
    if (!firstName) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.first_name === 'string') firstName = meta.first_name;
      else if (typeof meta.firstName === 'string') firstName = meta.firstName as string;
    }

    const { subject, html, text } = buildEmail({
      firstName,
      accountEmail: user.email,
      deadlineDateISO: deadline.toISOString(),
    });

    // ── Send via Resend, or no-op gracefully ──────────────────────────
    if (!RESEND_API_KEY) {
      console.warn('[send-confirmation-email] RESEND_API_KEY not set — logging only');
      console.log(`[send-confirmation-email] would send to ${user.email} (subject="${subject}")`);
      return jsonResponse({ ok: true, skipped: true, reason: 'mailer_not_configured' }, 200);
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [user.email],
        subject,
        html,
        text,
        // Tags help Resend dashboard filtering + bounce diagnostics.
        tags: [
          { name: 'category', value: 'arbitration_summary' },
          { name: 'user_id', value: user.id.slice(0, 8) },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text().catch(() => '');
      console.error('[send-confirmation-email] Resend rejected send:', resendRes.status, errBody);
      return jsonResponse({ error: `Mailer error ${resendRes.status}` }, 502);
    }

    const sentAt = new Date().toISOString();

    // ── Stamp idempotency marker (best-effort) ────────────────────────
    const { error: upErr } = await admin
      .from('user_eligibility')
      .upsert(
        {
          user_id: user.id,
          signup_confirmation_email_sent_at: sentAt,
          updated_at: sentAt,
        },
        { onConflict: 'user_id' },
      );
    if (upErr) {
      console.warn('[send-confirmation-email] stamp upsert failed:', upErr.message);
    }

    console.log(`[send-confirmation-email] sent to ${user.email} (user=${user.id.slice(0, 8)}…)`);
    return jsonResponse({ ok: true, skipped: false, sent_at: sentAt }, 200);

  } catch (err) {
    console.error('[send-confirmation-email] error:', err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
