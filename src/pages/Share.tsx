// src/pages/Share.tsx
//
// Animated promo page at /share — designed to be screen-recorded into a
// 10–15 second MP4 for social posts (Facebook video, Reels, Stories,
// LinkedIn). Also works as a standalone landing destination.
//
// Animation timeline (all CSS @keyframes, no JS deps):
//   0.0s  → eyebrow fades in
//   0.4s  → headline typewriter starts (4.5s to complete)
//   5.0s  → subheadline fades up
//   6.0s  → feature pills cascade in (six pills, 0.15s stagger)
//   8.5s  → price card scales in with a flash
//   10.0s → CTA button pulses
//   11.0s → loop holds (stable frame for screenshots)
//
// Best recording window: 0.0s – 11.0s. After that the page is steady.
// Use OBS / QuickTime / Game Bar / Loom; record at 1080p portrait
// (1080x1920) for FB Reels / Stories, or 1920x1080 landscape for feed.

import { Link } from 'react-router-dom';

export const Share = () => {
  return (
    <>
      <style>{`
        @keyframes ch-fade-up {
          0%   { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ch-fade-in {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes ch-typewriter {
          0%   { width: 0; }
          100% { width: 100%; }
        }
        @keyframes ch-blink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
        @keyframes ch-pop {
          0%   { opacity: 0; transform: scale(0.85); }
          60%  { opacity: 1; transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes ch-flash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212, 165, 116, 0); }
          50%      { box-shadow: 0 0 60px 0 rgba(212, 165, 116, 0.45); }
        }
        @keyframes ch-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
        @keyframes ch-glow {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes ch-marker-tick {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(0); }
        }

        .ch-share-bg {
          background:
            radial-gradient(ellipse at 75% 20%, rgba(27,67,50,0.55) 0%, transparent 55%),
            radial-gradient(ellipse at 25% 90%, rgba(212,165,116,0.10) 0%, transparent 50%),
            #131313;
        }
        .ch-eyebrow {
          opacity: 0;
          animation: ch-fade-in 0.6s ease-out 0.1s forwards;
        }
        .ch-headline-wrap {
          display: inline-block;
          overflow: hidden;
          white-space: nowrap;
          border-right: 4px solid #D4A574;
          width: 0;
          animation:
            ch-typewriter 4.5s steps(48, end) 0.5s forwards,
            ch-blink 0.7s step-end 0.5s 7;
        }
        .ch-headline-wrap.line2 {
          animation-delay: 5.2s, 5.2s;
          animation-iteration-count: 1, 6;
        }
        .ch-sub {
          opacity: 0;
          animation: ch-fade-up 0.7s ease-out 9.0s forwards;
        }
        .ch-pill {
          opacity: 0;
          animation: ch-fade-up 0.5s ease-out forwards;
        }
        .ch-pill:nth-child(1) { animation-delay: 9.6s; }
        .ch-pill:nth-child(2) { animation-delay: 9.75s; }
        .ch-pill:nth-child(3) { animation-delay: 9.9s; }
        .ch-pill:nth-child(4) { animation-delay: 10.05s; }
        .ch-pill:nth-child(5) { animation-delay: 10.2s; }
        .ch-pill:nth-child(6) { animation-delay: 10.35s; }
        .ch-price {
          opacity: 0;
          animation:
            ch-pop 0.8s cubic-bezier(0.34,1.56,0.64,1) 11.2s forwards,
            ch-flash 1.6s ease-in-out 11.5s 1;
        }
        .ch-cta {
          opacity: 0;
          animation:
            ch-fade-up 0.6s ease-out 12.4s forwards,
            ch-pulse 2.4s ease-in-out 13.5s infinite;
        }
        .ch-cta-glow {
          background: linear-gradient(90deg, #1B4332 0%, #2D6A4F 50%, #1B4332 100%);
          background-size: 200% 100%;
          animation: ch-glow 3s ease-in-out infinite;
        }
        .ch-marker-line {
          opacity: 0;
          animation: ch-fade-in 0.4s ease-out 8.4s forwards;
        }
        .ch-marker-fill {
          animation: ch-marker-tick 1.2s ease-out 8.6s forwards;
          transform-origin: left;
        }

        /* Stable rendering of the typewriter at end-state for screenshots */
        @media (prefers-reduced-motion: reduce) {
          .ch-headline-wrap, .ch-headline-wrap.line2 {
            width: 100%;
            border-right: none;
            animation: none;
          }
          .ch-eyebrow, .ch-sub, .ch-pill, .ch-price, .ch-cta, .ch-marker-line {
            opacity: 1;
            animation: none;
          }
        }
      `}</style>

      <div className="min-h-screen ch-share-bg flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-3xl text-center">

          {/* Eyebrow */}
          <p className="ch-eyebrow text-precision text-[0.7rem] sm:text-xs font-bold tracking-[0.35em] uppercase mb-6" style={{ color: '#D4A574' }}>
            Clinical Health Intelligence
          </p>

          {/* Headline — typewriter */}
          <h1 className="text-authority font-bold text-white leading-[1.05] mb-3" style={{ fontSize: 'clamp(2.25rem, 7vw, 4.5rem)' }}>
            <span className="ch-headline-wrap block mx-auto">
              Bloodwork answers
            </span>
            <span className="ch-headline-wrap line2 block mx-auto" style={{ color: '#D4A574' }}>
              your doctor doesn't have
            </span>
          </h1>

          {/* Sub */}
          <p className="ch-sub text-body text-white/75 mb-8 max-w-xl mx-auto leading-relaxed" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.35rem)' }}>
            Cross-specialty pattern surfacing, drug-nutrient depletion mapping, and educational insight on patterns worth discussing earlier with your doctor.
          </p>

          {/* Marker line — narrative beat between headline and pills */}
          <div className="ch-marker-line max-w-md mx-auto mb-7">
            <div className="h-px bg-white/15 overflow-hidden">
              <div className="ch-marker-fill h-full" style={{ background: 'linear-gradient(90deg, transparent, #D4A574, transparent)', width: '100%' }} />
            </div>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5 mb-9 max-w-2xl mx-auto">
            {[
              'Pattern discussion topics',
              'Drug + supplement interactions',
              'ICD-10 doctor prep',
              'Cross-specialty synthesis',
              'Biological + cardiometabolic age',
              'Educational retest expectations',
            ].map((label) => (
              <span
                key={label}
                className="ch-pill text-precision text-[0.65rem] sm:text-xs font-bold tracking-wider uppercase px-3 py-2 rounded-[6px]"
                style={{
                  color: '#D4A574',
                  background: 'rgba(27,67,50,0.40)',
                  border: '1px solid rgba(212,165,116,0.30)',
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Price card */}
          <div className="ch-price inline-block mb-7">
            <div
              className="inline-flex items-baseline gap-3 px-7 py-5 rounded-[10px]"
              style={{
                background: '#1C1B1B',
                border: '1.5px solid #D4A574',
              }}
            >
              <span className="text-authority font-bold text-white" style={{ fontSize: 'clamp(2.25rem, 6vw, 3.5rem)' }}>$19</span>
              <span className="text-precision text-xs sm:text-sm font-bold tracking-widest uppercase" style={{ color: '#D4A574' }}>
                One-time · Lifetime
              </span>
            </div>
            <p className="text-precision text-[0.6rem] sm:text-xs tracking-widest uppercase text-white/50 mt-3">
              No subscription · $5 per additional draw
            </p>
          </div>

          {/* CTA */}
          <div className="ch-cta">
            <Link
              to="/register"
              className="ch-cta-glow inline-flex items-center gap-2 px-8 py-4 rounded-[8px] text-white font-semibold text-base sm:text-lg shadow-2xl"
            >
              <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              Unlock for $19
            </Link>
            <p className="text-precision text-[0.6rem] tracking-widest uppercase text-white/40 mt-4">
              causehealth.app
            </p>
          </div>

          {/* Footer micro-disclaimer */}
          <p className="ch-cta text-body text-white/30 text-xs mt-10 leading-relaxed max-w-md mx-auto">
            Educational use only · Not medical advice · Always consult your doctor
          </p>

        </div>
      </div>
    </>
  );
};
