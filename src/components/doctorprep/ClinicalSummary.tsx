// src/components/doctorprep/ClinicalSummary.tsx
import type { DoctorPrepDocument } from '../../hooks/useDoctorPrep';
import { format } from 'date-fns';

const DocSection = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-2 border-b border-outline-variant/15 pb-1">{label}</p>
    {children}
  </div>
);

function flagColor(f: string) { return (f === 'deficient' || f === 'elevated') ? '#C94F4F' : '#E8922A'; }

export const ClinicalSummary = ({ doc }: { doc: DoctorPrepDocument }) => {
  const rosPositive = Object.entries(doc.review_of_systems).filter(([_, v]) => v && v.toLowerCase() !== 'negative');

  return (
    <div className="space-y-0">
      {/* Dark header */}
      <div className="bg-[#131313] rounded-t-[10px] p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-authority text-2xl text-white font-bold">CauseHealth.</p>
            <p className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase mt-1">Clinical Visit Preparation Document</p>
          </div>
          <div className="text-right">
            <p className="text-precision text-[0.6rem] text-on-surface-variant">PREPARED</p>
            <p className="text-precision text-sm text-on-surface font-medium">{format(new Date(doc.document_date), 'MMMM d, yyyy')}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="bg-clinical-white rounded-b-[10px] shadow-card border border-outline-variant/10 p-8 space-y-6">
        {/* Executive Summary */}
        {doc.executive_summary && doc.executive_summary.length > 0 && (
          <div className="bg-primary-container/5 border border-primary-container/20 rounded-[10px] p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary-container text-[18px]">summarize</span>
              <p className="text-precision text-[0.68rem] font-bold text-primary-container tracking-widest uppercase">Executive Summary</p>
            </div>
            <ul className="space-y-2">
              {doc.executive_summary.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[14px] mt-0.5 flex-shrink-0">arrow_right</span>
                  <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{item}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DocSection label="Chief Complaint"><p className="text-body text-clinical-charcoal leading-relaxed">{doc.chief_complaint}</p></DocSection>
        <DocSection label="History of Present Illness"><p className="text-body text-clinical-charcoal leading-relaxed">{doc.hpi}</p></DocSection>
        <DocSection label="Past Medical History"><p className="text-body text-clinical-charcoal leading-relaxed">{doc.pmh}</p></DocSection>

        <DocSection label="Current Medications">
          <div className="space-y-2">
            {doc.medications.map((med, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-body text-clinical-charcoal text-sm w-4 flex-shrink-0">·</span>
                <div>
                  <span className="text-body text-clinical-charcoal text-sm font-medium">{med.name}</span>
                  {med.dose && <span className="text-body text-clinical-stone text-sm"> — {med.dose}</span>}
                  {med.notable_depletion && <span className="text-precision text-[0.6rem] text-[#E8922A] ml-2">⚠ {med.notable_depletion}</span>}
                </div>
              </div>
            ))}
          </div>
        </DocSection>

        {/* Medication Alternatives */}
        {doc.medication_alternatives && doc.medication_alternatives.length > 0 && (
          <DocSection label="Medication Alternatives to Discuss">
            <div className="space-y-4">
              {doc.medication_alternatives.map((med, i) => (
                <div key={i} className="bg-clinical-cream/50 rounded-lg border border-outline-variant/15 p-5">
                  <p className="text-authority text-lg text-clinical-charcoal font-semibold mb-3">
                    {med.current_medication}
                    <span className="text-precision text-[0.6rem] text-clinical-stone ml-2 font-normal tracking-widest uppercase">currently taking</span>
                  </p>
                  {med.pharmaceutical_alternatives?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-precision text-[0.6rem] font-bold text-primary-container tracking-widest uppercase mb-2">
                        <span className="material-symbols-outlined text-[14px] align-middle mr-1">medication</span>
                        Pharmaceutical Alternatives
                      </p>
                      <div className="space-y-1.5">
                        {med.pharmaceutical_alternatives.map((alt, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-primary-container text-[14px] mt-0.5 flex-shrink-0">swap_horiz</span>
                            <p className="text-body text-clinical-charcoal text-sm"><span className="font-medium">{alt.name}</span> — {alt.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {med.natural_alternatives?.length > 0 && (
                    <div>
                      <p className="text-precision text-[0.6rem] font-bold text-[#D4A574] tracking-widest uppercase mb-2">
                        <span className="material-symbols-outlined text-[14px] align-middle mr-1">eco</span>
                        Natural / Integrative Alternatives
                      </p>
                      <div className="space-y-1.5">
                        {med.natural_alternatives.map((alt, j) => (
                          <div key={j} className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[#D4A574] text-[14px] mt-0.5 flex-shrink-0">spa</span>
                            <p className="text-body text-clinical-charcoal text-sm"><span className="font-medium">{alt.name}</span> — {alt.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </DocSection>
        )}

        {rosPositive.length > 0 && (
          <DocSection label="Review of Systems">
            <div className="space-y-1">
              {rosPositive.map(([system, symptoms]) => (
                <div key={system} className="flex gap-3">
                  <span className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider w-28 flex-shrink-0 pt-0.5">{system}:</span>
                  <span className="text-body text-clinical-charcoal text-sm">{symptoms}</span>
                </div>
              ))}
            </div>
          </DocSection>
        )}

        <DocSection label={`Recent Lab Results — ${doc.lab_summary?.lab_name ?? 'Lab'} (${doc.lab_summary?.draw_date ?? ''})`}>
          {doc.lab_summary?.urgent_findings?.length > 0 && (
            <div className="mb-4">
              <p className="text-precision text-[0.6rem] text-[#C94F4F] font-bold tracking-widest uppercase mb-2">Findings Requiring Attention</p>
              <div className="space-y-2">
                {doc.lab_summary.urgent_findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-3 bg-[#C94F4F]/5 border-l-4 border-[#C94F4F] p-3 rounded-r-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body text-clinical-charcoal font-semibold text-sm">{f.marker}</span>
                        <span className="text-precision text-sm font-bold" style={{ color: flagColor(f.flag) }}>{f.value}</span>
                        <span className="text-precision text-[0.55rem] font-bold px-1.5 py-0.5 text-white" style={{ borderRadius: '2px', backgroundColor: flagColor(f.flag) }}>{f.flag.toUpperCase()}</span>
                      </div>
                      <p className="text-body text-clinical-stone text-xs mt-0.5">{f.clinical_note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {doc.lab_summary?.other_abnormal?.length > 0 && (
            <div>
              <p className="text-precision text-[0.6rem] text-clinical-stone font-bold tracking-widest uppercase mb-2">Other Abnormal Findings</p>
              <div className="flex flex-wrap gap-2">
                {doc.lab_summary.other_abnormal.map((item, i) => (
                  <span key={i} className="text-precision text-[0.6rem] text-clinical-charcoal bg-clinical-cream border border-outline-variant/20 px-2 py-1" style={{ borderRadius: '3px' }}>{item.marker}: {item.value} [{item.flag}]</span>
                ))}
              </div>
            </div>
          )}
        </DocSection>

        {doc.discussion_points?.length > 0 && (
          <DocSection label="Points to Raise with Your Doctor">
            <ul className="space-y-2">
              {doc.discussion_points.map((p, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[16px] mt-0.5 flex-shrink-0">arrow_right</span>
                  <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{p}</p>
                </li>
              ))}
            </ul>
          </DocSection>
        )}

        {/* Patient Questions */}
        {doc.patient_questions && doc.patient_questions.length > 0 && (
          <div className="bg-clinical-cream rounded-[10px] border border-outline-variant/15 p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary-container text-[18px]">help</span>
              <p className="text-precision text-[0.68rem] font-bold text-primary-container tracking-widest uppercase">Questions to Ask Your Doctor</p>
            </div>
            <ol className="space-y-2">
              {doc.patient_questions.map((q, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="text-precision text-sm font-bold text-primary-container w-5 flex-shrink-0">{i + 1}.</span>
                  <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{q}</p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {doc.functional_medicine_note && (
          <div className="bg-clinical-cream rounded-lg p-4">
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Root Cause Analysis</p>
            <p className="text-body text-clinical-stone text-sm italic leading-relaxed">{doc.functional_medicine_note}</p>
          </div>
        )}

        <div className="border-t border-outline-variant/10 pt-4">
          <p className="text-precision text-[0.6rem] text-clinical-stone/60 tracking-wide leading-relaxed">
            This document was generated by CauseHealth for educational purposes. It does not constitute medical advice. Values reflect functional medicine reference intervals which differ from standard laboratory reference ranges.
          </p>
        </div>
      </div>
    </div>
  );
};
