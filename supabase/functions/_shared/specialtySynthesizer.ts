// supabase/functions/_shared/specialtySynthesizer.ts
//
// Layer F — cross-specialty synthesizer. UNIVERSAL: tag every finding with
// which medical specialty would normally see it, then surface what NO
// single specialist would catch.
//
// Doctors are siloed. Endo sees TSH. Cardio sees LDL. Gyn sees FSH. GP
// sees the symptom list. NO ONE looks at all four and says "these are the
// same problem." CauseHealth does. That's the moat.
//
// Universal: every finding (adequacy flag, causal node, retest entry)
// declares its `specialty` tag — synthesis happens automatically by
// counting how many specialty silos a patient's findings span.

import { CausalChain } from './causalChainBuilder.ts';
import { AdequacyFlag } from './replacementTherapyChecks.ts';

export type Specialty =
  | 'endo'        // endocrinology — thyroid, hormones, diabetes
  | 'cardio'      // cardiology — lipids, BP, heart
  | 'gyn'         // gynecology — menopause, PCOS, female hormones
  | 'gi'          // gastroenterology — IBD, IBS, celiac
  | 'rheum'       // rheumatology — lupus, RA, autoimmune
  | 'sleep'       // sleep medicine
  | 'nephro'      // nephrology — CKD
  | 'derm'        // dermatology — psoriasis
  | 'urology'     // urology — TRT, BPH (males)
  | 'gp'          // primary care
  | 'mental'      // psychiatry — depression / anxiety
  | 'neuro';      // neurology — MS, migraine

interface SpecialtyTaggedFinding {
  source: 'adequacy' | 'causal_root' | 'condition' | 'medication';
  key: string;
  label: string;
  specialty: Specialty;
}

// Map adequacy keys to specialties (which doctor would manage that drug)
const ADEQUACY_SPECIALTY: Record<string, Specialty> = {
  thyroid_replacement_tsh_high: 'endo',
  thyroid_replacement_tsh_low: 'endo',
  trt_hematocrit_high: 'urology',
  glycemic_tighter_control_high: 'endo',
  glycemic_basic_control_high: 'endo',
  ace_arb_potassium_high: 'cardio',
  ace_arb_potassium_low: 'cardio',
  diuretic_potassium_low: 'cardio',
  statin_liver_high: 'cardio',
  dhea_not_converting: 'endo',
};

// Map causal-chain root keys to specialties
const CAUSAL_ROOT_SPECIALTY: Record<string, Specialty> = {
  under_replaced_thyroid: 'endo',
  postmenopause: 'gyn',
  insulin_resistance: 'endo',
  sleep_deprivation: 'sleep',
  autoimmune_activity: 'rheum',     // rheum if dx-tier; could also be gi/endo/derm
};

// Map condition keys to specialties (registry-level — could move to conditionAliases.ts later)
const CONDITION_SPECIALTY: Record<string, Specialty> = {
  hashimotos: 'endo',
  graves: 'endo',
  ibd: 'gi',
  t2d: 'endo',
  pcos: 'gyn',
  hypertension: 'cardio',
  ckd: 'nephro',
  cad: 'cardio',
  lupus: 'rheum',
  ra: 'rheum',
  osteoporosis: 'endo',
  hyperlipidemia: 'cardio',
  nafld: 'gi',
  celiac: 'gi',
  ms: 'neuro',
  fibromyalgia: 'rheum',
  endometriosis: 'gyn',
  menopause_postmenopause: 'gyn',
  low_testosterone_male: 'urology',
  depression: 'mental',
  anxiety: 'mental',
  sleep_apnea: 'sleep',
  migraine: 'neuro',
  asthma: 'gp',
  psoriasis: 'derm',
  long_covid: 'gp',
  gerd: 'gi',
  ibs: 'gi',
  sjogrens: 'rheum',
  gout: 'rheum',
  afib: 'cardio',
  familial_hypercholesterolemia: 'cardio',
};

