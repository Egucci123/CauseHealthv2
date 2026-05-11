// supabase/functions/_shared/rules/testTiers/types.ts
//
// Shared types for the tier-based test recommendation system.
// Every test recommendation now carries a `tier` field so the doctor
// prep can group recommendations into clearly-labeled sections.

export type TestTier =
  | 'baseline'      // Universal standard-of-care, every adult PCP can't deny
  | 'preventive'    // Age-based screening (USPSTF A/B grade — ACA $0 coverage)
  | 'pattern'       // Lab/symptom-driven workup
  | 'specialist'    // Post-pattern confirmatory workup
  | 'imaging';      // Imaging studies (DEXA, CAC, mammogram, MRI, ultrasound)

// Re-export the existing Trigger / TestIndication types from testIndications.ts
// so tier files can import from a single location.
export type { Trigger, TestIndication, TestRef, TestTrigger, FlagName } from '../../testIndications.ts';
