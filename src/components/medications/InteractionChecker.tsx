// src/components/medications/InteractionChecker.tsx
import { useState } from 'react';
import { getInteractions } from '../../data/medicationDepletions';
import { SectionLabel } from '../ui/SectionLabel';

interface InteractionCheckerProps { medications: Array<{ id: string; name: string }> }

export const InteractionChecker = ({ medications }: InteractionCheckerProps) => {
  const [selected, setSelected] = useState<string[]>([]);
  const toggleMed = (name: string) => setSelected(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  const interactions = selected.length >= 2 ? getInteractions(selected) : [];

  const riskCfg: Record<string, { border: string; badge: string; label: string }> = {
    severe: { border: 'border-l-4 border-[#C94F4F]', badge: 'bg-[#C94F4F] text-white', label: 'SEVERE RISK' },
    significant: { border: 'border-l-4 border-[#E8922A]', badge: 'bg-[#614018] text-[#FFDCBC]', label: 'SIGNIFICANT RISK' },
    moderate: { border: 'border-l-4 border-[#D4A574]', badge: 'bg-surface-container text-on-surface-variant', label: 'MODERATE RISK' },
  };

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-8">
      <SectionLabel icon="warning" className="mb-6">Drug-Nutrient Interaction Checker</SectionLabel>
      <p className="text-body text-clinical-stone text-sm mb-6 leading-relaxed">Select two or more medications to check for compounding depletion interactions.</p>

      <div className="flex flex-wrap gap-2 mb-8">
        {medications.map(med => (
          <button key={med.id} onClick={() => toggleMed(med.name)} style={{ borderRadius: '4px' }}
            className={`text-body text-sm px-4 py-2 border transition-all ${selected.includes(med.name) ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-charcoal hover:border-primary-container/40'}`}>
            {med.name}
          </button>
        ))}
      </div>

      {selected.length < 2 ? (
        <div className="text-center py-8 border-t border-outline-variant/10">
          <span className="material-symbols-outlined text-[#E8E3DB] text-4xl mb-3 block">medication</span>
          <p className="text-body text-clinical-stone text-sm">Select at least 2 medications to check interactions.</p>
        </div>
      ) : interactions.length === 0 ? (
        <div className="border-t border-outline-variant/10 pt-6">
          <div className="bg-primary-container/5 border border-primary-container/20 rounded-lg p-5 flex items-center gap-3">
            <span className="material-symbols-outlined text-primary-container text-[20px]">check_circle</span>
            <div><p className="text-body text-primary-container font-semibold text-sm">No compounding interactions found</p><p className="text-body text-clinical-stone text-xs mt-0.5">The selected medications do not compound each other's known depletions.</p></div>
          </div>
        </div>
      ) : (
        <div className="border-t border-outline-variant/10 pt-6 space-y-4">
          <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold">{interactions.length} Compounding Interaction{interactions.length > 1 ? 's' : ''} Found</p>
          {interactions.map((ix, i) => {
            const cfg = riskCfg[ix.risk];
            return (
              <div key={i} className={`bg-clinical-cream rounded-lg ${cfg.border} p-5`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`${cfg.badge} text-precision text-[0.55rem] font-bold px-2 py-0.5`} style={{ borderRadius: '2px' }}>{cfg.label}</span>
                  <span className="text-body text-clinical-charcoal font-semibold text-sm">{ix.nutrient} Depletion</span>
                </div>
                <p className="text-body text-clinical-stone text-sm leading-relaxed">{ix.detail}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ix.drugs.map(drug => <span key={drug} className="text-precision text-[0.6rem] text-clinical-charcoal bg-clinical-white border border-outline-variant/20 px-2 py-0.5 capitalize" style={{ borderRadius: '3px' }}>{drug}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
