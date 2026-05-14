// markerDisambiguator.ts
// ──────────────────────────────────────────────────────────────────────
// Some marker names are ambiguous on their own — the right canonical
// resolution depends on (unit + value range). This module runs AFTER
// initial canonicalization and PROMOTES rows to their correct canonical
// when units + value tell a different story.
//
// Worked example
// ──────────────
// AI returns:  { marker_name: "Calcium", value: 1.18, unit: "mmol/L" }
// canonicalize() maps "Calcium" → canonical 'calcium' (Total Calcium, mg/dL, ref 8.6-10.3).
// Engine then sees 1.18 mg/dL and screams "critical hypocalcemia."
// In reality, value 1.18 + unit mmol/L is IONIZED calcium (ref 1.0-1.3, normal).
// The disambiguator looks at the (unit, value) tuple and promotes the row to
// canonical_key='calcium_ionized'.
//
// Each rule:
//   1. Matches when the row already has a particular canonical_key (the
//      "ambiguous default" that earlier matching landed on).
//   2. Checks the unit + value range.
//   3. If both signals point at a sibling canonical, rewrites the row.

import { canonicalize, MARKERS } from './markerCanonical.ts';

interface MaybeLab {
  marker_name?: string;
  canonical_key?: string;
  canonical_name?: string;
  canonical_category?: string;
  value?: number | string | null;
  unit?: string | null;
  disambiguation_note?: string;
}

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normUnit(u: string | null | undefined): string {
  return (u || '').toLowerCase().replace(/\s+/g, '').replace(/[µμ]/g, 'u');
}

interface DisambigRule {
  /** Human-readable rule name (used in disambiguation_note). */
  name: string;
  /** Run on rows that currently resolve to this canonical key. */
  fromKey: string;
  /** Run the rule; mutate the row in place to promote it, return true if promoted. */
  run: (row: MaybeLab) => boolean;
}

/** Helper: rewrite a row to a new canonical key. Looks up the canonical
 *  entry from the registry so name + category stay consistent. */
function promote(row: MaybeLab, newKey: string, reason: string) {
  const entry = MARKERS.find(m => m.key === newKey);
  if (!entry) return false;
  const oldName = row.canonical_name ?? row.marker_name ?? '?';
  row.canonical_key = entry.key;
  row.canonical_name = entry.canonical;
  row.canonical_category = entry.category;
  row.disambiguation_note = `Reclassified from "${oldName}" to "${entry.canonical}" because ${reason}.`;
  return true;
}

