// src/components/ui/Card.tsx
import type { StatusType } from '../../styles/tokens';
import { statusColors } from '../../styles/tokens';

// Primary card — top border accent, used for main content cards
interface PrimaryCardProps {
  children: React.ReactNode;
  status?: StatusType;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

export const PrimaryCard = ({
  children,
  status = 'brand',
  className = '',
  padding = 'lg',
}: PrimaryCardProps) => {
  const paddings = { sm: 'p-4', md: 'p-6', lg: 'p-8' };
  const topBorder = statusColors[status].topBorder;

  return (
    <div
      className={`
        bg-clinical-white
        rounded-[10px]
        shadow-card
        overflow-hidden
        ${topBorder}
        ${className}
      `}
    >
      <div className={paddings[padding]}>{children}</div>
    </div>
  );
};

// Alert card — left border accent, used for priority findings
interface AlertCardProps {
  children: React.ReactNode;
  status: StatusType;
  className?: string;
}

export const AlertCard = ({ children, status, className = '' }: AlertCardProps) => {
  const leftBorder = statusColors[status].leftBorder;

  return (
    <div
      className={`
        bg-clinical-white
        rounded-[10px]
        shadow-card
        ${leftBorder}
        p-6
        ${className}
      `}
    >
      {children}
    </div>
  );
};

// Side panel card — contextual intelligence, dark teal
interface ContextCardProps {
  children: React.ReactNode;
  className?: string;
}

export const ContextCard = ({ children, className = '' }: ContextCardProps) => (
  <div
    className={`
      bg-tertiary-container
      text-on-tertiary-container
      p-6
      rounded-[10px]
      ${className}
    `}
  >
    {children}
  </div>
);

// Supporting card — clinical white with subtle border
export const SupportCard = ({ children, className = '' }: ContextCardProps) => (
  <div
    className={`
      bg-clinical-white
      p-6
      rounded-[10px]
      shadow-card
      border border-outline-variant/10
      ${className}
    `}
  >
    {children}
  </div>
);

// Intervention box — forest green left border, used for recommended interventions
interface InterventionBoxProps {
  label?: string;
  children: React.ReactNode;
}

export const InterventionBox = ({
  label = 'Recommended Intervention',
  children,
}: InterventionBoxProps) => (
  <div className="border-l-4 border-primary-container bg-primary-container/5 p-6">
    <h5 className="text-precision text-[0.68rem] font-bold text-primary-container tracking-widest uppercase mb-2">
      {label}
    </h5>
    <div className="text-body text-clinical-charcoal font-medium text-lg">
      {children}
    </div>
  </div>
);

// Clinical quote — italic, cream background, for symptom connections
interface ClinicalQuoteProps {
  children: React.ReactNode;
}

export const ClinicalQuote = ({ children }: ClinicalQuoteProps) => (
  <div className="p-6 bg-clinical-cream/50 rounded-lg">
    <p className="text-body italic text-clinical-stone text-lg leading-relaxed">
      "{children}"
    </p>
  </div>
);

// Section header — used at top of every major page section
interface SectionHeaderProps {
  title: string;
  description?: string;
}

export const SectionHeader = ({ title, description }: SectionHeaderProps) => (
  <div className="border-b border-[#414844]/10 pb-6">
    <h2 className="text-authority text-4xl text-clinical-charcoal font-bold">
      {title}
    </h2>
    {description && (
      <p className="text-body text-clinical-stone mt-2 text-lg">{description}</p>
    )}
  </div>
);
