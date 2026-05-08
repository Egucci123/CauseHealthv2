// src/components/layout/TopBar.tsx
import { useAuthStore } from '../../store/authStore';

interface TopBarProps { title: string; subtitle?: string; }

export const TopBar = ({ title, subtitle }: TopBarProps) => {
  const { profile } = useAuthStore();
  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase() : '?';

  return (
    <header
      className="flex justify-between items-center gap-3 w-full px-4 sm:px-6 bg-[#131313] sticky top-0 z-40 border-b border-[#414844]/15"
      style={{
        paddingTop: 'calc(0.875rem + env(safe-area-inset-top))',
        paddingBottom: '0.875rem',
      }}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-serif text-white tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-precision text-[0.65rem] sm:text-[0.7rem] text-on-surface-variant tracking-widest uppercase truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary-container flex items-center justify-center border border-primary-container/50 flex-shrink-0">
        <span className="text-precision text-[0.7rem] sm:text-[0.75rem] text-white font-bold">{initials}</span>
      </div>
    </header>
  );
};
