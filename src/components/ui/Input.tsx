// src/components/ui/Input.tsx
import { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">
          {label}
        </label>
      )}
      <input
        ref={ref}
        style={{ borderRadius: '4px' }}
        className={`
          w-full
          bg-clinical-cream
          border ${error ? 'border-[#C94F4F]' : 'border-outline-variant/20'}
          px-4 py-3
          text-clinical-charcoal
          placeholder-clinical-stone/60
          text-body text-sm
          focus:border-primary-container
          focus:ring-1 focus:ring-primary-container
          focus:outline-none
          transition-colors
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-precision text-[0.68rem] text-[#C94F4F] tracking-wide">{error}</p>
      )}
      {hint && !error && (
        <p className="text-body text-[0.75rem] text-clinical-stone">{hint}</p>
      )}
    </div>
  )
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, error, hint, options, className = '', ...props }, ref) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">
        {label}
      </label>
    )}
    <select
      ref={ref}
      style={{ borderRadius: '4px' }}
      className={`
        w-full
        bg-clinical-cream
        border ${error ? 'border-[#C94F4F]' : 'border-outline-variant/20'}
        px-4 py-3
        text-clinical-charcoal
        text-body text-sm
        focus:border-primary-container
        focus:ring-1 focus:ring-primary-container
        focus:outline-none
        transition-colors
        ${className}
      `}
      {...props}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    {error && (
      <p className="text-precision text-[0.68rem] text-[#C94F4F] tracking-wide">{error}</p>
    )}
    {hint && !error && (
      <p className="text-body text-[0.75rem] text-clinical-stone">{hint}</p>
    )}
  </div>
));

Select.displayName = 'Select';
