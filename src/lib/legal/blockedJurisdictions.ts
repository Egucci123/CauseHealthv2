// src/lib/legal/blockedJurisdictions.ts
//
// GEOBLOCK SOURCE OF TRUTH
// ========================
// Per the v6 legal spec, residents of California, New York, Illinois, and
// Washington State are not permitted users. EU/UK/EEA/Switzerland are
// blocked internationally. The app enforces this at THREE layers:
//
//   1. Self-certification at signup (state dropdown excludes blocked states;
//      separate checkbox certifies non-residency for redundancy).
//   2. IP geolocation at signup (server-side resolution, logged to
//      user_eligibility for evidence trail).
//   3. Backend re-validation on every privileged action (so a client-side
//      tampering attempt fails server-side).
//
// IMPORTANT: do not soften this list without legal sign-off. Each blocked
// jurisdiction was chosen for a specific statutory exposure (CCPA, GBL 349,
// BIPA, MHMDA). Adding back any one of them re-opens the corresponding
// liability surface.

/** US states that may NOT use the Service. ISO codes. */
export const BLOCKED_US_STATES = ['CA', 'NY', 'IL', 'WA'] as const;
export type BlockedUSState = (typeof BLOCKED_US_STATES)[number];

/** Country / region codes blocked at the geofence layer. ISO 3166-1 alpha-2. */
export const BLOCKED_COUNTRIES = [
  // EEA
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // UK + Switzerland
  'GB', 'CH',
  // OFAC comprehensive embargoes (sanctions)
  'CU', 'IR', 'KP', 'SY',
] as const;

/** Quick-check: is this US state blocked? Accepts 'CA', 'ca', 'California'. */
export function isBlockedState(input: string | null | undefined): boolean {
  if (!input) return false;
  const code = normalizeStateCode(input);
  return code != null && (BLOCKED_US_STATES as readonly string[]).includes(code);
}

/** Quick-check: is this country blocked? Accepts ISO alpha-2. */
export function isBlockedCountry(input: string | null | undefined): boolean {
  if (!input) return false;
  return (BLOCKED_COUNTRIES as readonly string[]).includes(input.toUpperCase());
}

/** Combined: returns true if signup should be refused. */
export function isBlockedJurisdiction(args: {
  countryCode?: string | null;
  stateCode?: string | null;
}): { blocked: boolean; reason: string | null } {
  if (args.countryCode && isBlockedCountry(args.countryCode)) {
    if (args.countryCode.toUpperCase() === 'GB' || args.countryCode.toUpperCase() === 'CH') {
      return { blocked: true, reason: 'international_uk_eu_switzerland' };
    }
    if (['CU', 'IR', 'KP', 'SY'].includes(args.countryCode.toUpperCase())) {
      return { blocked: true, reason: 'sanctions_embargo' };
    }
    return { blocked: true, reason: 'international_eu_eea' };
  }
  if (args.countryCode && args.countryCode.toUpperCase() !== 'US') {
    // We only serve US residents. Anything outside US is blocked even if
    // not in BLOCKED_COUNTRIES — Privacy Policy Section 12.
    return { blocked: true, reason: 'outside_us' };
  }
  if (args.stateCode && isBlockedState(args.stateCode)) {
    return { blocked: true, reason: `blocked_state_${args.stateCode.toUpperCase()}` };
  }
  return { blocked: false, reason: null };
}

/** Normalize 'California' / 'california' / 'ca' / 'CA' → 'CA'. */
export function normalizeStateCode(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const map: Record<string, string> = {
    california: 'CA', 'new york': 'NY', illinois: 'IL', washington: 'WA',
    // Allowed states — only ones where the spelling-out collision matters.
  };
  const lower = trimmed.toLowerCase();
  return map[lower] ?? null;
}

/** All US states minus the blocked four — for the signup state dropdown. */
export const ALLOWED_US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CO', name: 'Colorado' }, { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];
