// src/components/landing/StatsBar.tsx
import { useEffect, useRef, useState } from 'react';

interface StatItem {
  value: string;
  label: string;
  source: string;
}

const STATS: StatItem[] = [
  {
    value: '12',
    label: 'minutes — average primary care appointment',
    source: 'JAMA Internal Medicine',
  },
  {
    value: '80%',
    label: 'of nutrient depletions from medications never addressed',
    source: 'Clinical Pharmacology Review',
  },
  {
    value: '43%',
    label: 'of Americans living with at least one chronic condition',
    source: 'CDC National Center for Health Statistics',
  },
];

function useCounter(target: number, duration: number, active: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration]);

  return count;
}

const StatCard = ({
  stat,
  active,
  index,
}: {
  stat: StatItem;
  active: boolean;
  index: number;
}) => {
  const isPercent = stat.value.includes('%');
  const numericValue = parseInt(stat.value.replace('%', ''));
  const count = useCounter(numericValue, 1200, active);
  const displayValue = isPercent ? `${count}%` : `${count}`;

  return (
    <div
      className={`
        flex flex-col gap-3 transition-all duration-700
        ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className="text-authority text-5xl md:text-6xl font-bold text-white">
        {displayValue}
      </div>
      <p className="text-body text-on-surface-variant text-sm leading-relaxed max-w-48">
        {stat.label}
      </p>
      <p className="text-precision text-[0.6rem] text-on-surface-variant/50 tracking-widest uppercase">
        {stat.source}
      </p>
    </div>
  );
};

export const StatsBar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setActive(true); },
      { threshold: 0.3 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="bg-[#131313] border-t border-b border-[#414844]/20"
    >
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-[#414844]/20">
          {STATS.map((stat, i) => (
            <div key={i} className={`${i > 0 ? 'pt-12 md:pt-0 md:pl-8' : ''}`}>
              <StatCard stat={stat} active={active} index={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
