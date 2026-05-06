// src/components/wellness/ProgressSummary.tsx
//
// LONGITUDINAL PROGRESS CARD — universal renderer.
//
// Shown only on retest plans (when the user has a prior draw). Each
// movement is computed deterministically by the backend (longitudinalDelta.ts)
// — this component just renders them with color, arrows, and 1-line context.
//
// UNIVERSAL: works for any marker name, any unit, any direction. Direction
// (improved/worsened/stable) is inferred backend-side from optimal-flag tier
// movement, so the component doesn't need per-marker knowledge.

import { format, parseISO } from 'date-fns';
import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

type Movement = NonNullable<WellnessPlanData['progress_summary']>['movements'][number];

const DIRECTION_STYLES: Record<Movement['direction'], { icon: string; bg: string; text: string; label: string }> = {
  improved:    { icon: 'trending_down',    bg: 'bg-[#1B423A]/10',  text: 'text-[#1B423A]',  label: 'IMPROVED'   },
  worsened:    { icon: 'trending_up',      bg: 'bg-[#C94F4F]/10',  text: 'text-[#C94F4F]',  label: 'WORSENED'   },
  stable:      { icon: 'trending_flat',    bg: 'bg-[#8A7E6B]/10',  text: 'text-[#8A7E6B]',  label: 'STABLE'     },
  new_marker:  { icon: 'add_circle',       bg: 'bg-[#5C8FA8]/10',  text: 'text-[#5C8FA8]',  label: 'NEW'        },
  unclear:     { icon: 'help_outline',     bg: 'bg-[#8A7E6B]/10',  text: 'text-[#8A7E6B]',  label: 'UNCLEAR'    },
};

function fmtDelta(m: Movement): string {
  if (m.delta === null) return '';
  const sign = m.delta > 0 ? '+' : '';
  // Round sensibly based on magnitude
  const absD = Math.abs(m.delta);
  const rounded = absD >= 10 ? m.delta.toFixed(0) : m.delta.toFixed(1);
  const pct = m.pct_change !== null ? ` (${m.pct_change > 0 ? '+' : ''}${m.pct_change.toFixed(0)}%)` : '';
  return `${sign}${rounded}${pct}`;
}

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return iso; }
}

interface Props {
  summary: NonNullable<WellnessPlanData['progress_summary']>;
}

export const ProgressSummary = ({ summary }: Props) => {
  if (!summary || summary.movements.length === 0) return null;

  // Show noteworthy movements (non-zero magnitude). Cap at 12 so the card
  // doesn't dwarf the rest of the page; the rest are still searchable in
  // the audit JSON if anyone wants them.
  const noteworthy = summary.movements.filter(m => m.magnitude !== 'none').slice(0, 12);

  return (
    <div className="space-y-4">
      {/* Header strip with rollup */}
      <div className="bg-clinical-cream/40 rounded-[10px] p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1">
            Compared to your draw on
          </p>
          <p className="text-authority text-base text-clinical-charcoal font-semibold">
            {fmtDate(summary.prior_draw_date)} <span className="text-clinical-stone font-normal text-sm">· {summary.weeks_between} weeks ago</span>
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {summary.rollup.improved > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1B423A]/10" style={{ borderRadius: '4px' }}>
              <span className="material-symbols-outlined text-[14px] text-[#1B423A]">trending_down</span>
              <span className="text-precision text-[0.65rem] font-bold tracking-wider text-[#1B423A]">{summary.rollup.improved} improved</span>
            </div>
          )}
          {summary.rollup.worsened > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#C94F4F]/10" style={{ borderRadius: '4px' }}>
              <span className="material-symbols-outlined text-[14px] text-[#C94F4F]">trending_up</span>
              <span className="text-precision text-[0.65rem] font-bold tracking-wider text-[#C94F4F]">{summary.rollup.worsened} worsened</span>
            </div>
          )}
          {summary.rollup.stable > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#8A7E6B]/10" style={{ borderRadius: '4px' }}>
              <span className="material-symbols-outlined text-[14px] text-[#8A7E6B]">trending_flat</span>
              <span className="text-precision text-[0.65rem] font-bold tracking-wider text-[#8A7E6B]">{summary.rollup.stable} stable</span>
            </div>
          )}
        </div>
      </div>

      {/* Movements list */}
      <div className="space-y-2">
        {noteworthy.map((m, i) => {
          const style = DIRECTION_STYLES[m.direction] ?? DIRECTION_STYLES.unclear;
          return (
            <div key={i} className="bg-clinical-white border border-clinical-cream rounded-[10px] p-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Direction badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${style.bg}`} style={{ borderRadius: '2px' }}>
                  <span className={`material-symbols-outlined text-[14px] ${style.text}`}>{style.icon}</span>
                  <span className={`text-precision text-[0.6rem] font-bold tracking-widest ${style.text}`}>
                    {style.label}
                  </span>
                </span>
                {/* Marker name */}
                <span className="text-body text-clinical-charcoal text-sm font-semibold flex-1 min-w-0">
                  {m.marker}
                </span>
                {/* Magnitude badge if major */}
                {m.magnitude === 'major' && (
                  <span className="text-precision text-[0.55rem] font-bold tracking-widest text-clinical-stone uppercase">
                    Big move
                  </span>
                )}
              </div>

              {/* From → To row */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex items-baseline gap-1">
                  <span className="text-precision text-[0.6rem] tracking-wider text-clinical-stone">FROM</span>
                  <span className="text-authority text-lg text-clinical-charcoal font-semibold">{m.prior_display}</span>
                  <span className="text-body text-xs text-clinical-stone">{m.unit}</span>
                </div>
                <span className="material-symbols-outlined text-[16px] text-clinical-stone">arrow_forward</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-precision text-[0.6rem] tracking-wider text-clinical-stone">TO</span>
                  <span className={`text-authority text-lg font-bold ${style.text}`}>{m.current_display}</span>
                  <span className="text-body text-xs text-clinical-stone">{m.unit}</span>
                </div>
                {m.delta !== null && (
                  <span className={`text-precision text-[0.7rem] font-bold tracking-wide px-2 py-0.5 ${style.bg} ${style.text}`} style={{ borderRadius: '2px' }}>
                    {fmtDelta(m)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New / retired markers (compact) */}
      {(summary.new_markers.length > 0 || summary.retired_markers.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.new_markers.length > 0 && (
            <div className="bg-clinical-cream/40 rounded-[8px] p-3">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1">
                New tests this draw
              </p>
              <p className="text-body text-clinical-charcoal text-xs leading-snug">
                {summary.new_markers.slice(0, 8).join(', ')}
                {summary.new_markers.length > 8 && ` +${summary.new_markers.length - 8} more`}
              </p>
            </div>
          )}
          {summary.retired_markers.length > 0 && (
            <div className="bg-clinical-cream/40 rounded-[8px] p-3">
              <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1">
                No longer tested
              </p>
              <p className="text-body text-clinical-charcoal text-xs leading-snug">
                {summary.retired_markers.slice(0, 8).join(', ')}
                {summary.retired_markers.length > 8 && ` +${summary.retired_markers.length - 8} more`}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider leading-relaxed mt-2">
        Movement direction is based on how each marker moved relative to its optimal range. "Improved" means closer to optimal, "worsened" means further from it — the universal interpretation across every marker.
      </p>
    </div>
  );
};
