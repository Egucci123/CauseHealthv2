// supabase/functions/_shared/rules/riskCalculators.ts
//
// Deterministic risk-calculator orchestrator. Wraps the existing pure
// calculators in `clinicalCalculators.ts` and applies them only when the
// required inputs are available.

import {
  computeASCVDRisk,
  computeFIB4,
  computeHOMAIR,
  computeTGHDLRatio,
} from '../clinicalCalculators.ts';
import type { LabValue } from '../buildPlan.ts';

export interface RiskCalculatorBundle {
  ascvd_10yr: { value: number; category: string; missingInputs?: string[] } | null;
  fib4: { value: number; category: string } | null;
  homa_ir: { value: number; category: string } | null;
  tg_hdl_ratio: { value: number; category: string } | null;
}

interface Input {
  labs: LabValue[];
  age: number | null;
  sex: 'male' | 'female' | null;
  conditionsLower: string;
  medsLower: string;
}

const TYPE_BY_MARKER = (markers: RegExp): ((labs: LabValue[]) => number | null) =>
  (labs) => {
    for (const l of labs) {
      if (markers.test(l.marker)) {
        const n = typeof l.value === 'number' ? l.value : Number(l.value);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

const totalCholFrom = TYPE_BY_MARKER(/total\s*cholesterol|^cholesterol$/i);
const hdlFrom = TYPE_BY_MARKER(/^hdl$|hdl[\s-]*c/i);
const tgFrom = TYPE_BY_MARKER(/triglyceride/i);
const altFrom = TYPE_BY_MARKER(/^alt$|sgpt/i);
const astFrom = TYPE_BY_MARKER(/^ast$|sgot/i);
const plateletsFrom = TYPE_BY_MARKER(/platelet/i);
const glucoseFrom = TYPE_BY_MARKER(/^glucose|fasting glucose/i);
const insulinFrom = TYPE_BY_MARKER(/fasting insulin|^insulin$/i);
const sbpFrom = TYPE_BY_MARKER(/systolic|sbp/i);

export function computeAllRiskCalculators(input: Input): RiskCalculatorBundle {
  const { labs, age, sex } = input;

  const tc = totalCholFrom(labs);
  const hdl = hdlFrom(labs);
  const tg = tgFrom(labs);
  const alt = altFrom(labs);
  const ast = astFrom(labs);
  const platelets = plateletsFrom(labs);
  const glucose = glucoseFrom(labs);
  const insulin = insulinFrom(labs);
  const sbp = sbpFrom(labs);

  const isSmoker = /smoke|smoking|tobacco|nicotine/i.test(input.conditionsLower);
  const hasDiabetes = /\b(diabetes|t2d|t1d|dm)\b/i.test(input.conditionsLower);
  const onBpMeds = /lisinopril|losartan|amlodipine|metoprolol|atenolol|hctz|hydrochlorothiazide|valsartan|irbesartan/.test(input.medsLower);

  const ascvd = (age && sex && tc && hdl && sbp)
    ? computeASCVDRisk({
        age, sex, totalCholesterol: tc, hdl, systolicBP: sbp,
        onBpMeds, isSmoker, hasDiabetes,
      })
    : null;

  const fib4 = (age && alt && ast && platelets)
    ? computeFIB4({ age, alt, ast, platelets })
    : null;

  const homaIr = (glucose && insulin)
    ? computeHOMAIR({ glucose, insulin })
    : null;

  const tgHdl = (tg && hdl)
    ? computeTGHDLRatio({ triglycerides: tg, hdl })
    : null;

  return {
    ascvd_10yr: ascvd ? { value: ascvd.tenYearRisk, category: ascvd.category } : null,
    fib4: fib4 ? { value: fib4.score, category: fib4.category } : null,
    homa_ir: homaIr ? { value: homaIr.score, category: homaIr.category } : null,
    tg_hdl_ratio: tgHdl ? { value: tgHdl.ratio, category: tgHdl.category } : null,
  };
}
