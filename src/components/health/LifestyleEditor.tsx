// src/components/health/LifestyleEditor.tsx
//
// Shared lifestyle form. Used by onboarding Step 5 and Settings → Health
// Profile. Pure UI — takes `value` + `onChange` and emits patches.
//
// Layout: stacked vertical sections (Sleep, Diet, Exercise, Stress) — was
// originally tabs but users were missing 3 of 4 sections (filling Sleep
// only and clicking Continue). Stacked forces them through every section.
import { SectionLabel } from '../ui/SectionLabel';

const DIET_TYPES = [
  { value: 'standard', label: 'Standard', icon: '🍔' },
  { value: 'mediterranean', label: 'Mediterranean', icon: '🫒' },
  { value: 'low_carb', label: 'Low Carb / Keto', icon: '🥩' },
  { value: 'plant_based', label: 'Plant-Based', icon: '🥦' },
  { value: 'carnivore', label: 'Carnivore', icon: '🥓' },
  { value: 'other', label: 'Other', icon: '🍽️' },
];
const EXERCISE_TYPES = ['Walking', 'Running', 'Cycling', 'Swimming', 'Resistance Training', 'HIIT', 'Yoga', 'Sports', 'None'];
const STRESS_OPTIONS = ['Work / Career', 'Finances', 'Relationships', 'Health', 'Family', 'Sleep deprivation', 'Chronic pain'];

export interface LifestyleValue {
  sleepHours?: number; sleepQuality?: number; snoring?: 'yes' | 'no' | 'partner_says'; wakeRested?: 'yes' | 'no' | 'sometimes';
  dietType?: string; alcoholPerWeek?: number; coffeePerDay?: number;
  exerciseDaysPerWeek?: number; exerciseTypes?: string[];
  stressLevel?: number; primaryStressors?: string[]; smoker?: 'never' | 'former' | 'current';
}

interface Props {
  value: LifestyleValue;
  onChange: (patch: Partial<LifestyleValue>) => void;
}

