// src/components/wellness/TransformationForecast.tsx
// Hero card: "Stick to the plan 90 days → here's where your numbers land."
// Pure math, no AI call.
import { motion } from 'framer-motion';
import type { MarkerForecast } from '../../lib/transformationForecast';

interface Props {
  forecasts: MarkerForecast[];
}

export const TransformationForecast = ({ forecasts }: Props) => {
  if (!forecasts || forecasts.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-[#1B423A] to-[#0F2A24] rounded-[14px] p-6 text-on-surface">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-[#D4A574] text-[20px]">trending_up</span>
        <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#D4A574]">In 90 days at this plan</p>
      </div>
      <p className="text-authority text-2xl font-bold mb-5 leading-tight">Here's where your numbers land.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {forecasts.map((f, i) => (
          <motion.div
            key={f.marker}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white/5 backdrop-blur rounded-[10px] p-3 border border-white/10"
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-lg leading-none">{f.emoji}</span>
              <p className="text-precision text-[0.55rem] font-bold tracking-wide text-on-surface-variant truncate">{f.marker.split(',')[0].split('(')[0].trim()}</p>
            </div>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-precision text-clinical-stone line-through text-sm">{f.current}</span>
              <span className="material-symbols-outlined text-[#D4A574] text-[14px]">arrow_forward</span>
              <span className="text-precision text-on-surface text-2xl font-bold">{f.projected}</span>
              <span className="text-precision text-[0.55rem] text-on-surface-variant">{f.unit}</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-precision text-[0.55rem] font-bold tracking-wide text-[#D4A574]">{f.delta}</span>
              {f.confidence === 'high' && <span className="text-[0.55rem]">●●●</span>}
              {f.confidence === 'moderate' && <span className="text-[0.55rem] text-on-surface-variant">●●○</span>}
              {f.confidence === 'lower' && <span className="text-[0.55rem] text-on-surface-variant">●○○</span>}
            </div>
          </motion.div>
        ))}
      </div>

      <p className="text-precision text-[0.55rem] text-on-surface-variant/60 mt-4 leading-relaxed">
        Estimates based on average response in adherent patients. Real change tracks adherence to the plan.
      </p>
    </div>
  );
};
