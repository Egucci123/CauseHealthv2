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

// ── Watch list visual (early detection) ─────────────────────────────────
const WatchListVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
    <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mb-4">
      Hemoglobin A1c (3-month blood sugar)
    </p>
    <div className="grid grid-cols-3 gap-2 mb-5">
      <div className="bg-clinical-cream rounded-sm py-2 text-center">
        <p className="text-precision text-[0.6rem] font-bold text-[#1B4332] tracking-wider uppercase">Healthy</p>
      </div>
      <div className="bg-[#E8922A]/15 rounded-sm py-2 text-center" style={{ outline: '2px solid #E8922A' }}>
        <p className="text-precision text-[0.6rem] font-bold text-[#E8922A] tracking-wider uppercase">Watch</p>
      </div>
      <div className="bg-clinical-cream rounded-sm py-2 text-center">
        <p className="text-precision text-[0.6rem] font-bold text-[#C94F4F] tracking-wider uppercase">Out of Range</p>
      </div>
    </div>
    <div className="flex items-baseline justify-between mb-2">
      <span className="text-authority text-3xl text-clinical-charcoal font-bold leading-none">5.5</span>
      <div>
        <span className="inline-block bg-[#E8922A] text-white text-precision text-[0.7rem] px-1.5 py-0.5 font-bold tracking-wider">WATCH</span>
        <p className="text-precision text-[0.7rem] text-clinical-stone mt-1">Lab said: Normal</p>
      </div>
    </div>
    <div className="w-full h-2 flex rounded-sm overflow-hidden mb-1.5">
      <div className="w-[40%] bg-[#1B4332]" />
      <div className="w-[15%] bg-[#5E8C61]" />
      <div className="w-[20%] bg-[#E8922A]" />
      <div className="w-[15%] bg-[#C94F4F]" />
      <div className="w-[10%] bg-[#A53A3A]" />
    </div>
    <p className="text-precision text-[0.7rem] text-clinical-stone mb-3">
      Standard: 4.0–5.6% · Watch threshold: ≥5.4%
    </p>
    <div className="border-l-2 border-[#E8922A] bg-[#E8922A]/5 p-3">
      <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
        Your lab says <strong>"normal."</strong> We tag it <strong>Watch</strong> — drifting toward prediabetes. Catchable now. Diagnosed in 5 years if ignored.
      </p>
    </div>
  </div>
);

// ── Depletion + medication alternatives visual ──────────────────────────
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
      <p className="text-precision text-[0.6rem] text-primary-container uppercase tracking-wider mb-1">Fix + Alternative Discussion</p>
      <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
        CoQ10 (Ubiquinol) 200mg daily with food. Plus: Doctor Prep includes lower-dose statin alternatives + bergamot/red yeast considerations to discuss.
      </p>
    </div>
  </div>
);

// ── Causal cascade visual (Layer A — the moat) ──────────────────────────
const CausalCascadeVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
    <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mb-4">
      Why You Feel This Way — The Cascade
    </p>
    <div className="space-y-3">
      <div>
        <p className="text-precision text-[0.6rem] text-[#C94F4F] uppercase tracking-wider font-bold mb-1">Layer 1 · Root Cause</p>
        <div className="bg-[#C94F4F]/10 rounded p-2 border-l-2 border-[#C94F4F]">
          <p className="text-body text-clinical-charcoal text-xs font-semibold">Under-replaced thyroid (TSH 3.04 on Armour)</p>
        </div>
      </div>
      <p className="text-center text-clinical-stone text-xs">↓ drives</p>
      <div>
        <p className="text-precision text-[0.6rem] text-[#E8922A] uppercase tracking-wider font-bold mb-1">Layer 2 · Driven State</p>
        <div className="bg-[#E8922A]/10 rounded p-2 border-l-2 border-[#E8922A]">
          <p className="text-body text-clinical-charcoal text-xs font-semibold">Chronic inflammation (hs-CRP 2.2)</p>
        </div>
      </div>
      <p className="text-center text-clinical-stone text-xs">↓ drives</p>
      <div>
        <p className="text-precision text-[0.6rem] text-[#1B4332] uppercase tracking-wider font-bold mb-1">Layer 3 · Symptoms You Feel</p>
        <div className="bg-clinical-cream rounded p-2 border-l-2 border-[#1B4332]">
          <p className="text-body text-clinical-charcoal text-xs">Fatigue · Brain fog · Weight resistance · Joint pain</p>
        </div>
      </div>
    </div>
    <div className="mt-4 p-3 bg-primary-container/5 border-l-2 border-primary-container">
      <p className="text-precision text-[0.6rem] text-primary-container uppercase tracking-wider mb-1">Highest-leverage fix</p>
      <p className="text-body text-clinical-charcoal text-xs">Fix Layer 1 (thyroid dose) and Layers 2-3 dissolve. Don't start at the symptom.</p>
    </div>
  </div>
);

