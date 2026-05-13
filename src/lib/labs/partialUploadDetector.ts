// src/lib/labs/partialUploadDetector.ts
//
// Pre-upload heuristic: detect when a user is about to upload a single-panel
// lab PDF (e.g. MyChart "Test Details") instead of their full lab report.
//
// We saw a real user upload only CMP + Total Bilirubin (16 markers) when their
// full draw almost certainly had Lipid + A1c + CBC + Thyroid too — they exported
// MyChart's single Test Details page instead of the full results PDF.
//
// This module returns a soft signal; the UI nudges, it does not block.

import * as pdfjsLib from 'pdfjs-dist';

// Use a CDN worker so we don't need to ship the worker in our bundle.
// (Same major version pin as the dist package in package.json.)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export type PartialSignal = {
  suspect: boolean;
  reason: string;          // user-facing short reason, e.g. "Looks like a single test panel"
  diagnostics: string;     // technical, surfaced only in dev/log
  detectedPanels: string[];
  markerCount: number;
  pageCount: number;
};

// Filename signatures that almost-always mean single-panel exports.
const SINGLE_PANEL_FILENAME_PATTERNS: RegExp[] = [
  /mychart.*test[_\- ]details?/i,    // MyChart "Test Details" page export
  /test[_\- ]details?/i,             // generic Test Details
  /single[_\- ]test/i,
  /individual[_\- ]result/i,
];

// Major panel headers — finding ≥2 of these signals a real multi-panel report.
const PANEL_HEADERS: Array<{ name: string; patterns: RegExp[] }> = [
  { name: 'CMP',     patterns: [/comprehensive metabolic/i, /\bCMP\b/, /basic metabolic/i, /\bBMP\b/] },
  { name: 'CBC',     patterns: [/\bCBC\b/, /complete blood count/i, /hemogram/i] },
  { name: 'Lipid',   patterns: [/lipid panel/i, /lipid profile/i, /cholesterol panel/i] },
  { name: 'A1c',     patterns: [/hemoglobin a1c/i, /\bHbA1c\b/i, /\bA1C\b/, /glycated hemoglobin/i] },
  { name: 'Thyroid', patterns: [/thyroid panel/i, /\bTSH\b/, /thyroid stimulating/i, /free T4/i, /free T3/i] },
  { name: 'Iron',    patterns: [/iron panel/i, /ferritin/i, /\bTIBC\b/i, /transferrin/i] },
  { name: 'Vit D',   patterns: [/vitamin d.*25.?oh/i, /25.?hydroxy.*vitamin d/i, /25.?OH.?vit/i] },
  { name: 'B12',     patterns: [/vitamin b.?12/i, /cobalamin/i] },
  { name: 'Inflam',  patterns: [/\bCRP\b/, /c.?reactive protein/i, /\bESR\b/, /sedimentation rate/i] },
  { name: 'Liver',   patterns: [/hepatic function/i, /liver panel/i, /\bALT\b/, /\bAST\b/, /alkaline phosphatase/i] },
];

