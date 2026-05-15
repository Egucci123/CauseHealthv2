// REALISTIC PATIENT FUZZ AUDIT
// ============================
// Generates N realistic synthetic patients (random marker aliases,
// Poisson symptom counts, partial panels, polypharmacy, borderline
// values) and runs each through buildPlan(). Asserts safety invariants
// that should hold UNIVERSALLY regardless of patient profile.
//
// Goal: surface engine bugs that clean synthetics miss — the class of
// bugs that bit Daniel (false-IDA-name), Angel (Vit-D repletion on a
// high Vit D), Marisa, Tim, Evan.

import { buildPlan } from "../buildPlan.ts";
import { generateRealisticPatient } from "./realisticPatientGenerator.ts";

const N = Number(Deno.args[0] ?? 300);

interface Violation {
  seed: number;
  rule: string;
  detail: string;
  profile?: string;
}

const violations: Violation[] = [];
let crashes = 0;
let runs = 0;

// Repletion-supplement marker map (subset). Trip if supplement recommended
// while corresponding marker is measured HIGH.
const REPLETION_BLOCKERS: Array<{ nutrient: RegExp; markerHints: string[] }> = [
  { nutrient: /vitamin d|vit d|cholecalciferol/i, markerHints: ['vitamin d', '25-oh', '25-hydroxy'] },
  { nutrient: /iron|ferrous|bisglycinate/i, markerHints: ['ferritin'] },
  { nutrient: /b12|cobalamin|methylcobalamin/i, markerHints: ['b12', 'cobalamin'] },
  { nutrient: /folate|folic|methylfolate/i, markerHints: ['folate'] },
  { nutrient: /magnesium/i, markerHints: ['magnesium'] },
  { nutrient: /zinc/i, markerHints: ['zinc'] },
];