// ── Bio + cardiometabolic age visual ────────────────────────────────────
const BioAgeVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-5 border border-outline-variant/10 space-y-4">
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">Biological Age</p>
        <span className="text-precision text-[0.7rem] text-clinical-stone tracking-wide">PhenoAge · Levine 2018</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-authority text-4xl font-bold leading-none" style={{ color: '#1B4332' }}>22.8</span>
        <span className="text-body text-clinical-stone text-xs">years</span>
        <span className="ml-auto text-precision text-[0.7rem] font-bold tracking-widest uppercase px-2 py-0.5"
          style={{ borderRadius: '3px', backgroundColor: '#1B433215', color: '#1B4332' }}>5.4 yrs younger</span>
      </div>
      <p className="text-precision text-[0.7rem] text-clinical-stone leading-relaxed italic">
        9-marker peer-reviewed mortality biomarker.
      </p>
    </div>
    <div className="border-t border-outline-variant/15 pt-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">Cardiometabolic Age</p>
        <span className="text-precision text-[0.7rem] text-clinical-stone tracking-wide">CauseHealth model</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-authority text-4xl font-bold leading-none" style={{ color: '#C94F4F' }}>42</span>
        <span className="text-body text-clinical-stone text-xs">years</span>
        <span className="ml-auto text-precision text-[0.7rem] font-bold tracking-widest uppercase px-2 py-0.5"
          style={{ borderRadius: '3px', backgroundColor: '#C94F4F15', color: '#C94F4F' }}>14 yrs older</span>
      </div>
      <p className="text-precision text-[0.7rem] text-clinical-stone leading-relaxed italic">
        Lipids, liver enzymes, glucose, vitamin D — markers PhenoAge skips.
      </p>
    </div>
    <div className="bg-[#D4A574]/10 border-l-2 border-[#D4A574] rounded-r-lg p-3">
      <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
        Two numbers, two stories. Your lab gives you neither.
      </p>
    </div>
  </div>
);

// ── Doctor prep + cross-specialty synthesis visual ──────────────────────
const DoctorPrepVisual = () => (
  <div className="bg-clinical-white rounded-[10px] overflow-hidden border border-outline-variant/10">
    <div className="bg-[#131313] px-4 py-3">
      <p className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase">
        CauseHealth. · Clinical Prep Document
      </p>
    </div>
    <div className="p-4 space-y-3">
      <div>
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mb-2">Tests Doctor Should Order</p>
        {[
          { test: 'TPO + Tg Antibodies', icd: 'E06.3', coverage: 'COVERED', color: '#1B4332' },
          { test: 'Reverse T3', icd: 'E03.9', coverage: 'COVERED', color: '#1B4332' },
          { test: 'Coronary Calcium Score', icd: 'Z13.6', coverage: 'COVERED', color: '#1B4332' },
        ].map((row) => (
          <div key={row.test} className="flex items-center justify-between py-2 border-b border-outline-variant/5">
            <div>
              <p className="text-body text-clinical-charcoal text-xs font-medium">{row.test}</p>
              <p className="text-precision text-[0.7rem] text-clinical-stone">{row.icd}</p>
            </div>
            <span className="text-precision text-[0.7rem] px-1.5 py-0.5 font-bold text-white flex-shrink-0"
              style={{ background: row.color }}>{row.coverage}</span>
          </div>
        ))}
      </div>
      <div className="pt-1 border-t border-outline-variant/10">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mb-2">Cross-Specialty Synthesis</p>
        <div className="space-y-1">
          {[
            { label: 'Endocrinologist would see', text: 'thyroid + DHEA' },
            { label: 'Cardiologist would see', text: 'lipid pattern + CRP' },
            { label: 'Gynecologist would see', text: 'postmenopausal hormone shift' },
          ].map((row) => (
            <p key={row.label} className="text-body text-clinical-charcoal text-xs leading-snug">
              <span className="text-clinical-stone">{row.label}:</span> {row.text}
            </p>
          ))}
        </div>
        <p className="text-precision text-[0.65rem] text-primary-container italic mt-2">No single doctor sees all of it. CauseHealth does.</p>
      </div>
    </div>
  </div>
);