// Marker name fragments — used purely to estimate how many distinct analytes
// the PDF reports. Not exhaustive; we just need a count signal.
const MARKER_FRAGMENTS: string[] = [
  'glucose', 'sodium', 'potassium', 'chloride', 'co2', 'bicarbonate', 'bun',
  'creatinine', 'egfr', 'calcium', 'albumin', 'protein', 'bilirubin', 'alkaline',
  'alt', 'ast', 'sgot', 'sgpt', 'ggt',
  'cholesterol', 'triglyceride', 'hdl', 'ldl', 'vldl', 'non-hdl',
  'hemoglobin', 'hematocrit', 'wbc', 'rbc', 'platelet', 'mcv', 'mch', 'mchc',
  'rdw', 'mpv', 'neutrophil', 'lymphocyte', 'monocyte', 'eosinophil', 'basophil',
  'tsh', 't4', 't3', 'thyroid',
  'a1c', 'hba1c', 'fructosamine',
  'ferritin', 'iron', 'tibc', 'transferrin', 'saturation',
  'vitamin d', '25-oh', '25 oh',
  'b12', 'cobalamin', 'folate', 'methylmalonic',
  'crp', 'esr', 'sedimentation',
  'testosterone', 'shbg', 'estradiol', 'progesterone', 'prolactin', 'lh', 'fsh', 'dhea',
  'cortisol', 'aldosterone', 'renin',
  'psa', 'cea', 'afp',
  'magnesium', 'phosphorus', 'phosphate', 'zinc', 'copper', 'selenium',
  'homocysteine', 'apolipoprotein', 'apob', 'apoa', 'lp(a)', 'lipoprotein',
  'insulin', 'c-peptide', 'glucagon',
  'urine', 'urinalysis', 'microalbumin', 'creatinine clearance', 'cystatin',
];

/** Fast: filename-only pre-check. Use this to short-circuit before downloading bytes. */
export function filenameSuggestsPartial(filename: string): boolean {
  return SINGLE_PANEL_FILENAME_PATTERNS.some(re => re.test(filename));
}

/** Full check — pulls text out of the PDF and scores it. */
export async function detectPartialUpload(file: File): Promise<PartialSignal> {
  const filename = file.name || '';
  const filenameFlag = filenameSuggestsPartial(filename);

  // Only PDFs are worth scanning (photos go through OCR server-side).
  if (file.type !== 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
    return {
      suspect: false, reason: '', diagnostics: 'not-pdf',
      detectedPanels: [], markerCount: 0, pageCount: 0,
    };
  }

  let text = '';
  let pageCount = 0;
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    pageCount = pdf.numPages;
    // Cap at 10 pages — full reports rarely exceed that and we want this fast.
    const maxPages = Math.min(pageCount, 10);
    const pageTexts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((it: any) => it.str ?? '').join(' '));
    }
    text = pageTexts.join('\n').toLowerCase();
  } catch (err) {
    // If we can't parse it, don't block — just let the server handle it.
    return {
      suspect: false, reason: '', diagnostics: `parse-fail: ${String(err).slice(0, 80)}`,
      detectedPanels: [], markerCount: 0, pageCount,
    };
  }

  // Count distinct panel headers
  const detectedPanels = PANEL_HEADERS
    .filter(p => p.patterns.some(re => re.test(text)))
    .map(p => p.name);

  // Count distinct markers
  const seen = new Set<string>();
  for (const m of MARKER_FRAGMENTS) if (text.includes(m)) seen.add(m);
  const markerCount = seen.size;

  // Scoring — any one of these is enough to nudge the user.
  // Tuned so a real CMP + CBC + Lipid + A1c export (typical full annual) passes cleanly:
  //   ≥3 panels and ≥20 markers across multiple pages.
  const reasons: string[] = [];
  if (filenameFlag) reasons.push('Filename looks like a single-panel export (e.g. MyChart Test Details)');
  if (pageCount <= 1 && markerCount < 18) reasons.push('Only 1 page detected');
  if (detectedPanels.length <= 1) reasons.push(`Only ${detectedPanels.length || 'one'} test panel detected`);
  if (markerCount < 15) reasons.push(`Only ${markerCount} markers detected — full draws usually have 30+`);

  const suspect = reasons.length > 0;

  return {
    suspect,
    reason: suspect
      ? (filenameFlag
          ? 'This looks like a single test panel, not your full lab report'
          : `We only see ${detectedPanels.length || 'one'} test panel${detectedPanels.length === 1 ? '' : 's'} and ${markerCount} markers in this PDF`)
      : '',
    diagnostics: `panels=[${detectedPanels.join(',')}] markers=${markerCount} pages=${pageCount} filenameFlag=${filenameFlag}`,
    detectedPanels,
    markerCount,
    pageCount,
  };
}
