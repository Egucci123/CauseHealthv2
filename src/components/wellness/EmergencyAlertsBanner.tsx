// EmergencyAlertsBanner.tsx
// ──────────────────────────────────────────────────────────────────────
// Top-of-page banner that renders engine-emitted critical-value alerts
// (K >6.5, Na <125, glucose <40 or >400, Hgb <7, etc.) and the optional
// crisis_alert (suicide-risk language detection in free text).
//
// Safety-critical: renders before any "plan" content so a user with a
// life-threatening lab value sees it before scrolling. Engine emits
// these via buildAlerts() in alertRules.ts; the wellness plan was
// previously discarding them (orphan field).

import type { WellnessPlanData } from '../../hooks/useWellnessPlan';

interface Props {
  emergencyAlerts?: WellnessPlanData['emergency_alerts'];
  crisisAlert?: WellnessPlanData['crisis_alert'];
}

function crisisMessage(crisis: WellnessPlanData['crisis_alert']): string | null {
  if (!crisis) return null;
  if (typeof crisis === 'string') return crisis;
  return crisis.message ?? null;
}

export const EmergencyAlertsBanner = ({ emergencyAlerts, crisisAlert }: Props) => {
  const alerts = Array.isArray(emergencyAlerts) ? emergencyAlerts : [];
  const crisis = crisisMessage(crisisAlert);
  if (alerts.length === 0 && !crisis) return null;

  return (
    <div className="space-y-3">
      {crisis && (
        <div className="bg-[#FFE8E8] border-2 border-[#C94F4F] rounded-[10px] p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#C94F4F] text-[24px] flex-shrink-0 mt-0.5">support</span>
            <div className="flex-1">
              <p className="text-precision text-[0.68rem] text-[#C94F4F] font-bold tracking-widest uppercase mb-1">Please reach out</p>
              <p className="text-body text-clinical-charcoal font-semibold leading-relaxed">{crisis}</p>
              <p className="text-body text-clinical-charcoal text-sm mt-2 leading-relaxed">
                If you're in crisis, call or text <a href="tel:988" className="font-bold underline">988</a> (US Suicide & Crisis Lifeline) — 24/7, free, confidential.
              </p>
            </div>
          </div>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="bg-[#FFE8E8] border-2 border-[#C94F4F] rounded-[10px] p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="material-symbols-outlined text-[#C94F4F] text-[24px] flex-shrink-0 mt-0.5">emergency</span>
            <div className="flex-1">
              <p className="text-precision text-[0.68rem] text-[#C94F4F] font-bold tracking-widest uppercase">
                {alerts.length} critical lab {alerts.length === 1 ? 'value' : 'values'} — contact your doctor today
              </p>
              <p className="text-body text-clinical-charcoal text-sm mt-1 leading-relaxed">
                The values below are outside the range a clinician would consider safe to leave untreated. Don't wait for your next appointment — call your provider or visit urgent care.
              </p>
            </div>
          </div>
          <div className="space-y-2 pl-9">
            {alerts.map((a, i) => (
              <div key={a.key ?? i} className="bg-clinical-white rounded-[6px] p-3 border border-[#C94F4F]/30">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-body text-clinical-charcoal font-semibold text-sm">{a.marker}</p>
                  <p className="text-precision text-sm text-[#C94F4F] font-bold">
                    {a.value} {a.unit} <span className="text-[0.65rem] tracking-wide uppercase ml-1">{a.threshold.replace('_', ' ')}</span>
                  </p>
                </div>
                {a.message && <p className="text-body text-clinical-stone text-xs mt-1 leading-relaxed">{a.message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