// ── Supplement stack + predicted outcomes visual ────────────────────────
const SupplementStackVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-5 border border-outline-variant/10 space-y-4">
    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">
      Evidence-Based Supplement Stack
    </p>

    {/* Supplement cards */}
    <div className="space-y-2">
      <div className="bg-clinical-cream/60 rounded-lg p-3 border-l-2 border-[#C94F4F]">
        <div className="flex items-center justify-between mb-1">
          <p className="text-body text-clinical-charcoal text-xs font-bold">Curcumin (Meriva)</p>
          <span className="text-precision text-[0.55rem] bg-[#C94F4F] text-white px-1.5 py-0.5 font-bold tracking-wider">CRITICAL</span>
        </div>
        <p className="text-precision text-[0.65rem] text-clinical-stone">500-1000mg · breakfast w/ fat · for elevated CRP 2.2</p>
        <p className="text-precision text-[0.6rem] text-clinical-stone italic mt-1">+ alternatives: Quercetin · NAC</p>
      </div>
      <div className="bg-clinical-cream/60 rounded-lg p-3 border-l-2 border-[#E8922A]">
        <div className="flex items-center justify-between mb-1">
          <p className="text-body text-clinical-charcoal text-xs font-bold">Selenium (Selenomethionine)</p>
          <span className="text-precision text-[0.55rem] bg-[#E8922A] text-white px-1.5 py-0.5 font-bold tracking-wider">HIGH</span>
        </div>
        <p className="text-precision text-[0.65rem] text-clinical-stone">200mcg · breakfast · for Hashimoto's TPO antibodies</p>
        <p className="text-precision text-[0.6rem] text-clinical-stone italic mt-1">+ alt: Brazil nuts (1-2 daily)</p>
      </div>
    </div>

    {/* Predicted outcome */}
    <div className="bg-primary-container/5 border-l-2 border-primary-container rounded-r-lg p-3">
      <p className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest uppercase mb-1">
        Predicted at 12-week retest
      </p>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-clinical-charcoal">hs-CRP</span>
          <span className="font-bold text-[#1B4332]">−0.6 mg/L</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-clinical-charcoal">TPO Ab</span>
          <span className="font-bold text-[#1B4332]">−200 IU/mL</span>
        </div>
      </div>
      <p className="text-precision text-[0.6rem] text-clinical-stone italic mt-2">
        Falsifiable forecasts from peer-reviewed effect-size data. Doctors don't make these.
      </p>
    </div>
  </div>
);

// ── AI chat visual (without daily-tracking gimmicks) ────────────────────
const AIChatVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-5 border border-outline-variant/10 space-y-3">
    <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">
      AI Chat — Knows Your Specific Labs
    </p>
    <div className="bg-clinical-cream/60 rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-clinical-charcoal flex-shrink-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[12px]">person</span>
        </div>
        <div className="bg-clinical-white rounded-lg px-3 py-1.5">
          <p className="text-body text-clinical-charcoal text-xs">Why is my energy still low?</p>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-primary-container flex-shrink-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[12px]">auto_awesome</span>
        </div>
        <div className="bg-primary-container/10 rounded-lg px-3 py-1.5 max-w-[85%]">
          <p className="text-body text-clinical-charcoal text-xs leading-snug">
            Your TSH is 3.04 on Armour — that's under-replaced (target 0.5–2.0). Plus serum Mg looks fine, but that test is unreliable;
            with your sleep symptoms, RBC magnesium would tell us more.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-clinical-charcoal flex-shrink-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[12px]">person</span>
        </div>
        <div className="bg-clinical-white rounded-lg px-3 py-1.5">
          <p className="text-body text-clinical-charcoal text-xs">What should I ask my doctor for?</p>
        </div>
      </div>
    </div>
    <p className="text-precision text-[0.7rem] text-clinical-stone italic">
      Reads your specific labs, conditions, meds, and symptoms — not generic answers.
    </p>
  </div>
);

