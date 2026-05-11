// supabase/functions/_shared/factsCache.ts
//
// CLINICAL FACTS CACHE — read/write-through helper
// =================================================
// All three surfaces (lab analysis, wellness plan, doctor prep) call
// `loadOrComputeFacts(input)`. If an existing cache row exists for the
// same input_state_hash, return its facts. Otherwise compute fresh,
// write the cache, return the result. Same patient input → same facts
// across surfaces, mathematically.
//
// Universal invalidation: any change to (profile, conditions, meds,
// symptoms, lab values, rule library version) → different hash →
// cache miss → recompute. Old facts auto-expire after 24 hours.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildPlan, type ClinicalFacts, type PatientInput } from './buildPlan.ts';

// Bump this when ANY rule file in _shared/rules/* changes. Forces
// cache invalidation across the user base — old facts are no longer
// guaranteed to match the current rule library.
//
// Convention: bump on every rule-impacting deploy. Format: 'YYYY-MM-DD-N'.
//
// 2026-05-10-1: tightened CRITICAL_VALUE_THRESHOLDS regex anchors so MCH /
// MCHC / MPV / IPF / BUN-Creatinine-Ratio no longer trip the same-name
// hemoglobin / platelet / creatinine emergency alerts. Dropped TSH 2.0–2.5
// low band on Subclinical Hashimoto's pattern (was firing on normal TSH).
//
// 2026-05-10-2: restructured thyroid-pattern flagging. Hashimoto's-named
// card now requires antibodies (TPO/TgAb) OR overt hypothyroidism (TSH≥10
// or TSH≥4.5+low Free T4). Borderline TSH 2.0–4.5 + symptoms folds into
// the soft 'subclinical_hypothyroidism' card with non-alarming naming
// ("Thyroid pattern worth tracking" / "Above functional optimal"). TSH
// optimal upper bound also lowered 2.5 → 2.0 so values 2.0–2.5 surface
// as watch-tier outliers on the lab card.
//
// 2026-05-10-3: added optimal ranges for MCV / MCH / MCHC / RDW so
// low-normal values surface as watch-tier outliers. Added new
// 'early_hypochromic_pattern' rule (rule-out iron deficiency before
// overt anemia develops): fires when ≥2 of {MCV low-normal, MCH low,
// MCHC low, RDW elevated, ferritin borderline} present. Confidence
// moderate. Soft framing — "rule-out," not a diagnosis. Universal
// across every CBC upload.
//
// 2026-05-10-4: added borderline-zone detection layer
// (borderlineDetector.ts) that classifies any lab value into a 5-tier
// zone (out_low / borderline_low / safe_zone / borderline_high /
// out_high) using the lab's own reference range. Wired refLow/refHigh
// from standard_low/standard_high in DB through the v2 normalize
// functions (was a column-name bug — refLow always null pre-fix).
//
// 2026-05-10-5: replaced 3 hand-coded borderline-correlation rules
// with ONE universal system-drift detector. Adds markerSystems.ts
// (marker → body-system taxonomy) and detectSystemDrift() that fires
// "Early {system} drift" cards for any system with ≥ 2 markers
// pressed to the same side of the lab's reference range. No per-
// pattern hand-coding. Dedups against named-pattern rules that
// already cover the same system. Universal: new marker added to a
// system → automatically participates; new system added → automatic
// new card. The detection routine itself never changes.
//
// 2026-05-10-6: three audit fixes uncovered by Luba's regen (T2D
// patient with A1c 7.9 / glucose 138 / LDL 106 / ALT 34 — all hidden
// from priority_findings AND no system-drift card fired):
//   (a) FLAG_SEVERITY_RANK now recognizes 'elevated', 'suboptimal_high',
//       'suboptimal_low', 'borderline_high', 'borderline_low', 'optimal'.
//       Previously these flags fell through and the value never made
//       the outlier list.
//   (b) v2 normalize functions now treat optimal_flag='unknown' as
//       missing (was leaving the flag stuck at 'unknown' → silent drop).
//   (c) System-drift detector no longer requires ≥1 borderline marker.
//       Fires on ≥2 same-direction markers regardless of zone, so
//       diagnosed users (skipIfDx blocks named patterns) still get a
//       system-level summary of overt findings. Card naming + confidence
//       adapt: "above range" + 'high' confidence when overtly out, vs
//       "pressed to edge" + 'moderate' when borderline.
// 2026-05-10-7: rankLabOutliers now normalizes input flag values
// (elevated → high, suboptimal_* → watch, borderline_* → watch) so
// LabOutlierFact actually conforms to its declared enum and the
// downstream UI flag-mapper produces correct 'urgent' / 'monitor' /
// in-range tier per finding. Caught when Luba's A1c 7.9 + glucose 138
// rendered as the wrong flag on the priority-findings card.
//
// 2026-05-10-8: scrubbed user-visible "optimal" language from
// condition cards, evidence strings, and supplement candidate notes.
// Product positioning is borderline early-detection, not
// optimization — vocabulary now: out-of-range low, in-range low,
// in-range normal, in-range high, out-of-range high.
// 2026-05-10-9: universal flag recomputation. The DB column
// optimal_flag is stamped at upload time and goes stale when rules
// change (Evan's CRP 0.5 mg/L was stamped 'watch' under an older rule
// and never updated). New helper recomputeFlag() in optimalRanges.ts
// derives the flag from value + standard_flag + standard_low/high +
// current rules per request. All three v2 normalize functions now
// call it via pickFlag(l, ctx) instead of trusting the stored flag.
// 2026-05-11-3: Pregnancy-aware expected findings. When the patient has
// answered pregnancy_status as pregnant/trying/breastfeeding/prefer-not-
// to-say (female), the rule layer now flags high prolactin, high
// estradiol, and low FSH/LH as expected physiologic findings instead of
// firing a "Female hormonal axis — multiple markers" drift card or a
// pituitary tumor workup. The Marisa Sirkin audit (27F on prenatal)
// showed why: the AI chased a pituitary adenoma differential while
// missing the obvious pregnancy explanation.
//
// 2026-05-11-2: Expected-findings suppressor for known conditions
//   (Gilbert → bilirubin, CKD → eGFR, T1D/T2D → A1c)
// 2026-05-11-1: Sex-gate on hormonal-axis system-drift patterns
export const RULE_LIBRARY_VERSION = '2026-05-11-3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Stable hash of every input that affects the deterministic engine.
 * Universal — same shape input → same hash, byte-for-byte.
 */