const RULES: DisambigRule[] = [
  // ── Calcium total (mg/dL) vs ionized (mmol/L) ───────────────────────
  // Total Calcium ref ~8.6-10.3 mg/dL. Ionized ref ~1.0-1.3 mmol/L.
  // Unit mmol/L OR value < 3 → ionized.
  {
    name: 'calcium_total_to_ionized_via_unit',
    fromKey: 'calcium',
    run: (row) => {
      const u = normUnit(row.unit);
      const v = num(row.value);
      const looksIonized = u === 'mmol/l' || (v != null && v > 0 && v < 3);
      if (looksIonized) return promote(row, 'calcium_ionized',
        `unit "${row.unit ?? '?'}" and value ${v ?? '?'} match ionized calcium reference range (1.0–1.3 mmol/L), not total calcium (mg/dL)`);
      return false;
    },
  },

  // ── Magnesium serum (mg/dL) vs RBC (mg/dL but row prefix "RBC") ─────
  // Can't disambiguate purely on unit (both mg/dL). Value range differs:
  // serum 1.6-2.6 mg/dL; RBC magnesium 4.2-6.8 mg/dL. If the row landed
  // on canonical 'magnesium' but value > 3.5 AND the original name hints
  // at RBC, promote. Most labs label it as "RBC Magnesium" so this is a
  // long-tail catch.
  {
    name: 'magnesium_to_rbc_via_value',
    fromKey: 'magnesium',
    run: (row) => {
      const v = num(row.value);
      const name = (row.marker_name ?? '').toLowerCase();
      const rbcHint = /\brbc\b|\bred\s*cell\b|\bintracellular\b/.test(name);
      if (rbcHint && v != null && v > 3.5) return promote(row, 'magnesium_rbc',
        `value ${v} mg/dL is in the RBC magnesium range (4.2–6.8), and marker name "${row.marker_name}" hints at intracellular measurement`);
      return false;
    },
  },

  // ── Iron vs Iron Saturation (TSat) by unit ──────────────────────────
  // Iron ref ~50-195 mcg/dL (or ug/dL). TSat ref ~20-48 %.
  // If the row landed on iron but unit is % or value <= 100 with %-range, → TSat.
  {
    name: 'iron_to_tsat_via_unit',
    fromKey: 'iron',
    run: (row) => {
      const u = normUnit(row.unit);
      const v = num(row.value);
      if (u === '%' || (u === '' && v != null && v >= 5 && v <= 100 && /sat/i.test(row.marker_name ?? '')))
        return promote(row, 'tsat',
          `unit "${row.unit ?? '?'}" and value ${v ?? '?'} match transferrin saturation (%), not serum iron (mcg/dL)`);
      return false;
    },
  },

  // ── Glucose generic → Fasting / Random / OGTT via name hints ────────
  // canonicalize() resolves "Glucose, Serum (fasting)" to plain glucose because
  // the fasting hint is in parentheses. If the AI-supplied name contains
  // "fasting" anywhere, promote.
  {
    name: 'glucose_to_fasting_via_name',
    fromKey: 'glucose',
    run: (row) => {
      const name = (row.marker_name ?? '').toLowerCase();
      if (/\bfasting\b/.test(name) && !/random|ogtt|tolerance|post.?prandial|2.?hr|2.?hour/.test(name))
        return promote(row, 'glucose_fasting',
          `marker name "${row.marker_name}" contains "fasting"`);
      return false;
    },
  },

  // ── B12 unit anomaly (rare lab reports in pmol/L) ───────────────────
  // B12 default is pg/mL (200-1100). Some international panels report
  // pmol/L (148-815). If unit is pmol/L, the value is plausible at a
  // very different range — annotate so plausibility doesn't false-flag,
  // BUT we don't promote (it's still B12); we flip the row's unit and
  // mathematically convert.
  {
    name: 'b12_unit_convert_pmol_to_pgml',
    fromKey: 'b12',
    run: (row) => {
      const u = normUnit(row.unit);
      const v = num(row.value);
      if (u === 'pmol/l' && v != null) {
        // 1 pmol/L B12 = 1.355 pg/mL
        const converted = v * 1.355;
        row.value = Math.round(converted);
        row.unit = 'pg/mL';
        row.disambiguation_note = `Converted from ${v} pmol/L to ${Math.round(converted)} pg/mL (US conventional unit). 1 pmol/L = 1.355 pg/mL.`;
        return true;
      }
      return false;
    },
  },

  // ── Vit D unit anomaly (rare nmol/L) ────────────────────────────────
  // US convention: ng/mL (20-100). International: nmol/L (50-250).
  // If unit looks like nmol/L, convert. 1 ng/mL = 2.496 nmol/L.
  {
    name: 'vit_d_unit_convert_nmol_to_ngml',
    fromKey: 'vit_d',
    run: (row) => {
      const u = normUnit(row.unit);
      const v = num(row.value);
      if (u === 'nmol/l' && v != null) {
        const converted = v / 2.496;
        row.value = Math.round(converted * 10) / 10;
        row.unit = 'ng/mL';
        row.disambiguation_note = `Converted from ${v} nmol/L to ${row.value} ng/mL (US conventional unit). nmol/L ÷ 2.496 = ng/mL.`;
        return true;
      }
      return false;
    },
  },
];

/**
 * Run all disambiguation rules over a list of canonicalized lab rows.
 * Mutates rows in place when a rule promotes (rewrites canonical) or
 * converts (rewrites unit + value). Returns the list of rules that fired.
 */
export function disambiguateMarkers(values: any[]): { values: any[]; rulesFired: string[] } {
  const fired: string[] = [];
  for (const row of values as MaybeLab[]) {
    if (!row.canonical_key) {
      // Re-derive in case caller hasn't enriched yet.
      const c = canonicalize(row.marker_name ?? '');
      if (c) {
        row.canonical_key = c.key;
        row.canonical_name = c.canonical;
        row.canonical_category = c.category;
      }
    }
    if (!row.canonical_key) continue;
    for (const rule of RULES) {
      if (rule.fromKey !== row.canonical_key) continue;
      try {
        if (rule.run(row)) {
          fired.push(rule.name);
          // After a promotion, re-check rules — chained promotions are
          // rare but possible (rule may now match new canonical_key).
        }
      } catch (e) {
        console.warn(`[disambiguator] rule ${rule.name} threw:`, (e as Error).message);
      }
    }
  }
  return { values, rulesFired: fired };
}
