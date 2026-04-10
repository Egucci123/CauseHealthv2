// src/components/layout/TopBar.tsx
import { useAuthStore } from '../../store/authStore';

interface TopBarProps { title: string; subtitle?: string; }

export const TopBar = ({ title, subtitle }: TopBarProps) => {
  const { profile } = useAuthStore();
  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase() : '?';

  return (
    <header className="flex justify-between items-center w-full px-6 py-4 bg-[#131313] sticky top-0 z-40 border-b border-[#414844]/15">
      <div className="flex items-center gap-4">
        <button className="text-[#A5D0B9] md:hidden"><span className="material-symbols-outlined">menu</span></button>
        <div>
          <h1 className="text-2xl font-serif text-white tracking-tight">{title}</h1>
          {subtitle && <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="text-on-surface-variant hover:text-white transition-colors"><span className="material-symbols-outlined">notifications</span></button>
        <div className="w-9 h-9 rounded-full bg-primary-container flex items-center justify-center border border-primary-container/50">
          <span className="text-precision text-[0.68rem] text-white font-bold">{initials}</span>
        </div>
      </div>
    </header>
  );
};
