// scripts/test-partial-upload-detector.mjs
//
// Smoke test for the partial-upload detector.
// Runs the filename heuristic against a battery of known patterns AND
// generates synthetic PDFs (one MyChart-style single-panel, one full report)
// to exercise the pdf.js text-extraction path end-to-end.
//
// Run: node scripts/test-partial-upload-detector.mjs

import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// --- inline copy of the detector internals so we can test in Node without
//     dragging the worker config from the browser module ---

const SINGLE_PANEL_FILENAME_PATTERNS = [
  /mychart.*test[_\- ]details?/i,
  /test[_\- ]details?/i,
  /single[_\- ]test/i,
  /individual[_\- ]result/i,
];

const PANEL_HEADERS = [
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

const MARKER_FRAGMENTS = [
  'glucose','sodium','potassium','chloride','co2','bicarbonate','bun','creatinine','egfr','calcium',
  'albumin','protein','bilirubin','alkaline','alt','ast','sgot','sgpt','ggt',
  'cholesterol','triglyceride','hdl','ldl','vldl','non-hdl',
  'hemoglobin','hematocrit','wbc','rbc','platelet','mcv','mch','mchc','rdw','mpv',
  'neutrophil','lymphocyte','monocyte','eosinophil','basophil',
  'tsh','t4','t3','thyroid','a1c','hba1c','fructosamine',
  'ferritin','iron','tibc','transferrin','saturation',
  'vitamin d','25-oh','25 oh','b12','cobalamin','folate','methylmalonic',
  'crp','esr','sedimentation','testosterone','shbg','estradiol','progesterone','prolactin',
  'lh','fsh','dhea','cortisol','aldosterone','renin','psa','cea','afp',
  'magnesium','phosphorus','phosphate','zinc','copper','selenium',
  'homocysteine','apolipoprotein','apob','apoa','lp(a)','lipoprotein',
  'insulin','c-peptide','glucagon','urine','urinalysis','microalbumin','creatinine clearance','cystatin',
];

function filenameSuggestsPartial(filename) {
  return SINGLE_PANEL_FILENAME_PATTERNS.some(re => re.test(filename));
}

async function detectFromPdfBytes(filename, bytes) {
  const filenameFlag = filenameSuggestsPartial(filename);
  const pdf = await pdfjsLib.getDocument({ data: bytes, useWorker: false }).promise;
  const pageCount = pdf.numPages;
  let text = '';
  for (let i = 1; i <= Math.min(pageCount, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += '\n' + content.items.map(it => it.str ?? '').join(' ');
  }
  text = text.toLowerCase();
  const detectedPanels = PANEL_HEADERS.filter(p => p.patterns.some(re => re.test(text))).map(p => p.name);
  const seen = new Set();
  for (const m of MARKER_FRAGMENTS) if (text.includes(m)) seen.add(m);
  const markerCount = seen.size;
  const reasons = [];
  if (filenameFlag) reasons.push('filename');
  if (pageCount <= 1 && markerCount < 18) reasons.push('single-page-sparse');
  if (detectedPanels.length <= 1) reasons.push('few-panels');
  if (markerCount < 15) reasons.push('low-marker-count');
  return { suspect: reasons.length > 0, reasons, detectedPanels, markerCount, pageCount, filenameFlag };
}

// --- synthetic PDF builders ---

function buildMyChartSingleTestPdf() {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('MyChart - Test Details', 10, 15);
  doc.setFontSize(10);
  doc.text('Comprehensive Metabolic Panel', 10, 30);
  doc.text('Component                Value     Range', 10, 40);
  doc.text('Glucose                  118       70-99', 10, 47);
  doc.text('Sodium                   140       136-145', 10, 54);
  doc.text('Potassium                4.2       3.5-5.1', 10, 61);
  doc.text('Chloride                 102       98-107', 10, 68);
  doc.text('CO2                      24        21-31', 10, 75);
  doc.text('BUN                      18        7-20', 10, 82);
  doc.text('Creatinine               1.1       0.7-1.3', 10, 89);
  doc.text('Calcium                  9.6       8.6-10.2', 10, 96);
  doc.text('Albumin                  4.3       3.5-5.0', 10, 103);
  doc.text('Total Protein            7.1       6.4-8.3', 10, 110);
  doc.text('Total Bilirubin          1.8       0.0-1.2', 10, 117);
  doc.text('Alkaline Phosphatase     78        44-147', 10, 124);
  doc.text('AST                      31        10-40', 10, 131);
  doc.text('ALT                      42        7-56', 10, 138);
  return new Uint8Array(doc.output('arraybuffer'));
}

function buildFullLabReportPdf() {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Quest Diagnostics - Lab Report', 10, 15);
  doc.setFontSize(11);
  doc.text('Comprehensive Metabolic Panel', 10, 30);
  doc.setFontSize(9);
  let y = 38;
  for (const line of [
    'Glucose 95   Sodium 140   Potassium 4.2   Chloride 102',
    'CO2 24   BUN 14   Creatinine 0.9   eGFR 92   Calcium 9.4',
    'Albumin 4.5   Total Protein 7.1   Bilirubin 0.6',
    'Alkaline Phosphatase 65   AST 22   ALT 24',
  ]) { doc.text(line, 10, y); y += 6; }
  doc.setFontSize(11); doc.text('Lipid Panel', 10, y + 6); y += 14; doc.setFontSize(9);
  doc.text('Total Cholesterol 185   HDL 52   LDL 110   Triglycerides 115   VLDL 23   Non-HDL 133', 10, y); y += 10;
  doc.setFontSize(11); doc.text('Complete Blood Count (CBC)', 10, y); y += 8; doc.setFontSize(9);
  doc.text('WBC 6.8   RBC 4.9   Hemoglobin 14.6   Hematocrit 43.5   Platelets 245', 10, y); y += 6;
  doc.text('MCV 88   MCH 30   MCHC 33   RDW 13   MPV 9.5   Neutrophil 58 Lymphocyte 32 Monocyte 7 Eosinophil 2 Basophil 1', 10, y); y += 10;
  doc.setFontSize(11); doc.text('Hemoglobin A1c', 10, y); y += 8; doc.setFontSize(9);
  doc.text('HbA1c 5.4', 10, y); y += 10;
  doc.setFontSize(11); doc.text('Thyroid Panel', 10, y); y += 8; doc.setFontSize(9);
  doc.text('TSH 1.8   Free T4 1.3   Free T3 3.1', 10, y); y += 10;
  doc.setFontSize(11); doc.text('Vitamin D, 25-OH', 10, y); y += 8; doc.setFontSize(9);
  doc.text('25-OH Vitamin D 32', 10, y); y += 10;
  doc.setFontSize(11); doc.text('Ferritin / Iron Panel', 10, y); y += 8; doc.setFontSize(9);
  doc.text('Ferritin 110   Iron 85   TIBC 310   Transferrin Saturation 27', 10, y);
  doc.addPage();
  doc.setFontSize(11); doc.text('Inflammation', 10, 20); doc.setFontSize(9);
  doc.text('CRP 0.9   ESR 8', 10, 28);
  return new Uint8Array(doc.output('arraybuffer'));
}

// --- run tests ---

const filenameCases = [
  { name: 'MyChart_-_Test_Details.pdf',           expect: true  },
  { name: '1778643653845_c3zxolqn_MyChart_-_Test_Details.pdf', expect: true },
  { name: 'test-details-2024.pdf',                expect: true  },
  { name: 'Single_Test_Result.pdf',               expect: true  },
  { name: 'Quest_Lab_Report_2026.pdf',            expect: false },
  { name: 'LabCorp_Results_Full.pdf',             expect: false },
  { name: 'annual_bloodwork.pdf',                 expect: false },
];

let passes = 0, fails = 0;
const log = (ok, label, extra='') => {
  if (ok) { passes++; console.log(`  ✓ ${label}${extra ? ' — ' + extra : ''}`); }
  else { fails++; console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
};

console.log('\n[1] Filename heuristic');
for (const c of filenameCases) {
  const got = filenameSuggestsPartial(c.name);
  log(got === c.expect, `${c.name} → ${got}`, `expected ${c.expect}`);
}

console.log('\n[2] Synthetic MyChart single-panel PDF (Tim-shaped)');
const singleBytes = buildMyChartSingleTestPdf();
const singleResult = await detectFromPdfBytes('MyChart_-_Test_Details.pdf', singleBytes);
log(singleResult.suspect === true, `should be flagged as suspect`, JSON.stringify(singleResult));
log(singleResult.filenameFlag === true, `filename should trigger`);
// CMP + Liver overlap on ALT/AST/AlkPhos, so a CMP-only PDF legitimately fingerprints as 2 panels.
// What matters is it's far below the ≥4 a full annual report shows.
log(singleResult.detectedPanels.length < 4, `should detect <4 panels`, `got [${singleResult.detectedPanels.join(',')}]`);

console.log('\n[3] Synthetic full lab report PDF (clean upload)');
const fullBytes = buildFullLabReportPdf();
const fullResult = await detectFromPdfBytes('Quest_Lab_Report_2026.pdf', fullBytes);
log(fullResult.suspect === false, `should NOT be flagged`, JSON.stringify(fullResult));
log(fullResult.detectedPanels.length >= 3, `should detect ≥3 panels`, `got [${fullResult.detectedPanels.join(',')}]`);
log(fullResult.markerCount >= 20, `should count ≥20 markers`, `got ${fullResult.markerCount}`);

console.log(`\nResult: ${passes} passed, ${fails} failed\n`);
process.exit(fails === 0 ? 0 : 1);
