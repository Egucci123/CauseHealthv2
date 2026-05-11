// src/components/landing/TwoDrawJourney.tsx
//
// Composite-illustration landing-page section that walks through the
// two-draw arc:
//   1. Initial panel + symptoms.
//   2. CauseHealth surfaces patterns and tells the patient exactly which
//      additional tests are worth asking their doctor about.
//   3. 12 weeks later: a second draw shows what those tests revealed,
//      which the patient brings back to their doctor for diagnosis.
//
// IMPORTANT — these cases are composite illustrations, NOT real patients
// and NOT app-generated diagnoses. The app surfaces patterns; doctors
// diagnose. The user-visible language must reflect that distinction:
// "patternSurfaced" not "diagnosisFound", "pattern surfaced for your
// doctor" not "diagnosis confirmed". FDA CDS guidance carve-out depends
// on the user being able to see we're presenting educational patterns,
// not naming diseases.

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
  /** Pattern label shown to the user. NEVER a diagnosis — patterns the
   *  app surfaces to bring to a doctor. */
  patternSurfaced: string;
  accent: string;
}

const CASES: Case[] = [
  {
    patient: '38F · fatigue, cold hands, hair thinning',
    initialSymptoms: ['Chronic fatigue', 'Cold hands and feet', 'Hair thinning', 'Brain fog'],
    doctorOrdered: ['CBC', 'CMP', 'TSH = 3.2', 'Lipid panel'],
    doctorVerdict: '"Your labs are normal. Try sleeping more."',
    appReadsPattern: 'TSH 3.2 sits at the upper end of the standard reference range. Combined with these symptoms, it\'s a thyroid-axis pattern worth discussing — the full thyroid story isn\'t on this panel.',
    appAsksFor: ['Free T4', 'Free T3', 'Reverse T3', 'TPO antibodies', 'Thyroglobulin antibodies', 'Ferritin', 'Vitamin D 25-OH'],
    twelveWeekResult: 'Second draw: TPO 285, Free T4 0.85, Ferritin 22. A clear pattern for the doctor to evaluate.',
    patternSurfaced: 'Thyroid-axis pattern',
    accent: '#1B423A',
  },
  {
    patient: '27F · irregular periods, acne, weight gain',
    initialSymptoms: ['Irregular periods', 'Adult acne', 'Weight gain', 'Sugar cravings'],
    doctorOrdered: ['CBC', 'CMP', 'TSH', 'Lipid panel'],
    doctorVerdict: '"Cycle issues are normal. Try birth control."',
    appReadsPattern: 'Cycle changes + acne + weight gain + sugar cravings is a hyperandrogen + insulin-pattern worth discussing. The basic panel doesn\'t look at any of those axes.',
    appAsksFor: ['Total Testosterone', 'Free Testosterone', 'SHBG', 'DHEA-S', 'LH + FSH', 'Fasting Insulin + HOMA-IR', 'HbA1c'],
    twelveWeekResult: 'Second draw: Total T 82, DHEA-S 425, LH:FSH ratio 3.2, Fasting insulin 22. The pattern is now on paper for the doctor.',
    patternSurfaced: 'Hyperandrogen + insulin pattern',
    accent: '#C94F4F',
  },
  {
    patient: '52M · fatigue, achy joints, slightly off liver enzymes',
    initialSymptoms: ['Chronic fatigue', 'Joint pain', 'Brain fog'],
    doctorOrdered: ['CBC', 'CMP', 'ALT 58', 'Lipid panel'],
    doctorVerdict: '"Mild liver bump. Cut back on alcohol."',
    appReadsPattern: 'ALT mildly elevated + fatigue + joint pain in a 52-year-old man is a pattern worth ruling iron overload in or out — iron studies are the deciding tests, and they aren\'t on a basic panel.',
    appAsksFor: ['Ferritin', 'Iron', 'TIBC', 'Transferrin Saturation', 'GGT', 'Liver Ultrasound (if iron studies suggest it)', 'HFE gene testing'],
    twelveWeekResult: 'Second draw: Ferritin 920, Iron sat 65%, HFE C282Y homozygous. The pattern the doctor needs is now in front of them.',
    patternSurfaced: 'Iron-overload pattern',
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
            How CauseHealth surfaces patterns for your next visit
          </p>
          <h2 className="text-authority text-3xl md:text-5xl text-clinical-charcoal font-bold leading-tight mb-4">
            The two-draw arc, end to end.
          </h2>
          <p className="text-body text-clinical-stone text-lg leading-relaxed">
            Many patterns don't fit in the basic panel your PCP ordered. CauseHealth reads what's there,
            connects it to your symptoms, and helps you ask for the right follow-up tests. Twelve weeks
            later, the second draw gives your doctor a clearer picture.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-clinical-cream/60 border border-clinical-stone/30 rounded-full">
            <span className="material-symbols-outlined text-[14px] text-clinical-stone">info</span>
            <span className="text-precision text-[0.6rem] font-bold tracking-wider uppercase text-clinical-stone">
              Composite illustrations · not real patients · not a diagnosis
            </span>
          </div>
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
                {caseItem.patternSurfaced}
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
                Pattern surfaced for your doctor
              </p>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: `${c.accent}30`, border: `1px solid ${c.accent}` }}
              >
                <span className="material-symbols-outlined text-[16px]" style={{ color: c.accent }}>
                  check_circle
                </span>
                <span className="text-precision text-[0.7rem] font-bold tracking-wide" style={{ color: c.accent }}>
                  {c.patternSurfaced}
                </span>
              </div>
              <p className="text-body text-clinical-white/60 text-xs leading-relaxed mt-4">
                Your plan adapts. Your next doctor visit has a starting point.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Disclaimer footer */}
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide leading-relaxed mt-6 max-w-3xl">
          The cases above are <strong>composite illustrations</strong> — not real patients, not predictions
          for your data, and not diagnoses. CauseHealth surfaces patterns in your bloodwork and symptoms;
          your doctor diagnoses, treats, and prescribes.
        </p>
      </div>
    </section>
  );
};
