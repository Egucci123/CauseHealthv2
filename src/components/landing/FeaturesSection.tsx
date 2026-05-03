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

// Visual mockup of the actual app — a Watch-tagged HbA1c value at 5.5%
// (technically inside the lab's "normal" range of 4.0–5.6 but on our curated
// Watch list because it's drifting toward prediabetes). This is the core
// product distinction: standard ranges miss the early signal; we don't.
const WatchListVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-6 border border-outline-variant/10">
    <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase mb-4">
      Hemoglobin A1c (3-month blood sugar)
    </p>

    {/* Score chips — same look as the actual lab analytics page */}
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

    {/* Marker tile — gradient bar with a dot */}
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

    {/* Plain-English callout */}
    <div className="border-l-2 border-[#E8922A] bg-[#E8922A]/5 p-3">
      <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
        Your lab says <strong>"normal."</strong> We tag it <strong>Watch</strong> — it's drifting toward prediabetes. Catchable with diet now. Diagnosed in 5 years if ignored.
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

// Visual mockup of the Wellness Plan tab — meals + supplements + a phase pill.
// Shows the rotating spotlight + brand-specific meals so the user sees the
// shape of the plan, not abstract promises.
const WellnessPlanVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-5 border border-outline-variant/10 space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase">
        This Week's Focus · Week 1 of 12
      </p>
      <span className="inline-block bg-[#1B4332] text-white text-precision text-[0.7rem] px-1.5 py-0.5 font-bold tracking-wider">
        EASY MODE
      </span>
    </div>

    {/* Meal pills */}
    <div className="space-y-2">
      <div className="bg-clinical-cream/60 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-base">🌯</span>
        <div className="flex-1 min-w-0">
          <p className="text-body text-clinical-charcoal text-xs font-semibold leading-tight">Wawa egg white wrap + spinach</p>
          <p className="text-precision text-[0.7rem] text-clinical-stone">30g protein · breakfast · Phase 1</p>
        </div>
      </div>
      <div className="bg-clinical-cream/60 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-base">🍚</span>
        <div className="flex-1 min-w-0">
          <p className="text-body text-clinical-charcoal text-xs font-semibold leading-tight">Chipotle bowl · double chicken</p>
          <p className="text-precision text-[0.7rem] text-clinical-stone">65g protein · lunch · Phase 1</p>
        </div>
      </div>
      <div className="bg-clinical-cream/60 rounded-lg px-3 py-2 flex items-center gap-2">
        <span className="text-base">🐟</span>
        <div className="flex-1 min-w-0">
          <p className="text-body text-clinical-charcoal text-xs font-semibold leading-tight">Air-fryer salmon + frozen broccoli</p>
          <p className="text-precision text-[0.7rem] text-clinical-stone">38g protein · dinner · Phase 2</p>
        </div>
      </div>
    </div>

    {/* Supplement card */}
    <div className="bg-primary-container/5 border-l-2 border-primary-container rounded-r-lg p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="material-symbols-outlined text-primary-container text-[14px]">medication</span>
        <p className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest uppercase">Supplement Stack</p>
      </div>
      <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
        <strong>CoQ10 (Ubiquinol) 200mg</strong> · with dinner · for atorvastatin depletion
      </p>
      <p className="text-body text-clinical-stone text-[0.6rem] mt-1">+ 4 more · alternatives included for each</p>
    </div>

    <p className="text-body text-clinical-stone text-[0.6rem] italic leading-snug pt-1">
      Plan rotates weekly — Phase 1 convenience-store hacks early, Phase 3 home cooking by week 7+.
    </p>
  </div>
);

// Visual mockup of the Biological + Cardiometabolic Age cards.
// Shows the two-number system: PhenoAge (peer-reviewed) vs CauseHealth's
// own composite that catches what PhenoAge misses (lipids/liver/glucose/D).
const BioAgeVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-5 border border-outline-variant/10 space-y-4">
    {/* PhenoAge */}
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">
          Biological Age
        </p>
        <span className="text-precision text-[0.7rem] text-clinical-stone tracking-wide">PhenoAge · Levine 2018</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-authority text-4xl font-bold leading-none" style={{ color: '#1B4332' }}>22.8</span>
        <span className="text-body text-clinical-stone text-xs">years</span>
        <span
          className="ml-auto text-precision text-[0.7rem] font-bold tracking-widest uppercase px-2 py-0.5"
          style={{ borderRadius: '3px', backgroundColor: '#1B433215', color: '#1B4332' }}
        >
          5.4 yrs younger
        </span>
      </div>
      <p className="text-precision text-[0.7rem] text-clinical-stone leading-relaxed italic">
        9-marker peer-reviewed mortality biomarker (albumin, creatinine, glucose, CRP, lymphocytes, MCV, RDW, ALP, WBC).
      </p>
    </div>

    <div className="border-t border-outline-variant/15 pt-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold">
          Cardiometabolic Age
        </p>
        <span className="text-precision text-[0.7rem] text-clinical-stone tracking-wide">CauseHealth model</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-authority text-4xl font-bold leading-none" style={{ color: '#C94F4F' }}>42</span>
        <span className="text-body text-clinical-stone text-xs">years</span>
        <span
          className="ml-auto text-precision text-[0.7rem] font-bold tracking-widest uppercase px-2 py-0.5"
          style={{ borderRadius: '3px', backgroundColor: '#C94F4F15', color: '#C94F4F' }}
        >
          14 yrs older
        </span>
      </div>
      <p className="text-precision text-[0.7rem] text-clinical-stone leading-relaxed italic">
        Lipids, liver enzymes, glucose, vitamin D — the metabolic markers PhenoAge skips.
      </p>
    </div>

    <div className="bg-[#D4A574]/10 border-l-2 border-[#D4A574] rounded-r-lg p-3">
      <p className="text-body text-clinical-charcoal text-xs leading-relaxed">
        Two numbers, two stories. Most apps give you one. We give you both because they answer different questions.
      </p>
    </div>
  </div>
);

