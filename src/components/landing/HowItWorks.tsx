// src/components/landing/HowItWorks.tsx
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const STEPS = [
  {
    number: '01',
    icon: 'upload_file',
    title: 'Upload Your Labs',
    body: 'Drag and drop your bloodwork PDF from any lab — LabCorp, Quest, hospital systems, or any standard lab report. Our AI reads every value on the page.',
    detail: 'PDF upload · Automatic extraction · Manual entry alternative',
  },
  {
    number: '02',
    icon: 'biotech',
    title: 'Get Root Cause Analysis',
    body: 'We compare your values against optimal ranges, identify patterns across multiple markers, connect your medications to your symptoms, and surface what 12-minute appointments miss.',
    detail: 'Optimal ranges · Pattern detection · Medication depletions · Symptom links',
  },
  {
    number: '03',
    icon: 'description',
    title: 'Walk In Prepared',
    body: 'Download your doctor visit prep document — formatted as a clinical reference with ICD-10 billing codes for every test you need. Your insurance covers it when the codes are right.',
    detail: 'ICD-10 codes · Insurance coverage guide · Specialist referrals · PDF download',
  },
];

export const HowItWorks = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.2 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="bg-clinical-cream py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-20">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-4 h-px bg-primary-container" />
            <span className="text-precision text-[0.68rem] text-primary-container tracking-widest uppercase font-bold">
              The Process
            </span>
          </div>
          <h2 className="text-authority text-4xl md:text-5xl font-bold text-clinical-charcoal leading-tight">
            From labs to answers<br />in minutes.
          </h2>
        </div>

        <div ref={ref} className="relative">
          <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-outline-variant/20 z-0" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 relative z-10">
            {STEPS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={visible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.2, ease: 'easeOut' }}
                className="flex flex-col"
              >
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-white text-[18px]">
                      {step.icon}
                    </span>
                  </div>
                  <span className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold">
                    Step {step.number}
                  </span>
                </div>

                <h3 className="text-authority text-2xl text-clinical-charcoal font-semibold mb-4 leading-tight">
                  {step.title}
                </h3>
                <p className="text-body text-clinical-stone text-sm leading-relaxed mb-6 flex-1">
                  {step.body}
                </p>

                <div className="flex flex-wrap gap-2">
                  {step.detail.split(' · ').map((tag) => (
                    <span
                      key={tag}
                      className="text-precision text-[0.6rem] tracking-wider bg-clinical-white border border-outline-variant/20 text-clinical-stone px-2 py-1 rounded-sm uppercase"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-16 pt-12 border-t border-outline-variant/15">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h3 className="text-authority text-2xl text-clinical-charcoal font-semibold">
                Ready to see what your labs actually mean?
              </h3>
              <p className="text-body text-clinical-stone text-sm mt-2">
                Start free. Upload your first lab report in 60 seconds.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/register'}
              className="bg-primary-container text-white px-8 py-4 text-base font-body font-medium hover:bg-[#2D6A4F] transition-colors flex-shrink-0"
              style={{ borderRadius: '6px' }}
            >
              Upload My Labs
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
