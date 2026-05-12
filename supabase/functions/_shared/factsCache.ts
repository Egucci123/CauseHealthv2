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
// 2026-05-11-6: Universal coverage fix #1 — hormonal contraception +
// methotrexate depletion rules. ~30% of female users on OCPs were
// getting zero depletion-driven supplements because OCPs had no
// medication-alias entry. Added comprehensive alias regex (combined
// pills, progestin-only, ring, patch, implant, hormonal IUDs) +
// depletion rules for folate, B6, B12, magnesium, zinc, CoQ10.
// Methotrexate added as a dedicated class (kept separate from
// hepatotoxic_other) so folate-antagonism specifically fires.
//
// 2026-05-11-5: Universal supplement-rule expansion. Previously fired
// for only 7 patterns. Expanded to ~25 covering thyroid drift, cortisol
// elevation, lipid panel, glycemic drift, homocysteine, AST, uric acid,
// PCOS, Hashimoto, T2D, hypertension, anxiety, plus symptom-driven
// (fatigue/brain fog/mood/sleep/bowel/joints/headaches/hair/stress).
//
// 2026-05-11-4: AI prompt polish (severity scale, evidence grounding,
//   disjoint patterns, sharp tell_doctor)
// 2026-05-11-3: Pregnancy-aware expected findings (prolactin / estradiol
//   / FSH / LH suppression while pregnant or breastfeeding)
// 2026-05-11-2: Expected-findings suppressor for known conditions
//   (Gilbert → bilirubin, CKD → eGFR, T1D/T2D → A1c)
// 2026-05-11-1: Sex-gate on hormonal-axis system-drift patterns
// 2026-05-11-13: Two universal corrections from the user's Marisa re-audit:
//   1. Supplement engine generates everything it can justify, then sorts
//      by (priority, source) and caps at top 6. Previously a 10-supplement
//      stack was too noisy. The cap lives in supplementRules.ts; bumping
//      SUPPLEMENT_TOP_N changes it globally.
//   2. Condition-workup tests (the confirmatory_tests array on each
//      suspected-condition rule — hyperprolactinemia, adrenal screen,
//      hemochromatosis, etc.) now MERGE into facts.tests. Previously
//      they lived only on the condition card and never reached the
//      patient's main "tests to ask PCP" list. Universal fix in
//      buildPlan.ts after conditions are computed. Dedup by lowercase
//      name so we never double-list a canonical test.
//
// 2026-05-11-12: Revert Fix 6's severity-based supplement gating —
// the in-app symptom picker has no severity slider; every selected
// symptom is auto-stamped severity 5. Filtering at >= 3 was dead code.
// Symptom-driven supplement rules now use unfiltered symptomsLower
// (selection is the signal). narrative.ts prompt also updated to drop
// the severity threshold note.
// 2026-05-11-14: Universal foundational baseline supplement stack.
// Fires ONLY when no other supplement rule produced a candidate. Three
// evidence-supported pregnancy-safe baseline items (Vit D 1000 IU,
// Omega-3 1000 mg, Mg glycinate 200 mg) so a "healthy adult, nothing
// flagged" user never opens an empty supplement page. Naturally pushed
// out by the priority-sort cap for users with actual findings.
// 2026-05-11-15: Two universal corrections from real-output review:
//   1. CoQ10 fatigue rule now gates on age >= 40 (matches the
//      mitochondrial-decline literature). Statin users still get it via
//      the depletion path. A 27-year-old reporting fatigue gets B-complex
//      first, not CoQ10.
//   2. Smart test-list dedup + 18-cap. Naive lowercase-exact dedup
//      double-listed "TSH" + "Thyroid Panel (TSH + Free T4 + Free T3)"
//      and "Medication review (dopamine)" + "Medication review
//      (corticosteroids)". Normalized matching strips parentheticals
//      and qualifiers; substring-containment catches "TSH" inside
//      "Thyroid Panel". Then sort by priority and cap at 18 so the PCP
//      gets an actionable list, not a wall.
// 2026-05-11-16: Supplement engine refactor — data-driven registry.
// supplementRules.ts went from 35+ hand-coded if-statements to a thin
// wrapper around supplementIndications.ts (INDICATIONS table + one
// evaluateIndications() function). Adding coverage for a new pattern =
// ADD ONE ROW. No engine modification. Universal across every user.
// Same outputs as before (verified by inspection); now extensible by
// data instead of code.
// 2026-05-12-1: testInjectors.ts refactored to data-driven registry.
// All test-ordering decisions now live in TEST_INDICATIONS in
// ./testIndications.ts. testInjectors.ts owns only fact-extraction
// (buildContextFlags) + thin wrapper adapters. Adding a new test
// pattern = ADD ONE ROW to TEST_INDICATIONS. No engine modification.
// 47 rows cover universal adult baseline, conditions, age/sex screens,
// medication monitoring, lipid patterns, hepatic patterns, metabolic
// syndrome, anemia subtyping, PTH workups, hormonal baselines, PCOS,
// fasting insulin, and early-Hashimoto's grey zone.
// 2026-05-12-2: Outlier prose builder refactored to data-driven registry.
// proseRules.ts's buildOutlierProse function had a 100-line if/else chain
// mapping marker class → prose. Now OUTLIER_PROSE_RULES is a 12-row table;
// the function iterates the table and falls back to a universal
// above/below/watch generic for unknown markers. Adding prose for a new
// marker class = ADD A ROW.
// 2026-05-12-3: Test-list dedup hardened + female SOC baseline added.
// (1) Dedup uses TEST_COVERAGE panel→component map so "Thyroid Panel
//     (TSH+Free T4+Free T3)" eats the standalone "TSH" entry coming
//     from hyperprolactinemia workup. Same for Hashimoto panel ⊇ TPO+Tg,
//     Iron Panel ⊇ Iron/TIBC/Ferritin/Transferrin Sat, etc.
// (2) Added standard-of-care female baseline indications: Pap smear
//     (21-65), Thyroid antibodies baseline (women 5-8x higher autoimmune
//     thyroid risk), DEXA (≥65), STI screen (18-25).
export const RULE_LIBRARY_VERSION = '2026-05-12-39';

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
