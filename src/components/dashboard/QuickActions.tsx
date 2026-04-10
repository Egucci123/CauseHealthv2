// src/components/dashboard/QuickActions.tsx
import { useNavigate } from 'react-router-dom';
import { useLatestLabDraw } from '../../hooks/useLabData';

export const QuickActions = () => {
  const navigate = useNavigate();
  const { data: latestDraw } = useLatestLabDraw();

  const actions = [
    { label: 'Upload Labs', description: 'Add new bloodwork results', icon: 'upload_file', path: '/labs/upload', primary: !latestDraw },
    { label: 'Doctor Prep', description: 'Generate your prep document', icon: 'description', path: '/doctor-prep', primary: false },
    { label: 'Wellness Plan', description: 'View your 90-day protocol', icon: 'favorite', path: '/wellness', primary: false },
    { label: 'Log Today', description: 'Daily check-in', icon: 'edit_note', path: '/progress', primary: false },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {actions.map(action => (
        <button key={action.path} onClick={() => navigate(action.path)}
          className={`flex flex-col items-start gap-2 p-4 rounded-[10px] border transition-all text-left hover:shadow-card-md ${action.primary ? 'bg-primary-container text-white border-primary-container hover:bg-[#2D6A4F]' : 'bg-clinical-white border-outline-variant/10 hover:border-primary-container/30'}`}>
          <span className={`material-symbols-outlined text-[22px] ${action.primary ? 'text-white' : 'text-primary-container'}`}>{action.icon}</span>
          <div>
            <p className={`text-body text-sm font-semibold ${action.primary ? 'text-white' : 'text-clinical-charcoal'}`}>{action.label}</p>
            <p className={`text-precision text-[0.6rem] tracking-wide mt-0.5 ${action.primary ? 'text-white/70' : 'text-clinical-stone'}`}>{action.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
};
