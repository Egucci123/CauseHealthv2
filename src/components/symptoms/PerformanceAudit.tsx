// src/components/symptoms/PerformanceAudit.tsx
// Quantified-self check-in for users in optimization / longevity mode.
// They don't have symptoms to map — they have performance dimensions to track.
// Each low score deterministically maps to specific lab markers worth checking
// and lifestyle adjustments worth trying. No AI call — fast, predictable, free.
import { useEffect, useState } from 'react';

const DIMENSIONS = [
  { key: 'energy', label: 'Energy', icon: 'bolt', desc: 'Daily energy and stamina, no afternoon crashes' },
  { key: 'sleep', label: 'Sleep Quality', icon: 'bedtime', desc: 'Falling asleep fast, staying asleep, waking refreshed' },
  { key: 'recovery', label: 'Recovery', icon: 'autorenew', desc: 'Bouncing back from workouts, stress, and illness' },
  { key: 'cognition', label: 'Cognition / Focus', icon: 'psychology', desc: 'Mental clarity, focus, no brain fog' },
  { key: 'mood', label: 'Mood', icon: 'mood', desc: 'Stable mood, low anxiety, motivation' },
  { key: 'libido', label: 'Libido', icon: 'favorite', desc: 'Sex drive and sexual function' },
  { key: 'gut', label: 'Gut Comfort', icon: 'restaurant', desc: 'No bloating, regular bowels, comfortable digestion' },
  { key: 'joints', label: 'Joints & Mobility', icon: 'accessibility_new', desc: 'No stiffness, full range of motion, no chronic pain' },
] as const;

type DimKey = typeof DIMENSIONS[number]['key'];
type Scores = Partial<Record<DimKey, number>>;

// Map low scores to labs and lifestyle. Conservative — only lab markers
// well-evidenced for the dimension.
const RECOMMENDATIONS: Record<DimKey, { labs: string[]; actions: string[] }> = {
  energy: {
    labs: ['Ferritin', 'Vitamin B12 + MMA', 'Free T3 + Free T4 + TPO antibodies', 'AM Cortisol', 'Vitamin D'],
    actions: ['Sunlight in your eyes within 30 min of waking', 'Protein-forward breakfast (30g+)', 'Consistent wake time, even on weekends', 'Cap caffeine at 200mg before noon'],
  },
  sleep: {
    labs: ['AM Cortisol', 'Magnesium (RBC)', 'Vitamin D', 'STOP-BANG screen → sleep study if positive'],
    actions: ['Cool bedroom (65-68°F)', 'No screens 60 min before bed', 'Magnesium glycinate 300-400mg in evening', 'No alcohol within 3h of bed', 'Consistent wake time'],
  },
  recovery: {
    labs: ['Total + Free Testosterone', 'DHEA-S', 'AM Cortisol', 'Vitamin D', 'hs-CRP'],
    actions: ['Sleep is the #1 recovery lever — 7-9 hrs', 'Easy week every 4 weeks (deload)', 'Protein 1g per lb of goal weight', 'Limit alcohol (impairs muscle protein synthesis)'],
  },
  cognition: {
    labs: ['Vitamin B12 + MMA', 'Omega-3 Index', 'Vitamin D', 'Homocysteine', 'Free T3 + Free T4'],
    actions: ['Omega-3 EPA+DHA 2g/day', 'Sleep — biggest cognitive lever', 'Zone 2 cardio 3x/week (BDNF, brain blood flow)', 'Reduce ultra-processed foods'],
  },
  mood: {
    labs: ['Vitamin D', 'Omega-3 Index', 'Magnesium', 'TSH + Free T3 + Free T4', 'Folate + B12'],
    actions: ['Daily sunlight or 10000-lux light therapy', 'Strength train 2-3x/week (best evidence for mood)', 'Reduce alcohol', 'Therapy if any of this feels stuck'],
  },
  libido: {
    labs: ['Total Testosterone + Free T (men)', 'Estradiol + SHBG', 'Prolactin', 'TSH', 'DHEA-S'],
    actions: ['Sleep 8 hours (T drops 15% on 5h nights)', 'Resistance training', 'Body composition — abdominal fat aromatizes T to E2', 'Limit alcohol', 'Reduce porn / dopamine overload if relevant'],
  },
  gut: {
    labs: ['Comprehensive Stool Analysis (GI-MAP)', 'tTG-IgA + total IgA (celiac screen)', 'hs-CRP', 'Food sensitivity panel (debatable utility)'],
    actions: ['Food + symptom journal for 2 weeks', 'Chew thoroughly, slow down meals', 'Stop eating 3h before bed', '30g fiber/day from real food', 'Consider low-FODMAP trial if bloating dominant'],
  },
  joints: {
    labs: ['hs-CRP', 'Vitamin D', 'Uric Acid', 'Ferritin (high — hemochromatosis joint pain)', 'ANA if persistent'],
    actions: ['Omega-3 EPA+DHA 2g/day', 'Daily 10-min mobility work', 'Strengthen the muscles around the joint', 'Cut inflammatory foods (sugar, ultra-processed, seed oils trial)'],
  },
};

