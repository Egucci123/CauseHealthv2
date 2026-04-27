// src/components/symptoms/BodyMap.tsx
// Simple SVG body silhouette that lights up regions tied to affected body systems.
// `systems` is the array from analyze-symptoms patterns: subset of
// brain | heart | gut | hormones | energy | immune | blood | liver | kidney | joints | skin

interface Props {
  systems: string[];
  size?: number;
}

const ACTIVE_FILL = '#C94F4F';
const ACTIVE_OPACITY = 0.55;

const isActive = (s: string, set: Set<string>) => set.has(s.toLowerCase());

export const BodyMap = ({ systems, size = 220 }: Props) => {
  const set = new Set(systems.map((s) => s.toLowerCase()));
  const fill = (s: string) => (isActive(s, set) ? ACTIVE_FILL : '#D8D2C5');
  const opacity = (s: string) => (isActive(s, set) ? ACTIVE_OPACITY : 0.7);

  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 200 400" width={size} height={size * 2} aria-label="Affected body systems">
        {/* Body outline */}
        <path
          d="M100 20 C115 20 125 35 125 55 C125 70 120 80 115 90 L115 100 L140 110 L150 130 L150 200 L140 210 L130 200 L130 250 L135 350 L125 380 L115 380 L110 320 L100 320 L90 320 L85 380 L75 380 L65 350 L70 250 L70 200 L60 210 L50 200 L50 130 L60 110 L85 100 L85 90 C80 80 75 70 75 55 C75 35 85 20 100 20 Z"
          fill="#EFE9DD"
          stroke="#A8A095"
          strokeWidth="1"
        />

        {/* Brain (head circle) */}
        <circle cx="100" cy="50" r="22" fill={fill('brain')} fillOpacity={opacity('brain')} />
        {isActive('brain', set) && <text x="100" y="54" textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700">BRAIN</text>}

        {/* Heart (left chest) */}
        <ellipse cx="92" cy="135" rx="14" ry="16" fill={fill('heart')} fillOpacity={opacity('heart')} />
        {isActive('heart', set) && <text x="92" y="138" textAnchor="middle" fontSize="7" fill="#fff" fontWeight="700">HEART</text>}

        {/* Lungs/immune (upper chest, both sides) */}
        <ellipse cx="80" cy="155" rx="12" ry="20" fill={fill('immune')} fillOpacity={opacity('immune') * 0.9} />
        <ellipse cx="120" cy="155" rx="12" ry="20" fill={fill('immune')} fillOpacity={opacity('immune') * 0.9} />

        {/* Liver (upper right abdomen) */}
        <path d="M105 175 L130 175 L132 195 L108 195 Z" fill={fill('liver')} fillOpacity={opacity('liver')} />
        {isActive('liver', set) && <text x="118" y="190" textAnchor="middle" fontSize="6" fill="#fff" fontWeight="700">LIVER</text>}

        {/* Gut (mid abdomen) */}
        <rect x="78" y="195" width="44" height="35" rx="6" fill={fill('gut')} fillOpacity={opacity('gut')} />
        {isActive('gut', set) && <text x="100" y="216" textAnchor="middle" fontSize="8" fill="#fff" fontWeight="700">GUT</text>}

        {/* Kidneys (back-side of abdomen, two ovals) */}
        <ellipse cx="80" cy="200" rx="6" ry="10" fill={fill('kidney')} fillOpacity={opacity('kidney')} />
        <ellipse cx="120" cy="200" rx="6" ry="10" fill={fill('kidney')} fillOpacity={opacity('kidney')} />

        {/* Hormones (thyroid + adrenal + pelvis) */}
        <ellipse cx="100" cy="105" rx="8" ry="4" fill={fill('hormones')} fillOpacity={opacity('hormones')} />
        <rect x="83" y="232" width="34" height="14" rx="4" fill={fill('hormones')} fillOpacity={opacity('hormones')} />
        {isActive('hormones', set) && <text x="100" y="243" textAnchor="middle" fontSize="7" fill="#fff" fontWeight="700">HORMONES</text>}

        {/* Blood (line down arms suggesting circulation) */}
        <line x1="62" y1="120" x2="50" y2="200" stroke={fill('blood')} strokeOpacity={opacity('blood')} strokeWidth="3" strokeLinecap="round" />
        <line x1="138" y1="120" x2="150" y2="200" stroke={fill('blood')} strokeOpacity={opacity('blood')} strokeWidth="3" strokeLinecap="round" />

        {/* Joints (knees) */}
        <circle cx="85" cy="305" r="6" fill={fill('joints')} fillOpacity={opacity('joints')} />
        <circle cx="115" cy="305" r="6" fill={fill('joints')} fillOpacity={opacity('joints')} />

        {/* Skin (face cheek dots) */}
        <circle cx="90" cy="55" r="2.5" fill={fill('skin')} fillOpacity={opacity('skin')} />
        <circle cx="110" cy="55" r="2.5" fill={fill('skin')} fillOpacity={opacity('skin')} />

        {/* Energy (whole-body subtle glow when active) */}
        {isActive('energy', set) && (
          <path
            d="M100 20 C115 20 125 35 125 55 C125 70 120 80 115 90 L115 100 L140 110 L150 130 L150 200 L140 210 L130 200 L130 250 L135 350 L125 380 L115 380 L110 320 L100 320 L90 320 L85 380 L75 380 L65 350 L70 250 L70 200 L60 210 L50 200 L50 130 L60 110 L85 100 L85 90 C80 80 75 70 75 55 C75 35 85 20 100 20 Z"
            fill="none"
            stroke={ACTIVE_FILL}
            strokeWidth="2"
            strokeOpacity="0.5"
          />
        )}
      </svg>

      {/* Legend */}
      {systems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
          {systems.map((s) => (
            <span
              key={s}
              className="text-precision text-[0.55rem] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${ACTIVE_FILL}15`, color: ACTIVE_FILL }}
            >
              {s}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-precision text-[0.55rem] text-clinical-stone tracking-widest uppercase">No systems flagged</p>
      )}
    </div>
  );
};
