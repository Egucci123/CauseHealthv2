// PrepInstructionsList.tsx
// ──────────────────────────────────────────────────────────────────────
// Pre-analytical prep tied to recommended tests — biotin hold for
// thyroid assays, AM testosterone draw window, fasting before lipid/
// glucose, hold supplements that interfere with hormone panels, etc.
// Surfaced near the test list so the patient walks into the lab prepared.

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

interface Props {
  instructions?: WellnessPlanData['prep_instructions'];
}

const CATEGORY_LABEL: Record<string, string> = {
  fasting:    'Fasting',
  medication: 'Medication',
  supplement: 'Supplement',
  timing:     'Timing',
  lifestyle:  'Lifestyle',
  cycle:      'Cycle',
};

export const PrepInstructionsList = ({ instructions }: Props) => {
  const list = Array.isArray(instructions) ? instructions : [];
  if (list.length === 0) return null;

  // Group by triggering test so each test only owns its prep block.
  const byTest = new Map<string, typeof list>();
  for (const p of list) {
    const key = p.triggeredByTest || 'General prep';
    const arr = byTest.get(key) ?? [];
    arr.push(p);
    byTest.set(key, arr);
  }

  return (
    <div className="space-y-3">
      {[...byTest.entries()].map(([test, items]) => (
        <div key={test} className="bg-clinical-cream/40 rounded-[8px] p-3 border-l-2 border-primary-container">
          <p className="text-precision text-[0.65rem] text-primary-container font-bold tracking-wider uppercase mb-2">{test}</p>
          <ul className="space-y-1.5">
            {items.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-precision text-[0.6rem] tracking-wider uppercase px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0" style={{
                  backgroundColor: p.importance === 'critical' ? '#FFE8E8' : '#E8F1FB',
                  color: p.importance === 'critical' ? '#8B2E2E' : '#1F3F5C',
                }}>
                  {CATEGORY_LABEL[p.category] ?? p.category}
                </span>
                <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{p.instruction}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
