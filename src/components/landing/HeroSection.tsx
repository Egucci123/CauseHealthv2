// src/components/landing/HeroSection.tsx
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Button } from '../ui/Button';

const AppMockup = () => (
  <div
    className="relative rounded-[14px] overflow-hidden shadow-2xl border border-[#414844]/30"
    style={{ background: '#131313' }}
  >
    <div className="flex items-center gap-2 px-4 py-3 border-b border-[#414844]/20">
      <div className="w-2.5 h-2.5 rounded-full bg-[#C94F4F]" />
      <div className="w-2.5 h-2.5 rounded-full bg-[#E8922A]" />
      <div className="w-2.5 h-2.5 rounded-full bg-[#1B4332]" />
      <span className="text-precision text-[0.6rem] text-on-surface-variant tracking-widest uppercase ml-4">
        CauseHealth. — Lab Analytics
      </span>
    </div>

    <div className="flex" style={{ minHeight: '360px' }}>
      <div className="w-14 bg-[#131313] border-r border-[#414844]/20 flex flex-col items-center py-4 gap-5">
        <span className="material-symbols-outlined text-primary text-[18px]">analytics</span>
        <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">biotech</span>
        <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">favorite</span>
        <span className="material-symbols-outlined text-on-surface-variant/40 text-[18px]">description</span>
      </div>

      <div className="flex-1 bg-clinical-cream p-4 space-y-3">
        <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase">
          Lab Analytics · Jan 26, 2026
        </p>

        <div className="bg-clinical-white rounded-lg border-l-4 border-[#C94F4F] p-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="inline-block bg-[#C94F4F] text-white text-precision text-[0.6rem] px-1.5 py-0.5 font-bold mb-1">
                URGENT
              </span>
              <p className="text-body text-clinical-charcoal text-xs font-medium">
                ALT 97 IU/L — 3.9x above optimal
              </p>
              <p className="text-body text-clinical-stone text-[0.65rem] mt-0.5">
                Atorvastatin hepatotoxicity likely.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-clinical-white rounded-lg border-t-[2px] border-[#C94F4F] p-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-body text-clinical-charcoal text-xs font-semibold">ALT (SGPT)</p>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wider uppercase">Liver</p>
            </div>
            <span className="inline-block bg-[#C94F4F] text-white text-precision text-[0.6rem] px-1.5 py-0.5 font-bold">
              URGENT
            </span>
          </div>
          <div className="mb-3">
            <span className="text-precision text-2xl text-clinical-charcoal font-medium">97</span>
            <span className="text-body text-clinical-stone text-sm ml-1">IU/L</span>
          </div>
          <div className="w-full h-1.5 flex rounded-sm overflow-hidden mb-1">
            <div className="w-[15%] bg-[#C94F4F]" />
            <div className="w-[10%] bg-[#E8922A]" />
            <div className="w-[25%] bg-[#D4A574]" />
            <div className="w-[15%] bg-[#E8922A]" />
            <div className="w-[35%] bg-[#C94F4F]" />
          </div>
          <div className="flex gap-3">
            <p className="text-precision text-[0.55rem] text-clinical-stone">
              <span className="text-clinical-charcoal">97 IU/L</span> · Optimal: 0–25
            </p>
          </div>
        </div>

        <div className="bg-clinical-white rounded-lg border-t-[2px] border-primary-container p-4">
          <p className="text-precision text-[0.6rem] text-clinical-stone tracking-widest uppercase mb-2">
            Depletion Identified
          </p>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-body text-clinical-charcoal text-xs font-bold">CoQ10</p>
              <p className="text-body text-clinical-stone text-[0.65rem]">Muscle pain, fatigue</p>
            </div>
            <span className="inline-block bg-[#C94F4F] text-white text-precision text-[0.55rem] px-1.5 py-0.5 font-bold">
              CRITICAL
            </span>
          </div>
          <div className="border-l-2 border-primary-container bg-primary-container/5 px-2 py-1.5 mt-2">
            <p className="text-body text-clinical-charcoal text-[0.65rem]">
              CoQ10 200mg daily with food.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const DetectionCounter = () => {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/detection-count`, {
      headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
    }).then(r => r.json()).then(d => setCount(d.count)).catch(() => {});
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.8, duration: 0.4, ease: 'easeOut' }}
      className="inline-flex items-center gap-2 bg-[#131313]/90 backdrop-blur-sm border border-[#D4A574]/40 rounded-full px-4 py-2"
    >
      <div className="w-2 h-2 rounded-full bg-[#D4A574] animate-pulse" />
      <span className="text-precision text-[0.68rem] text-[#D4A574] tracking-wide font-bold">
        {count !== null && count > 0 ? `${count.toLocaleString()} findings flagged` : 'Early detection engine active'}
      </span>
    </motion.div>
  );
};

const StatPill = ({ label, delay }: { label: string; delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ delay, duration: 0.4, ease: 'easeOut' }}
    className="inline-flex items-center gap-2 bg-[#131313]/90 backdrop-blur-sm border border-[#414844]/40 rounded-full px-4 py-2"
  >
    <div className="w-1.5 h-1.5 rounded-full bg-[#D4A574]" />
    <span className="text-precision text-[0.68rem] text-on-surface tracking-wide">
      {label}
    </span>
  </motion.div>
);

export const HeroSection = () => (
  <section className="relative bg-clinical-cream overflow-hidden pt-24 pb-20 md:pt-32 md:pb-28">
    <div
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, #1B4332 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }}
    />

    <div className="relative max-w-6xl mx-auto px-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-4 h-px bg-primary-container" />
            <span className="text-precision text-[0.68rem] text-primary-container tracking-widest uppercase font-bold">
              Built for normal people
            </span>
          </div>

          <h1 className="text-authority font-bold text-clinical-charcoal leading-tight mb-2">
            <span className="text-5xl md:text-6xl block">Your doctor has</span>
            <span className="text-5xl md:text-6xl block">12 minutes.</span>
          </h1>
          <h2 className="text-authority text-4xl md:text-5xl font-bold text-primary-container leading-tight mb-8">
            You deserve<br />answers.
          </h2>

          <p className="text-body text-clinical-stone text-lg leading-relaxed mb-4 max-w-lg">
            Upload your bloodwork. Get a list of tests your doctor <strong className="text-clinical-charcoal">should have ordered</strong> for
            someone your age — with the ICD-10 codes that get them covered by insurance. Walk
            into your next appointment with a list they can&rsquo;t reject.
          </p>
          <p className="text-body text-clinical-stone text-base leading-relaxed mb-10 max-w-lg">
            Built for nurses, truckers, parents, shift workers — the patients doctors rush
            through. <strong className="text-clinical-charcoal">$7.67 a month.</strong> Less than your morning coffee.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <Button
              variant="primary"
              size="lg"
              onClick={() => window.location.href = '/register'}
              icon="upload_file"
            >
              Try It Free — No Card
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              See How It Works
            </Button>
          </div>

          <p className="text-precision text-[0.68rem] text-clinical-stone tracking-wide">
            Free to upload · $19/month for full AI · Cancel anytime · Master codes for friends
          </p>

          <div className="flex flex-wrap gap-3 mt-10">
            <DetectionCounter />
            <StatPill label="ICD-10 coded doctor prep documents" delay={1.0} />
            <StatPill label="Medication depletion mapping" delay={1.2} />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
          className="hidden lg:block"
        >
          <AppMockup />
        </motion.div>
      </div>
    </div>
  </section>
);
