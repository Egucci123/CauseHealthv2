// supabase/functions/_shared/suppressRedundantTests.ts
//
// Universal post-process filter: drop a recommended test from the panel
// when every constituent marker is ALREADY measured AND every value is
// normal/healthy. Keeps the test if ANY component is abnormal (recheck
// warranted) or any component is missing (the test fills a gap).
//
// Real-user audit case (Marisa, 27F): the engine recommended CMP, CBC,
// Lipid Panel, A1c, Vitamin D, Fasting Insulin, B12 Workup — all of
// which she had measured and ALL of which were in range. Patient brought
// the list to her PCP only to be told "you just had all these." Wastes
// the appointment, makes the engine look lazy, undermines the credibility
// of the genuinely-new tests (TPO antibodies, Cystatin-C, RBC Mg) that
// SHOULD be ordered.
//
// Universal rule:
//   - Map each test_key to its constituent marker patterns
//   - For each candidate test: check the user's labs
//   - If ALL constituent markers are present AND every value is normal
//     → drop the test
//   - If ANY component is abnormal OR ANY component is missing
//     → keep the test

import type { TestOrder } from './rules/testRules.ts';

interface LabSnapshot {
  marker_name: string;
  value: number | string | null;
  optimal_flag: string | null;
  standard_flag?: string | null;
}

/**
 * Map test_key (from retest registry) to the marker patterns it covers.
 * If ALL of these markers are measured + normal in the user's labs, the
 * test is redundant and gets dropped.
 *
 * Universal: applies to every patient. Adding a row covers a new test.
 */
interface TestComponentMap {
  testKeyPattern: RegExp;     // matches test.key (canonical id)
  /** Components that MUST be measured + normal to drop the test.
   *  If ANY essential is missing OR abnormal, keep the test. */
  essential: RegExp[];
  /** Components that are nice-to-have. If present, they must be normal too,
   *  but their absence doesn't keep the test. Empty array = no nice-to-have. */
  supplementary?: RegExp[];
  description: string;
}

const TEST_COMPONENT_MAP: TestComponentMap[] = [
  {
    testKeyPattern: /^cmp$|comprehensive_metabolic|^metabolic_panel/i,
    // Real-world CMPs always include these. If a lab omits one of these,
    // the user IS missing a key data point and the recheck is justified.
    essential: [
      /^glucose\b(?!.*(?:tolerance|post|random|gtt|\bhr\b|\bpp\b|2[-\s]?hr|1[-\s]?hr))/i,
      /^bun\b|urea nitrogen/i,
      /^creatinine\b/i,
      /^sodium|^sodio/i,
      /^potassium|^potasio/i,
      /^calcium|^calcio/i,
      /\balt\b|sgpt|alanin/i,
      /\bast\b|sgot|aspart/i,
    ],
    supplementary: [
      /\begfr\b|estimated.?glomerular/i,
      /^chloride|^cloruro/i,
      /^albumin/i,
      /^protein.?total|^total protein/i,
      /^alkaline\s*phosphatase|^alk\s*phos|^alp\b/i,
      /^bilirubin.*total\b|^total.*bilirubin\b/i,
    ],
    description: 'CMP',
  },
  {
    testKeyPattern: /^cbc$|complete_blood_count|^cbc_w_diff/i,
    // Core 4 — every CBC reports these.
    essential: [
      /^wbc\b|white blood cell/i,
      /^hemoglobin\b(?!\s*a1c)|^hgb\b/i,
      /^hematocrit\b|^hct\b/i,
      /^platelets?\b/i,
    ],
    // Often included but not always — MCV/MCH/MCHC/RDW depend on lab format.
    supplementary: [
      /^rbc\b|red blood cell/i,
      /^mcv\b/i,
      /^mch\b/i,
      /^mchc\b/i,
      /^rdw\b/i,
    ],
    description: 'CBC',
  },
  {
    testKeyPattern: /^lipid_panel$|^lipid_panel_basic/i,
    essential: [
      /total\s+cholesterol|^cholesterol(?:,?\s+total)?\b/i,
      /(?<!v)\bldl\b|(?<!v)ldl cholesterol/i,
      /(?<!non[-\s]?)\bhdl\b|(?<!non[-\s]?)hdl cholesterol/i,
      /triglyc/i,
    ],
    description: 'Lipid Panel',
  },
  {
    testKeyPattern: /^hba1c$|^hemoglobin_a1c|^a1c$/i,
    essential: [/hemoglobin a1c|\ba1c\b|\bhba1c\b/i],
    description: 'Hemoglobin A1c',
  },
  {
    testKeyPattern: /^thyroid_panel$|^tsh_ft4_ft3/i,
    // Drop only if BOTH TSH and Free T4 are measured + normal. Free T3
    // is gravy — many panels skip it.
    essential: [/^tsh\b/i, /free\s*t4|t4,?\s*free|tiroxina libre/i],
    supplementary: [/free\s*t3|t3,?\s*free|triyodotironina libre/i],
    description: 'Thyroid Panel',
  },
  {
    testKeyPattern: /^vit_d_25oh$|^vitamin_d|^25_oh_vitamin_d/i,
    essential: [/\b(?:vitamin d|vitamina d|25.?hydroxy|25.?oh|calcidiol)\b/i],
    description: 'Vitamin D 25-OH',
  },
  {
    testKeyPattern: /^fasting_insulin|^homa_ir|^fasting_insulin_homa/i,
    essential: [/^insulin\b|fasting insulin/i],
    description: 'Fasting Insulin',
  },
  {
    testKeyPattern: /^vit_b12_workup|^b12_workup/i,
    // Drop only if BOTH serum B12 AND MMA AND homocysteine are measured + normal.
    // If just serum B12 is normal but MMA/Hcy unmeasured, KEEP — functional
    // deficiency can hide behind a normal serum B12.
    essential: [/\b(?:vitamin b.?12|b.?12|cobalamin)\b/i, /mma\b|methylmalonic/i, /homocysteine/i],
    description: 'B12 Workup (serum + MMA + Hcy)',
  },
];

