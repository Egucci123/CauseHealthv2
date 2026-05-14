// markerReferenceRanges.ts
// ──────────────────────────────────────────────────────────────────────
// Canonical sex-aware clinical reference ranges. Used by:
//   - sex-aware ref check: compare extracted ref range to canonical
//     range; if they differ by > tolerance, flag (likely AI grabbed the
//     wrong sex's reference printed on the report).
//   - downstream consumers that need a sex-specific reference for
//     flagging when the lab report didn't print one.
//
// Sources: standard adult clinical reference ranges from major US
// reference labs (Quest, LabCorp, Mayo) with sex- and age-banding where
// it materially differs. Ranges are conservative midpoints — individual
// labs vary ±10% on each bound. We tolerate that variance in checks.

export type Sex = 'male' | 'female';
export type AgeBand = 'pre_meno' | 'post_meno' | null;

export interface ReferenceRange {
  low: number;
  high: number;
  unit: string;
}

interface ReferenceEntry {
  canonical_key: string;
  /** Both sexes share the ref (most CMP markers). */
  shared?: ReferenceRange;
  /** Sex-specific overrides. Falls back to `shared` if missing. */
  male?: ReferenceRange;
  /** Sex-specific. For females, supports an optional age band. */
  female?: ReferenceRange | { preMeno: ReferenceRange; postMeno: ReferenceRange };
}

