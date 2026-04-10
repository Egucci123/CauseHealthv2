// src/components/ui/Button.tsx

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) => {

  const base = `
    inline-flex items-center justify-center gap-2
    font-body font-medium
    transition-all duration-150
    focus-visible:outline-2 focus-visible:outline-primary-container focus-visible:outline-offset-2
    disabled:opacity-40 disabled:cursor-not-allowed
  `;

  // CRITICAL: buttons are NEVER pill-shaped
  // 6px border-radius (style prop because Tailwind rounded values are overridden)
  const variants = {
    primary:   'bg-primary-container text-white hover:bg-[#2D6A4F] active:bg-[#0E3727]',
    secondary: 'border border-primary-container text-primary-container hover:bg-primary-container/5 active:bg-primary-container/10',
    ghost:     'text-clinical-charcoal hover:bg-clinical-cream active:bg-clinical-cream/80',
    danger:    'bg-[#C94F4F] text-white hover:bg-[#B03F3F] active:bg-[#922F2F]',
    link:      'text-primary-container hover:underline p-0',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  return (
    <button
      style={{ borderRadius: variant === 'link' ? '0' : '6px' }}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && (
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      )}
    </button>
  );
};

// Clinical link — the text-link pattern used for literature, add-to-prep, view actions
interface ClinicalLinkProps {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  icon?: boolean;
}

export const ClinicalLink = ({ children, href, onClick, icon = true }: ClinicalLinkProps) => (
  <a
    href={href}
    onClick={onClick}
    className="text-precision text-[0.68rem] text-primary-container font-bold hover:underline flex items-center gap-1 cursor-pointer"
  >
    {children}
    {icon && <span className="material-symbols-outlined text-xs">open_in_new</span>}
  </a>
);
