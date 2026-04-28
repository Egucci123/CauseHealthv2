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
  script?: string;
  icd10?: { code: string; description: string }[];
}

const TIER_META: Record<PanelGap['category'], { label: string; subtitle: string; accent: string; bg: string }> = {
  essential: {
    label: 'Tier 1 — Foundational Workup',
    subtitle: "Standard-of-care annual labs that catch endocrine, metabolic, and hematologic dysfunction before it progresses. Most PCPs will order these — bring this page and ask.",
    accent: '#C94F4F',
    bg: 'rgba(201,79,79,0.08)',
  },
  recommended: {
    label: 'Tier 2 — Comprehensive Metabolic & Inflammatory',
    subtitle: "Catches insulin resistance, micronutrient deficiency, subclinical inflammation, and early thyroid dysfunction 5–10 years before standard markers shift. Doctor may push back — ICD-10 codes below justify coverage.",
    accent: '#E8922A',
    bg: 'rgba(232,146,42,0.08)',
  },
  advanced: {
    label: 'Tier 3 — Advanced Risk Stratification',
    subtitle: "Cardiovascular particle analysis, genetic markers, adrenal and gonadal function. Identifies high-risk patients who appear 'normal' on routine labs. If declined, request a specialist referral.",
    accent: '#2A9D8F',
    bg: 'rgba(42,157,143,0.08)',
  },
};

export const AdditionalTesting = ({ gaps }: { gaps: PanelGap[] }) => {
  if (!gaps || gaps.length === 0) return null;

  const tiers: PanelGap['category'][] = ['essential', 'recommended', 'advanced'];

  return (
    <FolderSection
      icon="science"
      title="Comprehensive Health Screening"
      count={gaps.length}
      countLabel="tests"
      explanation="Standard annual labs miss early dysfunction. This tiered workup is designed to surface metabolic, hormonal, inflammatory, and cardiovascular risks that are clinically actionable but not detected by routine panels. Each test ships with ICD-10 codes that justify insurance coverage. Ordering this gives you a complete baseline and identifies issues 5–10 years before they manifest as disease."
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
              <div className="space-y-3">
                {tierGaps.map(g => (
                  <div
                    key={g.test_name}
                    className="rounded-[10px] p-4 border-l-2 bg-clinical-white"
                    style={{ borderColor: meta.accent }}
                  >
                    <p className="text-authority text-sm text-clinical-charcoal font-bold mb-1">{g.test_name}</p>
                    <p className="text-body text-clinical-stone text-xs leading-snug mb-3">{g.why_needed}</p>
                    {g.script && (
                      <div
                        className="rounded-[6px] p-3 mb-3"
                        style={{ backgroundColor: meta.bg }}
                      >
                        <p className="text-precision text-[0.55rem] font-bold tracking-widest uppercase mb-1.5" style={{ color: meta.accent }}>
                          What to say to your doctor
                        </p>
                        <p className="text-body text-clinical-charcoal text-sm leading-relaxed italic">{g.script}</p>
                      </div>
                    )}
                    {g.icd10 && g.icd10.length > 0 && (
                      <div>
                        <p className="text-precision text-[0.55rem] font-bold tracking-widest uppercase text-clinical-stone mb-1.5">
                          ICD-10 codes for insurance
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.icd10.map(c => (
                            <div
                              key={c.code}
                              className="inline-flex items-center gap-1.5 bg-clinical-cream border border-outline-variant/30 px-2 py-1 rounded"
                              title={c.description}
                            >
                              <span className="text-precision text-[0.65rem] font-bold text-clinical-charcoal">{c.code}</span>
                              <span className="text-precision text-[0.55rem] text-clinical-stone hidden sm:inline">{c.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
