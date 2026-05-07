// src/components/onboarding/steps/Step7_Complete.tsx
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { Button } from '../../ui/Button';
import { SectionLabel } from '../../ui/SectionLabel';

export const Step7_Complete = () => {
  const navigate = useNavigate();
  const { quickInsights, insightsLoading, completeOnboarding, medications } = useOnboardingStore();

  const handleComplete = async () => { await completeOnboarding(); navigate('/dashboard', { replace: true }); };

  return (
    <div className="min-h-screen bg-clinical-cream flex flex-col">
      <div className="bg-[#131313] px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-5">
            <span className="text-xl font-serif text-white">CauseHealth<span className="text-white">.</span></span>
            <span className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase">Setup Complete</span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (<div key={i} className="flex-1 h-1 rounded-full bg-primary-container" />))}
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto px-6 py-10 md:py-14 w-full">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-primary-container rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px]">check</span>
            </div>
            <span className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase">Profile Complete</span>
          </div>
          <h1 className="text-authority text-4xl text-clinical-charcoal font-bold leading-tight mb-3">Here's what we already know.</h1>
          <p className="text-body text-clinical-stone text-lg leading-relaxed">Based on your medications, conditions, and symptoms — before you've uploaded a single lab report.</p>
        </motion.div>

        <div className="space-y-4 mb-10">
          <SectionLabel>Initial Findings</SectionLabel>
          {insightsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (<div key={i} className="bg-clinical-white rounded-[10px] p-6 animate-pulse"><div className="h-4 bg-[#E8E3DB] rounded-sm w-3/4 mb-2" /><div className="h-3 bg-[#E8E3DB] rounded-sm w-full" /></div>))}
            </div>
          ) : quickInsights.length > 0 ? (
            quickInsights.map((insight, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.2, duration: 0.4 }}
                className="bg-clinical-white rounded-[10px] border-l-4 border-primary-container p-6">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[18px] flex-shrink-0 mt-0.5">insights</span>
                  <p className="text-body text-clinical-charcoal leading-relaxed">{insight}</p>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="bg-clinical-white rounded-[10px] border-l-4 border-primary-container p-6">
              <p className="text-body text-clinical-charcoal">Upload your first lab report to get your personalized root cause analysis.</p>
            </div>
          )}
        </div>

        {medications.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="bg-[#131313] rounded-[10px] p-6 mb-10">
            <SectionLabel light className="text-on-surface-variant">Depletions to Address</SectionLabel>
            <div className="space-y-2">
              {medications.filter(m => m.depletes.length > 0).map(med => (
                <div key={med.id} className="flex items-center justify-between">
                  <span className="text-body text-on-surface text-sm">{med.generic}</span>
                  <span className="text-precision text-[0.6rem] text-on-surface-variant">{med.depletes.length} depletion{med.depletes.length !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
            <p className="text-body text-on-surface-variant text-xs mt-4">All will be addressed in your personalized wellness plan.</p>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex flex-col gap-4">
          <Button variant="primary" size="lg" onClick={async () => { await completeOnboarding(); navigate('/labs/upload', { replace: true }); }} icon="upload_file" className="w-full justify-center">Upload My First Labs</Button>
          <button onClick={handleComplete} className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase text-center hover:text-clinical-charcoal transition-colors">Explore Dashboard First</button>
        </motion.div>
      </div>
    </div>
  );
};
