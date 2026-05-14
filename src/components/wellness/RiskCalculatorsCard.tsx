// RiskCalculatorsCard.tsx
// ──────────────────────────────────────────────────────────────────────
// Deterministic clinical risk scores computed from labs + demographics:
//   - ASCVD 10-year cardiovascular risk
//   - FIB-4 (liver fibrosis risk from AST/ALT/platelets/age)
//   - HOMA-IR (insulin resistance from fasting glucose + insulin)
//   - TG:HDL ratio (atherogenic dyslipidemia surrogate)
//
// Each only renders when the engine successfully computed it (required
// inputs were available).

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

interface Props {
  calculators?: WellnessPlanData['risk_calculators'];
}

const RISK_TONE: Record<string, string> = {
  low: '#3B7A4A',
  borderline: '#B86E15',
  intermediate: '#B86E15',
  moderate: '#B86E15',
  high: '#C94F4F',
  'very high': '#C94F4F',
  severe: '#C94F4F',
};

function toneFor(category: string | undefined): string {
  if (!category) return '#3A6B8C';
  return RISK_TONE[category.toLowerCase()] ?? '#3A6B8C';
}

interface Row {
  label: string;
  description: string;
  unit: string;
  data: { value: number; category: string } | null | undefined;
}

export const RiskCalculatorsCard = ({ calculators }: Props) => {
  if (!calculators || typeof calculators !== 'object') return null;
  const rows: Row[] = [
    { label: 'ASCVD 10-year CV risk', description: '10-year risk of heart attack or stroke based on age, sex, cholesterol, BP, smoking, diabetes status.', unit: '%', data: calculators.ascvd_10yr },
    { label: 'FIB-4 (liver fibrosis)',    description: 'Estimates liver fibrosis stage from AST, ALT, platelets, age. <1.3 reassures; >2.67 warrants imaging.', unit: '',  data: calculators.fib4 },
    { label: 'HOMA-IR (insulin resistance)', description: 'Insulin resistance index from fasting glucose × insulin. <1.5 healthy; >2.5 = insulin resistance.', unit: '',  data: calculators.homa_ir },
    { label: 'TG:HDL ratio', description: 'Atherogenic dyslipidemia surrogate. <2 ideal; >3.5 hints at small-dense-LDL.', unit: '',  data: calculators.tg_hdl_ratio },
  ];
  const present = rows.filter(r => r.data != null);
  if (present.length === 0) return null;

  return (
    <div className="space-y-3">
      {present.map((r, i) => {
        const c = r.data!;
        const tone = toneFor(c.category);
        return (
          <div key={i} className="bg-clinical-white rounded-[10px] p-4 border border-outline-variant/10">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="text-body text-clinical-charcoal font-semibold text-sm">{r.label}</p>
              <p className="text-precision text-sm font-bold" style={{ color: tone }}>
                {c.value}{r.unit}
                <span className="text-[0.6rem] tracking-wider uppercase ml-2">{c.category}</span>
              </p>
            </div>
            <p className="text-body text-clinical-stone text-xs leading-relaxed">{r.description}</p>
          </div>
        );
      })}
    </div>
  );
};
