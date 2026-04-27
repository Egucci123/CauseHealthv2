// src/components/symptoms/PatternAnalysis.tsx
import { motion } from 'framer-motion';
import type { SymptomAnalysis } from '../../hooks/useSymptoms';
import { FolderSection } from '../ui/FolderSection';

function sevCfg(s: string) {
  if (s === 'critical') return { border: 'border-t-[3px] border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', text: 'CRITICAL' };
  if (s === 'high') return { border: 'border-t-[3px] border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', text: 'HIGH' };
  return { border: 'border-t-[3px] border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', text: 'MODERATE' };
}

function confDots(c: string) { return c === 'high' ? '●●●' : c === 'moderate' ? '●●○' : '●○○'; }

const urgCfg: Record<string, { color: string; label: string }> = {
  immediate: { color: '#C94F4F', label: 'IMMEDIATELY' }, this_week: { color: '#E8922A', label: 'THIS WEEK' }, this_month: { color: '#D4A574', label: 'THIS MONTH' },
};

interface Props { patterns: SymptomAnalysis['patterns']; autoimmuneFlags: SymptomAnalysis['autoimmune_flags']; priorityActions: SymptomAnalysis['priority_actions']; }

export const PatternAnalysis = ({ patterns, autoimmuneFlags, priorityActions }: Props) => (
  <div className="space-y-4">
    <FolderSection
      icon="pattern"
      title="Identified Patterns"
      count={patterns?.length ?? 0}
      countLabel="patterns"
      explanation="Patterns are clusters of your symptoms and lab values that point to a specific underlying condition. Each one shows which symptoms support it, the likely mechanism, and the tests that would confirm or rule it out."
      defaultOpen
      accentColor="#1B4332"
    >
      {(!patterns || patterns.length === 0) ? (
        <p className="text-body text-clinical-stone text-sm">No significant patterns identified.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {patterns.map((p, i) => {
            const cfg = sevCfg(p.severity);
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                className={`bg-clinical-white rounded-[10px] shadow-card ${cfg.border} p-6`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className={`${cfg.badge} text-precision text-[0.55rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{cfg.text}</span>
                    <h4 className="text-authority text-lg text-clinical-charcoal font-semibold mt-2">{p.pattern_name}</h4>
                  </div>
                  <span className="text-precision text-[0.7rem] text-clinical-stone" title={`${p.confidence} confidence`}>{confDots(p.confidence)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">{p.symptoms_involved.map(s => <span key={s} className="text-body text-xs text-clinical-charcoal bg-clinical-cream px-2 py-1" style={{ borderRadius: '3px' }}>{s}</span>)}</div>
                <p className="text-body text-clinical-stone text-sm leading-relaxed mb-4">{p.explanation}</p>
                <div className="bg-clinical-cream rounded-lg p-3 mb-4"><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Mechanism</p><p className="text-body text-clinical-charcoal text-sm">{p.likely_mechanism}</p></div>
                {p.suggested_tests?.length > 0 && <div className="mb-4"><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-2">Tests to Request</p><div className="flex flex-wrap gap-1.5">{p.suggested_tests.map(t => <span key={t} className="text-precision text-[0.6rem] text-primary-container border border-primary-container/30 px-2 py-0.5" style={{ borderRadius: '3px' }}>{t}</span>)}</div></div>}
                {p.icd10_codes?.length > 0 && <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-2">ICD-10</p><div className="flex flex-wrap gap-1.5">{p.icd10_codes.map(c => <span key={c} className="text-precision text-[0.65rem] font-bold text-clinical-charcoal bg-clinical-cream border border-outline-variant/30 px-2 py-1" style={{ borderRadius: '4px' }}>{c}</span>)}</div></div>}
              </motion.div>
            );
          })}
        </div>
      )}
    </FolderSection>

    {autoimmuneFlags?.length > 0 && (
      <FolderSection
        icon="coronavirus"
        title="Autoimmune Flags"
        count={autoimmuneFlags.length}
        countLabel="conditions"
        explanation="Autoimmune conditions worth investigating based on your symptom and lab pattern. These are NOT diagnoses — they're educated screening priorities. Each one lists what symptoms suggest it and the next test step."
        accentColor="#E8922A"
      >
        <div className="space-y-4">
          {autoimmuneFlags.map((f, i) => (
            <div key={i} className="bg-clinical-white rounded-[10px] shadow-card border-l-4 border-[#E8922A] p-5">
              <div className="flex justify-between items-start mb-3">
                <h4 className="text-body text-clinical-charcoal font-semibold">{f.condition}</h4>
                <span className="text-precision text-[0.7rem] text-clinical-stone">{confDots(f.confidence)}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Supporting Symptoms</p><div className="flex flex-wrap gap-1">{f.supporting_symptoms.map(s => <span key={s} className="text-body text-xs text-clinical-charcoal bg-clinical-cream px-2 py-0.5" style={{ borderRadius: '3px' }}>{s}</span>)}</div></div>
                {f.supporting_labs?.length > 0 && <div><p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest mb-1">Supporting Labs</p><div className="flex flex-wrap gap-1">{f.supporting_labs.map(l => <span key={l} className="text-precision text-xs text-clinical-charcoal bg-clinical-cream px-2 py-0.5" style={{ borderRadius: '3px' }}>{l}</span>)}</div></div>}
              </div>
              <div className="bg-[#E8922A]/10 border-l-2 border-[#E8922A] rounded-r-lg px-3 py-2">
                <p className="text-precision text-[0.6rem] text-[#E8922A] font-bold uppercase tracking-widest mb-1">Next Step</p>
                <p className="text-body text-clinical-charcoal text-sm">{f.next_step}</p>
              </div>
            </div>
          ))}
        </div>
      </FolderSection>
    )}

    {priorityActions?.length > 0 && (
      <FolderSection
        icon="priority_high"
        title="Priority Actions"
        count={priorityActions.length}
        countLabel="actions"
        explanation="Specific actions ranked by urgency — what to do this week vs. this month. These are the highest-leverage next steps based on your full picture, not generic health advice."
        accentColor="#C94F4F"
      >
        <div className="space-y-3">
          {priorityActions.map((a, i) => {
            const cfg = urgCfg[a.urgency] ?? urgCfg.this_month;
            return (
              <div key={i} className="bg-clinical-white rounded-[10px] shadow-card border-l-4 p-5 flex items-start gap-4" style={{ borderLeftColor: cfg.color }}>
                <span className="text-precision text-[0.55rem] font-bold px-2 py-0.5 flex-shrink-0 mt-0.5" style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, borderRadius: '2px' }}>{cfg.label}</span>
                <div><p className="text-body text-clinical-charcoal font-semibold text-sm">{a.action}</p><p className="text-body text-clinical-stone text-xs mt-1">{a.rationale}</p></div>
              </div>
            );
          })}
        </div>
      </FolderSection>
    )}
  </div>
);
