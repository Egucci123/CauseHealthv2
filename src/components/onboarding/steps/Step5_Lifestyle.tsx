// src/components/onboarding/steps/Step5_Lifestyle.tsx
import { useState } from 'react';
import { OnboardingShell } from '../OnboardingShell';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { SectionLabel } from '../../ui/SectionLabel';

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

export const Step5_Lifestyle = () => {
  const { nextStep, lifestyle, updateStep5 } = useOnboardingStore();
  const [tab, setTab] = useState<'sleep' | 'diet' | 'exercise' | 'stress'>('sleep');
  const update = (data: Partial<typeof lifestyle>) => updateStep5({ lifestyle: { ...lifestyle, ...data } });

  const tabs = [
    { id: 'sleep', label: 'Sleep', icon: 'bedtime' },
    { id: 'diet', label: 'Diet', icon: 'restaurant' },
    { id: 'exercise', label: 'Exercise', icon: 'fitness_center' },
    { id: 'stress', label: 'Stress', icon: 'psychology' },
  ] as const;

  const ToggleButtons = ({ options, value, onChange }: { options: { value: string; label: string }[]; value: string | undefined; onChange: (v: string) => void }) => (
    <div className="flex gap-2">
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{ borderRadius: '4px' }}
          className={`flex-1 py-2.5 text-body text-sm border transition-colors ${value === opt.value ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
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

  return (
    <OnboardingShell stepKey="step-5" title="Your lifestyle factors."
      description="Sleep, diet, exercise, and stress affect every lab value. This context makes the difference between a generic plan and a precise one."
      onNext={async () => { await nextStep(); }} showSkip onSkip={async () => { await nextStep(); }}>
      <div className="flex gap-1 bg-[#131313] rounded-[10px] p-1 mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-precision text-[0.6rem] tracking-wider uppercase font-bold transition-all ${tab === t.id ? 'bg-primary-container text-white rounded-lg' : 'text-on-surface-variant hover:text-white'}`}>
            <span className="material-symbols-outlined text-[14px]">{t.icon}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'sleep' && (
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Hours per Night</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{lifestyle.sleepHours ?? 7}h</span></div>
            <input type="range" min={4} max={12} step={0.5} value={lifestyle.sleepHours ?? 7} onChange={e => update({ sleepHours: parseFloat(e.target.value) })} className="w-full accent-primary-container" />
            <div className="flex justify-between mt-1"><span className="text-precision text-[0.6rem] text-clinical-stone">4h</span><span className="text-precision text-[0.6rem] text-clinical-stone">12h</span></div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Sleep Quality</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{lifestyle.sleepQuality ?? 6}/10</span></div>
            <input type="range" min={1} max={10} value={lifestyle.sleepQuality ?? 6} onChange={e => update({ sleepQuality: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div><SectionLabel>Do You Snore?</SectionLabel><ToggleButtons options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'partner_says', label: 'Partner says yes' }]} value={lifestyle.snoring} onChange={v => update({ snoring: v as any })} /></div>
          <div><SectionLabel>Wake Feeling Rested?</SectionLabel><ToggleButtons options={[{ value: 'yes', label: 'Yes' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'no', label: 'Rarely' }]} value={lifestyle.wakeRested} onChange={v => update({ wakeRested: v as any })} /></div>
        </div>
      )}

      {tab === 'diet' && (
        <div className="space-y-6">
          <div><SectionLabel>Diet Type</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              {DIET_TYPES.map(dt => (
                <button key={dt.value} onClick={() => update({ dietType: dt.value })} style={{ borderRadius: '4px' }}
                  className={`flex flex-col items-center gap-1 py-3 px-2 border text-center transition-all ${lifestyle.dietType === dt.value ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
                  <span className="text-xl">{dt.icon}</span><span className="text-body text-xs font-medium">{dt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Alcohol (drinks/week)</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{lifestyle.alcoholPerWeek ?? 0}</span></div>
            <input type="range" min={0} max={21} value={lifestyle.alcoholPerWeek ?? 0} onChange={e => update({ alcoholPerWeek: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Coffee (cups/day)</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{lifestyle.coffeePerDay ?? 1}</span></div>
            <input type="range" min={0} max={8} value={lifestyle.coffeePerDay ?? 1} onChange={e => update({ coffeePerDay: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
        </div>
      )}

      {tab === 'exercise' && (
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Days per Week</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{lifestyle.exerciseDaysPerWeek ?? 2}</span></div>
            <input type="range" min={0} max={7} value={lifestyle.exerciseDaysPerWeek ?? 2} onChange={e => update({ exerciseDaysPerWeek: parseInt(e.target.value) })} className="w-full accent-primary-container" />
            <div className="flex justify-between mt-1"><span className="text-precision text-[0.6rem] text-clinical-stone">None</span><span className="text-precision text-[0.6rem] text-clinical-stone">Daily</span></div>
          </div>
          <div><SectionLabel>Types of Exercise</SectionLabel>
            <ChipSelect items={EXERCISE_TYPES} selected={lifestyle.exerciseTypes ?? []}
              onToggle={type => { const c = lifestyle.exerciseTypes ?? []; update({ exerciseTypes: c.includes(type) ? c.filter(t => t !== type) : [...c, type] }); }} />
          </div>
        </div>
      )}

      {tab === 'stress' && (
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Overall Stress Level</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{lifestyle.stressLevel ?? 5}/10</span></div>
            <input type="range" min={1} max={10} value={lifestyle.stressLevel ?? 5} onChange={e => update({ stressLevel: parseInt(e.target.value) })} className="w-full accent-primary-container" />
            <div className="flex justify-between mt-1"><span className="text-precision text-[0.6rem] text-clinical-stone">Low</span><span className="text-precision text-[0.6rem] text-clinical-stone">Extreme</span></div>
          </div>
          <div><SectionLabel>Primary Stressors</SectionLabel>
            <ChipSelect items={STRESS_OPTIONS} selected={lifestyle.primaryStressors ?? []}
              onToggle={s => { const c = lifestyle.primaryStressors ?? []; update({ primaryStressors: c.includes(s) ? c.filter(x => x !== s) : [...c, s] }); }} />
          </div>
          <div><SectionLabel>Smoking Status</SectionLabel><ToggleButtons options={[{ value: 'never', label: 'Never' }, { value: 'former', label: 'Former' }, { value: 'current', label: 'Current' }]} value={lifestyle.smoker} onChange={v => update({ smoker: v as any })} /></div>
        </div>
      )}
    </OnboardingShell>
  );
};
