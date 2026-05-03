// src/components/doctorprep/ClinicalSummary.tsx
import type { DoctorPrepDocument } from '../../hooks/useDoctorPrep';
import { format } from 'date-fns';
import { FolderSection } from '../ui/FolderSection';

function flagColor(f: string) { return (f === 'deficient' || f === 'elevated' || f.toUpperCase() === 'HIGH' || f.toUpperCase() === 'LOW') ? '#C94F4F' : '#E8922A'; }

function renderText(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    return Object.values(obj).filter(v => typeof v === 'string').join(' — ');
  }
  return String(val ?? '');
}

export const ClinicalSummary = ({ doc }: { doc: DoctorPrepDocument }) => {
  const rosPositive = doc.review_of_systems ? Object.entries(doc.review_of_systems).filter(([_, v]) => v && v.toLowerCase() !== 'negative') : [];
  const urgentCount = doc.lab_summary?.urgent_findings?.length ?? 0;
  const otherAbnormalCount = doc.lab_summary?.other_abnormal?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Dark header — always visible */}
      <div className="bg-[#131313] rounded-[10px] p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-authority text-2xl text-white font-bold">CauseHealth.</p>
            <p className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase mt-1">Clinical Visit Preparation Document</p>
          </div>
          <div className="text-right">
            <p className="text-precision text-[0.6rem] text-on-surface-variant">PREPARED</p>
            <p className="text-precision text-sm text-on-surface font-medium">{doc.document_date ? format(new Date(doc.document_date), 'MMMM d, yyyy') : 'Today'}</p>
          </div>
        </div>
      </div>

      {/* Executive Summary — open by default */}
      {doc.executive_summary && doc.executive_summary.length > 0 && (
        <FolderSection
          icon="summarize"
          title="Executive Summary"
          count={doc.executive_summary.length}
          countLabel="key findings"
          explanation="The most important findings from your bloodwork, in plain English. These are the headlines you should make sure your doctor reads."
          defaultOpen
          accentColor="#1B4332"
        >
          <ul className="space-y-2">
            {doc.executive_summary.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary-container text-[14px] mt-0.5 flex-shrink-0">arrow_right</span>
                <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{renderText(item)}</p>
              </li>
            ))}
          </ul>
        </FolderSection>
      )}

      {/* Patient History */}
      <FolderSection
        icon="person"
        title="Your Story"
        explanation="The context your doctor needs in 30 seconds. The first part is what's bothering you most. The second is what's been going on. The third is your medical background."
        accentColor="#1B423A"
      >
        <div className="space-y-4">
          {doc.chief_complaint && (
            <div>
              <p className="text-precision text-[0.6rem] font-bold text-clinical-stone tracking-widest uppercase mb-1">What's bothering you most</p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{doc.chief_complaint}</p>
            </div>
          )}
          {doc.hpi && (
            <div>
              <p className="text-precision text-[0.6rem] font-bold text-clinical-stone tracking-widest uppercase mb-1">What's been going on</p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{doc.hpi}</p>
            </div>
          )}
          {doc.pmh && (
            <div>
              <p className="text-precision text-[0.6rem] font-bold text-clinical-stone tracking-widest uppercase mb-1">Your medical background</p>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{doc.pmh}</p>
            </div>
          )}
        </div>
      </FolderSection>

      {/* Medications moved to dedicated "Medications" tab — keeps the Clinical
          Summary tab focused on the narrative + ROS + lab summary, while the
          Medications tab shows full depletion profiles + healthier alternatives. */}

      {/* Review of Systems */}
      {rosPositive.length > 0 && (
        <FolderSection
          icon="checklist"
          title="How you're feeling — by body system"
          count={rosPositive.length}
          countLabel={rosPositive.length === 1 ? 'system' : 'systems'}
          explanation="A quick map of your symptoms by body system. Your doctor uses this to focus the exam and decide which specialists, if any, to bring in."
          accentColor="#2D6A4F"
        >
          <div className="space-y-1.5">
            {rosPositive.map(([system, symptoms]) => (
              <div key={system} className="flex gap-3">
                <span className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider w-28 flex-shrink-0 pt-0.5">{system}:</span>
                <span className="text-body text-clinical-charcoal text-sm">{symptoms}</span>
              </div>
            ))}
          </div>
        </FolderSection>
      )}

      {/* Lab Findings */}
      {(urgentCount > 0 || otherAbnormalCount > 0) && (
        <FolderSection
          icon="biotech"
          title="Lab Findings"
          count={urgentCount + otherAbnormalCount}
          countLabel="abnormal markers"
          explanation={`Your bloodwork results from ${doc.lab_summary?.lab_name ?? 'your lab'} (${doc.lab_summary?.draw_date ?? 'recent draw'}). Top section is what needs immediate attention; bottom is other findings outside the optimal range.`}
          accentColor="#C94F4F"
        >
          {urgentCount > 0 && (
            <div className="mb-4">
              <p className="text-precision text-[0.6rem] text-[#C94F4F] font-bold tracking-widest uppercase mb-2">Findings Requiring Attention</p>
              <div className="space-y-2">
                {doc.lab_summary!.urgent_findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 bg-[#C94F4F]/5 border-l-4 border-[#C94F4F] p-3 rounded-r-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body text-clinical-charcoal font-semibold text-sm">{f.marker}</span>
                        <span className="text-precision text-sm font-bold" style={{ color: flagColor(f.flag) }}>{f.value}</span>
                        <span className="text-precision text-[0.7rem] font-bold px-1.5 py-0.5 text-white" style={{ borderRadius: '2px', backgroundColor: flagColor(f.flag) }}>{f.flag.toUpperCase()}</span>
                      </div>
                      <p className="text-body text-clinical-stone text-xs mt-0.5">{renderText(f.clinical_note)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {otherAbnormalCount > 0 && (
            <div>
              <p className="text-precision text-[0.6rem] text-clinical-stone font-bold tracking-widest uppercase mb-2">Other Abnormal Findings</p>
              <div className="flex flex-wrap gap-2">
                {doc.lab_summary!.other_abnormal.map((item, i) => (
                  <span key={i} className="text-precision text-[0.6rem] text-clinical-charcoal bg-clinical-cream border border-outline-variant/20 px-2 py-1" style={{ borderRadius: '3px' }}>{item.marker}: {item.value} [{item.flag}]</span>
                ))}
              </div>
            </div>
          )}
        </FolderSection>
      )}

      {/* Discussion Points */}
      {doc.discussion_points && doc.discussion_points.length > 0 && (
        <FolderSection
          icon="forum"
          title="Points to Raise with Your Doctor"
          count={doc.discussion_points.length}
          countLabel="discussion points"
          explanation="Specific points to bring up at your visit, written so you can read them out loud. Each leads with what to ask, then explains why — designed to drive a real conversation, not a 12-minute brush-off."
          accentColor="#1B4332"
        >
          <ul className="space-y-3">
            {doc.discussion_points.map((p, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary-container text-[16px] mt-0.5 flex-shrink-0">arrow_right</span>
                <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{renderText(p)}</p>
              </li>
            ))}
          </ul>
        </FolderSection>
      )}

      {/* Patient Questions */}
      {doc.patient_questions && doc.patient_questions.length > 0 && (
        <FolderSection
          icon="help"
          title="Questions to Ask Your Doctor"
          count={doc.patient_questions.length}
          countLabel="questions"
          explanation="Plain-language questions you can read directly to your doctor. No medical jargon — these are designed for you, not them, so you don't forget what to ask."
          accentColor="#D4A574"
        >
          <ol className="space-y-3">
            {doc.patient_questions.map((q, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-precision text-sm font-bold text-primary-container w-5 flex-shrink-0">{i + 1}.</span>
                <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{renderText(q)}</p>
              </li>
            ))}
          </ol>
        </FolderSection>
      )}

      {/* Root Cause Analysis */}
      {doc.functional_medicine_note && (
        <FolderSection
          icon="psychology"
          title="The bigger picture"
          explanation="How everything in this document connects. This is the 'why' behind your findings — not just what's wrong, but what's likely driving it."
          accentColor="#2A9D8F"
        >
          <p className="text-body text-clinical-charcoal text-sm italic leading-relaxed">{doc.functional_medicine_note}</p>
        </FolderSection>
      )}

      <div className="border-t border-outline-variant/10 pt-4">
        <p className="text-precision text-[0.6rem] text-clinical-stone/60 tracking-wide leading-relaxed">
          This document was generated by CauseHealth for educational purposes. It does not constitute medical advice. Values reflect functional medicine reference intervals which differ from standard laboratory reference ranges.
        </p>
      </div>
    </div>
  );
};
