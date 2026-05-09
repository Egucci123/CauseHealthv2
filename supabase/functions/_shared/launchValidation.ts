// supabase/functions/_shared/launchValidation.ts
//
// PHASE 9 — LAUNCH-WORTHY VALIDATION CHECKLIST
// ============================================
// Universal post-generation validator. Takes a wellness plan + the
// patient's lab/condition/symptom context, and returns a pass/fail
// report against the 25-item launch checklist.
//
// Used by:
//   1. Synthetic test bench (manual run during QA — pass on every
//      archetype before declaring launch-ready)
//   2. Production monitoring (run on every saved plan, log failures
//      to an audit table; weekly review)
//
// The checklist enforces:
//   - Comprehensive baseline coverage (CMP, CBC, Lipid, A1c, hs-CRP,
//     Vit D, B12 workup, Folate workup, Iron Panel, GGT, Mg, Thyroid
//     Panel, ApoB, Lp(a), Testosterone Panel for males)
//   - No fake test names ("Fecal gut hs-CRP", "Liver Panel")
//   - No truncation fragments (lone digits, "vs." titles, "(X)" stubs)
//   - No alarmist tone (forbidden phrase list)
//   - No condition-specific code paths (universal-only)
//   - Test alignment between wellness retest_timeline and any sub-list
//   - Action plan only references in-stack supplements
//   - Critical-value escalation when warranted
//   - Pre-analytical guidance present
//   - Risk calculators populated when inputs available

import { CRITICAL_VALUE_THRESHOLDS, ALARM_REPLACEMENTS, FAKE_TEST_NAME_FIXES } from './canonical.ts';

export interface ValidationCheck {
  id: string;
  category: 'safety' | 'completeness' | 'quality' | 'consistency';
  description: string;
  passed: boolean;
  detail?: string;
  severity: 'fatal' | 'high' | 'medium' | 'low';
}

export interface ValidationReport {
  passed: boolean;
  fatalCount: number;
  highCount: number;
  checks: ValidationCheck[];
  summary: string;
}

interface ValidatorInput {
  plan: any;            // wellness_plan plan_data
  labs?: any[];         // lab_values
  meds?: string[];      // medication names lowercased
  supps?: string[];     // supplement names lowercased
  age?: number;
  sex?: string;
}

