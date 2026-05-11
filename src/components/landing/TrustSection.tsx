// src/components/landing/TrustSection.tsx

const TRUST_PILLARS = [
  {
    icon: 'menu_book',
    title: 'Evidence-based only',
    body: 'Every optimal range, every depletion pathway, every supplement recommendation references peer-reviewed clinical literature. No wellness trends. No unproven interventions.',
  },
  {
    icon: 'gavel',
    title: 'References only FDA-approved medications',
    body: 'When medications are referenced, we cite only FDA-approved drugs and evidence-based supplements. No gray-market compounds, no unapproved protocols. CauseHealth does not prescribe — talk to your doctor or pharmacist before any medication change.',
  },
  {
    icon: 'lock',
    title: 'Your data is yours',
    body: 'Health data is encrypted in transit and at rest, with database-level access controls so only you can see your own data. We are not a HIPAA-covered entity (see our Privacy Policy), but apply HIPAA-grade security practices. You can export or delete all your data at any time. We never sell data.',
  },
  {
    icon: 'verified',
    title: 'ICD-10 codes updated annually',
    body: 'Our insurance billing code database is reviewed and updated every year. Codes that justify coverage for the tests you actually need.',
  },
];

export const TrustSection = () => (
  <section className="bg-clinical-cream py-24 md:py-28 border-t border-outline-variant/10">
    <div className="max-w-6xl mx-auto px-6">
      <div className="mb-16">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-4 h-px bg-primary-container" />
          <span className="text-precision text-[0.68rem] text-primary-container tracking-widest uppercase font-bold">
            Built on Evidence
          </span>
        </div>
        <h2 className="text-authority text-4xl md:text-5xl font-bold text-clinical-charcoal leading-tight">
          Not wellness trends.<br />Clinical standards.
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {TRUST_PILLARS.map((pillar) => (
          <div key={pillar.title} className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
            <span className="material-symbols-outlined text-primary-container text-3xl mb-4 block">
              {pillar.icon}
            </span>
            <h3 className="text-body text-clinical-charcoal font-semibold mb-3">
              {pillar.title}
            </h3>
            <p className="text-body text-clinical-stone text-sm leading-relaxed">
              {pillar.body}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-[#131313] rounded-[10px] p-10 md:p-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-authority text-3xl text-white font-bold leading-tight mb-4">
              Walk into your next visit<br />with the full picture.
            </h3>
            <p className="text-body text-on-surface-variant text-base leading-relaxed">
              Upload your bloodwork in 60 seconds. Start free.
              No credit card required.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 md:justify-end">
            <button
              onClick={() => window.location.href = '/register'}
              className="bg-primary-container text-white px-8 py-4 text-base font-body font-medium hover:bg-[#2D6A4F] transition-colors"
              style={{ borderRadius: '6px' }}
            >
              Upload My Labs — Free
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
);
