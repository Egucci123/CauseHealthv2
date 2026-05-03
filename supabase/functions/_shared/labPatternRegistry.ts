// supabase/functions/_shared/labPatternRegistry.ts
//
// Lab-pattern registry. Universal: when specific lab values exceed defined
// thresholds AND no condition/dx covers it, treat the pattern as a
// first-class "condition" with its own pathwayHints (tests + supplements).
//
// The Nona Lynn case that exposed this: hs-CRP 2.2 (critical high) but no
// autoimmune dx → no condition pathway fired, so no curcumin / no specific
// anti-inflammatory protocol was injected. The plan said "inflammation"
// but had nothing dedicated to lowering it.
//
// Same pattern would happen to any patient with elevated LDL-P alone, high
// triglycerides without diabetes, prediabetic A1c without dx, elevated uric
// acid without gout, etc. Each gets its own pathway here.
//
// Adding a pattern = pushing one row. The pathway engine consumes this
// registry the same way it consumes conditions/meds/symptoms.

export interface LabPatternDef {
  /** Stable id. */
  key: string;
  /** Plain-English label. */
  label: string;
  /** Detection logic — returns evidence string when fired, null otherwise. */
  detect: (labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null; optimal_flag?: string | null }>) => string | null;
  /** Required tests to inject (canonical retest registry keys). */
  requiredTests?: string[];
  /** Required supplements to inject (canonical supplement registry keys). */
  requiredSupplements?: string[];
}

// Helper: pull numeric marker value matching ANY pattern.
function mark(labs: any[], patterns: RegExp[]): { value: number; flag: string } | null {
  for (const v of labs) {
    const name = String(v.marker_name ?? '');
    if (patterns.some(re => re.test(name))) {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      if (Number.isFinite(num)) return { value: num, flag: (v.optimal_flag ?? '').toLowerCase() };
    }
  }
  return null;
}