const RANGES: ReferenceEntry[] = [
  // ── CBC indices — sex-aware ──────────────────────────────────────────
  { canonical_key: 'hemoglobin',
    male:   { low: 13.5, high: 17.5, unit: 'g/dL' },
    female: { low: 12.0, high: 15.5, unit: 'g/dL' } },
  { canonical_key: 'hematocrit',
    male:   { low: 41,   high: 53,   unit: '%' },
    female: { low: 36,   high: 46,   unit: '%' } },
  { canonical_key: 'rbc',
    male:   { low: 4.5,  high: 5.9,  unit: 'Million/uL' },
    female: { low: 4.0,  high: 5.2,  unit: 'Million/uL' } },

  // ── Iron studies — partially sex-aware ───────────────────────────────
  { canonical_key: 'ferritin',
    male:   { low: 30,   high: 400,  unit: 'ng/mL' },
    female: { low: 13,   high: 150,  unit: 'ng/mL' } },
  { canonical_key: 'iron',
    male:   { low: 65,   high: 175,  unit: 'mcg/dL' },
    female: { low: 50,   high: 170,  unit: 'mcg/dL' } },
  { canonical_key: 'tsat',
    male:   { low: 20,   high: 50,   unit: '%' },
    female: { low: 15,   high: 50,   unit: '%' } },

  // ── Kidney — sex-aware (muscle mass) ─────────────────────────────────
  { canonical_key: 'creatinine',
    male:   { low: 0.74, high: 1.35, unit: 'mg/dL' },
    female: { low: 0.59, high: 1.04, unit: 'mg/dL' } },

  // ── Liver — slightly sex-aware ───────────────────────────────────────
  { canonical_key: 'alt',
    male:   { low: 7,    high: 55,   unit: 'U/L' },
    female: { low: 7,    high: 45,   unit: 'U/L' } },
  { canonical_key: 'ast',
    male:   { low: 8,    high: 48,   unit: 'U/L' },
    female: { low: 8,    high: 43,   unit: 'U/L' } },
  { canonical_key: 'ggt',
    male:   { low: 8,    high: 61,   unit: 'U/L' },
    female: { low: 5,    high: 36,   unit: 'U/L' } },

  // ── Uric acid — sex-aware ────────────────────────────────────────────
  { canonical_key: 'uric_acid',
    male:   { low: 3.7,  high: 8.0,  unit: 'mg/dL' },
    female: { low: 2.7,  high: 7.3,  unit: 'mg/dL' } },

  // ── Lipid — sex-aware HDL ────────────────────────────────────────────
  { canonical_key: 'hdl',
    male:   { low: 40,   high: 100,  unit: 'mg/dL' },
    female: { low: 50,   high: 100,  unit: 'mg/dL' } },

  // ── Hormones — heavily sex-aware ─────────────────────────────────────
  { canonical_key: 'testosterone_total',
    male:   { low: 264,  high: 916,  unit: 'ng/dL' },
    female: { low: 8,    high: 60,   unit: 'ng/dL' } },
  { canonical_key: 'testosterone_free',
    male:   { low: 47,   high: 244,  unit: 'pg/mL' },
    female: { low: 0.2,  high: 5.0,  unit: 'pg/mL' } },
  { canonical_key: 'estradiol',
    male:   { low: 10,   high: 40,   unit: 'pg/mL' },
    female: { preMeno:  { low: 15, high: 350, unit: 'pg/mL' },
              postMeno: { low: 0,  high: 35,  unit: 'pg/mL' } } },
  { canonical_key: 'shbg',
    male:   { low: 14.5, high: 48.4, unit: 'nmol/L' },
    female: { preMeno:  { low: 26.1, high: 110, unit: 'nmol/L' },
              postMeno: { low: 27,   high: 128, unit: 'nmol/L' } } },
  { canonical_key: 'dhea_s',
    male:   { low: 80,   high: 560,  unit: 'mcg/dL' },
    female: { low: 35,   high: 430,  unit: 'mcg/dL' } },
  { canonical_key: 'lh',
    male:   { low: 1.7,  high: 8.6,  unit: 'mIU/mL' },
    female: { preMeno:  { low: 1.9,  high: 12.5, unit: 'mIU/mL' },
              postMeno: { low: 15.9, high: 54,   unit: 'mIU/mL' } } },
  { canonical_key: 'fsh',
    male:   { low: 1.5,  high: 12.4, unit: 'mIU/mL' },
    female: { preMeno:  { low: 3.5,  high: 12.5, unit: 'mIU/mL' },
              postMeno: { low: 25.8, high: 134.8, unit: 'mIU/mL' } } },

  // ── Markers that are NOT sex-aware in clinical practice — shared ─────
  { canonical_key: 'a1c',                shared: { low: 4.0,  high: 5.6,  unit: '%' } },
  { canonical_key: 'glucose',            shared: { low: 70,   high: 99,   unit: 'mg/dL' } },
  { canonical_key: 'tsh',                shared: { low: 0.4,  high: 4.5,  unit: 'mIU/L' } },
  { canonical_key: 'ft4',                shared: { low: 0.82, high: 1.77, unit: 'ng/dL' } },
  { canonical_key: 'ft3',                shared: { low: 2.0,  high: 4.4,  unit: 'pg/mL' } },
  { canonical_key: 'vit_d',              shared: { low: 30,   high: 100,  unit: 'ng/mL' } },
  { canonical_key: 'b12',                shared: { low: 200,  high: 1100, unit: 'pg/mL' } },
  { canonical_key: 'sodium',             shared: { low: 135,  high: 145,  unit: 'mmol/L' } },
  { canonical_key: 'potassium',          shared: { low: 3.5,  high: 5.2,  unit: 'mmol/L' } },
  { canonical_key: 'chloride',           shared: { low: 96,   high: 106,  unit: 'mmol/L' } },
  { canonical_key: 'co2',                shared: { low: 20,   high: 32,   unit: 'mmol/L' } },
  { canonical_key: 'calcium',            shared: { low: 8.6,  high: 10.3, unit: 'mg/dL' } },
  { canonical_key: 'magnesium',          shared: { low: 1.6,  high: 2.6,  unit: 'mg/dL' } },
  { canonical_key: 'phosphorus',         shared: { low: 2.5,  high: 4.5,  unit: 'mg/dL' } },
  { canonical_key: 'cholesterol_total',  shared: { low: 0,    high: 200,  unit: 'mg/dL' } },
  { canonical_key: 'ldl',                shared: { low: 0,    high: 100,  unit: 'mg/dL' } },
  { canonical_key: 'triglycerides',      shared: { low: 0,    high: 150,  unit: 'mg/dL' } },
  { canonical_key: 'albumin',            shared: { low: 3.5,  high: 5.1,  unit: 'g/dL' } },
  { canonical_key: 'protein_total',      shared: { low: 6.0,  high: 8.3,  unit: 'g/dL' } },
  { canonical_key: 'bilirubin_total',    shared: { low: 0.2,  high: 1.2,  unit: 'mg/dL' } },
  { canonical_key: 'bun',                shared: { low: 7,    high: 25,   unit: 'mg/dL' } },
  { canonical_key: 'alk_phos',           shared: { low: 36,   high: 130,  unit: 'U/L' } },
  { canonical_key: 'platelets',          shared: { low: 150,  high: 400,  unit: 'x10E3/uL' } },
  { canonical_key: 'wbc',                shared: { low: 4.0,  high: 11.0, unit: 'x10E3/uL' } },
  { canonical_key: 'mcv',                shared: { low: 80,   high: 100,  unit: 'fL' } },
  { canonical_key: 'mch',                shared: { low: 27,   high: 33,   unit: 'pg' } },
  { canonical_key: 'mchc',               shared: { low: 32,   high: 36,   unit: 'g/dL' } },
  { canonical_key: 'rdw',                shared: { low: 11.5, high: 14.5, unit: '%' } },
  { canonical_key: 'hscrp',              shared: { low: 0,    high: 3.0,  unit: 'mg/L' } },
];

