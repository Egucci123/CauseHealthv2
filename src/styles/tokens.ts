// src/styles/tokens.ts
// Single source of truth for all design values
// Import this wherever you need design values in TypeScript

export const colors = {
  // Structural zone
  surface:                 '#131313',
  surfaceContainerLow:     '#1C1B1B',
  surfaceContainer:        '#201F1F',
  surfaceContainerHigh:    '#2A2A2A',
  surfaceContainerHighest: '#353534',
  surfaceBright:           '#3A3939',

  // Data zone
  clinicalCream:           '#F5F0E8',
  clinicalWhite:           '#FDFAF5',
  clinicalCharcoal:        '#1A1A1A',
  clinicalStone:           '#6B6B6B',

  // Brand
  forest:                  '#1B4332',
  forestLight:             '#2D6A4F',
  primaryLight:            '#A5D0B9',

  // Semantic
  critical:                '#C94F4F',
  warningAmber:            '#E8922A',
  goldOptimal:             '#D4A574',
  tealContextual:          '#1B423A',

  // Gold system
  goldBg:                  '#64421A',
  goldText:                '#EFBD8A',
  amberBg:                 '#614018',
  amberText:               '#FFDCBC',

  // Text on dark
  onSurface:               '#E5E2E1',
  onSurfaceVariant:        '#C1C8C2',

  // Borders
  outlineVariant:          '#414844',
  outline:                 '#8B938D',
} as const;

export const fonts = {
  headline: "'Fraunces', serif",
  body:     "'DM Sans', sans-serif",
  label:    "'JetBrains Mono', monospace",
} as const;

export const radius = {
  default: '0.125rem',   // 2px — badges, sharp elements
  card:    '10px',       // cards throughout app
  button:  '6px',        // buttons
  input:   '4px',        // inputs
  pill:    '9999px',     // never used for buttons, only toggle switches
} as const;

export const spacing = {
  sidebarWidth: '18rem',   // 288px — w-72
  pagePadding:  '2rem',    // 32px — p-8
  cardPadding:  '2rem',    // 32px — p-8 primary cards
  panelPadding: '1.5rem',  // 24px — p-6 side panels
  sectionGap:   '3rem',    // 48px — space-y-12
  gridGap:      '2rem',    // 32px — gap-8
} as const;

// Status → color mapping
export const statusColors = {
  urgent: {
    border:  'border-[#C94F4F]',
    topBorder: 'border-t-[3px] border-[#C94F4F]',
    leftBorder: 'border-l-4 border-[#C94F4F]',
    bg:      'bg-[#C94F4F]',
    text:    'text-white',
    badgeBg: 'bg-[#C94F4F]',
    badgeText: 'text-white',
    label:   'URGENT',
  },
  monitor: {
    border:  'border-[#E8922A]',
    topBorder: 'border-t-[3px] border-[#E8922A]',
    leftBorder: 'border-l-4 border-[#E8922A]',
    bg:      'bg-[#614018]',
    text:    'text-[#FFDCBC]',
    badgeBg: 'bg-[#614018]',
    badgeText: 'text-[#FFDCBC]',
    label:   'MONITOR',
  },
  optimal: {
    border:  'border-[#D4A574]',
    topBorder: 'border-t-[3px] border-[#D4A574]',
    leftBorder: 'border-l-4 border-[#D4A574]',
    bg:      'bg-[#64421A]',
    text:    'text-[#EFBD8A]',
    badgeBg: 'bg-[#64421A]',
    badgeText: 'text-[#EFBD8A]',
    label:   'OPTIMAL',
  },
  brand: {
    border:  'border-primary-container',
    topBorder: 'border-t-[3px] border-primary-container',
    leftBorder: 'border-l-4 border-primary-container',
    bg:      'bg-primary-container',
    text:    'text-white',
    badgeBg: 'bg-primary-container',
    badgeText: 'text-white',
    label:   'INFO',
  },
} as const;

export type StatusType = keyof typeof statusColors;