const SPECIALTY_LABELS: Record<Specialty, string> = {
  endo: 'Endocrinologist',
  cardio: 'Cardiologist',
  gyn: 'Gynecologist',
  gi: 'Gastroenterologist',
  rheum: 'Rheumatologist',
  sleep: 'Sleep specialist',
  nephro: 'Nephrologist',
  derm: 'Dermatologist',
  urology: 'Urologist',
  gp: 'Primary care',
  mental: 'Psychiatrist / therapist',
  neuro: 'Neurologist',
};

export interface SynthesisInput {
  adequacyFlags: AdequacyFlag[];
  causalChain: CausalChain;
  /** Condition keys the user matched (from pathwayResult). */
  conditionKeys: string[];
}

export interface SpecialtySynthesis {
  /** All findings, tagged by specialty. */
  findings: SpecialtyTaggedFinding[];
  /** How many specialty silos are involved. */
  specialtyCount: number;
  /** Specialties spanned. */
  specialties: Specialty[];
  /** Plain-English synthesis line — what no single specialist sees. */
  synthesis: string;
  /** Per-specialty grouped breakdown for UI. */
  bySpecialty: Array<{ specialty: Specialty; specialtyLabel: string; findings: SpecialtyTaggedFinding[] }>;
}

export function synthesizeAcrossSpecialties(input: SynthesisInput): SpecialtySynthesis {
  const findings: SpecialtyTaggedFinding[] = [];

  for (const f of input.adequacyFlags) {
    const sp = ADEQUACY_SPECIALTY[f.key];
    if (sp) findings.push({ source: 'adequacy', key: f.key, label: f.title, specialty: sp });
  }
  for (const node of input.causalChain.nodes) {
    if (node.layer !== 1) continue;     // root causes only
    const sp = CAUSAL_ROOT_SPECIALTY[node.key];
    if (sp) findings.push({ source: 'causal_root', key: node.key, label: node.label, specialty: sp });
  }
  for (const k of input.conditionKeys) {
    const sp = CONDITION_SPECIALTY[k];
    if (sp) findings.push({ source: 'condition', key: k, label: k, specialty: sp });
  }

  // Dedupe by key (same finding might appear from multiple sources)
  const seen = new Set<string>();
  const unique = findings.filter(f => {
    if (seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });

  const specialtySet = new Set<Specialty>(unique.map(f => f.specialty));
  const specialties = [...specialtySet];

  const bySpecialty = specialties.map(specialty => ({
    specialty,
    specialtyLabel: SPECIALTY_LABELS[specialty],
    findings: unique.filter(f => f.specialty === specialty),
  }));

  let synthesis = '';
  if (specialties.length >= 3) {
    const labels = specialties.map(s => SPECIALTY_LABELS[s]);
    synthesis = `Your findings span ${specialties.length} medical specialties: ${labels.join(', ')}. Each one of those doctors would see only their slice — none of them would synthesize all ${unique.length} findings together. That synthesis is what this plan is for.`;
  } else if (specialties.length === 2) {
    synthesis = `Your findings cross ${SPECIALTY_LABELS[specialties[0]]} and ${SPECIALTY_LABELS[specialties[1]]} territory — typically two separate appointments, no shared visibility.`;
  } else if (specialties.length === 1) {
    synthesis = `Findings concentrated in ${SPECIALTY_LABELS[specialties[0]]} territory — straightforward referral path.`;
  }

  return {
    findings: unique,
    specialtyCount: specialties.length,
    specialties,
    synthesis,
    bySpecialty,
  };
}

/** Render block for the prompt. */
export function renderSynthesisForPrompt(s: SpecialtySynthesis): string {
  if (s.specialtyCount < 2) return '';
  const lines: string[] = ['CROSS-SPECIALTY SYNTHESIS — these findings span multiple medical silos. The user pays $19 to see what no single doctor connects:'];
  for (const g of s.bySpecialty) {
    lines.push(`  ${g.specialtyLabel} would see: ${g.findings.map(f => f.label).join('; ')}`);
  }
  lines.push(`SYNTHESIS LINE FOR THE SUMMARY: "${s.synthesis}"`);
  return lines.join('\n');
}
