// src/components/landing/FeaturesSection.tsx
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

const useVisible = (threshold = 0.2) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
};

const OptimalRangeVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
    <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mb-4">
      Vitamin D (25-OH)
    </p>
    <div className="space-y-4">
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-precision text-[0.6rem] text-clinical-stone uppercase">Standard Range</span>
          <span className="inline-block bg-surface-container text-on-surface-variant text-precision text-[0.6rem] px-1.5 py-0.5">NORMAL</span>
        </div>
        <div className="h-2 bg-[#E8E3DB] rounded-sm relative">
          <div className="absolute left-[20%] w-1 h-4 -top-1 bg-primary-container/60" style={{borderRadius: '1px'}} />
        </div>
        <p className="text-precision text-[0.6rem] text-clinical-stone mt-1">Range: 20–100 ng/mL · Your value: 24 — Normal</p>
      </div>
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-precision text-[0.6rem] text-clinical-stone uppercase">Optimal Range</span>
          <span className="inline-block bg-[#614018] text-[#FFDCBC] text-precision text-[0.6rem] px-1.5 py-0.5">MONITOR</span>
        </div>
        <div className="h-2 flex rounded-sm overflow-hidden">
          <div className="w-[15%] bg-[#C94F4F]" />
          <div className="w-[15%] bg-[#E8922A]" />
          <div className="w-[40%] bg-[#D4A574]" />
          <div className="w-[15%] bg-[#E8922A]" />
          <div className="w-[15%] bg-[#C94F4F]" />
        </div>
        <p className="text-precision text-[0.6rem] text-[#C94F4F] mt-1 font-bold">Range: 50–70 ng/mL · Your value: 24 — Insufficient</p>
      </div>
    </div>
    <div className="mt-4 border-l-2 border-primary-container bg-primary-container/5 p-3">
      <p className="text-body text-clinical-charcoal text-xs">
        Your value is marked "normal" by the lab. It is 26 points below the clinical optimal threshold.
      </p>
    </div>
  </div>
);

const DepletionChainVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
    <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mb-4">
      Depletion Chain — Atorvastatin
    </p>
    <div className="space-y-2">
      {[
        { from: 'Atorvastatin 10mg', to: 'Blocks HMG-CoA reductase', color: '#C94F4F' },
        { from: 'Blocks HMG-CoA', to: 'CoQ10 synthesis impaired', color: '#E8922A' },
        { from: 'CoQ10 depleted', to: 'Mitochondrial dysfunction', color: '#E8922A' },
        { from: 'Mitochondrial dysfunction', to: 'Muscle pain + fatigue', color: '#1B4332' },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: item.color }} />
          <div>
            <p className="text-precision text-[0.6rem] text-clinical-stone uppercase tracking-wider">{item.from}</p>
            <p className="text-body text-clinical-charcoal text-xs font-medium">→ {item.to}</p>
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 p-3 bg-primary-container/5 border-l-2 border-primary-container">
      <p className="text-precision text-[0.6rem] text-primary-container uppercase tracking-wider mb-1">Fix</p>
      <p className="text-body text-clinical-charcoal text-xs">CoQ10 (ubiquinol) 200mg daily with food.</p>
    </div>
  </div>
);

