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
        <div className="bg-[#FFF4E5] border border-[#E89D3C]/40 rounded-[10px] p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[#B86E15] text-[22px] flex-shrink-0 mt-0.5">support</span>
            <div className="flex-1">
              <p className="text-precision text-[0.68rem] text-[#B86E15] font-bold tracking-widest uppercase mb-1">Worth talking to someone</p>
              <p className="text-body text-clinical-charcoal font-semibold leading-relaxed">{crisis}</p>
              <p className="text-body text-clinical-charcoal text-sm mt-2 leading-relaxed">
                Free, confidential support is available 24/7 — call or text <a href="tel:988" className="font-bold underline">988</a> (US Suicide & Crisis Lifeline), or bring this up with your doctor.
              </p>
            </div>
          </div>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="bg-[#FFF4E5] border border-[#E89D3C]/40 rounded-[10px] p-5">
          <div className="flex items-start gap-3 mb-3">
            <span className="material-symbols-outlined text-[#B86E15] text-[22px] flex-shrink-0 mt-0.5">priority_high</span>
            <div className="flex-1">
              <p className="text-precision text-[0.68rem] text-[#B86E15] font-bold tracking-widest uppercase">
                {alerts.length} {alerts.length === 1 ? 'lab value' : 'lab values'} to discuss with your doctor promptly
              </p>
              <p className="text-body text-clinical-charcoal text-sm mt-1 leading-relaxed">
                These values are outside the range that's typically considered safe to leave untreated. Worth bringing to your doctor's attention soon rather than waiting for your next routine appointment.
              </p>
            </div>
          </div>
          <div className="space-y-2 pl-9">
            {alerts.map((a, i) => (
              <div key={a.key ?? i} className="bg-clinical-white rounded-[6px] p-3 border border-[#E89D3C]/30">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-body text-clinical-charcoal font-semibold text-sm">{a.marker}</p>
                  <p className="text-precision text-sm text-[#B86E15] font-bold">
                    {a.value} {a.unit} <span className="text-[0.65rem] tracking-wide uppercase ml-1">{a.threshold === 'critical_low' ? 'well below range' : 'well above range'}</span>
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
