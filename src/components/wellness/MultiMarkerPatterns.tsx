// MultiMarkerPatterns.tsx
// ──────────────────────────────────────────────────────────────────────
// Named cross-marker patterns the engine surfaces — clusters of labs
// that fit a recognized clinical syndrome (metabolic syndrome, hepatic
// stress, anabolic profile, stress leukogram, iron overload, etc.).
// Previously the engine generated these in plan.multi_marker_patterns
// but the wellness UI ignored them.

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

interface Props {
  patterns?: WellnessPlanData['multi_marker_patterns'];
}

const SEVERITY_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  high:     { bg: '#FFE8E8', border: '#C94F4F', text: '#8B2E2E' },
  moderate: { bg: '#FFF4E5', border: '#E89D3C', text: '#8B5512' },
  low:      { bg: '#E8F1FB', border: '#3A6B8C', text: '#1F3F5C' },
};

export const MultiMarkerPatterns = ({ patterns }: Props) => {
  const list = Array.isArray(patterns) ? patterns : [];
  if (list.length === 0) return null;

  return (
    <div className="space-y-3">
      {list.map((p, i) => {
        const tone = SEVERITY_COLOR[p.severity ?? 'moderate'] ?? SEVERITY_COLOR.moderate;
        return (
          <div key={i} className="bg-clinical-white border rounded-[10px] p-4" style={{ borderColor: `${tone.border}33` }}>
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[20px] flex-shrink-0 mt-0.5" style={{ color: tone.border }}>scatter_plot</span>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <p className="text-body text-clinical-charcoal font-semibold text-sm">{p.name}</p>
                  {p.severity && (
                    <span className="text-precision text-[0.6rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded" style={{ backgroundColor: tone.bg, color: tone.text }}>
                      {p.severity}
                    </span>
                  )}
                </div>
                {p.description && <p className="text-body text-clinical-stone text-sm leading-relaxed">{p.description}</p>}
                {Array.isArray(p.markers) && p.markers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {p.markers.map((m, j) => (
                      <span key={j} className="text-precision text-[0.6rem] text-clinical-stone bg-clinical-cream border border-outline-variant/20 px-2 py-0.5 rounded tracking-wide">{m}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
