// src/components/layout/DisclaimerBanner.tsx
//
// Non-dismissible disclaimer banner shown at the top of every analysis,
// plan, results, and doctor-prep page. Required by our Medical Disclaimer
// commitment and helpful for FDA / FTC defensibility — keeps the
// "educational only, not medical advice" framing visible during use, not
// just at signup.
//
// Universal — same banner on every plan, every report, every PDF preview.
// Cannot be dismissed during active use of the app.

export const DisclaimerBanner = () => (
  <div
    className="bg-[#D4A574]/10 border-b border-[#D4A574]/30 px-4 py-2 sticky top-0 z-30"
    role="note"
    aria-label="Medical disclaimer"
  >
    <div className="max-w-7xl mx-auto flex items-center gap-2">
      <span className="material-symbols-outlined text-[#8B6F47] text-[16px] flex-shrink-0">
        info
      </span>
      <p className="text-precision text-[0.65rem] sm:text-[0.7rem] font-semibold tracking-wide text-[#8B6F47] leading-snug">
        For educational use only — not medical advice. Always consult your doctor before making health decisions.
      </p>
    </div>
  </div>
);
