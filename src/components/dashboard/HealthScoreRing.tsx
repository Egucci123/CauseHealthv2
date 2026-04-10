// src/components/dashboard/HealthScoreRing.tsx
import { useEffect, useRef, useState } from 'react';
import type { HealthScore } from '../../types';

interface HealthScoreRingProps { score: HealthScore | null; loading?: boolean; analyzing?: boolean; }

const RingSkeleton = () => (
  <div className="flex flex-col items-center gap-4">
    <div className="w-32 h-32 rounded-full border-8 border-[#E8E3DB] animate-pulse" />
    <div className="h-4 w-24 bg-[#E8E3DB] rounded-sm animate-pulse" />
    <div className="h-3 w-32 bg-[#E8E3DB] rounded-sm animate-pulse" />
  </div>
);

const RingEmpty = () => (
  <div className="flex flex-col items-center gap-3 py-4">
    <div className="w-32 h-32 rounded-full border-4 border-dashed border-outline-variant/30 flex items-center justify-center">
      <span className="material-symbols-outlined text-clinical-stone text-4xl">biotech</span>
    </div>
    <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase text-center">Upload labs to get your score</p>
  </div>
);

const RingAnalyzing = () => (
  <div className="flex flex-col items-center gap-3 py-4">
    <div className="w-32 h-32 rounded-full border-4 border-primary-container/30 flex items-center justify-center">
      <span className="material-symbols-outlined text-primary-container text-4xl animate-pulse">analytics</span>
    </div>
    <p className="text-precision text-[0.68rem] text-primary-container tracking-widest uppercase text-center font-bold">Analyzing your labs...</p>
    <p className="text-precision text-[0.6rem] text-clinical-stone text-center">Your score will update automatically</p>
  </div>
);

export const HealthScoreRing = ({ score, loading, analyzing }: HealthScoreRingProps) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!score) return;
    const target = score.score, duration = 1200, start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(target * eased));
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [score?.score]);

  if (loading) return <RingSkeleton />;
  if (analyzing && !score) return <RingAnalyzing />;
  if (!score) return <RingEmpty />;

  const size = 128, strokeWidth = 10, radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - animatedScore / 100);

  const trendIcon = score.trend === 'up' ? 'trending_up' : score.trend === 'down' ? 'trending_down' : score.trend === 'new' ? 'fiber_new' : 'trending_flat';
  const trendColor = score.trend === 'up' ? '#1B4332' : score.trend === 'down' ? '#C94F4F' : '#6B6B6B';

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#E8E3DB" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={score.color} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: 'stroke-dashoffset 0.05s linear' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-authority text-3xl font-bold text-clinical-charcoal leading-none">{animatedScore}</span>
          <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wider uppercase">/100</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase" style={{ color: score.color }}>{score.label}</p>
        <div className="flex items-center justify-center gap-1 mt-1">
          <span className="material-symbols-outlined text-[14px]" style={{ color: trendColor }}>{trendIcon}</span>
          {score.trend !== 'new' && score.previousScore !== undefined
            ? <span className="text-precision text-[0.6rem] text-clinical-stone">{score.trend === 'up' ? '+' : ''}{score.score - score.previousScore} from last draw</span>
            : <span className="text-precision text-[0.6rem] text-clinical-stone">Based on {score.totalMarkers} markers</span>}
        </div>
      </div>
      <div className="flex gap-4 mt-1">
        <div className="text-center"><p className="text-precision text-[0.68rem] font-bold text-primary-container">{score.optimalCount}</p><p className="text-precision text-[0.55rem] text-clinical-stone uppercase tracking-wider">Optimal</p></div>
        <div className="w-px bg-outline-variant/20" />
        <div className="text-center"><p className="text-precision text-[0.68rem] font-bold text-[#E8922A]">{score.monitorCount}</p><p className="text-precision text-[0.55rem] text-clinical-stone uppercase tracking-wider">Monitor</p></div>
        <div className="w-px bg-outline-variant/20" />
        <div className="text-center"><p className="text-precision text-[0.68rem] font-bold text-[#C94F4F]">{score.urgentCount}</p><p className="text-precision text-[0.55rem] text-clinical-stone uppercase tracking-wider">Urgent</p></div>
      </div>
    </div>
  );
};
