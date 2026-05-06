// src/components/ui/SmoothSlider.tsx
//
// A range input that FEELS continuous during drag but stores integer
// (or arbitrary-step) values. Native <input type="range" step="1"> snaps
// at every integer — the snap-jiggle is what users describe as "stopping
// at each one" or "not sliding smoothly."
//
// Solution: use step="any" internally (continuous drag), keep an
// uncommitted local value while dragging, and commit the rounded value
// to the parent on each tick of the drag. Visual movement is buttery,
// the displayed + saved value is the rounded integer.
//
// Universal — works for any integer slider (sleep hours, coffee/day,
// alcohol/week, exercise days, stress level, severity scales).

import { useEffect, useRef, useState } from 'react';

interface Props {
  min: number;
  max: number;
  /** The committed step the parent cares about. 1 for integers, 0.5 for
   *  half-steps. Internal native step is always "any" for smooth feel. */
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
  // Local uncommitted value during drag — provides the smooth visual feel.
  const [draft, setDraft] = useState<number>(value);
  const draftRef = useRef<number>(value);

  // Keep draft in sync if parent changes value externally (e.g. reset / load).
  useEffect(() => {
    setDraft(value);
    draftRef.current = value;
  }, [value]);

  const round = (v: number) => {
    if (step >= 1) return Math.round(v);
    // Round to nearest step: e.g. step=0.5 → snap to halves
    return Math.round(v / step) * step;
  };

  return (
    <input
      type="range"
      min={min}
      max={max}
      step="any"
      value={draft}
      aria-label={ariaLabel}
      // onInput fires during drag (continuous motion). Update the visual
      // draft state immediately so the thumb glides without stutter.
      onInput={(e) => {
        const raw = parseFloat((e.target as HTMLInputElement).value);
        setDraft(raw);
        draftRef.current = raw;
        // Also commit the rounded value to parent on each tick — callers
        // rely on `value` prop reflecting the current selection in real
        // time (e.g., "7h" display next to slider). The round prevents
        // float noise from leaking into stored state.
        const rounded = round(raw);
        if (rounded !== value) onChange(rounded);
      }}
      onChange={() => {
        // Native onChange is redundant once onInput is wired, but keep
        // a no-op to avoid React's "controlled without onChange" warning.
      }}
      className={`w-full accent-primary-container ${className}`}
    />
  );
};
