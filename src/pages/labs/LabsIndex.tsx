// src/pages/labs/LabsIndex.tsx
// Default /labs route — shows the latest analyzed lab detail page directly
// so users see their analytics every time, not a list. List view lives at
// /labs/history (button on the detail page).
import { Navigate } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/Button';
import { useLatestLabDraw, useLabDraws } from '../../hooks/useLabData';
import { useNavigate } from 'react-router-dom';

export const LabsIndex = () => {
  const navigate = useNavigate();
  const { data: latest, isLoading: latestLoading } = useLatestLabDraw();
  const { data: allDraws, isLoading: drawsLoading } = useLabDraws();

  // Skeleton only when neither query has any cached data (true first load).
  // If we have either cached, navigate immediately based on what's cached.
  if (!latest && !allDraws && (latestLoading || drawsLoading)) {
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

  // Have an analyzed draw → jump to its detail page
  if (latest) return <Navigate to={`/labs/${latest.id}`} replace />;

  // Have at least one draw but none complete → send to history so they can
  // retry / wait on the in-flight analysis
  if (allDraws && allDraws.length > 0) return <Navigate to="/labs/history" replace />;

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
