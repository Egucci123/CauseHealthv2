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

  const round = (v: number) => {
    if (step >= 1) return Math.round(v);
    return Math.round(v / step) * step;
  };

  // Sync draft from external `value` ONLY when the parent's value
  // genuinely changed — i.e., not just echoing back the rounded value
  // we just committed. Without this guard, dragging to 7.3 commits 7 to
  // parent, parent re-renders with value=7, this useEffect would snap
  // draft from 7.3 back to 7, fighting the next drag tick. Stutter.
  useEffect(() => {
    if (round(draftRef.current) !== value) {
      setDraft(value);
      draftRef.current = value;
    }
    // round() is stable per step, intentionally not in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step="any"
      value={draft}
      aria-label={ariaLabel}
      onInput={(e) => {
        const raw = parseFloat((e.target as HTMLInputElement).value);
        setDraft(raw);
        draftRef.current = raw;
        const rounded = round(raw);
        if (rounded !== value) onChange(rounded);
      }}
      onChange={() => {
        // Native onChange is redundant once onInput is wired, but keep a
        // no-op to silence React's "controlled-without-onChange" warning.
      }}
      className={`w-full accent-primary-container ${className}`}
    />
  );
};
