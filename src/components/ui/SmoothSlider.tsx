// src/components/ui/SmoothSlider.tsx
//
// A range input that is genuinely smooth to drag.
//
// Why the obvious controlled-input version is broken:
//   <input type="range" value={value} onChange={e => setValue(...)} />
// Every drag tick triggers parent re-render → React reconciles the input
// → input's `value` prop is set imperatively → browser's active drag
// gesture gets interrupted, thumb releases mid-drag, user has to re-click
// to keep going. Symptom matches the bug report exactly.
//
// Fix: input is UNCONTROLLED (defaultValue, no value prop). React never
// touches the DOM input during drag. We sync the DOM `value` directly via
// a ref when the parent's `value` changes from outside (load, reset,
// programmatic update) — but NOT during the user's own drag, because
// the input already has the right value (the user is the one setting it).
//
// Universal — works for any integer or fractional-step slider.

import { useEffect, useRef } from 'react';

interface Props {
  min: number;
  max: number;
  /** Committed step the parent cares about. 1 for integers, 0.5 for halves.
   *  Internal slider always uses step="any" for buttery drag. */
  step?: number;
  value: number;
  onChange: (next: number) => void;
  className?: string;
  ariaLabel?: string;
}

export const SmoothSlider = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  className = '',
  ariaLabel,
}: Props) => {
  const ref = useRef<HTMLInputElement>(null);

  const round = (v: number) => {
    if (step >= 1) return Math.round(v);
    return Math.round(v / step) * step;
  };

  // Sync DOM value when parent's `value` changes externally (load, reset,
  // programmatic updates). We compare rounded-DOM-value to the new value;
  // if they differ, write directly to the DOM. This bypasses React
  // reconciliation, so an active drag is NEVER interrupted by an
  // upstream state change echoing back.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const currentDom = parseFloat(el.value);
    if (Number.isFinite(currentDom) && round(currentDom) !== value) {
      el.value = String(value);
    }
    // Only re-run when parent's `value` actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      step="any"
      defaultValue={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        // Fires on every drag tick. Commit the rounded value to parent
        // when it differs — keeps the displayed number ("7h") in sync.
        // The slider's own DOM value is continuous (step="any"), so the
        // browser's drag tracking is never interrupted.
        const raw = parseFloat(e.target.value);
        if (!Number.isFinite(raw)) return;
        const rounded = round(raw);
        if (rounded !== value) onChange(rounded);
      }}
      className={`w-full accent-primary-container ${className}`}
    />
  );
};
