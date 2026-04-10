// src/components/auth/AuthComponents.tsx
import { useState } from 'react';

interface GoogleButtonProps {
  label:     string;
  onClick:   () => void;
  loading?:  boolean;
}

export const GoogleButton = ({ label, onClick, loading = false }: GoogleButtonProps) => (
  <button
    onClick={onClick}
    disabled={loading}
    style={{ borderRadius: '6px' }}
    className="
      w-full flex items-center justify-center gap-3
      border border-outline-variant/30
      bg-clinical-cream
      text-clinical-charcoal
      text-body text-sm font-medium
      px-4 py-3
      hover:bg-clinical-cream/80
      transition-colors
      disabled:opacity-50
    "
  >
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    {loading ? 'Connecting...' : label}
  </button>
);

export const AuthDivider = () => (
  <div className="flex items-center gap-4 my-6">
    <div className="flex-1 h-px bg-outline-variant/20" />
    <span className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase">
      or
    </span>
    <div className="flex-1 h-px bg-outline-variant/20" />
  </div>
);

interface PasswordFieldProps {
  label:        string;
  value:        string;
  onChange:     (val: string) => void;
  onBlur?:      () => void;
  error?:       string;
  placeholder?: string;
  autoComplete?: string;
}

export const PasswordField = ({
  label,
  value,
  onChange,
  onBlur,
  error,
  placeholder = '••••••••',
  autoComplete = 'current-password',
}: PasswordFieldProps) => {
  const [show, setShow] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          autoComplete={autoComplete}
          style={{ borderRadius: '4px' }}
          className={`
            w-full pr-12
            bg-clinical-cream
            border ${error ? 'border-[#C94F4F]' : 'border-outline-variant/20'}
            px-4 py-3
            text-clinical-charcoal
            placeholder-clinical-stone/50
            text-body text-sm
            focus:border-primary-container
            focus:ring-1 focus:ring-primary-container
            focus:outline-none
            transition-colors
          `}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-clinical-stone hover:text-clinical-charcoal transition-colors"
          tabIndex={-1}
        >
          <span className="material-symbols-outlined text-[18px]">
            {show ? 'visibility_off' : 'visibility'}
          </span>
        </button>
      </div>
      {error && (
        <p className="text-precision text-[0.68rem] text-[#C94F4F] tracking-wide">{error}</p>
      )}
    </div>
  );
};

interface PasswordStrengthProps {
  password: string;
}

export const PasswordStrength = ({ password }: PasswordStrengthProps) => {
  const checks = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][score];
  const color = ['', '#C94F4F', '#E8922A', '#D4A574', '#1B4332'][score];
  const width = ['0%', '25%', '50%', '75%', '100%'][score];

  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="h-1 bg-outline-variant/20 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300 rounded-full"
          style={{ width, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between items-center mt-1">
        <div className="flex gap-3">
          {Object.entries(checks).map(([key, passed]) => (
            <span
              key={key}
              className={`text-precision text-[0.6rem] tracking-wide ${
                passed ? 'text-primary-container' : 'text-clinical-stone/40'
              }`}
            >
              {key === 'length' ? '8+ chars' :
               key === 'uppercase' ? 'A-Z' :
               key === 'number' ? '0-9' : '!@#'}
            </span>
          ))}
        </div>
        {label && (
          <span
            className="text-precision text-[0.6rem] font-bold tracking-wider uppercase"
            style={{ color }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

interface AuthCheckboxProps {
  checked:  boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  error?:   string;
}

export const AuthCheckbox = ({ checked, onChange, children, error }: AuthCheckboxProps) => (
  <div>
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`
          flex-shrink-0 w-4 h-4 mt-0.5
          border transition-colors
          flex items-center justify-center
          ${checked
            ? 'bg-primary-container border-primary-container'
            : 'border-outline-variant/40 group-hover:border-primary-container/50'
          }
        `}
        style={{ borderRadius: '2px' }}
      >
        {checked && (
          <span className="material-symbols-outlined text-white text-[12px]">check</span>
        )}
      </div>
      <span className="text-body text-clinical-stone text-sm leading-relaxed">
        {children}
      </span>
    </label>
    {error && (
      <p className="text-precision text-[0.68rem] text-[#C94F4F] tracking-wide mt-1 ml-7">
        {error}
      </p>
    )}
  </div>
);

interface ErrorBannerProps {
  message: string | null;
}

export const ErrorBanner = ({ message }: ErrorBannerProps) => {
  if (!message) return null;
  return (
    <div className="bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-lg p-4 flex items-start gap-3">
      <span className="material-symbols-outlined text-[#C94F4F] text-[18px] flex-shrink-0 mt-0.5">
        error
      </span>
      <p className="text-body text-[#C94F4F] text-sm leading-relaxed">{message}</p>
    </div>
  );
};

interface SuccessBannerProps {
  message: string | null;
}

export const SuccessBanner = ({ message }: SuccessBannerProps) => {
  if (!message) return null;
  return (
    <div className="bg-primary-container/10 border border-primary-container/30 rounded-lg p-4 flex items-start gap-3">
      <span className="material-symbols-outlined text-primary-container text-[18px] flex-shrink-0 mt-0.5">
        check_circle
      </span>
      <p className="text-body text-primary-container text-sm leading-relaxed">{message}</p>
    </div>
  );
};
