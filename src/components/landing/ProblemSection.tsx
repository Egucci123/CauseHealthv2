// src/components/landing/ProblemSection.tsx
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const PROBLEMS = [
  {
    icon: 'troubleshoot',
    title: 'Your labs say normal.\nYou feel terrible.',
    body: 'Standard lab ranges are built from broad reference populations — "in range" can still mean a value worth a conversation. Vitamin D at 24 ng/mL might be flagged in range while sitting well below the functional optimal of 50-70. CauseHealth surfaces these in-range-but-suboptimal patterns so you can bring them up at your next visit.',
    accent: '#C94F4F',
    label: 'The Range Problem',
  },
  {
    icon: 'medication',
    title: 'Your medication is\ncausing your symptoms.',
    body: 'Atorvastatin is associated with CoQ10 depletion. Mesalamine and methotrexate can affect folate status. Metformin and PPIs can affect B12 absorption. These are documented drug-nutrient interactions worth monitoring — CauseHealth surfaces them and adds the appropriate workup tests to your doctor-prep document so you can discuss whether testing is right for you.',
    accent: '#E8922A',
    label: 'The Depletion Problem',
  },
  {
    icon: 'schedule',
    title: 'Your doctor has no time\nto connect the dots.',
    body: 'The average primary care appointment is 12 minutes. You have multiple conditions, multiple medications, years of history, and a list of symptoms that don\'t make sense individually. In 12 minutes, a pattern that takes 20 minutes to see never gets seen. That is not your doctor\'s fault. It is a systemic failure.',
    accent: '#1B4332',
    label: 'The Time Problem',
  },
];

export const ProblemSection = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="problem" className="bg-[#131313] py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-16">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-4 h-px bg-primary" />
            <span className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold">
              Why Conventional Medicine Fails
            </span>
          </div>
          <h2 className="text-authority text-4xl md:text-5xl font-bold text-white leading-tight">
            The 12-Minute Problem
          </h2>
          <p className="text-body text-on-surface-variant text-lg mt-4 max-w-xl leading-relaxed">
            Three systematic failures that explain why intelligent, motivated people
            spend years feeling terrible while their labs say everything is fine.
          </p>
        </div>

        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROBLEMS.map((problem, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              animate={visible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15, ease: 'easeOut' }}
              className="bg-clinical-white rounded-[10px] overflow-hidden"
              style={{ borderTop: `3px solid ${problem.accent}` }}
            >
              <div className="p-8">
                <p
                  className="text-precision text-[0.68rem] font-bold tracking-widest uppercase mb-6"
                  style={{ color: problem.accent }}
                >
                  {problem.label}
                </p>
                <span
                  className="material-symbols-outlined text-4xl mb-6 block"
                  style={{ color: problem.accent }}
                >
                  {problem.icon}
                </span>
                <h3 className="text-authority text-2xl text-clinical-charcoal font-semibold leading-tight mb-4 whitespace-pre-line">
                  {problem.title}
                </h3>
                <p className="text-body text-clinical-stone text-sm leading-relaxed">
                  {problem.body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
