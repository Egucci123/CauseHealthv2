// src/components/landing/ConditionsSection.tsx
const CONDITIONS = [
  'High Cholesterol', 'Fatty Liver', 'Hair Loss', 'IBD / Crohn\'s / UC',
  'Hashimoto\'s Thyroiditis', 'Insulin Resistance', 'Autoimmune Conditions',
  'Chronic Fatigue', 'Vitamin Deficiencies', 'Hormonal Imbalance',
  'Metabolic Syndrome', 'Cardiovascular Risk',
];

const CONDITIONS_ROW2 = [
  'Joint & Muscle Pain', 'Brain Fog', 'Sleep Disorders', 'PCOS',
  'Alopecia', 'Adrenal Dysfunction', 'Gut Dysbiosis', 'SIBO',
  'Celiac Disease', 'Psoriasis', 'Ankylosing Spondylitis',
];

const ConditionChip = ({
  label,
  variant,
}: {
  label: string;
  variant: 'forest' | 'sage';
}) => (
  <span
    className={`
      inline-flex items-center flex-shrink-0
      text-precision text-[0.68rem] font-bold tracking-wider uppercase
      px-4 py-2 border
      ${variant === 'forest'
        ? 'border-primary-container/40 text-primary-container bg-primary-container/5'
        : 'border-outline-variant/20 text-clinical-stone bg-clinical-white'
      }
    `}
    style={{ borderRadius: '4px' }}
  >
    {label}
  </span>
);

const Marquee = ({
  items,
  variant,
  reverse = false,
}: {
  items: string[];
  variant: 'forest' | 'sage';
  reverse?: boolean;
}) => (
  <div className="overflow-hidden">
    <div
      className={`flex gap-3 ${reverse ? 'animate-marquee-reverse' : 'animate-marquee'}`}
      style={{ width: 'max-content' }}
    >
      {[...items, ...items].map((label, i) => (
        <ConditionChip key={i} label={label} variant={variant} />
      ))}
    </div>
  </div>
);

export const ConditionsSection = () => (
  <section id="conditions" className="bg-clinical-cream py-24 md:py-28">
    <div className="max-w-6xl mx-auto px-6 mb-12">
      <div className="inline-flex items-center gap-2 mb-6">
        <div className="w-4 h-px bg-primary-container" />
        <span className="text-precision text-[0.68rem] text-primary-container tracking-widest uppercase font-bold">
          What We Address
        </span>
      </div>
      <h2 className="text-authority text-4xl md:text-5xl font-bold text-clinical-charcoal leading-tight mb-4">
        If your doctor said "your labs<br className="hidden md:block" /> look fine" but you don't feel fine.
      </h2>
      <p className="text-body text-clinical-stone text-lg max-w-xl leading-relaxed">
        CauseHealth. finds the pattern behind the symptoms — regardless of what
        condition is on the label.
      </p>
    </div>

    <div className="space-y-4">
      <Marquee items={CONDITIONS} variant="forest" />
      <Marquee items={CONDITIONS_ROW2} variant="sage" reverse />
    </div>
  </section>
);
