// src/components/doctorprep/TestsToRequest.tsx
import type { TestToRequest } from '../../hooks/useDoctorPrep';
import { FolderSection } from '../ui/FolderSection';

function priorityCfg(p: string) {
  if (p === 'urgent') return { border: 'border-t-[3px] border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'DISCUSS PROMPTLY' };
  if (p === 'high') return { border: 'border-t-[3px] border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'RECOMMENDED' };
  return { border: 'border-t-[3px] border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'CONSIDER' };
}

const TestCard = ({ test, advanced = false }: { test: TestToRequest; advanced?: boolean }) => {
  const cfg = priorityCfg(test.priority);
  const border = advanced ? 'border-t-[3px] border-[#2A9D8F]' : cfg.border;
  const badgeClass = advanced ? 'bg-[#2A9D8F] text-white' : cfg.badge;
  const badgeText = advanced ? 'EARLY DETECTION' : cfg.text;
  return (
    <div className={`bg-clinical-white rounded-[10px] shadow-card ${border} p-6`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <span className={`${badgeClass} text-precision text-[0.55rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{badgeText}</span>
          <h4 className="text-authority text-xl text-clinical-charcoal font-semibold mt-2">{test.test_name}</h4>
        </div>
      </div>
      <div className="mb-4">
        <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Why This Test</p>
        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{test.clinical_justification}</p>
      </div>
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
      <div className="bg-primary-container/5 border-l-4 border-primary-container rounded-r-lg px-4 py-3">
        <p className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest uppercase mb-1">Insurance Note</p>
        <p className="text-body text-clinical-charcoal text-sm">{test.insurance_note}</p>
      </div>
    </div>
  );
};

export const TestsToRequest = ({ tests, advanced }: { tests: TestToRequest[]; advanced?: TestToRequest[] }) => {
  const hasEssential = tests?.length > 0;
  const hasAdvanced = advanced && advanced.length > 0;
  if (!hasEssential && !hasAdvanced) return null;

  const ordered = hasEssential ? [...tests.filter(t => t.priority === 'urgent'), ...tests.filter(t => t.priority === 'high'), ...tests.filter(t => t.priority === 'moderate')] : [];
  const orderedAdvanced = hasAdvanced ? [...advanced!.filter(t => t.priority === 'urgent'), ...advanced!.filter(t => t.priority === 'high'), ...advanced!.filter(t => t.priority === 'moderate')] : [];

  return (
    <div className="space-y-4">
      {hasEssential && (
        <FolderSection
          icon="biotech"
          title="Essential Tests for Your Doctor"
          count={tests.length}
          countLabel="tests"
          explanation="The priority tests your doctor should order at this visit, based on what's abnormal in your bloodwork. Each test ties directly to a specific finding — no shotgun ordering, no insurance-friendly fluff. Bring this list and ask for what's listed."
          defaultOpen
          accentColor="#1B4332"
        >
          <div className="space-y-4">
            {ordered.map((test, i) => <TestCard key={`e-${i}`} test={test} />)}
          </div>
        </FolderSection>
      )}

      {hasAdvanced && (
        <FolderSection
          icon="search_check"
          title="Advanced Early Detection"
          count={advanced!.length}
          countLabel="screenings"
          explanation="Tests that catch what a 12-minute appointment misses. These screen for serious-but-rare conditions (like myeloproliferative disorders, hereditary cancer risk, or autoimmune patterns) that match a specific clue in your bloodwork. Your doctor probably won't order these by default — that's exactly why they're here."
          accentColor="#2A9D8F"
        >
          <div className="space-y-4">
            {orderedAdvanced.map((test, i) => <TestCard key={`a-${i}`} test={test} advanced />)}
          </div>
        </FolderSection>
      )}
    </div>
  );
};