const SCORE_KEY = (uid: string) => `performance_audit_${uid}`;

export const PerformanceAudit = ({ userId }: { userId: string }) => {
  const [scores, setScores] = useState<Scores>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Load saved scores on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCORE_KEY(userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.scores) setScores(parsed.scores);
        if (parsed.savedAt) setSavedAt(parsed.savedAt);
      }
    } catch { /* ignore */ }
  }, [userId]);

  const setScore = (key: DimKey, value: number) => {
    setScores(prev => {
      const next = { ...prev, [key]: value };
      try {
        const payload = { scores: next, savedAt: new Date().toISOString() };
        localStorage.setItem(SCORE_KEY(userId), JSON.stringify(payload));
        setSavedAt(payload.savedAt);
      } catch { /* quota */ }
      return next;
    });
  };

  const completedCount = Object.keys(scores).length;
  const lowDimensions = DIMENSIONS.filter(d => (scores[d.key] ?? 10) < 7);

  return (
    <div className="space-y-5">
      <div className="bg-[#D4A574]/10 border border-[#D4A574]/30 rounded-[10px] p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-[#B8915F] text-[20px] flex-shrink-0 mt-0.5">tips_and_updates</span>
        <div>
          <p className="text-body text-clinical-charcoal text-sm font-semibold mb-1">Self-rate each dimension 1-10.</p>
          <p className="text-body text-clinical-stone text-xs leading-relaxed">Scores below 7 surface labs to ask for and lifestyle changes that move the needle. Saved on this device. {savedAt && `Last updated ${new Date(savedAt).toLocaleDateString()}.`}</p>
        </div>
      </div>

      <div className="space-y-3">
        {DIMENSIONS.map(d => {
          const score = scores[d.key];
          const isLow = score !== undefined && score < 7;
          const accent = score === undefined ? '#D4A574' : isLow ? '#E8922A' : '#2A9D8F';
          return (
            <div key={d.key} className="bg-clinical-white rounded-[10px] shadow-card p-5" style={{ borderTop: `3px solid ${accent}` }}>
              <div className="flex items-start gap-3 mb-4">
                <span className="material-symbols-outlined text-[24px] flex-shrink-0" style={{ color: accent }}>{d.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-body text-clinical-charcoal font-semibold">{d.label}</p>
                    {score !== undefined && (
                      <span className="text-authority text-2xl font-bold" style={{ color: accent }}>{score}<span className="text-precision text-sm text-clinical-stone">/10</span></span>
                    )}
                  </div>
                  <p className="text-precision text-[0.65rem] text-clinical-stone tracking-wide">{d.desc}</p>
                </div>
              </div>
              <div className="flex gap-1">
                {[1,2,3,4,5,6,7,8,9,10].map(n => {
                  const isSelected = score === n;
                  const isInRange = score !== undefined && n <= score;
                  return (
                    <button
                      key={n}
                      onClick={() => setScore(d.key, n)}
                      className="flex-1 h-10 rounded transition-all text-precision text-xs font-bold"
                      style={{
                        backgroundColor: isSelected ? accent : isInRange ? `${accent}30` : '#F5F0E8',
                        color: isSelected ? '#FDFAF5' : isInRange ? accent : '#9C8B7A',
                        border: isSelected ? `2px solid ${accent}` : '1px solid #E8E3DB',
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {isLow && (
                <div className="mt-4 pt-4 border-t border-outline-variant/10 space-y-3">
                  <div>
                    <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#B8763B] mb-2">Labs to ask for</p>
                    <div className="flex flex-wrap gap-1.5">
                      {RECOMMENDATIONS[d.key].labs.map(lab => (
                        <span key={lab} className="text-precision text-[0.65rem] font-medium text-clinical-charcoal bg-[#E8922A]/15 px-2 py-1 rounded">{lab}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#B8763B] mb-2">Try these first</p>
                    <ul className="space-y-1">
                      {RECOMMENDATIONS[d.key].actions.map((a, i) => (
                        <li key={i} className="text-body text-clinical-stone text-xs leading-relaxed flex items-start gap-2">
                          <span className="text-[#B8763B] flex-shrink-0">·</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {completedCount === DIMENSIONS.length && lowDimensions.length === 0 && (
        <div className="bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 rounded-[10px] p-5 flex items-start gap-3">
          <span className="material-symbols-outlined text-[#2A9D8F] text-[24px] flex-shrink-0">check_circle</span>
          <div>
            <p className="text-authority text-base text-clinical-charcoal font-bold mb-1">Across the board, you're solid.</p>
            <p className="text-body text-clinical-stone text-sm leading-relaxed">Re-rate quarterly. Drift in one dimension is the signal — track it and treat any slide as a prompt to investigate before symptoms appear.</p>
          </div>
        </div>
      )}
      {completedCount < DIMENSIONS.length && (
        <p className="text-precision text-[0.65rem] text-clinical-stone text-center">{completedCount} of {DIMENSIONS.length} rated</p>
      )}
    </div>
  );
};