/** Lowercase normalized marker name → value + flag, for fast lookup. */
function indexLabs(labs: LabSnapshot[]): Map<string, { value: number | string | null; flag: string }> {
  const map = new Map<string, { value: number | string | null; flag: string }>();
  for (const l of labs) {
    const name = String(l.marker_name ?? '').toLowerCase().trim();
    if (!name) continue;
    const flag = String(l.optimal_flag ?? l.standard_flag ?? '').toLowerCase();
    map.set(name, { value: l.value, flag });
  }
  return map;
}

/** A marker is "normal" if optimal_flag is one of these (NOT high / low / watch / critical). */
const NORMAL_FLAGS = new Set(['normal', 'healthy', 'optimal']);

function findComponent(labs: LabSnapshot[], pattern: RegExp): LabSnapshot | null {
  for (const l of labs) {
    if (pattern.test(String(l.marker_name ?? ''))) return l;
  }
  return null;
}

/**
 * Filter a test panel against user labs. Returns:
 *   - kept: tests that are not redundant
 *   - suppressed: tests that were dropped (with reason)
 */
export function suppressRedundantTests(
  tests: TestOrder[],
  labs: LabSnapshot[],
): { kept: TestOrder[]; suppressed: Array<{ test: TestOrder; reason: string }> } {
  const kept: TestOrder[] = [];
  const suppressed: Array<{ test: TestOrder; reason: string }> = [];

  for (const t of tests) {
    const map = TEST_COMPONENT_MAP.find(m => m.testKeyPattern.test(t.key));
    if (!map) { kept.push(t); continue; }

    // Rule: drop the test when EVERY essential component is measured AND
    // normal, AND every supplementary that IS measured is also normal.
    // If any essential is missing OR any present component is abnormal,
    // keep the test.
    let keep = false;
    let abnormalSeen = false;
    let missingEssential = false;
    for (const p of map.essential) {
      const found = findComponent(labs, p);
      if (!found) { missingEssential = true; break; }
      const flag = String(found.optimal_flag ?? found.standard_flag ?? '').toLowerCase();
      if (!NORMAL_FLAGS.has(flag)) { abnormalSeen = true; break; }
    }
    if (!missingEssential && !abnormalSeen) {
      for (const p of (map.supplementary ?? [])) {
        const found = findComponent(labs, p);
        if (!found) continue; // supplementary absence is fine
        const flag = String(found.optimal_flag ?? found.standard_flag ?? '').toLowerCase();
        if (!NORMAL_FLAGS.has(flag)) { abnormalSeen = true; break; }
      }
    }
    keep = missingEssential || abnormalSeen;

    if (keep) {
      kept.push(t);
    } else {
      suppressed.push({ test: t, reason: `${map.description} — all components already measured and in range; rechecking adds no signal` });
    }
  }

  return { kept, suppressed };
}
