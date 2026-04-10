// src/components/doctorprep/TestsToRequest.tsx
import type { TestToRequest } from '../../hooks/useDoctorPrep';
import { SectionLabel } from '../ui/SectionLabel';

function priorityCfg(p: string) {
  if (p === 'urgent') return { border: 'border-t-[3px] border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'ORDER NOW' };
  if (p === 'high') return { border: 'border-t-[3px] border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'HIGH PRIORITY' };
  return { border: 'border-t-[3px] border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'ROUTINE' };
}

export const TestsToRequest = ({ tests }: { tests: TestToRequest[] }) => {
  if (!tests?.length) return null;
  const ordered = [...tests.filter(t => t.priority === 'urgent'), ...tests.filter(t => t.priority === 'high'), ...tests.filter(t => t.priority === 'moderate')];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionLabel icon="biotech">Tests to Request</SectionLabel>
        <p className="text-body text-clinical-stone text-sm">{tests.length} test{tests.length > 1 ? 's' : ''} recommended</p>
      </div>
      <div className="space-y-4">
        {ordered.map((test, i) => {
          const cfg = priorityCfg(test.priority);
          return (
            <div key={i} className={`bg-clinical-white rounded-[10px] shadow-card ${cfg.border} p-6`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={`${cfg.badge} text-precision text-[0.55rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{cfg.text}</span>
                  <h4 className="text-authority text-xl text-clinical-charcoal font-semibold mt-2">{test.test_name}</h4>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Clinical Justification</p>
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
        })}
      </div>
    </div>
  );
};
