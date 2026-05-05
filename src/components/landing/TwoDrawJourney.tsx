// src/components/landing/TwoDrawJourney.tsx
//
// Real-pattern landing-page section that walks through the two-draw arc:
//   1. Doctor orders the basic panel. Symptoms remain. Diagnosis missed.
//   2. CauseHealth reads the basic panel + symptoms, tells the patient
//      exactly what tests to ask for next time.
//   3. 12 weeks later: new labs uploaded. The chain completes — diagnosis
//      surfaces, plan adapts, retest cadence updates.
//
// Three cases drawn from the most underdiagnosed patterns we've verified
// in synthetic + real testing: Hashimoto's, PCOS, and hemochromatosis.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface Case {
  patient: string;
  initialSymptoms: string[];
  doctorOrdered: string[];
  doctorVerdict: string;
  appReadsPattern: string;
  appAsksFor: string[];
  twelveWeekResult: string;
  diagnosisFound: string;
  accent: string;
}

const CASES: Case[] = [
  {
    patient: '38F · fatigue, cold hands, hair thinning',
    initialSymptoms: ['Chronic fatigue', 'Cold hands and feet', 'Hair thinning', 'Brain fog'],
    doctorOrdered: ['CBC', 'CMP', 'TSH = 3.2', 'Lipid panel'],
    doctorVerdict: '"Your labs are normal. Try sleeping more."',
    appReadsPattern: 'TSH 3.2 is technically normal — but with these symptoms, that\'s the upper end of subclinical hypothyroidism. The full thyroid story isn\'t on this panel.',
    appAsksFor: ['Free T4', 'Free T3', 'Reverse T3', 'TPO antibodies', 'Thyroglobulin antibodies', 'Ferritin', 'Vitamin D 25-OH'],
    twelveWeekResult: 'Second draw: TPO 285 (positive), Free T4 0.85 (low-normal), Ferritin 22 (low). Diagnosis lands.',
    diagnosisFound: 'Hashimoto\'s thyroiditis',
    accent: '#1B423A',
  },
  {
    patient: '27F · irregular periods, acne, weight gain',
    initialSymptoms: ['Irregular periods', 'Adult acne', 'Weight gain', 'Sugar cravings'],
    doctorOrdered: ['CBC', 'CMP', 'TSH', 'Lipid panel'],
    doctorVerdict: '"Cycle issues are normal. Try birth control."',
    appReadsPattern: 'Cycle changes + acne + weight gain + sugar cravings is a hyperandrogenic / insulin-resistance pattern. The basic panel doesn\'t look at any of those axes.',
    appAsksFor: ['Total Testosterone', 'Free Testosterone', 'SHBG', 'DHEA-S', 'LH + FSH', 'Fasting Insulin + HOMA-IR', 'HbA1c'],
    twelveWeekResult: 'Second draw: Total T 82, DHEA-S 425, LH:FSH ratio 3.2, Fasting insulin 22. Pattern confirmed.',
    diagnosisFound: 'PCOS (polycystic ovary syndrome)',
    accent: '#C94F4F',
  },
  {
    patient: '52M · fatigue, achy joints, slightly off liver enzymes',
    initialSymptoms: ['Chronic fatigue', 'Joint pain', 'Brain fog'],
    doctorOrdered: ['CBC', 'CMP', 'ALT 58', 'Lipid panel'],
    doctorVerdict: '"Mild liver bump. Cut back on alcohol."',
    appReadsPattern: 'ALT mildly elevated + fatigue + joint pain in a 52yo male is a classic missed pattern for iron overload — not "drink less." Iron studies are the deciding tests, and they aren\'t on a basic panel.',
    appAsksFor: ['Ferritin', 'Iron', 'TIBC', 'Transferrin Saturation', 'GGT', 'Liver Ultrasound (if iron studies confirm)', 'HFE gene testing'],
    twelveWeekResult: 'Second draw: Ferritin 920, Iron sat 65%. Hereditary hemochromatosis confirmed via HFE C282Y homozygous.',
    diagnosisFound: 'Hereditary hemochromatosis',
    accent: '#E8922A',
  },
];

