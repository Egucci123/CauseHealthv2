// src/pages/company/Contact.tsx
//
// Single visible inbox: support@causehealth.app. Everything users need
// in-app routes here.
//
// legal@causehealth.app exists and is referenced in the ToS Section 9
// and the post-signup arbitration confirmation email — those are the
// two places users learn about the opt-out path. We deliberately do NOT
// surface legal@ on the Contact page: one shot at opt-out per the email,
// no extra prompts.
//
// Context-aware layout: signed-in users get the in-app AppShell so the
// route doesn't pull them out of the app and force re-login on return.

import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { AppShell } from '../../components/layout/AppShell';
import { useAuthStore } from '../../store/authStore';

const REASONS: { emoji: string; title: string; body: string; cta: string; href: string }[] = [
  {
    emoji: '🐛',
    title: 'Found a bug?',
    body: "Tell us what happened, what you expected, and the page you were on. Screenshot helps. We'll get on it.",
    cta: 'support@causehealth.app',
    href: 'mailto:support@causehealth.app?subject=Bug%20report',
  },
  {
    emoji: '💡',
    title: 'Have an idea?',
    body: "Feature requests, biomarkers we don't cover, ways the AI could be sharper — we read every email.",
    cta: 'support@causehealth.app',
    href: 'mailto:support@causehealth.app?subject=Feature%20idea',
  },
  {
    emoji: '🤝',
    title: 'Partnership or press?',
    body: 'Podcasters, clinicians, integrators, journalists — we love hearing from people building in this space.',
    cta: 'support@causehealth.app',
    href: 'mailto:support@causehealth.app?subject=Partnership',
  },
  {
    emoji: '🩺',
    title: 'Account, billing, or how-to?',
    body: "We're educational only — we can't give medical advice. For urgent matters call your doctor or 911. For account, billing, or how-to questions, email us.",
    cta: 'support@causehealth.app',
    href: 'mailto:support@causehealth.app?subject=Question',
  },
  {
    emoji: '🔐',
    title: 'Security report?',
    body: "Found a vulnerability? Please email us with reproduction steps. We'll acknowledge within 2 business days.",
    cta: 'support@causehealth.app',
    href: 'mailto:support@causehealth.app?subject=Security%20report',
  },
];

const ContactBody = ({ inApp }: { inApp: boolean }) => (
  <div className={inApp ? '' : 'max-w-4xl mx-auto px-6 py-24 md:py-32'}>
    {!inApp && (
      <>
        <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">Contact</p>
        <h1 className="text-authority text-4xl md:text-5xl text-clinical-charcoal font-bold mb-6 leading-tight">
          Tell us what you need.
        </h1>
      </>
    )}
    <p className="text-body text-clinical-stone text-lg max-w-2xl mb-10">
      Real humans answer. We try to respond within 24 hours, often the same day.
    </p>

    {/* Single inbox call-out — keep it simple. */}
    <div className="bg-clinical-white rounded-[14px] border border-outline-variant/15 p-6 mb-10">
      <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-2">Email us</p>
      <a
        href="mailto:support@causehealth.app"
        className="text-authority text-xl text-clinical-charcoal font-bold hover:text-primary-container break-all"
      >
        support@causehealth.app
      </a>
      <p className="text-body text-clinical-stone text-sm mt-2 leading-relaxed">
        Bugs, ideas, billing, account, security reports, partnerships — everything.
      </p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {REASONS.map((r) => (
        <a
          key={r.title}
          href={r.href}
          className="bg-clinical-white rounded-[14px] border border-outline-variant/15 p-6 hover:border-primary-container/40 hover:shadow-card-md transition-all"
        >
          <span className="text-3xl block mb-3 leading-none">{r.emoji}</span>
          <p className="text-authority text-lg text-clinical-charcoal font-bold mb-2">{r.title}</p>
          <p className="text-body text-clinical-stone text-sm leading-relaxed mb-4">{r.body}</p>
          <p className="text-precision text-[0.65rem] font-bold tracking-wider text-primary-container break-all">
            {r.cta} →
          </p>
        </a>
      ))}
    </div>

    <p className="text-precision text-[0.62rem] text-clinical-stone/70 mt-10 italic leading-relaxed max-w-2xl">
      CauseHealth is a wellness and health-information service. We do not diagnose, treat, or prescribe.
      For medical emergencies call 911. For urgent health questions, contact your doctor.
    </p>
  </div>
);

export const Contact = () => {
  const user = useAuthStore((s) => s.user);

  if (user) {
    return (
      <AppShell pageTitle="Contact" pageSubtitle="Reach out — real humans answer">
        <ContactBody inApp />
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-clinical-cream">
      <LandingNav />
      <main>
        <ContactBody inApp={false} />
      </main>
      <LandingFooter />
    </div>
  );
};
