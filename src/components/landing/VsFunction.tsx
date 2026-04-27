// src/components/landing/VsFunction.tsx
// Quiet comparison row vs. category leader. Positions CauseHealth as the
// "bring your own labs" alternative. Doesn't trash-talk, just contrasts.
import { motion } from 'framer-motion';

const ROWS: { label: string; us: string; them: string; usWin: boolean }[] = [
  { label: 'Bring your own labs (LabCorp, Quest, MyChart, paper)', us: '✓ Any source — PDF or photo', them: 'Their lab order only', usWin: true },
  { label: 'Doctor prep document with ICD-10 codes', us: '✓ Built for your visit', them: 'Replaces the visit', usWin: true },
  { label: 'Medication + supplement interaction layer', us: '✓ Threaded through every analysis', them: 'Generic insights', usWin: true },
  { label: '90-day plan with retest tracking', us: '✓ Today actions, meals, workouts', them: 'Score + insights', usWin: true },
  { label: 'AI chat that knows your data', us: '✓ Plain English, your labs', them: 'Limited messaging', usWin: true },
  { label: 'Annual cost', us: '$228/year', them: '$365/year', usWin: true },
];

export const VsFunction = () => (
  <section className="bg-clinical-white py-20 md:py-28 border-t border-outline-variant/10">
    <div className="max-w-5xl mx-auto px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-50px' }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-12">
          <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">Different by design</p>
          <h2 className="text-authority text-4xl md:text-5xl text-clinical-charcoal font-bold mb-4">
            Built for the labs you already have.
          </h2>
          <p className="text-body text-clinical-stone text-lg max-w-2xl mx-auto">
            Most apps want to sell you their bloodwork. We meet you where you are — the labs
            sitting in MyChart from your last physical. No new draws, no lock-in.
          </p>
        </div>

        <div className="bg-clinical-cream/40 rounded-[14px] border border-outline-variant/15 overflow-hidden">
          <div className="grid grid-cols-12 px-6 py-4 border-b border-outline-variant/15 bg-clinical-white">
            <div className="col-span-6 text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone">What matters</div>
            <div className="col-span-3 text-precision text-[0.6rem] font-bold tracking-widest uppercase text-primary-container text-center">CauseHealth</div>
            <div className="col-span-3 text-precision text-[0.6rem] font-bold tracking-widest uppercase text-clinical-stone text-center">The other guys</div>
          </div>
          {ROWS.map((row, i) => (
            <div
              key={i}
              className={`grid grid-cols-12 items-start px-6 py-4 ${i !== ROWS.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
            >
              <div className="col-span-6 text-body text-clinical-charcoal text-sm font-medium pr-3">{row.label}</div>
              <div className="col-span-3 text-body text-primary-container text-sm font-semibold text-center px-2">{row.us}</div>
              <div className="col-span-3 text-body text-clinical-stone text-sm text-center px-2">{row.them}</div>
            </div>
          ))}
        </div>

        <p className="text-precision text-[0.6rem] text-clinical-stone/60 tracking-wide text-center mt-4">
          Comparison reflects publicly available information. We respect competitors and focus on what we do uniquely well.
        </p>
      </motion.div>
    </div>
  </section>
);
