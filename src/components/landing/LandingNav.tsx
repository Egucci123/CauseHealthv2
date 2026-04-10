// src/components/landing/LandingNav.tsx
import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';

export const LandingNav = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navLinks = [
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'What We Find', href: '#features' },
    { label: 'Conditions',   href: '#conditions' },
    { label: 'Pricing',      href: '#pricing' },
  ];

  return (
    <>
      <nav
        className={`
          fixed top-0 left-0 right-0 z-50
          transition-all duration-300
          ${scrolled
            ? 'bg-[#131313] border-b border-[#414844]/15 shadow-md'
            : 'bg-[#131313]'
          }
        `}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <a href="/" className="text-2xl font-serif text-white hover:opacity-90 transition-opacity">
            CauseHealth<span className="text-primary-container">.</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-on-surface-variant hover:text-white text-sm font-body transition-colors duration-150"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            <a
              href="/login"
              className="text-on-surface-variant hover:text-white text-sm font-body transition-colors duration-150"
            >
              Sign In
            </a>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.location.href = '/register'}
            >
              Get Started
            </Button>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-on-surface-variant hover:text-white transition-colors"
            aria-label="Toggle navigation"
          >
            <span className="material-symbols-outlined">
              {mobileOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>

        <div
          className={`
            md:hidden overflow-hidden transition-all duration-300
            ${mobileOpen ? 'max-h-96 border-t border-[#414844]/15' : 'max-h-0'}
            bg-[#131313]
          `}
        >
          <div className="px-6 py-4 space-y-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block text-on-surface-variant hover:text-white text-sm font-body transition-colors py-2"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-[#414844]/20 flex flex-col gap-3">
              <a href="/login" className="text-on-surface-variant text-sm font-body text-center py-2">
                Sign In
              </a>
              <Button
                variant="primary"
                size="md"
                onClick={() => window.location.href = '/register'}
                className="w-full justify-center"
              >
                Get Started Free
              </Button>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};
