// src/pages/company/Contact.tsx
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';

const REASONS: { emoji: string; title: string; body: string; cta: string; href: string }[] = [
  {
    emoji: '🐛',
    title: 'Found a bug?',
    body: "Tell us what happened, what you expected, and the page you were on. Screenshot helps. We'll get on it.",
    cta: 'hello@causehealth.app',
    href: 'mailto:hello@causehealth.app?subject=Bug%20report',
  },
  {
    emoji: '💡',
    title: 'Have an idea?',
    body: "Feature requests, biomarkers we don't cover, ways the AI could be sharper — we read every email.",
    cta: 'feedback@causehealth.app',
    href: 'mailto:feedback@causehealth.app?subject=Feature%20idea',
  },
  {
    emoji: '🤝',
    title: 'Partnership or press?',
    body: 'Podcasters, clinicians, integrators, journalists — we love hearing from people building in this space.',
    cta: 'partners@causehealth.app',
    href: 'mailto:partners@causehealth.app?subject=Partnership',
  },
  {
    emoji: '🩺',
    title: 'Medical concern?',
    body: "We're educational only — we can't give medical advice. For urgent matters call your doctor or 911. For interpretation questions, email us.",
    cta: 'support@causehealth.app',
    href: 'mailto:support@causehealth.app?subject=Question',
  },
];

export const Contact = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <main className="max-w-4xl mx-auto px-6 py-24 md:py-32">
      <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">Contact</p>
      <h1 className="text-authority text-4xl md:text-5xl text-clinical-charcoal font-bold mb-6 leading-tight">
        Tell us what you need.
      </h1>
      <p className="text-body text-clinical-stone text-lg max-w-2xl mb-12">
        Real humans answer. We try to respond within 24 hours, often the same day.
      </p>

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
            <p className="text-precision text-[0.65rem] font-bold tracking-wider text-primary-container">
              {r.cta} →
            </p>
          </a>
        ))}
      </div>
    </main>
    <LandingFooter />
  </div>
);
