// src/components/landing/PricingSection.tsx
import { Button } from '../ui/Button';

const FEATURES = [
  'Optimal range analysis (not just "normal")',
  'Watch list — markers worth tracking even if "in range"',
  'Tests your doctor didn\'t order, with ICD-10 codes',
  'Findings your doctor missed — root-cause patterns across markers',
  'Doctor Prep document — printable, hand to your doctor',
  '90-day plan with retest schedule',
  'Medication depletion mapping (CoQ10, B12, folate, magnesium)',
  'Biological + Cardiometabolic Age scoring',
  'AI chat that reads your actual labs',
  'Lifetime access to every analysis you buy',
  'PDF export — yours to keep',
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
            $20 per analysis. No subscription.
          </h2>
          <p className="text-body text-on-surface-variant text-lg max-w-lg mx-auto">
            Pay when you upload labs. Keep that analysis forever. No monthly
            charge sitting in the background.
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
              One-Time Purchase
            </p>
          </div>

          <div className="p-8 md:p-10">
            <div className="text-center mb-8">
              <h3 className="text-authority text-2xl text-clinical-charcoal font-semibold mb-2">
                Lab Analysis
              </h3>
              <p className="text-body text-clinical-stone text-sm mb-6">
                Upload your bloodwork. Pay once. Keep it forever.
              </p>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-authority text-5xl text-clinical-charcoal font-bold">
                  $20
                </span>
                <span className="text-body text-clinical-stone text-sm">per analysis</span>
              </div>
              <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide mt-2">
                One-time. Lifetime access to that analysis. New labs later? $20 again.
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              onClick={() => window.location.href = '/register'}
              className="w-full justify-center mb-3"
            >
              Upload My Labs
            </Button>
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide text-center mb-8">
              Free signup · Free preview · Pay only to unlock the full analysis + plan.
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
          No subscriptions. No surprises. Your data is always yours and always deletable.
        </p>
      </div>
    </section>
  );
};
