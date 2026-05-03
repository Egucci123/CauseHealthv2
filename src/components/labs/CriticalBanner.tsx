// src/components/labs/CriticalBanner.tsx
// Urgency banner shown to ALL users (free + Pro) when critical lab findings
// are detected. Names no diseases — just urgency. Diagnostic differential
// lives in the Doctor Prep document (Pro feature) for the user's doctor.
import { useNavigate } from 'react-router-dom';
import type { CriticalFinding } from '../../lib/criticalFindings';
import { topSeverity } from '../../lib/criticalFindings';

interface Props {
  findings: CriticalFinding[];
}

export const CriticalBanner = ({ findings }: Props) => {
  const navigate = useNavigate();
  const severity = topSeverity(findings);
  if (!severity || findings.length === 0) return null;

  const isEmergency = severity === 'emergency';
  const bgClass = isEmergency ? 'bg-[#7B1F1F]' : 'bg-[#9A3A20]';
  const accentClass = isEmergency ? 'text-[#FFC9C9]' : 'text-[#FFD9B5]';

  return (
    <div className={`${bgClass} rounded-[14px] p-5 shadow-card border-l-4 border-white/30`}>
      <div className="flex items-start gap-4">
        <span className="material-symbols-outlined text-white text-[28px] flex-shrink-0">
          {isEmergency ? 'emergency_home' : 'priority_high'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-precision text-[0.6rem] font-bold tracking-widest uppercase ${accentClass} mb-1`}>
            {isEmergency ? 'Emergency · Same-day care' : 'Critical · Urgent doctor visit'}
          </p>
          <p className="text-authority text-lg text-white font-bold leading-tight mb-2">
            {findings.length === 1
              ? 'A finding needs urgent medical attention.'
              : `${findings.length} findings need urgent medical attention.`}
          </p>
          <ul className="space-y-2 mt-2">
            {findings.slice(0, 3).map((f, i) => (
              <li key={i} className="text-body text-white/90 text-sm leading-relaxed">
                <span className="font-semibold">{f.marker} {f.value}{f.unit ? ` ${f.unit}` : ''}.</span>{' '}
                {f.userMessage}
              </li>
            ))}
            {findings.length > 3 && (
              <li className="text-body text-white/70 text-xs italic">
                + {findings.length - 3} more critical findings.
              </li>
            )}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/doctor-prep')}
              className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-white text-[#7B1F1F] hover:bg-white/90 rounded-[8px] transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">description</span>
              Open Doctor Prep
            </button>
            {isEmergency && (
              <a
                href="tel:911"
                className="inline-flex items-center gap-1.5 text-precision text-[0.65rem] font-bold tracking-wider uppercase px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-[8px] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">call</span>
                Call 911
              </a>
            )}
          </div>
          <p className="text-precision text-[0.7rem] text-white/60 mt-3 leading-relaxed">
            This is automated detection of clinical panic values, not a diagnosis. Your doctor's evaluation determines the cause and treatment.
          </p>
        </div>
      </div>
    </div>
  );
};
