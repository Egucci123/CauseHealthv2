// src/components/health/DailyLifeEditor.tsx
//
// Shared "Daily Life" form (work / home / food / healthcare). Used by
// onboarding Step 6 and Settings → Health Profile. Pure UI — takes
// `value` + `onChange`. Drives universal AI tailoring without hardcoding.
//
// Layout: stacked vertical sections — was originally tabs (Work/Home/Food/
// Healthcare) but most users filled only the first tab and missed the rest.
// Stacked sections force users to scroll past every required field.
import { SectionLabel } from '../ui/SectionLabel';
import type { LifeContext } from '../../store/onboardingStore';

const WORK_TYPES: { value: LifeContext['workType']; label: string; icon: string }[] = [
  { value: 'desk',         label: 'Desk / office',        icon: '💻' },
  { value: 'driver',       label: 'Driver / trucker',     icon: '🚛' },
  { value: 'shift',        label: 'Shift work (nurse, factory)', icon: '🏭' },
  { value: 'labor',        label: 'Construction / labor', icon: '🔨' },
  { value: 'service',      label: 'Service (retail, food)', icon: '🛒' },
  { value: 'parent_home',  label: 'Parent at home',       icon: '🏡' },
  { value: 'retired',      label: 'Retired',              icon: '🌴' },
  { value: 'unemployed',   label: 'Between jobs',         icon: '⏳' },
];
const SCHEDULE_OPTS: { value: LifeContext['workSchedule']; label: string }[] = [
  { value: 'days', label: 'Days' }, { value: 'nights', label: 'Nights' }, { value: 'rotating', label: 'Rotating' },
  { value: 'flexible', label: 'Flexible' }, { value: 'multi_jobs', label: 'Multiple jobs' }, { value: 'na', label: 'N/A' },
];
const KIDS_OPTS: { value: LifeContext['kidsAtHome']; label: string }[] = [
  { value: '0', label: 'None' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3plus', label: '3+' },
];
const LIVING_OPTS: { value: LifeContext['livingSituation']; label: string }[] = [
  { value: 'alone', label: 'Alone' }, { value: 'partner', label: 'Partner' }, { value: 'family', label: 'Family' }, { value: 'roommates', label: 'Roommates' },
];
const COOKING_TIME_OPTS: { value: LifeContext['cookingTimeAvailable']; label: string }[] = [
  { value: 'under_15', label: '<15 min' }, { value: '15_30', label: '15–30 min' }, { value: '30_60', label: '30–60 min' }, { value: '60_plus', label: '1 hr+' },
];
const BREAKFAST_OPTS: { value: string; label: string; icon: string }[] = [
  { value: 'skip', label: 'Skip', icon: '🚫' },
  { value: 'fast_food', label: 'Fast food', icon: '🍔' },
  { value: 'gas_station', label: 'Gas station', icon: '⛽' },
  { value: 'coffee_shop', label: 'Coffee shop', icon: '☕' },
  { value: 'frozen_sandwich', label: 'Frozen sandwich', icon: '🥪' },
  { value: 'eggs_home', label: 'Eggs at home', icon: '🍳' },
  { value: 'cereal', label: 'Cereal / oatmeal', icon: '🥣' },
  { value: 'smoothie', label: 'Smoothie / shake', icon: '🥤' },
  { value: 'protein_bar', label: 'Protein bar', icon: '🍫' },
  { value: 'other', label: 'Other', icon: '🍽️' },
];
const LUNCH_OPTS: { value: string; label: string; icon: string }[] = [
  { value: 'fast_food', label: 'Fast food', icon: '🍔' },
  { value: 'gas_station', label: 'Gas station', icon: '⛽' },
  { value: 'wawa_convenience', label: 'Wawa / 7-Eleven / Sheetz', icon: '🏪' },
  { value: 'packed', label: 'Packed from home', icon: '🥪' },
  { value: 'cafeteria', label: 'Cafeteria / work', icon: '🍽️' },
  { value: 'cooler_box', label: 'Cooler / Pyrex box', icon: '🧊' },
  { value: 'drive_thru_salad', label: 'Drive-thru salad / bowl', icon: '🥗' },
  { value: 'restaurant', label: 'Sit-down restaurant', icon: '🍴' },
  { value: 'skip', label: 'Skip lunch', icon: '🚫' },
];
const DINNER_OPTS: { value: string; label: string; icon: string }[] = [
  { value: 'cook_scratch', label: 'Cook from scratch', icon: '🍳' },
  { value: 'crock_pot', label: 'Crock pot / Instant Pot', icon: '🍲' },
  { value: 'sheet_pan', label: 'Sheet pan / one-pan', icon: '🥘' },
  { value: 'frozen_meal', label: 'Frozen meal', icon: '❄️' },
  { value: 'takeout', label: 'Takeout / delivery', icon: '🥡' },
  { value: 'restaurant', label: 'Sit-down restaurant', icon: '🍴' },
  { value: 'kid_friendly', label: 'Kid-friendly meal', icon: '🧒' },
  { value: 'snack_dinner', label: 'Snacks-as-dinner', icon: '🥨' },
  { value: 'skip', label: 'Skip dinner', icon: '🚫' },
];
const BUDGET_OPTS: { value: LifeContext['weeklyFoodBudget']; label: string }[] = [
  { value: 'under_50', label: '<$50' }, { value: '50_100', label: '$50–100' }, { value: '100_150', label: '$100–150' }, { value: '150_plus', label: '$150+' },
];
const EAT_OUT_PLACES = [
  "McDonald's", 'Chick-fil-A', 'Chipotle', 'Subway', 'Starbucks', 'Dunkin',
  'Taco Bell', 'Wendy\'s', 'Burger King', 'Panera', 'Wawa', '7-Eleven',
  'Sheetz', 'Cracker Barrel', 'Olive Garden', 'Local diner', 'Pizza',
  'Costco food court', 'Whole Foods hot bar', 'Trader Joe\'s prepared',
  'Don\'t eat out', 'Other',
];
const INSURANCE_OPTS: { value: LifeContext['insuranceType']; label: string }[] = [
  { value: 'employer', label: 'Employer plan' }, { value: 'marketplace', label: 'Marketplace / ACA' },
  { value: 'medicaid', label: 'Medicaid' }, { value: 'medicare', label: 'Medicare' },
  { value: 'cash', label: 'None / cash-pay' }, { value: 'va', label: 'VA / Tricare' },
];
const PCP_OPTS: { value: LifeContext['hasPCP']; label: string }[] = [
  { value: 'regular', label: 'Yes, see them regularly' }, { value: 'rare', label: 'Have one, rarely see' }, { value: 'none', label: 'No / urgent care only' },
];
const PHYSICAL_OPTS: { value: LifeContext['lastPhysical']; label: string }[] = [
  { value: 'under_6mo', label: '<6 months' }, { value: '6_12mo', label: '6–12 months' }, { value: '1_2yr', label: '1–2 years' },
  { value: '2yr_plus', label: '2+ years' }, { value: 'never', label: 'Never' },
];

interface Props {
  value: Partial<LifeContext>;
  onChange: (patch: Partial<LifeContext>) => void;
}

// Section header used for every Daily-Life section.
const DLSectionHeader = ({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) => (
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

export const DailyLifeEditor = ({ value, onChange }: Props) => {
  const Toggle = <T extends string | undefined>({ options, val, onPick }: { options: { value: T; label: string }[]; val: T | undefined; onPick: (v: T) => void }) => (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onPick(opt.value)} style={{ borderRadius: '4px' }}
          className={`flex-1 min-w-[80px] py-2.5 text-body text-sm border transition-colors ${val === opt.value ? 'bg-primary-container border-primary-container text-white' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
          {opt.label}
        </button>
      ))}
    </div>
  );

  const IconGrid = <T extends string | undefined>({ options, val, onPick, cols = 3 }: { options: { value: T; label: string; icon: string }[]; val: T | undefined; onPick: (v: T) => void; cols?: number }) => (
    <div className={`grid gap-2 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {options.map(opt => (
        <button key={String(opt.value)} onClick={() => onPick(opt.value)} style={{ borderRadius: '4px' }}
          className={`flex flex-col items-center gap-1 py-3 px-2 border text-center transition-all ${val === opt.value ? 'bg-primary-container/10 border-primary-container/40 text-primary-container' : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'}`}>
          <span className="text-xl">{opt.icon}</span>
          <span className="text-body text-xs font-medium">{opt.label}</span>
        </button>
      ))}
    </div>
  );

  const ChipMulti = ({ items, selected, onToggle }: { items: string[]; selected: string[]; onToggle: (s: string) => void }) => (
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

  // Card wrapper for each section — clear visual separation as users scroll.
  const SectionCard = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-clinical-white rounded-[10px] border border-outline-variant/15 p-5 md:p-6">
      {children}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* ── WORK ────────────────────────────────────────────── */}
      <SectionCard>
        <DLSectionHeader icon="work" title="Work" subtitle="Schedule shapes meal timing + stress" />
        <div className="space-y-6">
          <div><SectionLabel>What kind of work do you do?</SectionLabel><IconGrid options={WORK_TYPES} val={value.workType} onPick={v => onChange({ workType: v })} cols={2} /></div>
          <div><SectionLabel>When do you work?</SectionLabel><Toggle options={SCHEDULE_OPTS} val={value.workSchedule} onPick={v => onChange({ workSchedule: v })} /></div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">Hours per week</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.hoursWorkedPerWeek ?? 40}h</span></div>
            <input type="range" min={0} max={80} value={value.hoursWorkedPerWeek ?? 40} onChange={e => onChange({ hoursWorkedPerWeek: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
        </div>
      </SectionCard>

      {/* ── HOME ────────────────────────────────────────────── */}
      <SectionCard>
        <DLSectionHeader icon="home" title="Home" subtitle="Family + living situation" />
        <div className="space-y-6">
          <div><SectionLabel>Kids at home?</SectionLabel><Toggle options={KIDS_OPTS} val={value.kidsAtHome} onPick={v => onChange({ kidsAtHome: v })} /></div>
          <div><SectionLabel>You live with...</SectionLabel><Toggle options={LIVING_OPTS} val={value.livingSituation} onPick={v => onChange({ livingSituation: v })} /></div>
          <div>
            <div className="flex justify-between items-center mb-2"><SectionLabel className="mb-0">How often do you cook at home?</SectionLabel><span className="text-authority text-2xl text-clinical-charcoal font-bold">{value.cookHomeFrequency ?? 5}/10</span></div>
            <input type="range" min={0} max={10} value={value.cookHomeFrequency ?? 5} onChange={e => onChange({ cookHomeFrequency: parseInt(e.target.value) })} className="w-full accent-primary-container" />
          </div>
        </div>
      </SectionCard>

      {/* ── FOOD ────────────────────────────────────────────── */}
      <SectionCard>
        <DLSectionHeader icon="restaurant" title="Food" subtitle="What you eat drives the wellness plan" />
        <div className="space-y-6">
          <div><SectionLabel>Time you can spend on food per day</SectionLabel><Toggle options={COOKING_TIME_OPTS} val={value.cookingTimeAvailable} onPick={v => onChange({ cookingTimeAvailable: v })} /></div>

          <MealMultiPick label="Breakfast — what do you actually eat? (pick up to 5)" options={BREAKFAST_OPTS}
            selected={value.breakfastPatterns ?? []} onChange={(v) => onChange({ breakfastPatterns: v as any })} max={5} />

          <MealMultiPick label="Lunch — what do you actually eat? (pick up to 5)" options={LUNCH_OPTS}
            selected={value.typicalLunches ?? (value.typicalLunch ? [value.typicalLunch] : [])}
            onChange={(v) => onChange({ typicalLunches: v as any })} max={5} />

          <MealMultiPick label="Dinner — how does dinner usually happen? (pick up to 5)" options={DINNER_OPTS}
            selected={value.dinnerPatterns ?? []} onChange={(v) => onChange({ dinnerPatterns: v as any })} max={5} />

          <div><SectionLabel>Weekly food budget (per person)</SectionLabel><Toggle options={BUDGET_OPTS} val={value.weeklyFoodBudget} onPick={v => onChange({ weeklyFoodBudget: v })} /></div>
          <div><SectionLabel>Where do you usually eat out?</SectionLabel>
            <ChipMulti items={EAT_OUT_PLACES} selected={value.eatOutPlaces ?? []}
              onToggle={p => { const c = value.eatOutPlaces ?? []; onChange({ eatOutPlaces: c.includes(p) ? c.filter(x => x !== p) : [...c, p] }); }} />
          </div>
        </div>
      </SectionCard>

      {/* ── HEALTHCARE ──────────────────────────────────────── */}
      <SectionCard>
        <DLSectionHeader icon="medical_services" title="Healthcare" subtitle="Insurance + access shapes test recommendations" />
        <div className="space-y-6">
          <div><SectionLabel>Insurance type</SectionLabel><Toggle options={INSURANCE_OPTS} val={value.insuranceType} onPick={v => onChange({ insuranceType: v })} />
            <p className="text-body text-xs text-clinical-stone mt-2">Used to pick tests your insurance is likely to cover.</p>
          </div>
          <div><SectionLabel>Do you have a primary care doctor?</SectionLabel><Toggle options={PCP_OPTS} val={value.hasPCP} onPick={v => onChange({ hasPCP: v })} /></div>
          <div><SectionLabel>Last full physical</SectionLabel><Toggle options={PHYSICAL_OPTS} val={value.lastPhysical} onPick={v => onChange({ lastPhysical: v })} /></div>
        </div>
      </SectionCard>
    </div>
  );
};

// Multi-pick icon-grid with a max-cap. Used for the meal-pattern fields.
const MealMultiPick = ({ label, options, selected, onChange, max }: {
  label: string;
  options: { value: string; label: string; icon: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
  max: number;
}) => {
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter(x => x !== v));
    else if (selected.length < max) onChange([...selected, v]);
  };
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <SectionLabel className="mb-0">{label}</SectionLabel>
        <span className="text-precision text-[0.55rem] text-clinical-stone tracking-widest">{selected.length}/{max}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map(opt => {
          const sel = selected.includes(opt.value);
          const atCap = !sel && selected.length >= max;
          return (
            <button key={opt.value} onClick={() => toggle(opt.value)} disabled={atCap} style={{ borderRadius: '4px' }}
              className={`flex flex-col items-center gap-1 py-3 px-2 border text-center transition-all ${
                sel ? 'bg-primary-container border-primary-container text-white'
                : atCap ? 'border-outline-variant/10 text-clinical-stone/40 cursor-not-allowed'
                : 'border-outline-variant/20 text-clinical-stone hover:border-outline-variant/40'
              }`}>
              <span className="text-xl">{opt.icon}</span>
              <span className="text-body text-xs font-medium leading-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
