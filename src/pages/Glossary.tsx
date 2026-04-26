// src/pages/Glossary.tsx
import { useState, useMemo } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SectionHeader } from '../components/ui/Card';
import { FolderSection } from '../components/ui/FolderSection';
import { BIOMARKER_GLOSSARY } from '../data/biomarkerGlossary';

const categoryOrder = ['Metabolic', 'Cardiovascular', 'Liver', 'Kidney', 'CBC', 'Thyroid', 'Inflammation', 'Nutrients', 'Hormones'];

const categoryAccent: Record<string, string> = {
  Metabolic: '#1B4332',
  Cardiovascular: '#C94F4F',
  Liver: '#E8922A',
  Kidney: '#2D6A4F',
  CBC: '#A06B30',
  Thyroid: '#2A9D8F',
  Inflammation: '#E8922A',
  Nutrients: '#1B423A',
  Hormones: '#D4A574',
};

const categoryDescription: Record<string, string> = {
  Metabolic: 'Blood sugar, insulin sensitivity, and metabolic health markers. The earliest indicators of metabolic dysfunction.',
  Cardiovascular: 'Lipid profile and heart disease risk markers. Pattern matters more than any single number here.',
  Liver: 'Liver enzymes and bilirubin. Catches fatty liver, medication injury, and bile flow problems early.',
  Kidney: 'Kidney filtration and waste clearance. Tracks function over time.',
  CBC: 'Complete Blood Count — your immune cells, oxygen carriers, and clotting factors.',
  Thyroid: 'Thyroid hormones and antibodies. TSH alone misses many problems — full panel reveals them.',
  Inflammation: 'Markers of systemic inflammation. Drivers of nearly every chronic disease.',
  Nutrients: 'Vitamin and mineral status. Common deficiencies that cause symptoms long before "abnormal."',
  Hormones: 'Sex hormones, stress hormones, and adrenal function. Highly cyclical — context matters.',
};

export const Glossary = () => {
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const filtered = search.trim().length === 0
      ? BIOMARKER_GLOSSARY
      : BIOMARKER_GLOSSARY.filter(e => {
          const q = search.toLowerCase();
          return e.name.toLowerCase().includes(q) ||
            e.aliases.some(a => a.includes(q)) ||
            e.whatItIs.toLowerCase().includes(q) ||
            e.whyItMatters.toLowerCase().includes(q);
        });

    const byCategory = new Map<string, typeof BIOMARKER_GLOSSARY>();
    for (const entry of filtered) {
      if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
      byCategory.get(entry.category)!.push(entry);
    }
    return byCategory;
  }, [search]);

  const totalShown = Array.from(grouped.values()).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <AppShell pageTitle="Biomarker Glossary">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <SectionHeader
          title="Biomarker Glossary"
          description="Plain-English definitions for every lab marker we track. Tap any marker name throughout the app to see this same explanation in context."
        />
      </div>

      {/* Search */}
      <div className="relative">
        <span className="material-symbols-outlined text-clinical-stone text-[20px] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search markers, symptoms, or terms..."
          className="w-full bg-clinical-white border border-outline-variant/20 pl-12 pr-4 py-3 text-body text-clinical-charcoal placeholder-clinical-stone/50 focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors"
          style={{ borderRadius: '6px' }}
        />
        {search && (
          <p className="text-precision text-[0.6rem] text-clinical-stone mt-2">
            {totalShown} {totalShown === 1 ? 'match' : 'matches'} for "{search}"
          </p>
        )}
      </div>

      <div className="space-y-4">
        {categoryOrder.map(category => {
          const entries = grouped.get(category);
          if (!entries || entries.length === 0) return null;

          return (
            <FolderSection
              key={category}
              icon="menu_book"
              title={category}
              count={entries.length}
              countLabel={entries.length === 1 ? 'marker' : 'markers'}
              explanation={categoryDescription[category] ?? ''}
              accentColor={categoryAccent[category] ?? '#1B4332'}
              defaultOpen={search.trim().length > 0}
            >
              <div className="space-y-4">
                {entries.map(entry => (
                  <div key={entry.name} className="bg-clinical-cream/40 rounded-lg p-4 border-l-4" style={{ borderLeftColor: categoryAccent[category] }}>
                    <h4 className="text-authority text-base text-clinical-charcoal font-semibold mb-2">{entry.name}</h4>
                    {entry.aliases.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {entry.aliases.slice(0, 5).map(a => (
                          <span key={a} className="text-precision text-[0.55rem] text-clinical-stone bg-white px-1.5 py-0.5" style={{ borderRadius: '2px' }}>{a}</span>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div>
                        <p className="text-precision text-[0.55rem] text-clinical-stone tracking-widest uppercase mb-0.5">What it is</p>
                        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{entry.whatItIs}</p>
                      </div>
                      <div>
                        <p className="text-precision text-[0.55rem] text-clinical-stone tracking-widest uppercase mb-0.5">Why it matters</p>
                        <p className="text-body text-clinical-charcoal text-sm leading-relaxed">{entry.whyItMatters}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="bg-[#C94F4F]/5 border-l-2 border-[#C94F4F] rounded-r px-3 py-2">
                          <p className="text-precision text-[0.55rem] text-[#C94F4F] tracking-widest uppercase mb-0.5">If high</p>
                          <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.highMeans}</p>
                        </div>
                        <div className="bg-[#E8922A]/5 border-l-2 border-[#E8922A] rounded-r px-3 py-2">
                          <p className="text-precision text-[0.55rem] text-[#E8922A] tracking-widest uppercase mb-0.5">If low</p>
                          <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.lowMeans}</p>
                        </div>
                      </div>
                      {entry.optimalNote && (
                        <div className="bg-primary-container/5 border-l-2 border-primary-container rounded-r px-3 py-2">
                          <p className="text-precision text-[0.55rem] text-primary-container tracking-widest uppercase mb-0.5">Optimal vs Standard</p>
                          <p className="text-body text-clinical-charcoal text-xs leading-relaxed">{entry.optimalNote}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </FolderSection>
          );
        })}

        {totalShown === 0 && (
          <div className="bg-clinical-white rounded-[10px] shadow-card p-12 text-center">
            <span className="material-symbols-outlined text-clinical-stone text-4xl mb-3 block">search_off</span>
            <p className="text-body text-clinical-charcoal">No matches for "{search}"</p>
            <button onClick={() => setSearch('')} className="mt-4 text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline">Clear search</button>
          </div>
        )}
      </div>
    </AppShell>
  );
};
