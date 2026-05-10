// src/components/legal/StandaloneConsent.tsx
//
// Renders a single, standalone, unchecked-by-default consent checkbox
// with the exact label adjacent to the box (NOT inside a link). Logs
// every state change so we have proof that the user clicked it themselves.
//
// Use this for any consent that courts have specifically held cannot be
// buried inside a general ToS link — arbitration / class-action waiver
// (Berman v. Freedom Financial), state-residency certification, EU
// geoblock certification, established-clinician attestation.
//
// Shape:
//   <StandaloneConsent
//      consent={ARBITRATION_CHECKBOX}
//      checked={...}
//      onChange={...}
//      hyperlinkText="Read Section 17"
//      hyperlinkHref="/terms#section-17"
//   />
//
// Important: the label TEXT is the user-facing record. Pull it from
// src/lib/legal/consentText.ts; never hard-code a label here. When the
// user checks the box, the parent should call recordConsentEvent with
// the same {type, version, text} bundle.

import React from 'react';
import type { ConsentText } from '../../lib/legal/consentTextTypes';

interface Props {
  consent: ConsentText;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Optional: link rendered AFTER the label, separately from it. The
   *  label itself must remain unmodified — courts have struck down
   *  consents where the operative language is hyperlinked. */
  hyperlinkText?: string;
  hyperlinkHref?: string;
  /** When true, disables interaction (e.g., during submission). */
  disabled?: boolean;
  /** Optional id for the checkbox — defaults to `consent-${type}`. */
  id?: string;
  /** Optional: render the label in a more prominent style for high-stakes
   *  consents (arbitration, residency). */
  emphasis?: 'normal' | 'high';
}

export const ConsentTextSchema = null; // re-exported below for convenience

export default function StandaloneConsent({
  consent,
  checked,
  onChange,
  hyperlinkText,
  hyperlinkHref,
  disabled,
  id,
  emphasis = 'normal',
}: Props) {
  const inputId = id ?? `consent-${consent.type}`;
  const isHigh = emphasis === 'high';

  return (
    <div
      className={`flex items-start gap-3 ${
        isHigh
          ? 'p-4 rounded-md border border-[#E8922A]/30 bg-[#FFF6E5]'
          : 'p-3'
      }`}
      data-consent-type={consent.type}
      data-consent-version={consent.version}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 cursor-pointer accent-[#1E40AF]"
        aria-describedby={hyperlinkHref ? `${inputId}-link` : undefined}
      />
      <label
        htmlFor={inputId}
        className={`text-body cursor-pointer leading-relaxed select-none ${
          isHigh
            ? 'text-clinical-charcoal text-[0.92rem] font-medium'
            : 'text-clinical-charcoal text-[0.88rem]'
        }`}
      >
        {/* Render the canonical text byte-for-byte. */}
        {consent.text}
        {hyperlinkText && hyperlinkHref && (
          <>
            {' '}
            <a
              id={`${inputId}-link`}
              href={hyperlinkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1E40AF] underline hover:text-[#1E3A8A]"
              onClick={(e) => e.stopPropagation()}
            >
              {hyperlinkText}
            </a>
          </>
        )}
      </label>
    </div>
  );
}
