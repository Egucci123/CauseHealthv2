// src/lib/legal/consentTextTypes.ts
//
// Shared types for the legal/consent module. Kept separate so React
// components (StandaloneConsent, OutputAckGate) can import the type
// without dragging in the full ConsentText registry.

import type { ConsentType } from './consentTypes';

export interface ConsentText {
  type: ConsentType;
  text: string;
  version: string;
}
