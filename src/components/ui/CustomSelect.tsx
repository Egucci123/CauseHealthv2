// src/components/ui/CustomSelect.tsx
// Custom select dropdown with consistent styling across platforms.
// Replaces the native <select> which renders inconsistently (esp. mobile picker wheel on iOS).

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface CustomSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface CustomSelectProps {
  label?: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean;
  /** Optional name for forms; doesn't affect behavior */
  name?: string;
  className?: string;
}

export interface CustomSelectHandle {
  focus: () => void;
}

export const CustomSelect = forwardRef<CustomSelectHandle, CustomSelectProps>(({
  label, hint, error, placeholder = 'Select...', options, value, onChange,
  disabled = false, searchable = false, name, className = '',
}, ref) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => buttonRef.current?.focus(),
  }));

  const selectedOption = options.find(o => o.value === value) ?? null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Auto-focus search input when opening
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, searchable]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setSearch(''); buttonRef.current?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const filtered = searchable && search.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.description?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch('');
    buttonRef.current?.focus();
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} ref={containerRef}>
      {label && (
        <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">
          {label}
        </label>
      )}

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="listbox"
          name={name}
          style={{ borderRadius: '4px' }}
          className={`
            w-full
            bg-clinical-cream
            border ${error ? 'border-[#C94F4F]' : open ? 'border-primary-container ring-1 ring-primary-container' : 'border-outline-variant/20'}
            px-4 py-3
            text-clinical-charcoal
            text-body text-sm text-left
            transition-all
            flex items-center justify-between gap-3
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-container/40 cursor-pointer'}
          `}
        >
          <span className={selectedOption ? 'text-clinical-charcoal' : 'text-clinical-stone/60'}>
            {selectedOption?.label ?? placeholder}
          </span>
          <span
            className="material-symbols-outlined text-clinical-stone text-[18px] transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
          >
            expand_more
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute z-40 mt-1 w-full bg-clinical-white shadow-card-md border border-outline-variant/20 max-h-72 overflow-hidden"
              style={{ borderRadius: '6px' }}
              role="listbox"
            >
              {searchable && (
                <div className="p-2 border-b border-outline-variant/10">
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full bg-clinical-cream px-3 py-2 text-body text-sm text-clinical-charcoal placeholder-clinical-stone/50 focus:outline-none"
                    style={{ borderRadius: '3px' }}
                  />
                </div>
              )}

              <div className="overflow-y-auto max-h-60">
                {filtered.length === 0 ? (
                  <div className="px-4 py-3 text-body text-sm text-clinical-stone">No matches</div>
                ) : (
                  filtered.map(option => {
                    const selected = option.value === value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(option.value)}
                        role="option"
                        aria-selected={selected}
                        className={`w-full text-left px-4 py-2.5 transition-colors flex items-start gap-3 ${
                          selected
                            ? 'bg-primary-container/10 text-primary-container'
                            : 'hover:bg-clinical-cream text-clinical-charcoal'
                        }`}
                      >
                        <span
                          className={`material-symbols-outlined text-[16px] mt-0.5 flex-shrink-0 ${
                            selected ? 'text-primary-container' : 'text-transparent'
                          }`}
                        >
                          check
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-body text-sm ${selected ? 'font-semibold' : ''}`}>{option.label}</p>
                          {option.description && (
                            <p className="text-body text-clinical-stone text-xs mt-0.5 leading-relaxed">{option.description}</p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && <p className="text-precision text-[0.68rem] text-[#C94F4F] tracking-wide">{error}</p>}
      {hint && !error && <p className="text-body text-[0.75rem] text-clinical-stone">{hint}</p>}
    </div>
  );
});

CustomSelect.displayName = 'CustomSelect';
