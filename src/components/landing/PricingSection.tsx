// src/components/landing/PricingSection.tsx
import { Button } from '../ui/Button';

const FEATURES = [
  'Unlimited lab report uploads',
  'Full optimal range analysis',
  'Complete personalized wellness plan',
  'Medication depletion checker',
  'Symptom root cause mapper',
  'Lab trend tracking over time',
  'Nutrition + exercise protocols',
  'Doctor Prep document with ICD-10 codes',
  'Insurance coverage talking points',
];

export const PricingSection = () => {
  return (
    <section id="pricing" className="bg-[#131313] py-24 md:py-32">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-16 text-center">
          <div className="inline-flex items-center gap-2 mb-6 justify-center">
            <div className="w-4 h-px bg-primary" />
            <span className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase font-bold">
              Pricing
            </span>
            <div className="w-4 h-px bg-primary" />
          </div>
          <h2 className="text-authority text-4xl md:text-5xl font-bold text-white leading-tight mb-4">
            Less than one specialist copay.
          </h2>
          <p className="text-body text-on-surface-variant text-lg max-w-lg mx-auto">
            The Doctor Prep feature alone has helped users get thousands in
            previously uncovered tests approved by insurance.
          </p>
        </div>

        <div
          className="
            bg-clinical-white rounded-[10px] overflow-hidden
            border-t-[3px] border-primary-container ring-1 ring-primary-container/20
            max-w-xl mx-auto
          "
        >
          <div className="bg-primary-container px-6 py-2">
            <p className="text-precision text-[0.68rem] text-white tracking-widest uppercase font-bold text-center">
              Full Access
            </p>
          </div>

          <div className="p-8 md:p-10">
            <div className="text-center mb-8">
              <h3 className="text-authority text-2xl text-clinical-charcoal font-semibold mb-2">
                CauseHealth Pro
              </h3>
              <p className="text-body text-clinical-stone text-sm mb-6">
                Everything you need to understand your labs and advocate for your health.
              </p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-authority text-5xl text-clinical-charcoal font-bold">
                  $19
                </span>
                <span className="text-body text-clinical-stone text-sm">/month</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              onClick={() => window.location.href = '/register'}
              className="w-full justify-center mb-3"
            >
              Start Your Health Intelligence
            </Button>
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide text-center mb-8">
              Free signup · Free uploads · Have a code? Redeem it in Settings.
            </p>

            <div className="space-y-3">
              <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold mb-4">
                Everything Included
              </p>
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[16px] flex-shrink-0 mt-0.5">
                    check_circle
                  </span>
                  <span className="text-body text-clinical-charcoal text-sm">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="text-body text-on-surface-variant/60 text-sm text-center mt-8">
          Cancel anytime. No contracts. Your data is always yours and always deletable.
        </p>
      </div>
    </section>
  );
};
