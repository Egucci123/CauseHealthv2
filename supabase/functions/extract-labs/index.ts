// supabase/functions/extract-labs/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { canonicalize, canonicalKey } from '../_shared/markerCanonical.ts';
import { crossMarkerSanity } from '../_shared/crossMarkerSanity.ts';
import { disambiguateMarkers } from '../_shared/markerDisambiguator.ts';
import { sexAwareRefSweep, type Sex, type AgeBand } from '../_shared/markerReferenceRanges.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Server-side credit gate ──
    // The client also gates on profile.uploadCredits, but client state can
    // be stale (e.g., consume RPC silently failed, optimistic +1 fired
    // erroneously, profile didn't refresh). Without this server check, a
    // user with 0 credits could still trigger an Anthropic call and burn
    // our money. Authoritative source-of-truth = the profiles table.
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing auth token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userRes?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid auth token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const userId = userRes.user.id;
    const { data: prof, error: profErr } = await admin.from('profiles').select('upload_credits').eq('id', userId).single();
    if (profErr) {
      console.warn('[extract-labs] profile lookup failed:', profErr.message);
      return new Response(JSON.stringify({ error: 'Could not verify credits' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const credits = (prof as any)?.upload_credits ?? 0;
    const body = await req.json();
    const { pdfText, pdfBase64, imageBase64, imageMimeType, drawDate, appendToDrawId, patientSex, patientAgeBand } = body;
    // patientSex: 'male' | 'female' | undefined — used for sex-aware ref check.
    // patientAgeBand: 'pre_meno' | 'post_meno' | undefined — used for women's hormones.
    const sex: Sex | null = (patientSex === 'male' || patientSex === 'female') ? patientSex : null;
    const ageBand: AgeBand = (patientAgeBand === 'pre_meno' || patientAgeBand === 'post_meno') ? patientAgeBand : null;

    // Append-mode: user is adding markers to an EXISTING lab draw they
    // already paid for. Skip the upload-credit check, but verify they
    // own the drawId being appended to (prevents using append-mode to
    // bypass credits on someone else's draw).
    if (appendToDrawId) {
      const { data: drawRow, error: drawErr } = await admin
        .from('lab_draws')
        .select('user_id')
        .eq('id', appendToDrawId)
        .single();
      if (drawErr || !drawRow || drawRow.user_id !== userId) {
        console.warn('[extract-labs] append-mode draw ownership failed', { userId, appendToDrawId });
        return new Response(JSON.stringify({ error: 'Draw not found or access denied', code: 'APPEND_FORBIDDEN' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Ownership verified — append-mode is free. Continue without credit check.
      console.log('[extract-labs] append-mode: skipping credit check for owner', userId);
    } else if (credits <= 0) {
      console.warn('[extract-labs] credit gate blocked user', userId, 'credits=', credits);
      return new Response(JSON.stringify({ error: 'No upload credits remaining', code: 'NO_CREDITS' }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Shared prompt — same parser instructions for PDF and image inputs.
    //
    // Per-value `confidence` field added 2026-05-14: vision models KNOW
    // when they're guessing vs reading clearly. Surfacing that signal lets
    // downstream stages (two-pass reconciliation, UI badges) treat
    // uncertain rows differently than confident ones. Rather than ask for
    // a number (which models tend to hedge to 0.7), we ask for a 3-level
    // bucket — concrete enough that the model actually distinguishes.
    const PARSER_PROMPT = `You are a medical lab report parser. ANY of the following IS a valid lab source — extract every lab value you can read:\n  • Traditional PDF lab reports (LabCorp, Quest, hospital lab printouts)\n  • Patient portal SCREENSHOTS from any portal — Quest MyQuest, LabCorp Patient, MyChart (Epic), athenaPatient, FollowMyHealth, Cerner HealtheLife, Walgreens, CVS, etc.\n  • Mobile app screenshots showing test names + values + reference ranges (these are real lab data even if the UI looks app-like rather than paper-like)\n  • Photos of paper lab reports\n  • Cropped or partial views — even ONE visible test result is a valid lab\n\nReject ONLY if there is genuinely no lab data on the image (bank statement, resume, photo of food, blank screenshot). When in doubt, extract whatever values you can see. Empty 'values' array should be RARE — if you can read ANY test name + number, include it.\n\nReturn ONLY valid JSON — no markdown, no explanation.\n\nReturn: { "draw_date": "YYYY-MM-DD or null", "lab_name": "name or null", "ordering_provider": "name or null", "values": [{ "marker_name": "name", "value": 97.0, "unit": "IU/L", "standard_low": 0, "standard_high": 44, "standard_flag": "normal|low|high|critical_low|critical_high", "category": "metabolic|cardiovascular|liver|kidney|thyroid|hormones|nutrients|cbc|inflammation|other", "confidence": "high|medium|low" }] }\n\nThe \`confidence\` field is REQUIRED for every value and must reflect how clearly you can read the value from the source:\n  • "high" — value is clearly printed, no smudges, you would bet \\$100 you read it right.\n  • "medium" — readable but you had to interpret (handwritten, slight blur, unusual layout, partially obscured).\n  • "low" — you're guessing on at least one digit, decimal point unclear, or unit ambiguous. If confidence would be lower than "low" (you literally cannot read it), omit the row instead.\n\nInclude every single lab value visible on the screen — even ones that look like sub-items, reference values, or "negative" qualitative results. value must be a number; for qualitative results (NEGATIVE / POSITIVE / NON-REACTIVE), skip the row unless there's an associated numeric (e.g. S/CO, titer). IMPORTANT: If lab values use international units (mmol/L, umol/L, nmol/L), convert them to US conventional units (mg/dL, ng/mL, ug/dL) before returning. Common conversions: glucose mmol/L x 18 = mg/dL, cholesterol mmol/L x 38.67 = mg/dL, triglycerides mmol/L x 88.57 = mg/dL, creatinine umol/L / 88.4 = mg/dL, calcium mmol/L x 4.0 = mg/dL, uric acid umol/L / 59.48 = mg/dL. Always return values in US conventional units with the US unit label.\n\nFor IMAGES of lab paperwork (photos taken with a phone camera) OR patient portal screenshots: focus on result values. Skip headers, footers, navigation chrome. If you see a green/red/colored result tag (common in portal apps) that has a number next to it, that IS a lab value — extract it. If the image is genuinely blurry or you can't read a value confidently, omit that single row rather than guess.`;

    // Build the message content based on what the client sent
    let messages: any;

    if (imageBase64 && imageMimeType) {
      // Phone-camera photo of a paper lab report
      messages = [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageBase64 } },
          { type: 'text', text: PARSER_PROMPT },
        ],
      }];
    } else if (pdfBase64) {
      // Raw PDF sent as base64 — use Claude's document reading
      messages = [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          { type: 'text', text: PARSER_PROMPT },
        ],
      }];
    } else if (pdfText && pdfText.length >= 50) {
      // Pre-extracted text sent from client
      const prompt = `You are a medical lab report parser. Extract all laboratory test values from the following lab report text.\n\nReturn ONLY valid JSON — no markdown, no explanation.\n\nLab report text:\n${pdfText.slice(0, 12000)}\n\nReturn: { "draw_date": "YYYY-MM-DD or null", "lab_name": "name or null", "ordering_provider": "name or null", "values": [{ "marker_name": "name", "value": 97.0, "unit": "IU/L", "standard_low": 0, "standard_high": 44, "standard_flag": "normal|low|high|critical_low|critical_high", "category": "metabolic|cardiovascular|liver|kidney|thyroid|hormones|nutrients|cbc|inflammation|other", "confidence": "high|medium|low" }] }\n\nEvery value MUST include a confidence: "high" (cleanly readable text), "medium" (interpreted from messy text), "low" (guessing on at least one digit). Include every single lab value. value must be a number. IMPORTANT: If lab values use international units (mmol/L, umol/L, nmol/L), convert them to US conventional units (mg/dL, ng/mL, ug/dL) before returning. Common conversions: glucose mmol/L x 18 = mg/dL, cholesterol mmol/L x 38.67 = mg/dL, triglycerides mmol/L x 88.57 = mg/dL, creatinine umol/L / 88.4 = mg/dL, calcium mmol/L x 4.0 = mg/dL, uric acid umol/L / 59.48 = mg/dL. Always return values in US conventional units with the US unit label.`;
      messages = [{ role: 'user', content: prompt }];
    } else {
      return new Response(JSON.stringify({ error: 'No PDF data provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Single Anthropic call wrapped in a function so we can retry transient
    // failures (5xx Anthropic errors, malformed JSON responses) without
    // surfacing them to the user as "Failed to parse AI response."
    async function callAnthropic(): Promise<{ status: number; body: any; rawText: string }> {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 120000);
      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          // 32K tokens — fits a 100+ marker comprehensive panel with full
          // metadata (units, ranges, flags, categories) per row plus
          // padding for the JSON envelope. Haiku 4.5 supports up to 64K
          // output, so 32K leaves plenty of headroom. We never WANT to
          // hit this ceiling; it's a safety net so dense panels (Quest
          // Diagnostics ~80 markers, LabCorp annual physical ~70+,
          // micronutrient panels with 60+ vitamins/minerals/aminos) don't
          // get truncated mid-JSON and rejected by the parser.
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 32000, messages }),
        });
      } finally {
        clearTimeout(t);
      }
      if (!response.ok) {
        const errText = await response.text();
        return { status: response.status, body: null, rawText: errText };
      }
      const aiResponse = await response.json();
      const rawText = (aiResponse.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return { status: response.status, body: aiResponse, rawText };
    }

    function tryParse(rawText: string): any | null {
      try {
        const lb = rawText.lastIndexOf('}');
        const sliced = lb > 0 ? rawText.slice(0, lb + 1) : rawText;
        const obj = JSON.parse(sliced);
        if (!obj || !Array.isArray(obj.values)) return null;
        return obj;
      } catch { return null; }
    }

    // Attempt 1
    let attempt: { status: number; body: any; rawText: string };
    try { attempt = await callAnthropic(); }
    catch (e: any) {
      if (e?.name === 'AbortError') return new Response(JSON.stringify({ error: 'Extraction timed out' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw e;
    }
    let parsed = attempt.status === 200 ? tryParse(attempt.rawText) : null;

    // Auto-retry once on transient failure: 5xx Anthropic, or 200 with
    // unparseable response (truncation / malformed JSON / apology text).
    const isTransient = attempt.status >= 500 || (attempt.status === 200 && parsed === null);

    // 2026-05-14: ALSO retry once when Claude returned 200 + parseable JSON
    // but values:[] for an IMAGE input. Real-user bug (Daniel): 10 Quest
    // patient-portal iPhone screenshots all returned values:[] on first
    // pass — Claude classified the portal UI as "not a lab report" despite
    // visible test results. The retry uses a more permissive prompt that
    // explicitly tells Claude to extract whatever it can read.
    const isEmptyValuesOnImage = !isTransient
      && attempt.status === 200
      && parsed !== null
      && Array.isArray(parsed.values)
      && parsed.values.length === 0
      && !!imageBase64;

    if (isTransient || isEmptyValuesOnImage) {
      console.warn(`[extract-labs] Attempt 1 ${isTransient ? 'failed' : 'returned 0 values on image'} (status=${attempt.status}, parsed=${parsed !== null}, values=${parsed?.values?.length ?? 'n/a'}), retrying ${isEmptyValuesOnImage ? 'with permissive prompt' : ''}...`);
      await new Promise(r => setTimeout(r, 1500));
      // For empty-values retries on image input, swap in a more aggressive
      // extractor prompt that overrides the "is this a lab report?" check.
      // Caller already verified it's a lab image by going through the
      // dropzone — if Claude can read ANYTHING test-shaped, we want it.
      if (isEmptyValuesOnImage) {
        const PERMISSIVE_PROMPT = `Extract EVERY lab test value visible in this image. Do not refuse based on document format. The image is from a real lab source — extract everything you can read: test names, numeric values, units, reference ranges, flags.\n\nReturn ONLY valid JSON: { "draw_date": "YYYY-MM-DD or null", "lab_name": "name or null", "ordering_provider": "name or null", "values": [{ "marker_name": "name", "value": 97.0, "unit": "IU/L", "standard_low": 0, "standard_high": 44, "standard_flag": "normal|low|high|critical_low|critical_high", "category": "metabolic|cardiovascular|liver|kidney|thyroid|hormones|nutrients|cbc|inflammation|other", "confidence": "high|medium|low" }] }\n\nEvery value MUST include a confidence: "high" (cleanly readable), "medium" (interpreted from messy text), "low" (guessing on at least one digit). Even if the layout is unusual (mobile app screenshot, patient portal UI, cropped photo, single result detail page), if there's ANY visible test name with a number, include it. Skip ONLY rows where the value field is purely qualitative text (POSITIVE, NEGATIVE, NON-REACTIVE) with no numeric. Do NOT return an empty values array unless the image truly contains zero numeric test results.`;
        messages = [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageBase64 } },
            { type: 'text', text: PERMISSIVE_PROMPT },
          ],
        }];
      }
      try { attempt = await callAnthropic(); }
      catch (e: any) {
        if (e?.name === 'AbortError') return new Response(JSON.stringify({ error: 'Extraction timed out' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        throw e;
      }
      parsed = attempt.status === 200 ? tryParse(attempt.rawText) : null;
      // Log the count after retry for observability
      if (parsed) {
        console.log(`[extract-labs] retry result: status=${attempt.status}, values=${parsed?.values?.length ?? 'n/a'}`);
      }
    }

    if (attempt.status !== 200) {
      return new Response(JSON.stringify({ error: 'AI extraction failed', detail: attempt.rawText }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (parsed === null) {
      return new Response(JSON.stringify({ error: 'Failed to parse AI response after retry. Try uploading the file again, or use Manual Entry.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (drawDate) parsed.draw_date = drawDate;
    if (drawDate) parsed.draw_date = drawDate;

    // ── DEDUPE + DISAMBIGUATE + VALIDATE + CROSS-MARKER SANITY ─────────────
    // Pipeline order matters:
    //   1. dedupe — collapse aliases (SGPT → ALT) using canonical keys.
    //   2. disambiguate — promote rows whose (unit, value) say they're a
    //      sibling canonical (Calcium mmol/L → Ionized Calcium; Iron %
    //      → TSat; B12 pmol/L → pg/mL conversion). Must run BEFORE sanity
    //      so cross-marker checks operate on correct canonicals.
    //   3. validate — per-marker plausibility + decimal auto-correction.
    //   4. cross-marker sanity — arithmetic identities (Hgb*3≈Hct,
    //      LDL≤TC-HDL, Friedewald, diff sums, etc).
    parsed.values = dedupeValues(parsed.values);
    const disambigResult = disambiguateMarkers(parsed.values);
    parsed.values = disambigResult.values;
    if (disambigResult.rulesFired.length > 0) {
      parsed.disambiguation_rules_fired = disambigResult.rulesFired;
      console.log('[extract-labs] disambiguation fired:', disambigResult.rulesFired.join(', '));
    }
    parsed.values = validateValues(parsed.values);
    const sanityResult = crossMarkerSanity(parsed.values);
    parsed.values = sanityResult.values;
    if (sanityResult.warningsFired.length > 0) {
      parsed.sanity_warnings_fired = sanityResult.warningsFired;
      console.log('[extract-labs] cross-marker sanity warnings:', sanityResult.warningsFired.join(', '));
    }
    // Sex-aware reference range check — only fires when caller passed a known sex.
    // Detects when the lab report printed the opposite-sex column (rare but
    // real on multi-column reports). Annotates the row but never modifies value.
    if (sex) {
      const refResult = sexAwareRefSweep(parsed.values, sex, ageBand);
      parsed.values = refResult.values;
      if (refResult.mismatched.length > 0) {
        parsed.ref_mismatches = refResult.mismatched;
        console.log('[extract-labs] sex-aware ref mismatches:', refResult.mismatched.join(', '));
      }
    }

    // ── (7) TWO-PASS RECONCILIATION ────────────────────────────────────────
    // For IMAGES only: if any rows came back low-confidence, critical, or
    // tripped a sanity/ref/validation warning, ask the AI to re-read JUST
    // those specific markers from the same image and reconcile.
    // We pass the first-pass values back to the model and ask it to flag
    // any disagreements. Each disputed row gets `reconciliation_note` and,
    // when the second pass had stronger evidence, the value is rewritten.
    //
    // Cost: at most ONE extra Anthropic call per upload, only when there's
    // a reason to doubt the first pass. Most clean labs skip this entirely.
    if (imageBase64 && parsed.values?.length > 0) {
      const suspect = parsed.values.filter((v: any) =>
        v.confidence === 'low'
        || v.standard_flag === 'critical_high' || v.standard_flag === 'critical_low'
        || v.validation_warning || v.sanity_warning || v.ref_mismatch_warning
      );
      if (suspect.length > 0 && suspect.length <= 20) {
        console.log('[extract-labs] running 2nd-pass reconciliation on', suspect.length, 'suspect rows');
        const suspectSummary = suspect.map((v: any) => {
          const reasons: string[] = [];
          if (v.confidence === 'low') reasons.push('LOW_CONFIDENCE');
          if (v.standard_flag === 'critical_high' || v.standard_flag === 'critical_low') reasons.push('CRITICAL_VALUE');
          if (v.validation_warning) reasons.push('PLAUSIBILITY');
          if (v.sanity_warning) reasons.push('CROSS_MARKER_INCONSISTENCY');
          if (v.ref_mismatch_warning) reasons.push('REF_MISMATCH');
          return `  - "${v.marker_name}" = ${v.value} ${v.unit ?? ''} (flagged: ${reasons.join(', ')})`;
        }).join('\n');
        const RECONCILE_PROMPT = `You previously extracted lab values from this image. The following rows were flagged for review — they had low confidence, critical values, or failed an arithmetic consistency check. Re-read the image carefully and confirm whether each value below is correct. If it's wrong, return the corrected value. If it's correct, repeat it back unchanged.\n\nFlagged rows from first pass:\n${suspectSummary}\n\nReturn ONLY valid JSON: { "reconciled": [{ "marker_name": "exact name as above", "value": 97.0, "unit": "IU/L", "confidence": "high|medium|low", "agrees_with_first_pass": true|false, "note": "short reason if changed" }] }\n\nBe pedantic — re-read each digit, confirm the decimal point, confirm the unit. If you genuinely cannot read a value with confidence, set agrees_with_first_pass=false, confidence="low", and note="unreadable in image".`;
        const reconcileMessages: any = [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMimeType, data: imageBase64 } },
            { type: 'text', text: RECONCILE_PROMPT },
          ],
        }];
        try {
          const reconcileResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8000, messages: reconcileMessages }),
          });
          if (reconcileResp.ok) {
            const reconcileBody = await reconcileResp.json();
            const reconcileRaw = (reconcileBody.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const reconciledParsed = (() => { try { return JSON.parse(reconcileRaw.slice(0, reconcileRaw.lastIndexOf('}') + 1)); } catch { return null; }})();
            if (reconciledParsed && Array.isArray(reconciledParsed.reconciled)) {
              for (const r of reconciledParsed.reconciled) {
                if (!r.marker_name) continue;
                const target = parsed.values.find((v: any) => v.marker_name === r.marker_name || (v.canonical_key && v.canonical_key === canonicalKey(r.marker_name)));
                if (!target) continue;
                target.reconciliation_note = r.agrees_with_first_pass
                  ? `2nd-pass re-read CONFIRMED ${target.value} ${target.unit ?? ''} (confidence: ${r.confidence ?? 'unknown'}).`
                  : `2nd-pass re-read DISAGREED: first pass said ${target.value} ${target.unit ?? ''}, second pass says ${r.value} ${r.unit ?? ''}${r.note ? ` (${r.note})` : ''}.`;
                // Only auto-replace when both passes agree on a non-trivial change AND second pass is at least as confident
                if (!r.agrees_with_first_pass && typeof r.value === 'number' && r.confidence !== 'low') {
                  target.first_pass_value = target.value;
                  target.value = r.value;
                  if (r.unit) target.unit = r.unit;
                  target.reconciliation_applied = true;
                }
              }
              parsed.reconciliation_ran = true;
              parsed.reconciliation_count = suspect.length;
              console.log('[extract-labs] reconciliation: rewrote', parsed.values.filter((v:any) => v.reconciliation_applied).length, 'of', suspect.length);
            }
          } else {
            console.warn('[extract-labs] reconciliation call failed:', reconcileResp.status);
          }
        } catch (e) {
          console.warn('[extract-labs] reconciliation threw:', (e as Error).message);
        }
      }
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ── Dedupe ────────────────────────────────────────────────────────────────────
// Lab PDFs frequently repeat markers across overlapping panels (CMP, BMP, hepatic
// function, etc). Group by canonical key, then keep the most complete row.
//
// 2026-05-14 hardening: switched the dedupe key from a shallow string-strip
// (which left "SGPT", "ALT", "Alanine Aminotransferase" as three separate keys)
// to the shared canonicalKey() — every alias of the same analyte now collapses.
// Same key drives plausibility lookups so "SGPT 97" gets validated against the
// "alt" plausibility entry.
function normalizeMarker(name: string): string {
  return canonicalKey(name);
}
function completenessScore(v: any): number {
  let s = 0;
  if (v.value != null && !Number.isNaN(Number(v.value))) s += 4;
  if (v.unit) s += 2;
  if (v.standard_low != null) s += 1;
  if (v.standard_high != null) s += 1;
  if (v.standard_flag && v.standard_flag !== 'normal') s += 1; // flagged rows often more authoritative
  if (v.category && v.category !== 'other') s += 1;
  return s;
}
function dedupeValues(values: any[]): any[] {
  const groups = new Map<string, any[]>();
  for (const v of values) {
    const k = normalizeMarker(v.marker_name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(v);
  }
  const out: any[] = [];
  for (const [, rows] of groups) {
    if (rows.length === 1) { out.push(rows[0]); continue; }
    // If all values agree (within 1%), keep the most complete
    const numericValues = rows.map(r => Number(r.value)).filter(n => !Number.isNaN(n));
    const allAgree = numericValues.length > 1 &&
      numericValues.every(n => Math.abs(n - numericValues[0]) <= Math.abs(numericValues[0]) * 0.01);
    if (allAgree) {
      const best = rows.reduce((a, b) => (completenessScore(a) >= completenessScore(b) ? a : b));
      out.push(best);
    } else {
      // Conflicting values for the same marker — keep the one with most complete data,
      // tag with a note so the UI/AI knows there was a discrepancy
      const best = rows.reduce((a, b) => (completenessScore(a) >= completenessScore(b) ? a : b));
      const others = rows.filter(r => r !== best).map(r => `${r.value}${r.unit ? ' ' + r.unit : ''}`);
      best.dedup_note = `Lab report had multiple values for this marker: ${[best.value + (best.unit ? ' ' + best.unit : ''), ...others].join(', ')}. Kept most complete.`;
      out.push(best);
    }
  }
  // Enrich every surviving row with the canonical name + key so downstream
  // consumers (engine, audits, UI) never have to re-derive them.
  return out.map(v => {
    const c = canonicalize(v.marker_name);
    return c ? { ...v, canonical_name: c.canonical, canonical_key: c.key, canonical_category: c.category }
             : { ...v, canonical_key: canonicalKey(v.marker_name) };
  });
}

// ── Validation ────────────────────────────────────────────────────────────────
// Plausibility ranges come from the canonical marker registry itself
// (markerCanonical.ts → MARKER.plausibleRange). One source of truth means
// new markers added to the canonical list are automatically validated;
// the legacy alias-keyed map below was the source of "SGPT 97 didn't match
// 'alt' so it wasn't validated" bugs. validateValues() looks up by
// canonical key so every alias of a marker uses the same plausibility band.
function validateValues(values: any[]): any[] {
  return values.map(v => {
    const c = canonicalize(v.marker_name);
    if (!c || !c.plausibleRange || v.value == null) return v;
    const val = Number(v.value);
    if (Number.isNaN(val)) return v;
    const rule = c.plausibleRange;
    if (val >= rule.min && val <= rule.max) return v;

    // Try common decimal errors — divide by 10 or 100 if that lands in range
    for (const factor of [10, 100, 1000]) {
      const corrected = val / factor;
      if (corrected >= rule.min && corrected <= rule.max) {
        return {
          ...v,
          value: corrected,
          original_value: val,
          validation_note: `Auto-corrected from ${val} → ${corrected} (likely decimal error in extraction).`,
        };
      }
      const upcorrected = val * factor;
      if (upcorrected >= rule.min && upcorrected <= rule.max) {
        return {
          ...v,
          value: upcorrected,
          original_value: val,
          validation_note: `Auto-corrected from ${val} → ${upcorrected} (likely decimal error in extraction).`,
        };
      }
    }
    // Genuinely outside plausibility — flag for user attention
    return { ...v, validation_warning: `Value ${val} ${v.unit ?? ''} is outside the plausible range (${rule.min}–${rule.max}). Please verify.` };
  });
}
