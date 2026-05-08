// src/components/onboarding/steps/Step0_Primer.tsx
//
// Pre-onboarding primer. Shows ONCE after signup, before Step 1. Sets
// expectations that every answer shapes the plan. Distinct from the numbered
// onboarding steps — no progress dots, no "Step X of Y" header. One CTA.
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../ui/Button';

interface Props { onContinue: () => void }

export const Step0_Primer = ({ onContinue }: Props) => {
  const profile = useAuthStore(s => s.profile);
  const firstName = profile?.firstName ?? '';

  return (
    <div className="min-h-screen bg-clinical-cream flex flex-col">
      {/* Dark hero header */}
      <div className="bg-[#131313] px-6 py-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-precision text-[0.6rem] font-bold tracking-widest uppercase text-[#D4A574] mb-2">Before we begin</p>
          <h1 className="text-authority text-3xl md:text-4xl text-on-surface font-bold leading-tight">
            Welcome{firstName ? `, ${firstName}` : ''}.
            <br />Let's build your plan.
          </h1>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto space-y-7">
          <p className="text-body text-clinical-charcoal text-base md:text-lg leading-relaxed">
            The next <strong className="font-semibold">7–10 minutes</strong> is the difference between a generic plan and one that actually fits your life.
          </p>

          <div className="bg-clinical-white rounded-[12px] p-5 border-l-[3px] border-[#1B423A] space-y-3">
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#1B423A]">What we'll ask about</p>
            <ul className="space-y-2 text-body text-clinical-charcoal text-sm leading-relaxed">
              <li className="flex items-start gap-3"><span className="text-[#D4A574] font-bold mt-0.5">·</span><span>Your health history and conditions</span></li>
              <li className="flex items-start gap-3"><span className="text-[#D4A574] font-bold mt-0.5">·</span><span>Medications and supplements you take</span></li>
              <li className="flex items-start gap-3"><span className="text-[#D4A574] font-bold mt-0.5">·</span><span>Symptoms you're experiencing</span></li>
              <li className="flex items-start gap-3"><span className="text-[#D4A574] font-bold mt-0.5">·</span><span>How you sleep, eat, move, and handle stress</span></li>
              <li className="flex items-start gap-3"><span className="text-[#D4A574] font-bold mt-0.5">·</span><span>Your daily life — work, family, food, healthcare</span></li>
              <li className="flex items-start gap-3"><span className="text-[#D4A574] font-bold mt-0.5">·</span><span>What you want to achieve</span></li>
            </ul>
          </div>

          <div className="bg-[#D4A574]/10 border border-[#D4A574]/30 rounded-[12px] p-5">
            <p className="text-precision text-[0.65rem] font-bold tracking-widest uppercase text-[#B8915F] mb-2">Why every detail matters</p>
            <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
              Your plan is built from your answers. Skip a question and the AI guesses. Fill it all out and you get a food playbook tuned to your labs, tests your insurance is likely to cover, and supplements that fit your medications.
            </p>
            <p className="text-body text-clinical-charcoal text-sm leading-relaxed mt-3">
              <strong className="font-semibold">There are no wrong answers.</strong> If something doesn't apply, there's an "I have none" option.
            </p>
          </div>

          <div className="pt-2">
            <Button variant="primary" size="lg" onClick={onContinue} className="w-full">
              Okay
            </Button>
            <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide text-center mt-3">
              You can come back and update anything later in Settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
