// src/components/onboarding/OnboardingShell.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { useOnboardingStore } from '../../store/onboardingStore';
import { Button } from '../ui/Button';

interface OnboardingShellProps {
  children:        React.ReactNode;
  stepKey:         string;
  title:           string;
  description?:    string;
  onNext:          () => void | Promise<void>;
  nextLabel?:      string;
  nextDisabled?:   boolean;
  showBack?:       boolean;
  showSkip?:       boolean;
  onSkip?:         () => void;
  hideNav?:        boolean;
}

const variants = {
  enter:  { x: '60%', opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit:   { x: '-60%', opacity: 0 },
};

export const OnboardingShell = ({
  children, stepKey, title, description,
  onNext, nextLabel = 'Continue', nextDisabled = false,
  showBack = true, showSkip = false, onSkip, hideNav = false,
}: OnboardingShellProps) => {
  const { currentStep, totalSteps, prevStep, loading } = useOnboardingStore();

  return (
    <div className="min-h-screen bg-clinical-cream flex flex-col">
      {/* Dark top bar with progress */}
      <div className="bg-[#131313] px-6 py-5 flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-5">
            <span className="text-xl font-serif text-white">
              CauseHealth<span className="text-primary-container">.</span>
            </span>
            <span className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase">
              Step {currentStep} of {totalSteps}
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-1 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: i < currentStep ? '#1B4332'
                    : i === currentStep - 1 ? '#A5D0B9' : '#2A2A2A',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepKey}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="h-full"
          >
            <div className="max-w-2xl mx-auto px-6 py-10 md:py-14">
              <div className="mb-8 md:mb-10">
                <h1 className="text-authority text-3xl md:text-4xl text-clinical-charcoal font-bold leading-tight mb-2">
                  {title}
                </h1>
                {description && (
                  <p className="text-body text-clinical-stone text-base leading-relaxed">{description}</p>
                )}
              </div>
              {children}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation bar */}
      {!hideNav && (
        <div className="flex-shrink-0 border-t border-outline-variant/10 bg-clinical-cream px-6 py-4 md:py-5">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            {showBack && currentStep > 1 ? (
              <button onClick={prevStep} className="flex items-center gap-2 text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold hover:text-clinical-charcoal transition-colors">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back
              </button>
            ) : <div />}
            <div className="flex items-center gap-3">
              {showSkip && onSkip && (
                <button onClick={onSkip} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold hover:text-clinical-charcoal transition-colors">
                  Skip
                </button>
              )}
              <Button variant="primary" size="md" onClick={onNext} loading={loading} disabled={nextDisabled || loading} icon="arrow_forward" iconPosition="right">
                {nextLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
