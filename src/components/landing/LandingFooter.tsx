// src/components/landing/LandingFooter.tsx

const FOOTER_LINKS = {
  Product: [
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Conditions', href: '#conditions' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
    { label: 'Blog', href: '/blog' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Medical Disclaimer', href: '/disclaimer' },
  ],
};

export const LandingFooter = () => (
  <footer className="bg-[#131313] border-t border-[#414844]/20">
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
        <div className="md:col-span-1">
          <a href="/" className="text-2xl font-serif text-white mb-4 block">
            CauseHealth<span className="text-primary-container">.</span>
          </a>
          <p className="text-body text-on-surface-variant text-sm leading-relaxed">
            Root cause medicine.<br />Finally accessible.
          </p>
        </div>

        {Object.entries(FOOTER_LINKS).map(([category, links]) => (
          <div key={category}>
            <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold mb-4">
              {category}
            </p>
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-body text-on-surface-variant/60 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[#414844]/20 pt-8 mb-8">
        <div className="bg-surface-container-low rounded-lg p-6">
          <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold mb-3">
            Medical Disclaimer
          </p>
          <p className="text-body text-on-surface-variant/60 text-xs leading-relaxed">
            CauseHealth. is an educational platform. The information provided does not
            constitute medical advice and is not a substitute for evaluation by a licensed
            healthcare provider. Lab value interpretations, supplement recommendations, and
            wellness protocols are generated for informational purposes only. Always discuss
            any health findings and proposed interventions with your physician before making
            changes to your medications, supplements, or health practices. In the event of a
            medical emergency, call 911 or go to your nearest emergency room immediately.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <p className="text-precision text-[0.6rem] text-on-surface-variant/40 tracking-wider">
          © 2026 CauseHealth. All rights reserved. Patent Pending.
        </p>
        <p className="text-precision text-[0.6rem] text-on-surface-variant/40 tracking-wider">
          Powered by Claude AI · Not FDA evaluated · Not medical advice
        </p>
      </div>
    </div>
  </footer>
);
