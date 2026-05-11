// src/components/landing/HowItWorks.tsx
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const STEPS = [
  {
    number: '01',
    icon: 'upload_file',
    title: 'Upload Your Bloodwork',
    body: 'Drag and drop any lab PDF or take a photo — LabCorp, Quest, MyChart, hospital systems, paper printouts. Our AI extracts every value in 30 seconds. Add more files to the same draw if your CRP comes back later.',
    detail: 'PDF + photo · Auto-extraction · Manual entry · Add-to-draw',
  },
  {
    number: '02',
    icon: 'biotech',
    title: 'Pattern + Watch-List Engine',
    body: 'Educational optimal-range views on every value (not just "in/out of standard range"). Watch list highlights drift worth discussing earlier with your doctor. Cross-marker patterns to review with them: atherogenic LDL particles, A1c trending up, inflammation markers, thyroid-axis patterns, polycythemia signals. Medication-nutrient depletions mapped automatically (statin → CoQ10, metformin → B12, PPI → Mg).',
    detail: 'Optimal ranges · Pattern surfacing · Depletion mapping · Critical-value alerts',
  },
  {
    number: '03',
    icon: 'favorite',
    title: '90-Day Plan + Supplement Stack',
    body: 'Evidence-based supplement stack sourced from your specific labs (curcumin for elevated CRP, selenium for thyroid antibody patterns, berberine for A1c trending up) — with alternatives, dose, timing, and drug-interaction notes. Eating pattern. Workouts. AI chat that reads your specific labs. Educational expectations for your 12-week retest from published research. Talk to your doctor before changing any medication or supplement.',
    detail: 'Lab-driven supplements · Alternatives + interactions · Educational expectations · AI chat',
  },
  {
    number: '04',
    icon: 'description',
    title: 'Doctor Prep — Walk In Ready',
    body: 'Doctor Prep PDF organized for your next appointment: tests worth asking your doctor about, with reference ICD-10 codes they can use when ordering (coverage depends on your plan), medication alternatives to discuss, cross-specialty synthesis (endo + cardio + gyn + GI in one document), and questions to bring up. Hand it to your doctor and make the most of the visit.',
    detail: 'ICD-10 reference codes · Med-alternative talking points · Cross-specialty synthesis · Questions to ask',
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
            From labs to a doctor-ready<br />analysis in minutes.
          </h2>
        </div>

        <div ref={ref} className="relative">
          <div className="hidden md:block absolute top-12 left-0 right-0 h-px bg-outline-variant/20 z-0" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 md:gap-8 relative z-10">
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
                Ready to walk into your next visit prepared?
              </h3>
              <p className="text-body text-clinical-stone text-sm mt-2">
                $19, one-time. Upload your bloodwork in 60 seconds.
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