export const LAB_PATTERNS: LabPatternDef[] = [
  // ── Elevated inflammation (hs-CRP) ────────────────────────────────────
  // Universal: any patient with hs-CRP >= 1.0 mg/L gets the
  // anti-inflammatory pathway, regardless of whether they have an
  // autoimmune dx. Curcumin is empirically supported (Cochrane etc.) for
  // CRP reduction; safe for most patients (caution: blood thinner mild
  // effect, gallstone caution).
  {
    key: 'elevated_inflammation',
    label: 'Elevated systemic inflammation',
    detect: (labs) => {
      const crp = mark(labs, [/hs[-\s]?crp/i, /c[-\s]?reactive protein/i]);
      if (crp && crp.value >= 1.0) return `hs-CRP ${crp.value} mg/L`;
      return null;
    },
    requiredTests: ['hs_crp', 'glyca'],
    requiredSupplements: ['curcumin', 'omega_3'],
  },

  // ── Atherogenic lipid pattern ────────────────────────────────────────
  // Trigger: LDL-P high OR small LDL-P high OR low Large HDL-P. Universal
  // for anyone with these without statin dx.
  {
    key: 'atherogenic_lipid_pattern',
    label: 'Atherogenic lipid pattern (small dense LDL / low HDL particles)',
    detect: (labs) => {
      const ldlp = mark(labs, [/^ldl p\b/i, /ldl particle/i]);
      const smallLdlP = mark(labs, [/small ldl p/i]);
      const largeHdlP = mark(labs, [/large hdl p/i]);
      const apoB = mark(labs, [/^apolipoprotein b/i, /^apob\b/i]);
      const triggers: string[] = [];
      if (ldlp && (ldlp.value > 1100 || ldlp.flag.includes('high'))) triggers.push(`LDL-P ${ldlp.value}`);
      if (smallLdlP && (smallLdlP.value > 467 || smallLdlP.flag.includes('high'))) triggers.push(`small LDL-P ${smallLdlP.value}`);
      if (largeHdlP && (largeHdlP.value < 7.2 || largeHdlP.flag.includes('low'))) triggers.push(`Large HDL-P ${largeHdlP.value}`);
      if (apoB && (apoB.value > 90 || apoB.flag.includes('high'))) triggers.push(`ApoB ${apoB.value}`);
      return triggers.length > 0 ? triggers.join(', ') : null;
    },
    requiredTests: ['lipid_panel_extended', 'apob', 'lp_a', 'cac_score'],
    requiredSupplements: ['bergamot', 'omega_3'],
  },

  // ── High triglycerides (no diabetes dx) ─────────────────────────────
  {
    key: 'elevated_triglycerides',
    label: 'Elevated triglycerides',
    detect: (labs) => {
      const tg = mark(labs, [/^triglycerid/i, /^tg$/i]);
      if (tg && tg.value > 150) return `Triglycerides ${tg.value} mg/dL`;
      return null;
    },
    requiredTests: ['lipid_panel_extended', 'fasting_insulin_homa_ir'],
    requiredSupplements: ['omega_3'],
  },

  // ── Prediabetes (A1c 5.7–6.4 without diabetes dx) ────────────────────
  {
    key: 'prediabetic_a1c',
    label: 'Prediabetic glucose pattern',
    detect: (labs) => {
      const a1c = mark(labs, [/hemoglobin a1c/i, /^a1c\b/i, /^hba1c/i]);
      if (a1c && a1c.value >= 5.7 && a1c.value < 6.5) return `A1c ${a1c.value}%`;
      return null;
    },
    requiredTests: ['fasting_insulin_homa_ir', 'uacr', 'lipid_panel'],
    requiredSupplements: ['berberine'],
  },

  // ── Elevated uric acid (no gout dx) ──────────────────────────────────
  {
    key: 'hyperuricemia',
    label: 'Elevated uric acid',
    detect: (labs) => {
      const ua = mark(labs, [/uric acid/i]);
      if (ua && ua.value > 6.5) return `Uric Acid ${ua.value} mg/dL`;
      return null;
    },
    requiredTests: ['uric_acid', 'kidney_function'],
    // No specific supplement — primary fix is dietary (lower fructose, alcohol)
  },

  // ── Polycythemia pattern (high RBC/Hct without TRT) ──────────────────
  {
    key: 'polycythemia_pattern',
    label: 'Elevated red cell mass (polycythemia pattern)',
    detect: (labs) => {
      const rbc = mark(labs, [/^red blood cell/i, /^rbc\b/i]);
      const hct = mark(labs, [/^hematocrit/i, /^hct\b/i]);
      const rbcHigh = rbc && (rbc.value > 5.5 || rbc.flag.includes('high'));
      const hctHigh = hct && (hct.value > 50 || hct.flag.includes('high'));
      if (rbcHigh && hctHigh) return `RBC ${rbc!.value}, Hct ${hct!.value}`;
      if (hctHigh) return `Hct ${hct!.value}`;
      return null;
    },
    requiredTests: ['cbc', 'jak2_screen_if_persistent'],
  },

  // ── Low vitamin D (severe — <30 ng/mL) ───────────────────────────────
  {
    key: 'vitamin_d_deficient',
    label: 'Vitamin D deficiency',
    detect: (labs) => {
      const d = mark(labs, [/^vitamin d\b/i, /25[-\s]?(oh|hydroxy)/i]);
      if (d && d.value < 30) return `Vitamin D ${d.value} ng/mL`;
      return null;
    },
    requiredTests: ['vit_d_25oh', 'pth'],
    requiredSupplements: ['vit_d_3'],
  },

  // ── Elevated liver enzymes (no statin dx) ────────────────────────────
  // (statin + ALT high is handled by adequacy check; this is the lab-only path)
  {
    key: 'elevated_liver_enzymes',
    label: 'Elevated liver enzymes',
    detect: (labs) => {
      const alt = mark(labs, [/^alt$/i, /^sgpt/i]);
      const ast = mark(labs, [/^ast$/i, /^sgot/i]);
      const altHigh = alt && (alt.value > 40 || alt.flag.includes('high'));
      const astHigh = ast && (ast.value > 40 || ast.flag.includes('high'));
      if (altHigh && astHigh) return `ALT ${alt!.value}, AST ${ast!.value}`;
      if (altHigh) return `ALT ${alt!.value}`;
      if (astHigh) return `AST ${ast!.value}`;
      return null;
    },
    requiredTests: ['liver_panel', 'ggt', 'liver_ultrasound'],
    requiredSupplements: ['milk_thistle'],
  },
];

export interface LabPatternDetection {
  key: string;
  label: string;
  evidence: string;
  requiredTests: string[];
  requiredSupplements: string[];
}

export function detectLabPatterns(
  labValues: Array<{ marker_name?: string; value?: number | string | null; unit?: string | null; optimal_flag?: string | null }>
): LabPatternDetection[] {
  const out: LabPatternDetection[] = [];
  for (const p of LAB_PATTERNS) {
    const ev = p.detect(labValues);
    if (!ev) continue;
    out.push({
      key: p.key,
      label: p.label,
      evidence: ev,
      requiredTests: p.requiredTests ?? [],
      requiredSupplements: p.requiredSupplements ?? [],
    });
  }
  return out;
}