const DoctorPrepVisual = () => (
  <div className="bg-clinical-white rounded-[10px] overflow-hidden border border-outline-variant/10">
    <div className="bg-[#131313] px-4 py-3">
      <p className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase">
        CauseHealth. · Clinical Prep Document
      </p>
    </div>
    <div className="p-4 space-y-3">
      <div>
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mb-2">Test Requests</p>
        {[
          { test: 'RBC Folate + MMA', icd: 'D52.1 · K51.90', coverage: 'COVERED', color: '#1B4332' },
          { test: 'Creatine Kinase (CK)', icd: 'G72.0 · T46.6X5A', coverage: 'COVERED', color: '#1B4332' },
          { test: 'Free Testosterone', icd: 'E29.1 · R53.83', coverage: 'UNCERTAIN', color: '#E8922A' },
        ].map((row) => (
          <div key={row.test} className="flex items-center justify-between py-2 border-b border-outline-variant/5">
            <div>
              <p className="text-body text-clinical-charcoal text-xs font-medium">{row.test}</p>
              <p className="text-precision text-[0.55rem] text-clinical-stone">{row.icd}</p>
            </div>
            <span
              className="text-precision text-[0.55rem] px-1.5 py-0.5 font-bold text-white flex-shrink-0"
              style={{ background: row.color }}
            >
              {row.coverage}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const FEATURES = [
  {
    label: 'Optimal Range Interpretation',
    title: 'Normal ≠ Optimal.',
    body: 'Standard lab ranges are based on averages from sick populations, not healthy thresholds. Your value can sit squarely inside the "normal" range while you are deficient by every clinical measure. We compare your values against evidence-based optimal ranges and flag the gap — the gap your doctor never sees because they\'re using the same reference the lab printed.',
    visual: <OptimalRangeVisual />,
    flip: false,
  },
  {
    label: 'Medication Depletion Checker',
    title: 'Your prescription may be\ncausing your symptoms.',
    body: 'Statins deplete CoQ10. Mesalamine depletes folate and B12. Metformin depletes B12. PPIs deplete magnesium, zinc, and iron. These are documented, clinically established depletions — and almost no one is ever told. We map every medication you take to the nutrients it depletes, connect that depletion to the symptoms you reported, and give you the exact intervention.',
    visual: <DepletionChainVisual />,
    flip: true,
  },
  {
    label: 'ICD-10 Doctor Prep Document',
    title: 'Get the tests your doctor\nwould never order.',
    body: 'We generate a formatted clinical document for your next appointment — with the specific tests you need, the medical necessity statement for each, and the ICD-10 billing codes that tell your insurer why it\'s covered. Your doctor has 12 minutes. Hand them a document that does the diagnostic reasoning for them. This feature alone justifies the subscription.',
    visual: <DoctorPrepVisual />,
    flip: false,
  },
];

// Wrapper component to use the hook correctly (not inside a callback)
const FeatureItem = ({ feature, index: _index }: { feature: typeof FEATURES[number]; index: number }) => {
  const { ref, visible } = useVisible(0.15);
  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-16 items-center ${
        feature.flip ? 'lg:grid-flow-dense' : ''
      }`}
    >
      <motion.div
        initial={{ opacity: 0, x: feature.flip ? 20 : -20 }}
        animate={visible ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={feature.flip ? 'lg:col-start-2' : ''}
      >
        <p className="text-precision text-[0.68rem] text-primary tracking-widest uppercase font-bold mb-4">
          {feature.label}
        </p>
        <h3 className="text-authority text-3xl text-white font-bold leading-tight mb-6 whitespace-pre-line">
          {feature.title}
        </h3>
        <p className="text-body text-on-surface-variant text-base leading-relaxed">
          {feature.body}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: feature.flip ? -20 : 20 }}
        animate={visible ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
        className={feature.flip ? 'lg:col-start-1 lg:row-start-1' : ''}
      >
        {feature.visual}
      </motion.div>
    </div>
  );
};

export const FeaturesSection = () => (
  <section id="features" className="bg-[#131313] py-24 md:py-32">
    <div className="max-w-6xl mx-auto px-6">
      <div className="mb-20">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-4 h-px bg-primary" />
          <span className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold">
            What We Find
          </span>
        </div>
        <h2 className="text-authority text-4xl md:text-5xl font-bold text-white leading-tight">
          The connections that<br />12 minutes can't make.
        </h2>
      </div>

      <div className="space-y-24">
        {FEATURES.map((feature, i) => (
          <FeatureItem key={i} feature={feature} index={i} />
        ))}
      </div>
    </div>
  </section>
);
