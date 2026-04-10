// src/components/ui/Badge.tsx
import type { StatusType } from '../../styles/tokens';
import { statusColors } from '../../styles/tokens';

interface BadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

// CRITICAL RULE: badges have NO border-radius — that's default (2px) from tailwind config
// This is what makes them look clinical instead of bubbly
export const Badge = ({ status, label, className = '' }: BadgeProps) => {
  const s = statusColors[status];
  return (
    <span
      className={`
        inline-block
        text-precision text-[0.68rem]
        px-2 py-0.5
        font-bold
        tracking-widest
        ${s.badgeBg}
        ${s.badgeText}
        ${className}
      `}
    >
      {label ?? s.label}
    </span>
  );
};

// Standalone severity badge for medication depletions
interface SeverityBadgeProps {
  severity: 'critical' | 'moderate' | 'low';
}

export const SeverityBadge = ({ severity }: SeverityBadgeProps) => {
  const styles = {
    critical: 'bg-[#C94F4F] text-white',
    moderate: 'bg-[#614018] text-[#FFDCBC]',
    low:      'bg-surface-container text-on-surface-variant',
  };

  return (
    <span className={`inline-block text-precision text-[0.68rem] px-2 py-0.5 font-bold tracking-widest ${styles[severity]}`}>
      {severity.toUpperCase()}
    </span>
  );
};

// ICD-10 / Rx code tag
interface CodeTagProps {
  code: string;
  prefix?: string;
}

export const CodeTag = ({ code, prefix }: CodeTagProps) => (
  <div className="inline-block text-precision text-[0.68rem] bg-surface-container-highest/10 text-clinical-stone px-3 py-1 rounded border border-outline-variant/20 tracking-widest uppercase">
    {prefix && `${prefix}: `}{code}
  </div>
);
