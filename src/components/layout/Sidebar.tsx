// src/components/layout/Sidebar.tsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const NAV_ITEMS = [
  { label: 'Intelligence Hub',  icon: 'analytics',    path: '/dashboard' },
  { label: 'Lab Analytics',     icon: 'biotech',       path: '/labs' },
  { label: 'Wellness Protocol', icon: 'favorite',      path: '/wellness' },
  { label: 'Medications',       icon: 'medication',    path: '/medications' },
  { label: 'Symptoms',          icon: 'monitor_heart', path: '/symptoms' },
  { label: 'Clinical Prep',     icon: 'description',   path: '/doctor-prep' },
  { label: 'Progress',          icon: 'trending_up',   path: '/progress' },
  { label: 'Glossary',          icon: 'menu_book',     path: '/glossary' },
  { label: 'Settings',          icon: 'settings',      path: '/settings' },
];

interface SidebarProps { currentPath?: string; }

export const Sidebar = ({ currentPath: _currentPath }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut } = useAuthStore();

  const isActive = (path: string) => path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);

  const initials = profile?.firstName && profile?.lastName
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : profile?.firstName?.[0]?.toUpperCase() ?? 'U';

  const tierLabel = { free: 'Free Plan', pro: 'Pro Plan', comp: 'Pro · Comp' }[profile?.subscriptionTier ?? 'free'];

  return (
    <aside className="hidden md:flex flex-col h-full w-72 fixed left-0 top-0 border-r border-[#414844]/15 bg-[#131313] z-50">
      <div className="px-6 py-8">
        <button onClick={() => navigate('/dashboard')} className="text-3xl font-serif text-white hover:opacity-90 transition-opacity text-left">
          CauseHealth<span className="text-primary-container">.</span>
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 px-3 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = isActive(item.path);
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={`flex items-center gap-3.5 px-3 py-3 w-full text-left text-[0.875rem] transition-all duration-150 ${active ? 'text-white border-l-4 border-[#1B4332] bg-[#1C1B1B] font-semibold pl-2' : 'text-gray-400 opacity-80 hover:opacity-100 hover:bg-[#1C1B1B] hover:text-white rounded-lg'}`}>
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-5 border-t border-[#414844]/20">
        {profile?.subscriptionTier === 'free' && (
          <button onClick={() => navigate('/settings')} className="w-full mb-3 bg-primary-container/20 border border-primary-container/30 rounded-lg px-3 py-2.5 text-left hover:bg-primary-container/30 transition-colors">
            <p className="text-precision text-[0.6rem] text-primary font-bold tracking-widest uppercase">Upgrade to Core</p>
            <p className="text-body text-on-surface-variant/70 text-xs mt-0.5">Unlock your full wellness plan</p>
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
            <span className="text-precision text-[0.68rem] text-white font-bold">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-body text-[0.8rem] text-white font-medium truncate">{profile?.firstName} {profile?.lastName}</p>
            <p className="text-precision text-[0.6rem] text-on-surface-variant tracking-wider uppercase">{tierLabel}</p>
          </div>
          <button onClick={signOut} className="text-on-surface-variant/40 hover:text-on-surface-variant transition-colors" title="Sign out">
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
