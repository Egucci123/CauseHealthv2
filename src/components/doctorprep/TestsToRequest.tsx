// src/components/doctorprep/TestsToRequest.tsx
//
// Three-folder organization driven by the AI's clinical_justification trigger
// prefix (per the prompt: every justification starts with "(a)", "(b)", "(c)",
// "(d)", or "(e)" — symptom / med / out-of-range / baseline-gap / early-detection):
//
//   PCP — Comprehensive Baseline      — specialist:pcp + trigger:(d)
//                                       Tests every adult should have.
//                                       Standard-of-care gaps in this draw.
//   PCP — Test Possible Conditions    — specialist:pcp + trigger:(a/b/c/e)
//                                       Tests targeting a specific finding,
//                                       reported symptom, medication
//                                       depletion, or early-detection pattern.
//   Specialist Follow-Up              — specialist != pcp (GI, Imaging, etc.)
//                                       Tests routed to a specialist visit.
//
// Plus an optional fourth folder for advanced_screening (rare-disease early
// detection, e.g. JAK2 for unexplained polycythemia, HFE for iron overload).

import type { TestToRequest } from '../../hooks/useDoctorPrep';
import { FolderSection } from '../ui/FolderSection';

function priorityCfg(p: string) {
  if (p === 'urgent') return { border: 'border-t-[3px] border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'DISCUSS PROMPTLY' };
  if (p === 'high') return { border: 'border-t-[3px] border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'RECOMMENDED' };
  return { border: 'border-t-[3px] border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'CONSIDER' };
}

// Detects the trigger prefix '(a)' through '(e)' at the start of clinical_justification.
// Returns the letter or null if AI omitted the prefix.
function getTrigger(test: TestToRequest): 'a' | 'b' | 'c' | 'd' | 'e' | null {
  const m = (test.clinical_justification ?? '').match(/^\s*\(([abcde])\)/i);
  return m ? (m[1].toLowerCase() as any) : null;
}

const TRIGGER_LABELS: Record<string, string> = {
  a: 'Symptom workup',
  b: 'Medication monitoring',
  c: 'Lab finding',
  d: 'Standard baseline',
  e: 'Early detection pattern',
};

const SPECIALIST_LABELS: Record<string, string> = {
  pcp: 'Primary Care',
  gi: 'Gastroenterology',
  hepatology: 'Hepatology',
  cardiology: 'Cardiology',
  endocrinology: 'Endocrinology',
  sleep_medicine: 'Sleep Medicine',
  rheumatology: 'Rheumatology',
  nephrology: 'Nephrology',
  hematology: 'Hematology',
  imaging: 'Imaging',
  functional: 'Functional Medicine',
  mental_health: 'Mental Health',
};

const TestCard = ({ test, advanced = false }: { test: TestToRequest; advanced?: boolean }) => {
  const cfg = priorityCfg(test.priority);
  const border = advanced ? 'border-t-[3px] border-[#2A9D8F]' : cfg.border;
  const badgeClass = advanced ? 'bg-[#2A9D8F] text-white' : cfg.badge;
  const badgeText = advanced ? 'EARLY DETECTION' : cfg.text;
  const trigger = getTrigger(test);
  return (
    <div className={`bg-clinical-white rounded-[10px] shadow-card ${border} p-6`}>
      <div className="flex justify-between items-start mb-4 gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`${badgeClass} text-precision text-[0.7rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{badgeText}</span>
            {trigger && (
              <span className="text-precision text-[0.6rem] text-clinical-stone tracking-wider uppercase bg-clinical-cream px-2 py-0.5 rounded">
                {TRIGGER_LABELS[trigger]}
              </span>
            )}
          </div>
          <h4 className="text-authority text-xl text-clinical-charcoal font-semibold break-words">{test.test_name}</h4>
        </div>
      </div>
      <div className="mb-4">
        <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Why This Test</p>
        <p className="text-body text-clinical-charcoal text-sm leading-relaxed break-words">{test.clinical_justification}</p>
      </div>
      {test.icd10_primary && (
        <div className="mb-4">
          <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-2">ICD-10 Codes</p>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 bg-clinical-cream px-3 py-2 rounded-lg">
              <span className="text-precision text-sm font-bold text-clinical-charcoal">{test.icd10_primary}</span>
              <span className="text-body text-clinical-stone text-xs">{test.icd10_description}</span>
            </div>
            {test.icd10_secondary && (
              <div className="flex items-center gap-2 bg-clinical-cream px-3 py-2 rounded-lg">
                <span className="text-precision text-sm font-bold text-clinical-charcoal">{test.icd10_secondary}</span>
                <span className="text-body text-clinical-stone text-xs">{test.icd10_secondary_description}</span>
              </div>
            )}
          </div>
        </div>
      )}
      {test.insurance_note && (
        <div className="bg-primary-container/5 border-l-4 border-primary-container rounded-r-lg px-4 py-3">
          <p className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest uppercase mb-1">Insurance Note</p>
          <p className="text-body text-clinical-charcoal text-sm break-words">{test.insurance_note}</p>
        </div>
      )}
    </div>
  );
};

// Sort tests within a folder: urgent → high → moderate.
function priorityOrder(tests: TestToRequest[]): TestToRequest[] {
  return [
    ...tests.filter(t => t.priority === 'urgent'),
    ...tests.filter(t => t.priority === 'high'),
    ...tests.filter(t => t.priority === 'moderate'),
  ];
}

export const TestsToRequest = ({ tests, advanced }: { tests: TestToRequest[]; advanced?: TestToRequest[] }) => {
  const hasEssential = tests?.length > 0;
  const hasAdvanced = advanced && advanced.length > 0;
  if (!hasEssential && !hasAdvanced) return null;

  // Bucket every essential test into one of three folders.
  const pcpBaseline: TestToRequest[] = [];
  const pcpConditions: TestToRequest[] = [];
  const specialistBuckets: Record<string, TestToRequest[]> = {};

  if (hasEssential) {
    for (const t of tests) {
      const specialist = t.specialist ?? 'pcp';
      if (specialist === 'pcp') {
        const trigger = getTrigger(t);
        if (trigger === 'd') pcpBaseline.push(t);
        else pcpConditions.push(t);
      } else {
        if (!specialistBuckets[specialist]) specialistBuckets[specialist] = [];
        specialistBuckets[specialist].push(t);
      }
    }
  }

  // Order specialists alphabetically by their human-readable label for stability.
  const specialistKeys = Object.keys(specialistBuckets).sort((a, b) =>
    (SPECIALIST_LABELS[a] ?? a).localeCompare(SPECIALIST_LABELS[b] ?? b),
  );

  return (
    <div className="space-y-4">
      {pcpBaseline.length > 0 && (
        <FolderSection
          icon="medical_information"
          title="PCP — Comprehensive Baseline"
          count={pcpBaseline.length}
          countLabel="tests"
          explanation="The thorough adult panel your primary care doctor should run. Each test maps to a body system you don't have a recent baseline for. Insurance-covered, ICD-10 justifiable, the kind of order a good PCP writes when you ask for thorough labs."
          defaultOpen
          accentColor="#1B4332"
        >
          <div className="space-y-4">
            {priorityOrder(pcpBaseline).map((test, i) => <TestCard key={`pcp-base-${i}`} test={test} />)}
          </div>
        </FolderSection>
      )}

      {pcpConditions.length > 0 && (
        <FolderSection
          icon="search"
          title="PCP — Test Possible Conditions"
          count={pcpConditions.length}
          countLabel="tests"
          explanation="Targeted tests your PCP should add because something in your bloodwork, your symptoms, or your current medications calls for it. Each one ties to a specific finding — no shotgun ordering. Bring the symptom or lab value as the conversation starter."
          defaultOpen
          accentColor="#E8922A"
        >
          <div className="space-y-4">
            {priorityOrder(pcpConditions).map((test, i) => <TestCard key={`pcp-cond-${i}`} test={test} />)}
          </div>
        </FolderSection>
      )}

      {specialistKeys.map((key) => {
        const list = specialistBuckets[key];
        const label = SPECIALIST_LABELS[key] ?? key;
        return (
          <FolderSection
            key={key}
            icon="local_hospital"
            title={`Specialist — ${label}`}
            count={list.length}
            countLabel="tests"
            explanation={`Tests routed to a ${label.toLowerCase()} visit. Your PCP can refer or co-order these — they fold cleanly into a specialist appointment if you already have one scheduled.`}
            accentColor="#7B1FA2"
          >
            <div className="space-y-4">
              {priorityOrder(list).map((test, i) => <TestCard key={`spec-${key}-${i}`} test={test} />)}
            </div>
          </FolderSection>
        );
      })}

      {hasAdvanced && (
        <FolderSection
          icon="search_check"
          title="Advanced Early Detection"
          count={advanced!.length}
          countLabel="screenings"
          explanation="Tests that catch what a 12-minute appointment misses. These screen for serious-but-rare conditions (myeloproliferative disorders, hereditary cancer risk, autoimmune patterns) that match a specific clue in your bloodwork. Your doctor probably won't order these by default — that's exactly why they're here."
          accentColor="#2A9D8F"
        >
          <div className="space-y-4">
            {priorityOrder(advanced!).map((test, i) => <TestCard key={`a-${i}`} test={test} advanced />)}
          </div>
        </FolderSection>
      )}
    </div>
  );
};
