// src/components/ScrollToTop.tsx
//
// Mounts inside the Router and scrolls the window to the top whenever the
// pathname changes. Without this, navigating from a long page (Lab Analytics)
// to a short one (Wellness Plan tabs) lands the user at the OLD scroll
// position — the new page's hero is offscreen, looks broken.
//
// Renders nothing. Just a side-effect on route change.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    // Some browsers (Safari) don't honor scrollTo when the new view hasn't
    // committed yet — wrap in a microtask so React has a chance to paint
    // the new page first.
    queueMicrotask(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  }, [pathname]);
  return null;
};
