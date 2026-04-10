/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {

        // ── STRUCTURAL ZONE ──────────────────────────────────────
        'surface':                   '#131313',
        'surface-dim':               '#131313',
        'surface-container-low':     '#1C1B1B',
        'surface-container':         '#201F1F',
        'surface-container-high':    '#2A2A2A',
        'surface-container-highest': '#353534',
        'surface-bright':            '#3A3939',
        'surface-variant':           '#353534',

        // ── DATA ZONE ────────────────────────────────────────────
        'clinical-cream':            '#F5F0E8',
        'clinical-white':            '#FDFAF5',
        'clinical-charcoal':         '#1A1A1A',
        'clinical-stone':            '#6B6B6B',

        // ── BRAND ────────────────────────────────────────────────
        'primary':                   '#A5D0B9',
        'primary-container':         '#1B4332',
        'primary-fixed':             '#C1ECD4',
        'primary-fixed-dim':         '#A5D0B9',
        'on-primary':                '#0E3727',
        'on-primary-container':      '#86AF99',
        'on-primary-fixed':          '#002114',
        'on-primary-fixed-variant':  '#274E3D',
        'inverse-primary':           '#3F6653',

        // ── SECONDARY — Gold/Optimal system ──────────────────────
        'secondary':                 '#EFBD8A',
        'secondary-container':       '#64421A',
        'secondary-fixed':           '#FFDCBC',
        'secondary-fixed-dim':       '#EFBD8A',
        'on-secondary':              '#472A03',
        'on-secondary-container':    '#DFAF7E',
        'on-secondary-fixed':        '#2C1700',
        'on-secondary-fixed-variant':'#614018',

        // ── TERTIARY — Teal/contextual system ────────────────────
        'tertiary':                  '#A6CFC3',
        'tertiary-container':        '#1B423A',
        'tertiary-fixed':            '#C1EBDF',
        'tertiary-fixed-dim':        '#A6CFC3',
        'on-tertiary':               '#0D372F',
        'on-tertiary-container':     '#86AEA3',
        'on-tertiary-fixed':         '#00201A',
        'on-tertiary-fixed-variant': '#274E45',

        // ── ERROR / CRITICAL ─────────────────────────────────────
        'error':                     '#FFB4AB',
        'error-container':           '#93000A',
        'on-error':                  '#690005',
        'on-error-container':        '#FFDAD6',

        // ── SURFACE TEXT ─────────────────────────────────────────
        'on-surface':                '#E5E2E1',
        'on-surface-variant':        '#C1C8C2',
        'on-background':             '#E5E2E1',

        // ── UTILITY ──────────────────────────────────────────────
        'outline':                   '#8B938D',
        'outline-variant':           '#414844',
        'inverse-surface':           '#E5E2E1',
        'inverse-on-surface':        '#313030',
        'surface-tint':              '#A5D0B9',
        'background':                '#131313',

        // ── DIRECT CLINICAL SEMANTIC ─────────────────────────────
        'critical':                  '#C94F4F',
        'warning-amber':             '#E8922A',
        'gold-optimal':              '#D4A574',

      },

      borderRadius: {
        'DEFAULT': '0.125rem',
        'sm':      '0.125rem',
        'md':      '0.25rem',
        'lg':      '0.25rem',
        'xl':      '0.5rem',
        '2xl':     '0.5rem',
        'full':    '0.75rem',
        'card':    '10px',
      },

      fontFamily: {
        'headline': ['Fraunces', 'serif'],
        'body':     ['DM Sans', 'sans-serif'],
        'label':    ['JetBrains Mono', 'monospace'],
        'serif':    ['Fraunces', 'serif'],
        'sans':     ['DM Sans', 'sans-serif'],
        'mono':     ['JetBrains Mono', 'monospace'],
      },

      fontSize: {
        'precision-xs': ['0.68rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
      },

      boxShadow: {
        'card':   '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-md':'0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06)',
        'dark':   '0 -10px 30px rgba(0,0,0,0.5)',
      },

      spacing: {
        '18': '4.5rem',
        '72': '18rem',
        '88': '22rem',
      },
    },
  },
  plugins: [],
}
