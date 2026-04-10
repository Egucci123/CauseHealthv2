// src/components/ui/SectionLabel.tsx
// The most-used typographic pattern in the app
// JetBrains Mono, 0.68rem, bold, tracked, uppercase

interface SectionLabelProps {
  children: React.ReactNode;
  icon?: string;             // Material Symbol name
  className?: string;
  light?: boolean;           // true = use on-surface-variant (for dark backgrounds)
}

export const SectionLabel = ({
  children,
  icon,
  className = '',
  light = false,
}: SectionLabelProps) => (
  <h4
    className={`
      text-precision text-[0.68rem]
      font-bold
      tracking-widest
      uppercase
      mb-4
      flex items-center gap-2
      ${light ? 'text-on-surface-variant' : 'text-clinical-stone'}
      ${className}
    `}
  >
    {icon && (
      <span className="material-symbols-outlined text-sm">{icon}</span>
    )}
    {children}
  </h4>
);