export async function computeInputStateHash(input: PatientInput): Promise<string> {
  // Canonicalize: every field sorted, normalized, deterministic.
  const canonical = JSON.stringify({
    age: input.age,
    sex: input.sex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    bmi: input.bmi,
    isPregnant: input.isPregnant,
    hasShellfishAllergy: input.hasShellfishAllergy,
    hasSulfaAllergy: input.hasSulfaAllergy,
    conditions: [...input.conditionsList].map(s => s.toLowerCase().trim()).sort(),
    meds: [...input.medsList].map(s => s.toLowerCase().trim()).sort(),
    supplements: [...input.supplementsList].map(s => s.toLowerCase().trim()).sort(),
    symptoms: [...input.symptomsList]
      .map(s => `${s.name.toLowerCase().trim()}:${s.severity ?? 0}`)
      .sort(),
    labs: [...input.labs]
      .map(l => `${String(l.marker).toLowerCase().trim()}:${l.value ?? ''}:${l.unit ?? ''}:${l.flag ?? 'normal'}`)
      .sort(),
    rule_library: RULE_LIBRARY_VERSION,
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Read-through helper. Lab analysis, wellness, doctor prep all call this.
 * Returns ClinicalFacts. Computes once per input-state, serves the same
 * row to every subsequent caller until something changes.
 *
 * @param userId user UUID
 * @param drawId optional lab draw id (for indexing the cache by draw)
 * @param input the deterministic input
 */
export async function loadOrComputeFacts(args: {
  userId: string;
  drawId: string | null;
  input: PatientInput;
}): Promise<{ facts: ClinicalFacts; hash: string; fromCache: boolean }> {
  const { userId, drawId, input } = args;
  const hash = await computeInputStateHash(input);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Read-through
  const { data: cached } = await supabase
    .from('clinical_facts_cache')
    .select('facts, computed_at, expires_at')
    .eq('user_id', userId)
    .eq('input_state_hash', hash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (cached?.facts) {
    return { facts: cached.facts as ClinicalFacts, hash, fromCache: true };
  }

  // Compute fresh
  const facts = buildPlan(input);

  // Write-through (best-effort — failure to cache shouldn't fail the request)
  try {
    await supabase
      .from('clinical_facts_cache')
      .upsert(
        {
          user_id: userId,
          input_state_hash: hash,
          draw_id: drawId,
          rule_library_version: RULE_LIBRARY_VERSION,
          facts,
          computed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: 'user_id,input_state_hash' },
      );
  } catch (e) {
    console.warn('[factsCache] write failed (non-fatal):', e);
  }

  return { facts, hash, fromCache: false };
}

/**
 * Invalidate the cache for a user — used when input data is known to
 * have changed (e.g., new lab draw uploaded, conditions edited).
 * Universal — drops ALL rows for the user, not just one hash.
 */
export async function invalidateFactsCache(userId: string): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  await supabase.from('clinical_facts_cache').delete().eq('user_id', userId);
}
