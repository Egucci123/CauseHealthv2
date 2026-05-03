// src/components/layout/MobileNav.tsx
//
// Bottom mobile nav. 5 main items + "More" sheet that exposes everything
// else (Coach, Doctor Prep, Glossary, Settings, Sign out). Was previously
// just 5 items where Progress and Glossary weren't reachable from mobile.
//
// Tap targets are 56×56 minimum (above the 44×44 floor) so older users can
// reliably hit them. Active state has a thicker color band + bg so it reads
// at a glance.

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';

interface NavItem {
  label: string;
  icon: string;
  path: string;
}

// Top 4 — the core product surfaces
const PRIMARY_ITEMS: NavItem[] = [
  { label: 'Home',     icon: 'grid_view',   path: '/dashboard' },
  { label: 'Labs',     icon: 'biotech',     path: '/labs' },
  { label: 'Wellness', icon: 'favorite',    path: '/wellness' },
  { label: 'Doc Prep', icon: 'description', path: '/doctor-prep' },
];

// Everything else lives in the More sheet — keeps the bar uncluttered.
// AI Coach intentionally NOT here — it's the floating button on every page.
const MORE_ITEMS: NavItem[] = [
  { label: 'Glossary',      icon: 'menu_book',      path: '/glossary' },
  { label: 'Settings',      icon: 'settings',       path: '/settings' },
];

export const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const signOut = useAuthStore(s => s.signOut);

  const isActive = (path: string) =>
    path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(path);

  // "More" tab is "active" if the current route is in MORE_ITEMS
  const moreActive = MORE_ITEMS.some(i => isActive(i.path));

  const handleNavigate = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around items-stretch px-1 pt-2 md:hidden bg-[#131313] z-50 border-t border-[#414844]/30 shadow-[0_-4px_16px_rgba(0,0,0,0.25)]"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        {PRIMARY_ITEMS.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={`flex flex-col items-center justify-center min-h-[56px] flex-1 rounded-lg transition-all relative ${
                active ? 'text-[#A5D0B9]' : 'text-gray-400'
              }`}
              aria-label={item.label}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#A5D0B9] rounded-full" />
              )}
              <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
              <span className={`text-[0.68rem] mt-0.5 font-semibold tracking-wide ${active ? 'text-[#A5D0B9]' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex flex-col items-center justify-center min-h-[56px] flex-1 rounded-lg transition-all relative ${
            moreOpen || moreActive ? 'text-[#A5D0B9]' : 'text-gray-400'
          }`}
          aria-label="More options"
          aria-expanded={moreOpen}
        >
          {(moreOpen || moreActive) && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#A5D0B9] rounded-full" />
          )}
          <span className="material-symbols-outlined text-[22px]">{moreOpen ? 'close' : 'menu'}</span>
          <span className={`text-[0.68rem] mt-0.5 font-semibold tracking-wide ${moreOpen || moreActive ? 'text-[#A5D0B9]' : 'text-gray-400'}`}>
            More
          </span>
        </button>
      </nav>

      {/* More sheet — slides up from the bottom over a backdrop */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/40 z-40 md:hidden"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="fixed left-0 right-0 bg-clinical-cream rounded-t-[20px] z-50 md:hidden shadow-2xl overflow-hidden"
              style={{
                bottom: 'calc(56px + env(safe-area-inset-bottom) + 8px)',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
            >
              <div className="px-1 pt-3 pb-3 flex justify-center">
                <div className="w-10 h-1 bg-clinical-stone/30 rounded-full" />
              </div>

              <div className="px-4 pb-4">
                <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-widest font-bold mb-3 px-2">More</p>
                <div className="grid grid-cols-2 gap-2">
                  {MORE_ITEMS.map(item => {
                    const active = isActive(item.path);
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        className={`flex items-center gap-3 px-4 py-4 rounded-[12px] text-left min-h-[56px] transition-colors ${
                          active
                            ? 'bg-primary-container/15 text-primary-container border border-primary-container/30'
                            : 'bg-clinical-white border border-outline-variant/15 text-clinical-charcoal'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                        <span className="text-body text-sm font-semibold leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sign out — destructive, separated visually */}
                <button
                  onClick={async () => { setMoreOpen(false); await signOut(); }}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-4 rounded-[12px] min-h-[56px] bg-clinical-white border border-outline-variant/15 text-clinical-stone"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  <span className="text-body text-sm font-medium">Sign out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
