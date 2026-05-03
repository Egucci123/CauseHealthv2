// src/components/layout/TopBar.tsx
import { useAuthStore } from '../../store/authStore';

interface TopBarProps { title: string; subtitle?: string; }

export const TopBar = ({ title, subtitle }: TopBarProps) => {
  const { profile } = useAuthStore();
  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase() : '?';

  return (
    <header
      className="flex justify-between items-center w-full px-6 bg-[#131313] sticky top-0 z-40 border-b border-[#414844]/15"
      style={{
        paddingTop: 'calc(1rem + env(safe-area-inset-top))',
        paddingBottom: '1rem',
      }}
    >
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-serif text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-precision text-[0.7rem] text-on-surface-variant tracking-widest uppercase">{subtitle}</p>}
        </div>
      </div>
      <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center border border-primary-container/50">
        <span className="text-precision text-[0.75rem] text-white font-bold">{initials}</span>
      </div>
    </header>
  );
};
