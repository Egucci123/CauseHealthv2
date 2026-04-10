// src/components/medications/DepletionProtocol.tsx
import { synthesizeDepletions } from '../../data/medicationDepletions';
import { SectionLabel } from '../ui/SectionLabel';

export const DepletionProtocol = ({ medicationNames }: { medicationNames: string[] }) => {
  const depletions = synthesizeDepletions(medicationNames);

  if (depletions.length === 0) return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-8">
      <SectionLabel icon="medication">Combined Depletion Protocol</SectionLabel>
      <p className="text-body text-clinical-stone text-sm mt-4 text-center py-6">No depletion data found for your current medications.</p>
    </div>
  );

  const criticalCount = depletions.filter(d => d.maxSeverity === 'critical').length;
  const significantCount = depletions.filter(d => d.maxSeverity === 'significant').length;
  const severityColors: Record<string, string> = { critical: '#C94F4F', significant: '#E8922A', moderate: '#D4A574' };

  return (
    <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container overflow-hidden">
      <div className="p-8">
        <div className="flex justify-between items-start mb-6">
          <SectionLabel icon="medication">Combined Depletion Protocol</SectionLabel>
          <div className="flex gap-2">
            {criticalCount > 0 && <span className="text-precision text-[0.6rem] font-bold bg-[#C94F4F] text-white px-2 py-1" style={{ borderRadius: '3px' }}>{criticalCount} CRITICAL</span>}
            {significantCount > 0 && <span className="text-precision text-[0.6rem] font-bold bg-[#614018] text-[#FFDCBC] px-2 py-1" style={{ borderRadius: '3px' }}>{significantCount} SIGNIFICANT</span>}
          </div>
        </div>
        <p className="text-body text-clinical-stone text-sm mb-6 leading-relaxed">All unique nutritional depletions from your medication stack, de-duplicated and ranked by severity.</p>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="text-precision text-[0.6rem] text-clinical-stone border-b border-outline-variant/10 bg-clinical-cream">
              <th className="text-left px-4 py-3 font-medium">NUTRIENT</th><th className="text-left px-4 py-3 font-medium">RECOMMENDED FORM</th>
              <th className="text-left px-4 py-3 font-medium">DOSE</th><th className="text-left px-4 py-3 font-medium">TIMING</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">FROM</th>
            </tr></thead>
            <tbody>
              {depletions.map(dep => (
                <tr key={dep.nutrient} className="border-b border-outline-variant/5 last:border-0 hover:bg-clinical-cream/30 transition-colors">
                  <td className="px-4 py-4"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: severityColors[dep.maxSeverity] }} /><span className="text-body text-clinical-charcoal font-semibold text-sm">{dep.nutrient}</span></div></td>
                  <td className="px-4 py-4"><span className="text-body text-clinical-charcoal text-sm">{dep.depletion.form}</span></td>
                  <td className="px-4 py-4"><span className="text-precision text-sm text-clinical-charcoal">{dep.depletion.dose}</span></td>
                  <td className="px-4 py-4"><span className="text-body text-clinical-stone text-sm">{dep.depletion.timing}</span></td>
                  <td className="px-4 py-4 hidden md:table-cell"><div className="flex flex-wrap gap-1">{dep.sources.map(s => <span key={s} className="text-precision text-[0.55rem] text-clinical-stone bg-clinical-cream px-1.5 py-0.5" style={{ borderRadius: '2px' }}>{s}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 pt-4 border-t border-outline-variant/10 flex justify-between items-center">
          <p className="text-body text-clinical-stone text-sm">This protocol is the foundation of your Wellness Plan.</p>
          <a href="/wellness" className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline flex items-center gap-1">VIEW FULL PLAN<span className="material-symbols-outlined text-[14px]">arrow_forward</span></a>
        </div>
      </div>
    </div>
  );
};
