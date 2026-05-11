// src/pages/company/Blog.tsx
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Button } from '../../components/ui/Button';

export const Blog = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <main className="max-w-3xl mx-auto px-6 py-24 md:py-32">
      <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">Blog</p>
      <h1 className="text-authority text-4xl md:text-5xl text-clinical-charcoal font-bold mb-6 leading-tight">
        Notes, biomarker explainers,<br />and stories from the build.
      </h1>
      <p className="text-body text-clinical-stone text-lg max-w-2xl mb-12">
        Coming soon. Sign up for the newsletter to be the first to read what we publish —
        deep dives on biomarkers most doctors skip, what the labs actually mean, and behind-the-scenes
        on building CauseHealth.
      </p>

      <div className="bg-clinical-white rounded-[14px] border-t-[3px] border-primary-container p-8">
        <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">In the meantime</p>
        <p className="text-body text-clinical-charcoal text-base mb-5 leading-relaxed">
          The fastest way to learn what's actually in your bloodwork is to upload it.
          We'll help you make the most of your next 12-minute appointment.
        </p>
        <a href="/register">
          <Button variant="primary" size="md" icon="upload_file">Upload My Labs — Free</Button>
        </a>
      </div>
    </main>
    <LandingFooter />
  </div>
);