/** Lookup a sex-aware reference for the given canonical key.
 *  Returns null if no canonical ref is registered for this marker. */
export function lookupReference(
  canonical_key: string,
  sex: Sex | null,
  ageBand: AgeBand = null,
): ReferenceRange | null {
  const e = RANGES.find(r => r.canonical_key === canonical_key);
  if (!e) return null;
  if (sex === 'male' && e.male) return e.male as ReferenceRange;
  if (sex === 'female' && e.female) {
    const f = e.female;
    // Discriminate the two female schemas.
    if ('preMeno' in f) {
      return ageBand === 'post_meno' ? f.postMeno : f.preMeno;
    }
    return f as ReferenceRange;
  }
  return e.shared ?? null;
}

/**
 * Compare an extracted reference range to the canonical sex-aware reference.
 *
 * Detection strategy: instead of a fixed tolerance, we compute the
 * distance from the extracted bounds to BOTH the same-sex canonical AND
 * the opposite-sex canonical. If the extracted range is meaningfully
 * closer to the opposite-sex reference, flag — that's the signature of
 * a sex-mismatch (lab report printed the wrong column). Lab-to-lab
 * variation falls within the same-sex reference because both same-sex
 * options are clinically calibrated; opposite-sex is a distinct band.
 *
 * Only fires for markers with both male AND female canonicals registered;
 * "shared" markers (TSH, A1c, etc.) never produce a sex-mismatch warning.
 */
export function sexAwareRefCheck(
  canonical_key: string,
  extractedLow: number | null | undefined,
  extractedHigh: number | null | undefined,
  sex: Sex | null,
  ageBand: AgeBand = null,
): { mismatch: false } | { mismatch: true; expected: ReferenceRange; warning: string } {
  if (extractedLow == null && extractedHigh == null) return { mismatch: false };
  if (!sex) return { mismatch: false };
  const entry = RANGES.find(r => r.canonical_key === canonical_key);
  if (!entry || !entry.male || !entry.female) return { mismatch: false };
  const same = lookupReference(canonical_key, sex, ageBand);
  const opposite = lookupReference(canonical_key, sex === 'male' ? 'female' : 'male', ageBand);
  if (!same || !opposite) return { mismatch: false };

  // L2 distance between (extractedLow, extractedHigh) and each ref's
  // (low, high). Use 0 for any missing bound.
  const distTo = (r: ReferenceRange): number => {
    const dl = (extractedLow ?? r.low) - r.low;
    const dh = (extractedHigh ?? r.high) - r.high;
    return Math.sqrt(dl * dl + dh * dh);
  };
  const dSame = distTo(same);
  const dOpposite = distTo(opposite);

  // Flag when the extracted range is materially closer to the opposite
  // sex's canonical reference. Multiplier 0.5 means "opposite is at least
  // 2x closer than same-sex" — comfortable margin that avoids false
  // positives on labs whose printed ref drifts a bit.
  if (dOpposite < dSame * 0.5) {
    return {
      mismatch: true,
      expected: same,
      warning: `Reference range mismatch for ${sex}: lab printed ${extractedLow ?? '?'}–${extractedHigh ?? '?'} which fits the opposite-sex reference (${opposite.low}–${opposite.high} ${opposite.unit}). The standard ${sex} adult ref is ${same.low}–${same.high} ${same.unit}. The lab report may have shown the wrong sex's column.`,
    };
  }
  return { mismatch: false };
}

/**
 * Run sex-aware ref checks across a list of canonicalized lab rows.
 * Mutates rows in place with `ref_mismatch_warning` when a mismatch is
 * detected. Returns the list of keys that fired.
 */
export function sexAwareRefSweep(
  values: any[],
  sex: Sex | null,
  ageBand: AgeBand = null,
): { values: any[]; mismatched: string[] } {
  const mismatched: string[] = [];
  if (!sex) return { values, mismatched };
  for (const row of values) {
    if (!row.canonical_key) continue;
    const result = sexAwareRefCheck(
      row.canonical_key,
      row.standard_low != null ? Number(row.standard_low) : null,
      row.standard_high != null ? Number(row.standard_high) : null,
      sex,
      ageBand,
    );
    if (result.mismatch) {
      row.ref_mismatch_warning = result.warning;
      row.canonical_ref_low = result.expected.low;
      row.canonical_ref_high = result.expected.high;
      mismatched.push(row.canonical_key);
    }
  }
  return { values, mismatched };
}