// Section header used across all 4 lifestyle sections.
const SectionHeader = ({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) => (
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 bg-primary-container/10 rounded-lg flex items-center justify-center flex-shrink-0">
      <span className="material-symbols-outlined text-primary-container text-[20px]">{icon}</span>
    </div>
    <div>
      <h3 className="text-authority text-lg text-clinical-charcoal font-semibold leading-tight">{title}</h3>
      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide uppercase">{subtitle}</p>
    </div>
  </div>
);

// CRITICAL: these helpers MUST live at module scope, not inside
// LifestyleEditor's body. If defined inside, they get recreated as a
// brand-new component type on every parent render — React then unmounts
// + remounts the entire subtree (including <input type="range">), which
// kills active drag gestures at every state change. That was the
// real cause of "slider stops at each number, have to reclick to keep going".
const ToggleButtons = ({ options, val, onPick }: { options: { value: string; label: string }[]; val: string | undefined; onPick: (v: string) => void }) => (
  <div className="flex gap-2 flex-wrap">
    {options.map(opt => (
      <button key={opt.value} onClick={() => onPick(opt.value)} style={{ borderRadius: '4px' }}
        className={`flex-1 min-w-[80px] py-2.5 text-body text-sm border transition-colors ${val === opt.value ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
        {opt.label}
      </button>
    ))}
  </div>
);

const ChipSelect = ({ items, selected, onToggle }: { items: string[]; selected: string[]; onToggle: (item: string) => void }) => (
  <div className="flex flex-wrap gap-2">
    {items.map(item => {
      const sel = selected.includes(item);
      return (
        <button key={item} onClick={() => onToggle(item)} style={{ borderRadius: '4px' }}
          className={`text-body text-sm px-3 py-2 border transition-all ${sel ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
          {item}
        </button>
      );
    })}
  </div>
);

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-clinical-white rounded-[10px] border border-outline-variant/15 p-5 md:p-6">
    {children}
  </div>
);

export const LifestyleEditor = ({ value, onChange }: Props) => {
  return (
    <div className="space-y-5">
      {/* ── SLEEP ───────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon="bedtime" title="Sleep" subtitle="Affects every hormone + recovery" />
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Hours per Night</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.sleepHours ?? 7}h</span></div>
            <input type="range" min={4} max={12} step={0.5} defaultValue={value.sleepHours ?? 7} onChange={e => onChange({ sleepHours: parseFloat(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Sleep Quality</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.sleepQuality ?? 6}/10</span></div>
            <input type="range" min={1} max={10} defaultValue={value.sleepQuality ?? 6} onChange={e => onChange({ sleepQuality: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div><SectionLabel>Do You Snore?</SectionLabel><ToggleButtons options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'partner_says', label: 'Partner says yes' }]} val={value.snoring} onPick={v => onChange({ snoring: v as any })} /></div>
          <div><SectionLabel>Wake Feeling Rested?</SectionLabel><ToggleButtons options={[{ value: 'yes', label: 'Yes' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'no', label: 'Rarely' }]} val={value.wakeRested} onPick={v => onChange({ wakeRested: v as any })} /></div>
        </div>
      </SectionCard>

      {/* ── DIET ────────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon="restaurant" title="Diet" subtitle="Drives meal recommendations + lab interpretation" />
        <div className="space-y-6">
          <div><SectionLabel>Diet Type</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {DIET_TYPES.map(dt => (
                <button key={dt.value} onClick={() => onChange({ dietType: dt.value })} style={{ borderRadius: '4px' }}
                  className={`flex flex-col items-center gap-1 py-3 px-2 border text-center transition-all ${value.dietType === dt.value ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                  <span className="text-xl">{dt.icon}</span><span className="text-body text-xs font-medium">{dt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Alcohol (drinks/week)</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.alcoholPerWeek ?? 0}</span></div>
            <input type="range" min={0} max={21} defaultValue={value.alcoholPerWeek ?? 0} onChange={e => onChange({ alcoholPerWeek: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Coffee (cups/day)</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.coffeePerDay ?? 1}</span></div>
            <input type="range" min={0} max={8} defaultValue={value.coffeePerDay ?? 1} onChange={e => onChange({ coffeePerDay: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
        </div>
      </SectionCard>

      {/* ── EXERCISE ────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon="fitness_center" title="Exercise" subtitle="Metabolic + cardiovascular context" />
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Days per Week</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.exerciseDaysPerWeek ?? 2}</span></div>
            <input type="range" min={0} max={7} defaultValue={value.exerciseDaysPerWeek ?? 2} onChange={e => onChange({ exerciseDaysPerWeek: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div><SectionLabel>Types of Exercise</SectionLabel>
            <ChipSelect items={EXERCISE_TYPES} selected={value.exerciseTypes ?? []}
              onToggle={t => { const c = value.exerciseTypes ?? []; onChange({ exerciseTypes: c.includes(t) ? c.filter(x => x !== t) : [...c, t] }); }} />
          </div>
        </div>
      </SectionCard>

      {/* ── STRESS ──────────────────────────────────────────── */}
      <SectionCard>
        <SectionHeader icon="psychology" title="Stress & Smoking" subtitle="Cortisol + cardiovascular risk markers" />
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Overall Stress Level</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.stressLevel ?? 5}/10</span></div>
            <input type="range" min={1} max={10} defaultValue={value.stressLevel ?? 5} onChange={e => onChange({ stressLevel: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div><SectionLabel>Primary Stressors</SectionLabel>
            <ChipSelect items={STRESS_OPTIONS} selected={value.primaryStressors ?? []}
              onToggle={s => { const c = value.primaryStressors ?? []; onChange({ primaryStressors: c.includes(s) ? c.filter(x => x !== s) : [...c, s] }); }} />
          </div>
          <div><SectionLabel>Smoking Status</SectionLabel><ToggleButtons options={[{ value: 'never', label: 'Never' }, { value: 'former', label: 'Former' }, { value: 'current', label: 'Current' }]} val={value.smoker} onPick={v => onChange({ smoker: v as any })} /></div>
        </div>
      </SectionCard>
    </div>
  );
};