export const TwoDrawJourney = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const c = CASES[active];

  return (
    <section ref={ref} className="bg-clinical-cream py-20 md:py-28" id="examples">
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={visible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mb-12"
        >
          <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">
            How we find what your doctor missed
          </p>
          <h2 className="text-authority text-3xl md:text-5xl text-clinical-charcoal font-bold leading-tight mb-4">
            The two-draw arc that ends with an answer.
          </h2>
          <p className="text-body text-clinical-stone text-lg leading-relaxed">
            Most diagnoses don't fit in the basic panel your PCP ordered. CauseHealth reads what's there,
            connects it to your symptoms, and tells you exactly what to ask for next time. Twelve weeks
            later, the second draw closes the loop.
          </p>
        </motion.div>

        {/* Case picker */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 -mx-2 px-2">
          {CASES.map((caseItem, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`flex-shrink-0 px-5 py-2.5 transition-all ${
                i === active
                  ? 'bg-clinical-charcoal text-clinical-white shadow-card-md'
                  : 'bg-clinical-white text-clinical-stone hover:bg-clinical-white/80 border border-clinical-cream'
              }`}
              style={{ borderRadius: '6px' }}
            >
              <span className="text-precision text-[0.68rem] font-bold tracking-widest uppercase">
                Case {i + 1}
              </span>
              <span className={`block text-body text-sm mt-0.5 ${i === active ? 'text-clinical-white' : 'text-clinical-charcoal'}`}>
                {caseItem.diagnosisFound}
              </span>
            </button>
          ))}
        </div>

        {/* Active case card */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-clinical-white rounded-[14px] shadow-card-md overflow-hidden"
          style={{ borderTop: `4px solid ${c.accent}` }}
        >
          {/* Patient header */}
          <div className="px-6 md:px-8 py-5 border-b border-clinical-cream/60">
            <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone mb-1">
              Patient
            </p>
            <p className="text-authority text-lg text-clinical-charcoal font-semibold">{c.patient}</p>
          </div>

          {/* Three-step grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-clinical-cream/50">
            {/* STEP 1 — what doctor did */}
            <div className="bg-clinical-white p-6 md:p-7">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-clinical-cream">
                  <span className="text-precision text-xs font-bold text-clinical-charcoal">1</span>
                </span>
                <span className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone">
                  At the doctor
                </span>
              </div>
              <p className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone mb-2">
                Symptoms reported
              </p>
              <ul className="space-y-1 mb-4">
                {c.initialSymptoms.map((s, i) => (
                  <li key={i} className="text-body text-clinical-charcoal text-sm flex items-start gap-2">
                    <span className="material-symbols-outlined text-[14px] text-clinical-stone flex-shrink-0 mt-0.5">
                      circle
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <p className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone mb-2">
                Tests ordered
              </p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {c.doctorOrdered.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 bg-clinical-cream/60 text-body text-xs text-clinical-charcoal"
                    style={{ borderRadius: '2px' }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="bg-clinical-cream/40 border-l-2 border-clinical-stone p-3 rounded-r">
                <p className="text-body text-clinical-charcoal text-sm italic leading-snug">{c.doctorVerdict}</p>
              </div>
            </div>

            {/* STEP 2 — what app does */}
            <div className="bg-clinical-white p-6 md:p-7" style={{ borderLeft: `3px solid ${c.accent}` }}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full"
                  style={{ backgroundColor: `${c.accent}20` }}
                >
                  <span className="text-precision text-xs font-bold" style={{ color: c.accent }}>2</span>
                </span>
                <span
                  className="text-precision text-[0.6rem] font-bold tracking-widest uppercase"
                  style={{ color: c.accent }}
                >
                  CauseHealth reads it
                </span>
              </div>
              <p className="text-body text-clinical-charcoal text-sm leading-relaxed mb-4">
                {c.appReadsPattern}
              </p>
              <p className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone mb-2">
                Tests to ask your doctor for
              </p>
              <div className="flex flex-wrap gap-1.5">
                {c.appAsksFor.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-body text-xs"
                    style={{
                      backgroundColor: `${c.accent}10`,
                      color: c.accent,
                      borderRadius: '2px',
                      fontWeight: 600,
                    }}
                  >
                    <span className="material-symbols-outlined text-[12px]">science</span>
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* STEP 3 — 12-week result */}
            <div className="bg-clinical-charcoal text-clinical-white p-6 md:p-7">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-clinical-white/10">
                  <span className="text-precision text-xs font-bold text-clinical-white">3</span>
                </span>
                <span className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-white/70">
                  12 weeks · second upload
                </span>
              </div>
              <p className="text-body text-clinical-white/90 text-sm leading-relaxed mb-4">
                {c.twelveWeekResult}
              </p>
              <p className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-white/60 mb-2">
                Diagnosis confirmed
              </p>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: `${c.accent}30`, border: `1px solid ${c.accent}` }}
              >
                <span className="material-symbols-outlined text-[16px]" style={{ color: c.accent }}>
                  check_circle
                </span>
                <span className="text-precision text-[0.7rem] font-bold tracking-wide" style={{ color: c.accent }}>
                  {c.diagnosisFound}
                </span>
              </div>
              <p className="text-body text-clinical-white/60 text-xs leading-relaxed mt-4">
                Plan adapts. Doctor visit prep updates. The chain closes.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Disclaimer footer */}
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed mt-6 max-w-3xl">
          Cases above are representative patient patterns drawn from CauseHealth's deterministic + AI engines.
          Real users follow the same arc with their own data. Not a diagnosis — pattern matches against your data
          with confirmatory-test recommendations to bring to your doctor.
        </p>
      </div>
    </section>
  );
};
