// src/components/ui/TabNav.tsx
//
// Universal pill tab nav used by Wellness Plan, Doctor Prep, and
// Lab Detail. Single source of truth so the affordance + mobile
// behavior stay consistent across pages.
//
// Design notes:
//  - Inactive tabs render a subtle outline so they read as buttons,
//    not just text on a background.
//  - Active tab uses primary-container green for the icon and a clear
//    white fill so it's unmistakably "you are here".
//  - Smaller min-width on mobile (<640px) so 4-tab nav doesn't force
//    horizontal scroll on a 375px viewport.
//  - When tabs DO overflow, a right-edge gradient fade hints there's
//    more — solves the "I didn't know I could scroll" problem.

import { useEffect, useRef, useState } from 'react';

export interface TabDef<T extends string = string> {
  id: T;
  label: string;
  /** Optional short label rendered below the sm: breakpoint (mobile).
   *  Lets long labels like "Clinical Summary" / "Suggested Tests" use
   *  "Summary" / "Tests" on phones without horizontal scroll. */
  shortLabel?: string;
  /** Material Symbols icon name. Optional — text-only tabs are fine. */
  icon?: string;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Compact = lab-detail-style (text only, smaller); full = doctor-prep-
   *  style (icon + label). Default 'full'. */
  variant?: 'full' | 'compact';
}

export function TabNav<T extends string>({ tabs, active, onChange, variant = 'full' }: Props<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showRightFade, setShowRightFade] = useState(false);

  // Show the right-edge fade only when content overflows AND user
  // hasn't scrolled all the way right. Re-checks on resize + scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const overflow = el.scrollWidth > el.clientWidth + 2;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setShowRightFade(overflow && !atEnd);
    };
    update();
    el.addEventListener('scroll', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [tabs.length]);

  // Aggressive mobile shrinkage. With short labels on mobile, 4 tabs fit
  // in a 360px viewport without horizontal scroll.
  const minWClass = variant === 'compact'
    ? 'min-w-[64px] sm:min-w-[90px]'
    : 'min-w-[68px] sm:min-w-[110px]';

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-1 bg-clinical-cream rounded-[10px] p-1 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
        role="tablist"
      >
        {tabs.map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`
                flex-1 ${minWClass}
                ${variant === 'full' ? 'flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5' : 'block'}
                py-2 sm:py-2.5 px-2 sm:px-3 rounded-[8px] transition-all
                cursor-pointer
                ${isActive
                  ? 'bg-clinical-white shadow-card border border-primary-container/15'
                  : 'bg-clinical-white/40 border border-outline-variant/20 hover:bg-clinical-white/70 hover:border-outline-variant/40'}
              `}
            >
              {tab.icon && variant === 'full' && (
                <span
                  className={`material-symbols-outlined text-[16px] ${isActive ? 'text-primary-container' : 'text-clinical-stone'}`}
                >
                  {tab.icon}
                </span>
              )}
              <span
                className={`text-precision text-[0.62rem] sm:text-[0.68rem] font-bold tracking-wide sm:tracking-wider whitespace-nowrap ${
                  isActive ? 'text-clinical-charcoal' : 'text-clinical-stone'
                }`}
              >
                {/* Short label on mobile if provided, full on sm+. Two
                    spans stacked with display toggles so we don't need a
                    JS-side viewport check. */}
                {tab.shortLabel ? (
                  <>
                    <span className="sm:hidden">{tab.shortLabel}</span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </>
                ) : tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right-edge scroll-hint fade — only visible when content overflows
          and the user hasn't scrolled to the end. */}
      {showRightFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 bottom-0 w-10 rounded-r-[10px]"
          style={{
            background: 'linear-gradient(to right, rgba(244, 241, 235, 0), rgba(244, 241, 235, 0.95))',
          }}
        />
      )}
    </div>
  );
}