const FEATURES = [
  {
    label: 'Watch List · Early Detection',
    title: 'Catch the drift\nbefore the diagnosis.',
    body: 'Standard lab ranges flag values that have already crossed into a diagnosis. Our Watch list flags the values that are drifting — A1c at 5.5 (prediabetic pattern), ApoB above 90, ferritin under 50, hs-CRP creeping up, atherogenic LDL particle counts. Markers that are "in range" but show the early signal of a problem you can still fix. Months or years of warning before a diagnosis your doctor would have given you anyway.',
    visual: <WatchListVisual />,
    flip: false,
  },
  {
    label: 'Medication Depletions + Alternatives',
    title: 'Your prescription may be\ncausing your symptoms.',
    body: 'Statins deplete CoQ10. Mesalamine depletes folate and B12. Metformin depletes B12. PPIs deplete magnesium, zinc, and iron. Thiazide diuretics deplete potassium and magnesium. SSRIs raise risk of low sodium. These are documented depletions almost no one is ever told about. We map every medication to nutrients it depletes, connect that to the symptoms you reported, AND surface medication alternatives to discuss with your doctor when there are gentler options.',
    visual: <DepletionChainVisual />,
    flip: true,
  },
  {
    label: 'Causal Cascade',
    title: 'The synthesis\nno doctor builds.',
    body: 'Doctors are siloed. Your endo sees TSH. Your cardio sees LDL. Your gyn sees hormones. Nobody connects all three. CauseHealth maps your findings as a layered cascade: Layer 1 root causes (under-replaced thyroid, postmenopause, sleep deprivation) → Layer 2 driven states (chronic inflammation, atherogenic lipids) → Layer 3 outcomes (fatigue, brain fog, weight resistance, joint pain). Then ranks the highest-leverage fix. Fix Layer 1 and Layers 2-3 dissolve.',
    visual: <CausalCascadeVisual />,
    flip: false,
  },
  {
    label: 'Biological + Cardiometabolic Age',
    title: 'Two numbers your\nlab will never give you.',
    body: 'Biological Age uses Levine\'s peer-reviewed PhenoAge algorithm — 9 markers that predict mortality risk. But PhenoAge skips lipids and liver enzymes. So we built Cardiometabolic Age — a CauseHealth composite of the metabolic markers PhenoAge misses. Two numbers, two stories. Most apps give you one because the other might tell on them.',
    visual: <BioAgeVisual />,
    flip: true,
  },
  {
    label: 'Doctor Prep · Cross-Specialty Synthesis',
    title: 'Get the tests your\ndoctor never ordered.',
    body: 'Printable clinical document for your next appointment: tests with ICD-10 codes (insurance covers what they order when codes are right), medication alternatives to discuss, cross-specialty synthesis (endo + cardio + gyn + GI in one place — no specialist sees all of it), questions to ask, and a clear medical-necessity framing. Walk in prepared. Walk out with the workup you needed years ago.',
    visual: <DoctorPrepVisual />,
    flip: false,
  },
  {
    label: 'Supplement Stack · Predicted Outcomes',
    title: 'Evidence-based stacks +\nfalsifiable forecasts.',
    body: 'Supplement stack sourced from your specific labs (curcumin for elevated CRP, selenium for Hashimoto\'s antibodies, berberine for prediabetic A1c, CoQ10 for statin depletion). Each entry includes dose, timing, drug-interaction notes, and 1-2 alternatives. Then we predict the lab change at your 12-week retest based on peer-reviewed effect-size data: "TSH should drop 1.0–2.0 mIU/L if dose is optimized." Doctors don\'t make falsifiable forecasts. We do.',
    visual: <SupplementStackVisual />,
    flip: true,
  },
  {
    label: 'AI Chat · Reads Your Actual Labs',
    title: 'Coaching with\nyour data, not generic.',
    body: 'AI chat that has your specific labs, conditions, medications, and symptoms loaded into context. Ask "why is my energy low?" and it cites your specific TSH, ferritin, vitamin D — and explains which tests we don\'t trust given your situation (serum magnesium "in range" is unreliable; ferritin during inflammation is falsely elevated). Not a generic chatbot. Yours.',
    visual: <AIChatVisual />,
    flip: false,
  },
];

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
