// src/components/dashboard/FinishProfileBanner.tsx
//
// Shows on the dashboard when a user has signed in but never finished
// onboarding. Click → drops them at /onboarding which auto-resumes at the
// highest unfilled step (loadSavedProgress already handles that).
//
// Hides itself once profile.onboardingCompleted = true. Lightweight, no API
// calls — purely reads from authStore profile state.

import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export const FinishProfileBanner = () => {
  const navigate = useNavigate();
  const profile = useAuthStore(s => s.profile);

  // Don't render if user has finished onboarding OR if profile hasn't loaded yet
  if (!profile) return null;
  if (profile.onboardingCompleted) return null;

  return (
    <button
      onClick={() => navigate('/onboarding')}
      className="w-full bg-[#E8922A]/10 border border-[#E8922A]/30 rounded-[10px] p-5 flex items-center gap-4 hover:bg-[#E8922A]/15 transition-colors text-left"
    >
      <div className="w-10 h-10 bg-[#E8922A]/20 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-[#E8922A] text-[20px]">person_edit</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-body text-clinical-charcoal font-semibold text-sm">Finish your profile</p>
        <p className="text-precision text-[0.6rem] text-clinical-stone">Your wellness plan and lab analysis need this to give accurate results. Picks up where you left off.</p>
      </div>
      <span className="material-symbols-outlined text-[#E8922A] text-[18px] flex-shrink-0">arrow_forward</span>
    </button>
  );
};
