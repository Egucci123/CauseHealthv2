// src/lib/researchDigest.ts
// Curated quarterly research updates. Each entry is appended over time —
// the freshest one renders on the Dashboard. Goal: keep optimizers
// engaged between draws by surfacing what's new and clinically relevant.
//
// To publish a new digest: add an entry with publishedAt set to the
// release date. The component picks the latest by date.

export interface DigestEntry {
  publishedAt: string; // YYYY-MM-DD
  title: string;
  /** One-sentence headline (the "so what") */
  takeaway: string;
  /** 2-3 bullet items — what's new, what to do */
  bullets: string[];
  /** Optional source link */
  source?: { name: string; url?: string };
  /** Tag for filtering: cardiovascular, metabolic, sleep, supplements, longevity, etc. */
  tags: string[];
}

export const RESEARCH_DIGEST: DigestEntry[] = [
  {
    publishedAt: '2026-04-01',
    title: 'ApoB is officially the cardiology gold-standard',
    takeaway: 'Major cardiology bodies now formally recommend ApoB over LDL as the primary lipid risk marker.',
    bullets: [
      'AHA + ESC 2025 guideline updates moved ApoB from "advanced testing" to "preferred first-line" for adults with any CV risk factor.',
      'Functional target: ApoB <80 mg/dL for general population, <60 for established CV disease or family history.',
      'Action: ask your doctor for ApoB on your next draw. Many plans cover under E78.5 (hyperlipidemia) or Z82.49 (family hx of ischemic heart disease).',
    ],
    source: { name: 'AHA / ESC 2025 Lipid Guidelines' },
    tags: ['cardiovascular', 'longevity'],
  },
  {
    publishedAt: '2026-02-15',
    title: 'Creatine for cognition: the meta-analysis',
    takeaway: 'A 2026 meta-analysis (n=2400) confirms 5g daily creatine measurably improves working memory + processing speed in healthy adults.',
    bullets: [
      'Effect size larger in people who eat little red meat (vegetarians/vegans) but real even in omnivores.',
      'No loading needed. 5g monohydrate daily, any time, indefinitely. Cheap and well-studied.',
      'Already in your supplement stack if your primary goal is longevity, energy, or performance.',
    ],
    source: { name: 'Nutrients 2026 meta-analysis' },
    tags: ['supplements', 'cognition', 'longevity'],
  },
  {
    publishedAt: '2026-01-10',
    title: 'Sleep variability matters more than total hours',
    takeaway: 'Going to bed at irregular times (>90 min variation) raises CV risk independent of how long you sleep.',
    bullets: [
      'Mortality + cardiac event data from 88K UK Biobank participants.',
      'Action: pick a wake time and hold it within 30 minutes — including weekends.',
      'Variability is the lever, not duration. 7 hours every night beats 9-and-5 alternating.',
    ],
    source: { name: 'JAMA 2026' },
    tags: ['sleep', 'cardiovascular'],
  },
];

/** Get the most recent digest entry. */
export function latestDigest(): DigestEntry | null {
  if (RESEARCH_DIGEST.length === 0) return null;
  return [...RESEARCH_DIGEST].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
}
