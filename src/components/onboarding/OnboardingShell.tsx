// src/components/onboarding/OnboardingShell.tsx
import { useEffect } from 'react';
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

  // Scroll to top on every step change. Older users hit Continue and the new
  // step's title was BELOW the fold because the browser kept the previous
  // step's scroll position — they thought the page was empty or broken.
  useEffect(() => {
    queueMicrotask(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  }, [stepKey]);

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
        <AnimatePresence mode="wait" initial={false}>
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

      {/* Navigation bar — 56px min height, big tap targets, safe-area-bottom on iOS */}
      {!hideNav && (
        <div
          className="flex-shrink-0 border-t border-outline-variant/10 bg-clinical-cream px-4 md:px-6 py-3 md:py-5"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            {showBack && currentStep > 1 ? (
              <button
                onClick={prevStep}
                className="flex items-center gap-1.5 min-h-[48px] px-4 rounded-[8px] text-precision text-[0.75rem] text-clinical-charcoal tracking-wider uppercase font-bold hover:bg-clinical-stone/10 transition-colors"
                aria-label="Go back to previous step"
              >
                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                <span className="hidden sm:inline">Back</span>
              </button>
            ) : <div />}
            <div className="flex items-center gap-2">
              {showSkip && onSkip && (
                <button
                  onClick={onSkip}
                  className="min-h-[48px] px-4 rounded-[8px] text-precision text-[0.7rem] text-clinical-stone tracking-wider uppercase font-bold hover:bg-clinical-stone/10 transition-colors"
                >
                  Skip
                </button>
              )}
              <Button variant="primary" size="lg" onClick={onNext} loading={loading} disabled={nextDisabled || loading} icon="arrow_forward" iconPosition="right">
                {nextLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