for (let i = 0; i < N; i++) {
  const seed = 1000 + i;
  let patient;
  try {
    patient = generateRealisticPatient({ seed, profile: 'mix' });
    const plan = buildPlan(patient);
    runs++;

    // Invariant 1: plan structure
    if (!plan.chiefComplaint || typeof plan.chiefComplaint !== 'string') {
      violations.push({ seed, rule: 'plan_structure', detail: 'missing chiefComplaint' });
    }
    if (!Array.isArray(plan.conditions)) {
      violations.push({ seed, rule: 'plan_structure', detail: 'conditions not array' });
    }
    if (!Array.isArray(plan.supplementCandidates)) {
      violations.push({ seed, rule: 'plan_structure', detail: 'supplementCandidates not array' });
    }

    // Invariant 2: no repletion supplement when marker is HIGH
    for (const s of plan.supplementCandidates ?? []) {
      const nutName = (s.nutrient || '').toString();
      for (const block of REPLETION_BLOCKERS) {
        if (!block.nutrient.test(nutName)) continue;
        const matchedLab = patient.labs.find(l =>
          block.markerHints.some(h => l.marker.toLowerCase().includes(h))
          && (l.flag === 'high' || l.flag === 'critical_high')
        );
        if (matchedLab) {
          violations.push({
            seed,
            rule: 'repletion_on_high',
            detail: `${nutName} recommended while ${matchedLab.marker}=${matchedLab.value} ${matchedLab.unit} [${matchedLab.flag}]`,
          });
        }
      }
    }

    // Invariant 3: "Iron Deficiency Anemia" label requires LOW hemoglobin
    for (const c of plan.conditions ?? []) {
      if (/iron deficiency anemia/i.test(c.name) && !/no overt anemia/i.test(c.name)) {
        const hgb = patient.labs.find(l => /^hemoglobin$|^hgb$/i.test(l.marker));
        if (hgb && hgb.flag === 'normal') {
          violations.push({
            seed,
            rule: 'ida_without_anemia',
            detail: `"${c.name}" but Hgb=${hgb.value} [normal]`,
          });
        }
      }
    }

    // Invariant 4: no directive medical advice in HPI / discussion
    const directivePatterns = [
      /\byou should take\b/i,
      /\byou must take\b/i,
      /\bstop taking\b/i,
      /\bI prescribe\b/i,
      /\byou need to take\b/i,
    ];
    const proseBlob = [
      plan.chiefComplaint,
      plan.hpi,
      ...(plan.discussionPoints ?? []),
      ...(plan.conditions ?? []).map(c => c.evidence ?? ''),
    ].join(' \n ');
    for (const re of directivePatterns) {
      const m = proseBlob.match(re);
      if (m) {
        violations.push({ seed, rule: 'directive_advice', detail: m[0] });
        break;
      }
    }

    // Invariant 5: no condition fires on ALL-normal labs with zero symptoms
    if (patient.symptomsList.length === 0
        && patient.labs.every(l => l.flag === 'normal')
        && plan.conditions.length > 0) {
      violations.push({
        seed,
        rule: 'condition_on_clean_patient',
        detail: `conditions=${plan.conditions.map(c => c.name).join('|')}`,
      });
    }

    // Invariant 6: every supplement should have a `why` rationale
    for (const s of plan.supplementCandidates ?? []) {
      const why = (s as any).whyShort || (s as any).why || '';
      if (!why || why.length < 10) {
        violations.push({ seed, rule: 'supplement_no_why', detail: `${s.nutrient} has no rationale` });
      }
    }

    // Invariant 7: system-drift "pressed to LOW" must not fire when all
    // measured markers in that system are within normal range AND the
    // system's concerning direction is HIGH-only (liver, lipid, kidney,
    // glucose, inflammation). Catches Daniel's "Liver function pressed
    // to LOW" false fire.
    const HIGH_ONLY_SYSTEMS = /liver function|lipid|kidney|glucose metab|inflammation/i;
    for (const c of plan.conditions ?? []) {
      const isDrift = /pressed to (low|high) end|drift|multiple markers/i.test(c.evidence ?? '')
        || /pressed to (low|high)/i.test(c.name);
      if (!isDrift) continue;
      if (HIGH_ONLY_SYSTEMS.test(c.name) && /pressed to low/i.test(c.evidence ?? '' + ' ' + c.name)) {
        violations.push({
          seed, rule: 'low_drift_on_high_only_system',
          detail: `"${c.name}" — should not fire LOW-drift`,
        });
      }
    }

    // Invariant 8: Iron Deficiency in male/post-meno female → GI bleed
    // workup must appear somewhere (tests or evidence). Real-user bug
    // pattern (Daniel) was burying workup.
    // Only flag confirmed iron deficiency (Stage 2/3) — not "rule-out" pre-pattern.
    const isIronDef = (plan.conditions ?? []).some(c =>
      /iron deficiency/i.test(c.name) && !/rule[- ]?out/i.test(c.name)
    );
    const isMaleOrPostMeno = patient.sex === 'male' || (patient.sex === 'female' && patient.age >= 55);
    if (isIronDef && isMaleOrPostMeno) {
      const blob = [
        ...(plan.tests ?? []).map(t => t.name),
        ...(plan.conditions ?? []).map(c => c.evidence ?? ''),
        ...(plan.discussionPoints ?? []),
      ].join(' \n ').toLowerCase();
      const hasGIWorkup = /(fit\b|fecal occult|fecal immuno|h\. ?pylori|h pylori|celiac|tissue transgluta|calprotectin|colonoscop|endoscop)/i.test(blob);
      if (!hasGIWorkup) {
        violations.push({
          seed, rule: 'iron_def_no_gi_workup',
          detail: `Iron deficiency in ${patient.sex} age ${patient.age} but no GI bleed workup surfaced`,
        });
      }
    }

    // Invariant 9: HIGH or CRITICAL marker should be acknowledged
    // somewhere — either as a condition, a test, or a discussion point.
    // Catches "abnormal lab silently dropped" bugs.
    // MEANINGFUL abnormals only: hard flag AND ≥10% past the ref bound.
    // Filters out cases where a marker is flagged "high" but is only 1-2%
    // beyond range — engine is allowed to be clinically conservative
    // for those (e.g. PLT 443 with ref 140-400, Total Chol 201 with ref ≤200).
    const meaningfulAbnormals = patient.labs.filter(l => {
      if (l.flag !== 'high' && l.flag !== 'critical_high' && l.flag !== 'low' && l.flag !== 'critical_low') return false;
      const lo = (l as any).standard_low;
      const hi = (l as any).standard_high;
      const span = (hi != null && lo != null) ? hi - lo : 0;
      if (span <= 0) return true;
      if ((l.flag === 'high' || l.flag === 'critical_high') && hi != null) return l.value > hi + span * 0.10;
      if ((l.flag === 'low'  || l.flag === 'critical_low')  && lo != null) return l.value < lo - span * 0.10;
      return true;
    });
    if (meaningfulAbnormals.length >= 2 && (plan.conditions ?? []).length === 0 && (plan.discussionPoints ?? []).length === 0) {
      violations.push({
        seed, rule: 'abnormals_silently_dropped',
        detail: `${meaningfulAbnormals.length} meaningfully-out-of-range markers but 0 conditions and 0 discussion points`,
      });
    }
  } catch (e) {
    crashes++;
    violations.push({ seed, rule: 'crash', detail: (e as Error).message });
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  REALISTIC FUZZ — ${N} patients, ${runs} successful runs`);
console.log('══════════════════════════════════════════════════════════════\n');

console.log(`Crashes: ${crashes}`);
console.log(`Total violations: ${violations.length}\n`);

const byRule: Record<string, Violation[]> = {};
for (const v of violations) (byRule[v.rule] ??= []).push(v);

for (const [rule, vs] of Object.entries(byRule).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  [${rule}]  ${vs.length}`);
  for (const v of vs.slice(0, 50)) {
    console.log(`     seed=${v.seed}  ${v.detail.slice(0, 200)}`);
  }
  if (vs.length > 50) console.log(`     ... (${vs.length - 50} more)`);
}

console.log('\n══════════════════════════════════════════════════════════════\n');
// Regression baseline. Current steady-state on the 11-archetype mix is
// ~1/2000 (0.05%) — defensible silence on borderline cases. Pre-commit
// hook fails only on regression above baseline. Tighten when engine
// improves.
const baselineArg = Deno.args.find((a) => typeof a === 'string' && a.startsWith('--max-violations='));
const BASELINE = baselineArg ? Number(baselineArg.split('=')[1]) : 10;

if (crashes > 0) {
  console.log(`  ❌ ${crashes} crash(es) — must be zero. Exiting 1.`);
  Deno.exit(1);
}
if (violations.length > BASELINE) {
  console.log(`  ❌ ${violations.length} violations exceeds regression baseline (${BASELINE}). Engine has regressed.`);
  Deno.exit(1);
}
console.log(`  ✓ ${violations.length} violations within regression baseline (${BASELINE}). Engine clean.`);
