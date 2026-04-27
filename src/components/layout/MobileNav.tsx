// src/components/layout/MobileNav.tsx
import { useLocation, useNavigate } from 'react-router-dom';

const MOBILE_ITEMS = [
  { label: 'Home',      icon: 'grid_view',   path: '/dashboard' },
  { label: 'Labs',      icon: 'biotech',     path: '/labs' },
  { label: 'Wellness',  icon: 'favorite',    path: '/wellness' },
  { label: 'Prep',      icon: 'description', path: '/doctor-prep' },
  { label: 'More',      icon: 'menu',        path: '/settings' },
];

interface MobileNavProps { currentPath?: string; }

export const MobileNav = ({ currentPath: _currentPath }: MobileNavProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav
      className="fixed bottom-0 left-0 w-full flex justify-around items-center px-3 pt-3 md:hidden bg-[#131313] z-50 rounded-t-xl shadow-dark"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      {MOBILE_ITEMS.map(item => {
        const active = isActive(item.path);
        return (
          <button key={item.path} onClick={() => navigate(item.path)}
            className={`flex flex-col items-center py-1 px-3 rounded-lg transition-all ${active ? 'text-[#A5D0B9] bg-[#1C1B1B]' : 'text-gray-500'}`}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-precision text-[0.68rem] mt-1 uppercase tracking-wider">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
