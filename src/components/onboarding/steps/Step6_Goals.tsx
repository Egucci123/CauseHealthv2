// src/components/onboarding/steps/Step6_Goals.tsx
import { useNavigate } from 'react-router-dom';
import { OnboardingShell } from '../OnboardingShell';
import { useOnboardingStore } from '../../../store/onboardingStore';

const GOALS = [
  { value: 'understand_labs', label: 'Understand my bloodwork', icon: 'biotech', description: 'Decode what my results actually mean.' },
  { value: 'energy', label: 'Fix my energy', icon: 'bolt', description: 'Find the root cause of fatigue and brain fog.' },
  { value: 'off_medications', label: 'Reduce my medications', icon: 'medication_liquid', description: 'Address root causes, not just symptoms.' },
  { value: 'hair_regrowth', label: 'Regrow my hair', icon: 'face', description: 'Find the nutrient or hormonal cause.' },
  { value: 'heart_health', label: 'Improve heart health', icon: 'cardiology', description: 'Optimize cholesterol and cardiovascular risk.' },
  { value: 'gut_health', label: 'Fix my gut', icon: 'health_and_safety', description: 'IBD, IBS, SIBO — find the pattern.' },
  { value: 'weight', label: 'Lose weight', icon: 'monitor_weight', description: 'Find the metabolic root cause of resistance.' },
  { value: 'hormones', label: 'Balance hormones', icon: 'monitor_heart', description: 'Testosterone, thyroid, cortisol, estrogen.' },
  { value: 'doctor_prep', label: 'Prepare for a doctor visit', icon: 'description', description: 'Get the right tests ordered and covered.' },
  { value: 'longevity', label: 'Longevity & prevention', icon: 'timeline', description: 'Optimize before problems develop.' },
  { value: 'autoimmune', label: 'Manage autoimmune disease', icon: 'shield', description: 'Track cascade risk and manage inflammation.' },
  { value: 'pain', label: 'Reduce pain', icon: 'accessibility', description: 'Joint, muscle, and inflammatory pain.' },
];

export const Step6_Goals = () => {
  const navigate = useNavigate();
  const { primaryGoal, specificConcern, triedBefore, updateStep6, completeOnboarding } = useOnboardingStore();

  const handleFinish = async () => {
    try {
      await Promise.race([
        completeOnboarding(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
    } catch (err) {
      console.error('[Onboarding] Finish failed, navigating anyway:', err);
    }
    navigate('/dashboard', { replace: true });
  };

  return (
    <OnboardingShell stepKey="step-6" title="What brings you here?"
      description="Your primary goal shapes everything — what we prioritize in your plan, what tests we recommend, what patterns we look for."
      onNext={handleFinish} nextLabel="Finish" nextDisabled={!primaryGoal}>
      <div className="space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GOALS.map(goal => (
            <button key={goal.value} onClick={() => updateStep6({ primaryGoal: goal.value })} style={{ borderRadius: '6px' }}
              className={`flex items-start gap-3 p-4 border text-left transition-all ${primaryGoal === goal.value ? 'bg-primary-container/10 border-primary-container/50 text-primary-container' : 'bg-clinical-white border-outline-variant/20 hover:border-primary-container/30'}`}>
              <span className="material-symbols-outlined text-[20px] flex-shrink-0 mt-0.5" style={{ color: primaryGoal === goal.value ? '#1B4332' : '#6B6B6B' }}>{goal.icon}</span>
              <div>
                <p className={`text-body text-sm font-semibold ${primaryGoal === goal.value ? 'text-primary-container' : 'text-clinical-charcoal'}`}>{goal.label}</p>
                <p className="text-body text-clinical-stone text-xs mt-0.5 leading-relaxed">{goal.description}</p>
              </div>
            </button>
          ))}
        </div>
        <div>
          <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">Anything specific to add? (optional)</label>
          <textarea value={specificConcern} onChange={e => updateStep6({ specificConcern: e.target.value })}
            placeholder="What's the one thing you most want CauseHealth. to help you with?" rows={3} style={{ borderRadius: '4px' }}
            className="w-full bg-clinical-cream border border-outline-variant/20 px-4 py-3 text-clinical-charcoal text-body text-sm placeholder-clinical-stone/50 resize-none focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
        </div>
        <div>
          <label className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-1.5 block">What have you tried before? (optional)</label>
          <textarea value={triedBefore} onChange={e => updateStep6({ triedBefore: e.target.value })}
            placeholder="Diets, supplements, treatments that didn't fully work..." rows={2} style={{ borderRadius: '4px' }}
            className="w-full bg-clinical-cream border border-outline-variant/20 px-4 py-3 text-clinical-charcoal text-body text-sm placeholder-clinical-stone/50 resize-none focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-none transition-colors" />
        </div>
      </div>
    </OnboardingShell>
  );
};