// Visual mockup of the daily check-in + AI chat — the "ongoing coaching"
// half of the product. Shows the adherence ring + a chat snippet so the user
// sees this is more than a one-time analysis.
const ChatCheckInVisual = () => (
  <div className="bg-clinical-white rounded-[10px] p-5 border border-outline-variant/10 space-y-4">
    {/* Adherence ring mockup */}
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#E8E3DB" strokeWidth="6" />
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1B4332" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="213.6" strokeDashoffset="42.7" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-authority text-xl text-clinical-charcoal font-bold leading-none">80</span>
          <span className="text-precision text-[0.45rem] text-clinical-stone uppercase tracking-wider mt-0.5">% adherence</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase font-bold mb-1">Day 14 · Week 2 of 12</p>
        <p className="text-body text-clinical-charcoal text-sm font-semibold leading-tight">14-day streak</p>
        <p className="text-body text-clinical-stone text-xs leading-snug mt-1">Sleep up 2 points. CoQ10: 13/14 days.</p>
      </div>
    </div>

    {/* Chat snippet */}
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
            Your ferritin is 28 — low. With your hair thinning and afternoon crashes, that's the most likely driver. Iron panel is in your retest list for week 6.
          </p>
        </div>
      </div>
    </div>

    <p className="text-precision text-[0.7rem] text-clinical-stone italic">
      AI chat reads your actual labs, conditions, and meds — not generic answers.
    </p>
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
              <p className="text-precision text-[0.7rem] text-clinical-stone">{row.icd}</p>
            </div>
            <span
              className="text-precision text-[0.7rem] px-1.5 py-0.5 font-bold text-white flex-shrink-0"
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
    label: 'Watch List Detection',
    title: 'Normal isn\'t always healthy.',
    body: 'Standard lab ranges flag values that have already crossed into a diagnosis. Our Watch list flags the values that are drifting — A1c at 5.5, ApoB above 90, ferritin under 50, hs-CRP creeping up — markers that are "in range" by lab standards but show the early signal of a problem you can still fix. We tag every value as Healthy, Watch, or Out of Range so the early signal isn\'t buried.',
    visual: <WatchListVisual />,
    flip: false,
  },
  {
    label: 'Medication Depletion Mapping',
    title: 'Your prescription may be\ncausing your symptoms.',
    body: 'Statins deplete CoQ10. Mesalamine depletes folate and B12. Metformin depletes B12. PPIs deplete magnesium, zinc, and iron. These are documented, clinically established depletions — and almost no one is ever told. We map every medication you take to the nutrients it depletes, connect that depletion to the symptoms you reported, and give you the exact intervention.',
    visual: <DepletionChainVisual />,
    flip: true,
  },
  {
    label: 'Your 90-Day Wellness Plan',
    title: 'Not just a score.\nA path.',
    body: '25-35 personalized meals from a 360+ meal library — convenience-store hacks for week 1, sheet-pan and crock-pot recipes by week 7. Brand-specific (Wawa, Chipotle, Costco) and chain-aware (no Wawa for Texas users). Supplement stack with 1-2 alternatives per supplement. Workouts, lifestyle interventions, and a 12-week phased action plan. Updates every Monday.',
    visual: <WellnessPlanVisual />,
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
    label: 'ICD-10 Doctor Prep Document',
    title: 'Get the tests your doctor\nwould never order.',
    body: 'We generate a formatted clinical document for your next appointment — with the specific tests you need, the medical necessity statement for each, and the ICD-10 billing codes that tell your insurer why it\'s covered. Your doctor has 12 minutes. Hand them a document that does the diagnostic reasoning for them.',
    visual: <DoctorPrepVisual />,
    flip: false,
  },
  {
    label: 'AI Chat + Daily Check-In',
    title: 'Coaching, on tap.',
    body: 'Daily 30-second check-in (energy, sleep, pain, mental clarity, mood) builds your adherence score. Tap supplements as you take them — streak counter, weekly heat map, sparkline trends. AI chat reads your actual labs, conditions, and meds — ask "why is my energy low?" and it cites your specific values. Not a generic chatbot.',
    visual: <ChatCheckInVisual />,
    flip: true,
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
