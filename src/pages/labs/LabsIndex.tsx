// src/pages/labs/LabsIndex.tsx
// Default /labs route — shows the latest analyzed lab detail page directly
// so users see their analytics every time, not a list. List view lives at
// /labs/history (button on the detail page).
//
// AppShell stays mounted for ALL render paths — including during redirect —
// so navigating to /labs from sidebar doesn't flash the body background
// between the unmount of the previous AppShell and the mount of the new
// AppShell at /labs/:drawId. Imperative useNavigate inside an effect lets
// the layout chrome persist while the route swap happens.
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useLatestLabDraw, useLabDraws } from '../../hooks/useLabData';

export const LabsIndex = () => {
  const navigate = useNavigate();
  const { data: latest} = useLatestLabDraw();
  const { data: allDraws} = useLabDraws();

  // Decide redirect target — null while queries pending, undefined after
  // they resolve when there's no draw at all. Keeps the side-effect logic
  // tight in one place.
  const redirectTo: string | null =
    latest ? `/labs/${latest.id}`
    : (allDraws && allDraws.length > 0) ? `/labs/${allDraws[0].id}`
    : null;

  useEffect(() => {
    if (redirectTo) navigate(redirectTo, { replace: true });
  }, [redirectTo, navigate]);

  // Skeleton state covers both: queries still loading AND queries resolved
  // with a redirect pending. AppShell stays mounted the whole time so there's
  // no flash between this page and the lab detail page that's about to render.
  const isLoading = latest === undefined || allDraws === undefined;
  if (isLoading || redirectTo) {
    return (
      <AppShell pageTitle="Lab Analytics">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-clinical-white rounded-[10px] p-6 animate-pulse">
              <div className="h-4 bg-[#E8E3DB] rounded-sm w-1/4 mb-2" />
              <div className="h-3 bg-[#E8E3DB] rounded-sm w-1/2" />
            </div>
          ))}
        </div>
      </AppShell>
    );
  }

  // No draws yet — empty state with upload prompt
  return (
    <AppShell pageTitle="Lab Analytics">
      <div className="bg-clinical-white rounded-[10px] shadow-card border-t-[3px] border-primary-container p-12 text-center">
        <span className="material-symbols-outlined text-clinical-stone text-5xl mb-4 block">biotech</span>
        <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-2">No lab reports yet</p>
        <p className="text-body text-clinical-stone mb-6 max-w-xs mx-auto">Upload your first bloodwork PDF to start tracking your health over time.</p>
        <Button variant="primary" size="lg" icon="upload_file" onClick={() => navigate('/labs/upload')}>Upload My First Labs</Button>
      </div>
    </AppShell>
  );
};
