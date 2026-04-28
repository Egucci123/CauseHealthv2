// src/components/doctorprep/AdditionalTesting.tsx
// Renders the deterministic panel-gap recommendations from
// computePanelGaps (in labUploadStore). These are the universal baseline
// tests every adult should have — separate from the AI's reactive
// "Tests to Request" which respond to specific abnormal markers.
import { FolderSection } from '../ui/FolderSection';

export interface PanelGap {
  test_name: string;
  category: 'essential' | 'recommended' | 'advanced';
  why_needed: string;
}

const TIER_META: Record<PanelGap['category'], { label: string; subtitle: string; accent: string; bg: string }> = {
  essential: {
    label: 'Essential Baseline',
    subtitle: "Every adult should have these. Most primary-care doctors will order them — just bring this list and ask.",
    accent: '#C94F4F',
    bg: 'rgba(201,79,79,0.08)',
  },
  recommended: {
    label: 'Functional Medicine',
    subtitle: "Root-cause baseline tests that go beyond standard care. A typical PCP probably won't order these — that's why they're here. Ask for them by name.",
    accent: '#E8922A',
    bg: 'rgba(232,146,42,0.08)',
  },
  advanced: {
    label: 'Longevity & Optimization',
    subtitle: "Deeper preventive markers — cardiovascular, hormonal, metabolic. Most doctors don't order these unless asked. Show this list and request them.",
    accent: '#2A9D8F',
    bg: 'rgba(42,157,143,0.08)',
  },
};

export const AdditionalTesting = ({ gaps }: { gaps: PanelGap[] }) => {
  if (!gaps || gaps.length === 0) return null;

  const tiers: PanelGap['category'][] = ['essential', 'recommended', 'advanced'];

  return (
    <FolderSection
      icon="add_circle"
      title="Recommended Additional Testing"
      count={gaps.length}
      countLabel="tests"
      explanation="Tests every adult should have, organized by tier. Standard insurance usually covers Essential and most Functional Medicine items. Bring this list to your appointment and ask for each tier."
      accentColor="#1B4332"
    >
      <div className="space-y-5">
        {tiers.map(tier => {
          const tierGaps = gaps.filter(g => g.category === tier);
          if (!tierGaps.length) return null;
          const meta = TIER_META[tier];
          return (
            <div key={tier} className="space-y-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.accent }} />
                  <p className="text-precision text-[0.7rem] font-bold tracking-widest uppercase text-clinical-charcoal">{meta.label}</p>
                  <span className="text-precision text-[0.55rem] text-clinical-stone tracking-widest">{tierGaps.length}</span>
                </div>
                <p className="text-body text-clinical-stone text-xs leading-relaxed pl-4">{meta.subtitle}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tierGaps.map(g => (
                  <div
                    key={g.test_name}
                    className="rounded-[8px] p-3 border-l-2"
                    style={{ backgroundColor: meta.bg, borderColor: meta.accent }}
                  >
                    <p className="text-body text-clinical-charcoal text-sm font-semibold mb-0.5">{g.test_name}</p>
                    <p className="text-body text-clinical-stone text-xs leading-snug">{g.why_needed}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </FolderSection>
  );
};