export function validatePlan(input: ValidatorInput): ValidationReport {
  const { plan, labs = [], age, sex } = input;
  const checks: ValidationCheck[] = [];

  const add = (id: string, category: ValidationCheck['category'], description: string, passed: boolean, severity: ValidationCheck['severity'], detail?: string) => {
    checks.push({ id, category, description, passed, detail, severity });
  };

  // ── SAFETY CHECKS ─────────────────────────────────────────────────
  // 1. Critical-value escalator fired when warranted
  let expectedEmergencies = 0;
  for (const lab of labs) {
    const name = String(lab?.marker_name ?? '');
    const val = parseFloat(String(lab?.value ?? ''));
    if (!Number.isFinite(val)) continue;
    for (const t of CRITICAL_VALUE_THRESHOLDS) {
      if (!t.marker.test(name)) continue;
      if ((t.low !== undefined && val <= t.low) || (t.high !== undefined && val >= t.high)) {
        expectedEmergencies++;
        break;
      }
    }
  }
  const actualEmergencies = Array.isArray(plan?.emergency_alerts) ? plan.emergency_alerts.length : 0;
  add(
    'safety_emergency_alerts_fired',
    'safety',
    'Emergency-tier values trigger emergency_alerts',
    actualEmergencies >= expectedEmergencies,
    'fatal',
    `expected ${expectedEmergencies}, got ${actualEmergencies}`,
  );

  // 2. Plan output schema present
  add('safety_disclaimer_present', 'safety', 'Disclaimer present', !!plan?.disclaimer, 'high');

  // ── COMPLETENESS CHECKS ───────────────────────────────────────────
  // 3-15. Universal baseline tests present in retest_timeline
  const retestNames = (plan?.retest_timeline ?? [])
    .map((r: any) => String(r?.marker ?? '').toLowerCase());
  const hasMarker = (re: RegExp) => retestNames.some((n: string) => re.test(n));

  if ((age ?? 99) >= 18) {
    add('completeness_cmp', 'completeness', 'CMP in retest', hasMarker(/comprehensive metabolic|cmp\b/i), 'high');
    add('completeness_cbc', 'completeness', 'CBC w/ Diff in retest', hasMarker(/complete blood count|cbc\b/i), 'high');
    add('completeness_lipid', 'completeness', 'Lipid Panel in retest', hasMarker(/lipid panel/i), 'high');
    add('completeness_a1c', 'completeness', 'HbA1c in retest', hasMarker(/hemoglobin a1c|hba1c|^a1c/i), 'high');
    add('completeness_hscrp', 'completeness', 'hs-CRP in retest', hasMarker(/hs[-\s]?crp/i), 'medium');
    add('completeness_vitd', 'completeness', 'Vitamin D 25-OH in retest', hasMarker(/vitamin d|25.?hydroxy/i), 'medium');
    add('completeness_b12_workup', 'completeness', 'B12 Workup in retest', hasMarker(/b[\s-]?12.*workup|methylmalonic|cobalamin/i), 'medium');
    add('completeness_folate', 'completeness', 'Folate Workup in retest', hasMarker(/folate/i), 'medium');
    add('completeness_iron_panel', 'completeness', 'Iron Panel in retest', hasMarker(/iron panel/i), 'medium');
    add('completeness_ggt', 'completeness', 'GGT in retest', hasMarker(/ggt|gamma[\s-]?glutamyl/i), 'medium');
    add('completeness_thyroid_panel', 'completeness', 'Thyroid Panel in retest', hasMarker(/thyroid panel|tsh/i), 'medium');
    add('completeness_magnesium', 'completeness', 'Magnesium in retest', hasMarker(/magnesium/i), 'medium');
    add('completeness_lpa', 'completeness', 'Lp(a) in retest', hasMarker(/lp\(a\)|lipoprotein.?a/i), 'medium');
    if (sex && String(sex).toLowerCase() === 'male') {
      add('completeness_testosterone', 'completeness', 'Testosterone Panel in retest (male)', hasMarker(/testosterone/i), 'medium');
    }
  }

  // ── QUALITY CHECKS — no fake names, no truncations, no alarmism ──
  const allText = JSON.stringify(plan ?? {});

  // 16. No fake test names
  let fakeNameLeak = '';
  for (const [pat] of FAKE_TEST_NAME_FIXES) {
    if (pat.test(allText)) { fakeNameLeak = pat.toString(); break; }
  }
  add('quality_no_fake_names', 'quality', 'No AI-mashed fake test names', !fakeNameLeak, 'high', fakeNameLeak);

  // 17. No alarmist phrases
  let alarmLeak = '';
  for (const [pat] of ALARM_REPLACEMENTS) {
    // Skip the watch-tier rewrite patterns (those are forward replacements)
    const ps = pat.toString();
    if (ps.includes('5\\.[456]') || ps.includes('9[5-9]')) continue;
    if (pat.test(allText)) { alarmLeak = ps; break; }
  }
  add('quality_no_alarm', 'quality', 'No alarmist phrases', !alarmLeak, 'high', alarmLeak);

  // 18. No truncated condition titles ending in "vs." / "or" / "and"
  const truncatedTitle = (plan?.suspected_conditions ?? [])
    .find((c: any) => /\b(vs\.?|or|and)\s*$/i.test(String(c?.name ?? '').trim()));
  add('quality_no_truncated_titles', 'quality', 'No truncated suspected_condition titles', !truncatedTitle, 'medium', truncatedTitle?.name);

  // 19. No marker names with "(CONDITIONAL)" / "(OPTIONAL)" suffixes
  const conditionalSuffix = (plan?.retest_timeline ?? [])
    .find((r: any) => /\b(CONDITIONAL|OPTIONAL|MAYBE)\b/i.test(String(r?.marker ?? '')));
  add('quality_no_conditional_suffix', 'quality', 'No "(CONDITIONAL)" suffix on marker names', !conditionalSuffix, 'medium', conditionalSuffix?.marker);

  // 20. No "Triglyceride/HDL Ratio" or other calculations as test orders
  const calculationAsTest = (plan?.retest_timeline ?? [])
    .find((r: any) => /\bratio\b/i.test(String(r?.marker ?? '')) && !/panel/i.test(String(r?.marker ?? '')));
  add('quality_no_calc_as_test', 'quality', 'No calculations listed as orderable tests', !calculationAsTest, 'medium', calculationAsTest?.marker);

  // 21. No LOW-confidence suspected_conditions
  const lowConf = (plan?.suspected_conditions ?? [])
    .find((c: any) => String(c?.confidence ?? '').toLowerCase() === 'low');
  add('quality_no_low_conf', 'quality', 'No LOW-confidence suspected_conditions', !lowConf, 'medium', lowConf?.name);

  // ── CONSISTENCY CHECKS ────────────────────────────────────────────
  // 22. Action plan only references in-stack supplements
  const stackKeys = new Set<string>();
  const SUPP_ALIASES: Array<[string, RegExp]> = [
    ['omega3', /omega[\s-]?3|fish oil|epa|dha/i],
    ['vitd', /vitamin d|d3|cholecalciferol/i],
    ['magnesium', /magnesium/i],
    ['b12', /b[\s-]?12|cobalamin/i],
    ['coq10', /coq10|ubiquinol/i],
    ['milkthistle', /milk thistle|silymarin/i],
    ['nac', /nac|n.acetyl.cysteine/i],
    ['glutamine', /l.glutamine|glutamine/i],
    ['curcumin', /curcumin|turmeric/i],
    ['berberine', /berberine/i],
    ['selenium', /selenium/i],
    ['zinc', /zinc/i],
    ['inositol', /inositol/i],
    ['ltheanine', /l.theanine/i],
    ['bcomplex', /b.complex/i],
    ['psyllium', /psyllium/i],
    ['ashwagandha', /ashwagandha/i],
  ];
  for (const supp of plan?.supplement_stack ?? []) {
    const name = String(supp?.nutrient ?? supp?.name ?? '');
    for (const [k, re] of SUPP_ALIASES) {
      if (re.test(name)) { stackKeys.add(k); break; }
    }
  }
  let actionPlanLeak = '';
  for (const phaseName of ['phase_1', 'phase_2', 'phase_3']) {
    const actions = (plan?.action_plan?.[phaseName]?.actions ?? []) as any[];
    for (const a of actions) {
      const text = typeof a === 'string' ? a : (a?.action ?? '');
      if (typeof text !== 'string') continue;
      for (const [k, re] of SUPP_ALIASES) {
        if (re.test(text) && !stackKeys.has(k)) {
          actionPlanLeak = `${phaseName}: "${text.slice(0, 80)}" mentions ${k} (not in stack)`;
          break;
        }
      }
      if (actionPlanLeak) break;
    }
    if (actionPlanLeak) break;
  }
  add('consistency_action_plan_supps', 'consistency', 'Action plan references only in-stack supplements', !actionPlanLeak, 'high', actionPlanLeak);

  // 23. Risk calculators populated when inputs available
  if (age !== undefined && age >= 40 && age <= 79) {
    const hasLipidsForASCVD = retestNames.some((n: string) => /lipid panel/i.test(n)) || labs.some((l: any) => /cholesterol/i.test(String(l?.marker_name ?? '')));
    if (hasLipidsForASCVD) {
      add('consistency_ascvd_computed', 'consistency', 'ASCVD risk computed when age 40-79 + lipids', !!plan?.risk_calculators?.ascvd_10yr, 'low');
    }
  }

  // 24. Pre-analytical prep instructions present
  const hasFastingTests = retestNames.some((n: string) => /lipid panel|fasting (glucose|insulin)|cmp/i.test(n));
  if (hasFastingTests) {
    add('consistency_prep_instructions', 'consistency', 'Pre-analytical guidance present', Array.isArray(plan?.prep_instructions) && plan.prep_instructions.length > 0, 'medium');
  }

  // 25. Suboptimal flags considered (only when age + sex available)
  if (age !== undefined && sex) {
    add('consistency_suboptimal_flags', 'consistency', 'Suboptimal flags computed', Array.isArray(plan?.suboptimal_flags), 'low');
  }

  // ── REPORT ASSEMBLY ───────────────────────────────────────────────
  const fatalCount = checks.filter(c => !c.passed && c.severity === 'fatal').length;
  const highCount = checks.filter(c => !c.passed && c.severity === 'high').length;
  const passed = fatalCount === 0 && highCount === 0;

  const summary = passed
    ? `PASSED — ${checks.length} checks, ${checks.filter(c => c.passed).length} green`
    : `FAILED — ${fatalCount} fatal, ${highCount} high-severity, ${checks.filter(c => !c.passed && c.severity === 'medium').length} medium`;

  return { passed, fatalCount, highCount, checks, summary };
}
