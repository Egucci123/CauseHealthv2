// src/components/clinical/SpecialistTestStacks.tsx
//
// Specialist-grouped, collapsible-by-default stacks of recommended
// tests + a "Possible conditions to investigate" folder. Lifted from
// the wellness plan's inline render block so the same UI ships on
// the Clinical Prep page (Tests tab) using doctor-prep data.
//
// Behavior:
//   - Each stack is wrapped in a FolderSection (collapsed by default).
//     The user must click to expand each one — second layer of friction
//     after the OutputAcknowledgmentGate. Reinforces "physician review
//     before health decision" evidence.
//   - Tests collapsed into 5 folders: PCP / GI / Imaging / Functional /
//     Mental Health. Legacy specialist keys (cardiology, endocrinology,
//     etc.) fold into PCP since most blood tests are PCP-orderable with
//     the right ICD-10.
//   - Possible Conditions rendered as its own FolderSection at the
//     bottom of the stack.
//
// Props are intentionally minimal so this component works with both
// the wellness-plan retest_timeline shape and the doctor-prep
// tests_to_request shape.

import { FolderSection } from '../ui/FolderSection';
import { PossibleConditions } from '../wellness/PossibleConditions';

/** Loose shape that matches BOTH wellness plan and doctor prep tests:
 *  the wellness plan uses { marker, why } and doctor prep uses
 *  { test_name, clinical_justification }. The component picks whichever
 *  is present so the page can pass either shape unmodified. */
export interface SpecialistTest {
  // wellness-plan-style
  marker?: string;
  why?: string;
  icd10?: string;
  // doctor-prep-style
  test_name?: string;
  clinical_justification?: string;
  icd10_primary?: string;
  icd10_description?: string;
  // shared
  specialist?: string;
  insurance_note?: string;
  priority?: 'urgent' | 'high' | 'moderate';
}

export interface SuspectedCondition {
  name: string;
  evidence?: string;
  confidence?: 'high' | 'moderate' | 'low';
  category?: string;
  confirmatory_tests?: any;
  what_to_ask_doctor?: string;
  icd10?: string;
}

interface Props {
  tests?: SpecialistTest[];
  suspectedConditions?: SuspectedCondition[];
}

const SPECIALIST_META: Record<
  string,
  { title: string; explanation: string; icon: string; accent: string }
> = {
  pcp: {
    title: 'Tests to ask your PCP for',
    icon: 'medical_services',
    accent: '#1B423A',
    explanation:
      "Bring this list to your primary care follow-up. Each test pairs with an ICD-10 code your PCP can use to get insurance to cover it. Yes, even the advanced markers (ApoB, Lp(a), Free T3, etc.) — a good PCP will run them with the right diagnosis code.",
  },
  gi: {
    title: 'Tests at your GI follow-up',
    icon: 'restaurant',
    accent: '#8B6F47',
    explanation:
      "These fold into your existing GI visits — no extra copay. Your gastroenterologist routinely orders these for UC/Crohn's monitoring.",
  },
  imaging: {
    title: 'Imaging to schedule',
    icon: 'visibility',
    accent: '#6B6B6B',
    explanation:
      'Non-blood studies — ultrasound, FibroScan, sleep study, CAC, DEXA. These need separate orders. Your PCP can refer you with appropriate documentation; insurance coverage varies by indication.',
  },
  functional: {
    title: 'Cash-pay / functional MD',
    icon: 'spa',
    accent: '#5F7A4D',
    explanation:
      'Tests insurance often denies even with good ICD-10 codes (DUTCH cortisol, organic acids, comprehensive stool). A functional medicine MD or direct-to-consumer lab will run these — usually $100–300 cash-pay total.',
  },
  mental_health: {
    title: 'Mental health screening',
    icon: 'psychology',
    accent: '#7B6FA0',
    explanation:
      'Standard screening tools (PHQ-9, GAD-7) your PCP can administer in 5 minutes during your existing visit. No referral needed.',
  },
};

// Legacy specialty keys → simplified 5-folder model.
const COLLAPSE: Record<string, string> = {
  cardiology: 'pcp',
  endocrinology: 'pcp',
  hepatology: 'pcp',
  rheumatology: 'pcp',
  nephrology: 'pcp',
  hematology: 'pcp',
  sleep_medicine: 'imaging', // sleep study IS an imaging-class study
};

const ORDER = ['pcp', 'gi', 'imaging', 'functional', 'mental_health'];

function nameOf(t: SpecialistTest): string {
  return (t.marker ?? t.test_name ?? '').trim();
}

function whyOf(t: SpecialistTest): string {
  return (t.why ?? t.clinical_justification ?? '').trim();
}

function icd10Of(t: SpecialistTest): string {
  return (t.icd10 ?? t.icd10_primary ?? '').trim();
}

export const SpecialistTestStacks = ({
  tests = [],
  suspectedConditions = [],
}: Props) => {
  const validTests = tests.filter((t) => nameOf(t).length > 0);
  const validConditions = suspectedConditions.filter(
    (c) => c && typeof c.name === 'string' && c.name.trim().length > 0,
  );

  const groups: Record<string, SpecialistTest[]> = {};
  for (const t of validTests) {
    const raw = (t.specialist ?? 'pcp') as string;
    const key = COLLAPSE[raw] ?? raw;
    (groups[key] ??= []).push(t);
  }

  const renderedFolders = ORDER.filter((k) => groups[k]?.length).map((k) => {
    const meta = SPECIALIST_META[k] ?? SPECIALIST_META.pcp;
    const items = groups[k];
    return (
      <FolderSection
        key={k}
        icon={meta.icon}
        title={meta.title}
        count={items.length}
        countLabel={items.length === 1 ? 'test' : 'tests'}
        explanation={meta.explanation}
        accentColor={meta.accent}
      >
        <div className="space-y-2">
          {items.map((t, i) => {
            const name = nameOf(t);
            const why = whyOf(t);
            const icd10 = icd10Of(t);
            return (
              <div key={i} className="bg-clinical-cream/40 rounded-[8px] p-3">
                <div className="flex items-start gap-2">
                  <span
                    className="material-symbols-outlined text-[16px] flex-shrink-0 mt-0.5"
                    style={{ color: meta.accent }}
                  >
                    science
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-body text-clinical-charcoal text-sm font-semibold leading-tight">
                        {name}
                      </p>
                      {icd10 && (
                        <span
                          className="text-precision text-[0.6rem] text-clinical-stone tracking-wider px-1.5 py-0.5 bg-clinical-white border border-clinical-cream"
                          style={{ borderRadius: '2px' }}
                        >
                          ICD-10 · {icd10}
                        </span>
                      )}
                    </div>
                    {why && (
                      <p className="text-precision text-[0.65rem] text-clinical-stone mt-1 leading-snug">
                        {why}
                      </p>
                    )}
                    {t.insurance_note && (
                      <p className="text-precision text-[0.6rem] text-clinical-stone/80 mt-1 italic leading-snug">
                        {t.insurance_note}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </FolderSection>
    );
  });

  return (
    <>
      {renderedFolders}

      {validConditions.length > 0 && (
        <FolderSection
          icon="quiz"
          title="Possible conditions to investigate"
          count={validConditions.length}
          countLabel={validConditions.length === 1 ? 'pattern' : 'patterns'}
          explanation="Patterns in your bloodwork and symptoms that fit conditions you haven't been diagnosed with. Not a diagnosis — a starting point for discussion. Each one comes with tests that would help your doctor evaluate the pattern."
          accentColor="#C94F4F"
        >
          <PossibleConditions conditions={validConditions} />
        </FolderSection>
      )}
    </>
  );
};
