// src/components/common/ProGate.tsx
import { useNavigate } from 'react-router-dom';
import { useSubscription, PRO_FEATURES, type ProFeature } from '../../lib/subscription';

interface ProGateProps { feature: ProFeature; children: React.ReactNode; fallback?: React.ReactNode; }

export function ProGate({ feature, children, fallback }: ProGateProps) {
  const { isPro } = useSubscription();
  if (isPro) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return <UpgradePrompt feature={feature} />;
}

export function UpgradePrompt({ feature }: { feature: ProFeature }) {
  const navigate = useNavigate();
  return (
    <div className="bg-clinical-white rounded-[10px] border-t-[3px] border-[#D4A574] shadow-card p-8 text-center">
      <div className="w-12 h-12 rounded-full bg-[#D4A574]/15 flex items-center justify-center mx-auto mb-4">
        <span className="material-symbols-outlined text-[#D4A574] text-2xl">lock</span>
      </div>
      <p className="text-precision text-[0.68rem] uppercase tracking-widest text-[#D4A574] mb-2">Locked</p>
      <h3 className="text-authority text-xl text-clinical-charcoal mb-2">{PRO_FEATURES[feature]}</h3>
      <p className="text-body text-sm text-clinical-stone mb-6 max-w-xs mx-auto">Unlock {PRO_FEATURES[feature].toLowerCase()} for $19 — one-time per analysis.</p>
      <button onClick={() => navigate('/settings?tab=subscription')} className="bg-primary-container text-white text-sm font-semibold px-6 py-2.5 hover:bg-[#2D6A4F] transition-colors" style={{ borderRadius: '6px' }}>
        Unlock — $19 one-time
      </button>
    </div>
  );
}
