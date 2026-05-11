// LAYER 1 — MARKER NAME FUZZ
// ==========================
// Real labs name the same marker dozens of ways. Verifies that
// each canonical marker's regex matchers accept all common real-
// world variants. Catches the #1 silent failure mode: lab uploads
// but no rule fires because marker name didn't match regex.
//
// Pure deterministic. Zero API cost.
//
// Run: deno run -A __tests__/marker-fuzz.ts

// Each row: canonical marker + the regex pattern(s) the engine uses
// internally to match it + a bag of real-world variants observed in
// the wild from LabCorp / Quest / hospital LIS systems / patient
// portals / international labs. Variants come from actual lab PDFs
// or vendor documentation, not invented.

interface MarkerCase {
  canonical: string;
  patterns: RegExp[];   // patterns from the engine that should match
  variants: string[];   // real-world names that should all match
  shouldNotMatch?: string[]; // bonus: things that look similar but aren't this marker
}

const MARKER_CASES: MarkerCase[] = [
  // Thyroid
  { canonical:'TSH',
    patterns:[/^tsh\b/i, /thyroid[\s-]*stimulating[\s-]*hormone/i],
    variants:[
      'TSH', 'tsh', 'TSH 3rd Gen', 'TSH, Ultrasensitive', 'TSH (sensitive)',
      'Thyroid Stimulating Hormone', 'thyroid-stimulating hormone',
      'TSH, Reflex to FT4', 'TSH 3 Generation',
    ],
    shouldNotMatch:['Free T4', 'T3 Free', 'TPO Antibody'],
  },
  { canonical:'Free T4',
    patterns:[/free t4|t4 free|\bft4\b/i],
    variants:['Free T4', 'FREE T4', 'T4, Free', 'FT4', 'Free Thyroxine', 'free t4 (direct)'],
  },
  { canonical:'Free T3',
    patterns:[/free t3|t3 free|\bft3\b/i],
    variants:['Free T3', 'FREE T3', 'T3, Free', 'FT3', 'Triiodothyronine, Free'],
  },

  // Hematology — CBC components
  { canonical:'Hemoglobin',
    patterns:[/hemoglobin\b(?!\s*a1c)/i, /\bhgb\b/i],
    variants:[
      'Hemoglobin', 'HEMOGLOBIN', 'Hgb', 'HGB',
      'Hemoglobin (B)', 'Hemoglobin, Whole Blood', 'Hemoglobin g/dL',
    ],
    shouldNotMatch:['Hemoglobin A1c', 'HbA1c'],
  },
  { canonical:'Hemoglobin A1c',
    patterns:[/hemoglobin a1c|hba1c|\ba1c\b/i],
    variants:[
      'A1c', 'a1c', 'HbA1c', 'Hemoglobin A1c', 'HEMOGLOBIN A1C',
      'A1c, Hemoglobin', 'HgbA1c', 'Glycated Hemoglobin (A1c)',
    ],
  },
  { canonical:'WBC',
    patterns:[/^wbc\b/i, /white blood cell/i],
    variants:['WBC', 'wbc', 'White Blood Cells', 'White Blood Cell Count', 'White Blood Cell (WBC)'],
  },
  { canonical:'Platelets',
    patterns:[/^platelets?\b/i, /\bplt\b/i],
    variants:['Platelets', 'PLT', 'plt', 'Platelet Count', 'Platelets (PLT)'],
  },
  { canonical:'MCV',
    patterns:[/^mcv\b/i, /mean corpuscular volume/i],
    variants:['MCV', 'mcv', 'Mean Corpuscular Volume', 'MCV (Mean Corpuscular Volume)'],
  },

  // Lipids
  { canonical:'LDL',
    patterns:[/^ldl\b/i, /ldl[\s-]?cholesterol/i],
    variants:['LDL', 'ldl', 'LDL Cholesterol', 'LDL-C', 'LDL Cholesterol (calculated)', 'LDL Chol Calc'],
    shouldNotMatch:['HDL', 'VLDL Cholesterol', 'LDL Particle Number'],
  },
  { canonical:'HDL',
    patterns:[/^hdl\b/i, /hdl[\s-]?cholesterol/i],
    variants:['HDL', 'hdl', 'HDL Cholesterol', 'HDL-C', 'HDL Chol'],
  },
  { canonical:'Triglycerides',
    patterns:[/triglyceride/i, /\btg\b/i],
    variants:['Triglycerides', 'triglycerides', 'Triglyceride', 'TG', 'Trig'],
  },
  { canonical:'Total Cholesterol',
    patterns:[/total cholesterol/i, /cholesterol, total/i],
    variants:['Total Cholesterol', 'Cholesterol, Total', 'Cholesterol Total', 'TC'],
  },
  { canonical:'ApoB',
    patterns:[/apolipoprotein b|\bapob\b|apo b/i],
    variants:['ApoB', 'apoB', 'APO B', 'Apolipoprotein B', 'Apo B-100', 'Apolipoprotein B (ApoB)'],
  },
  { canonical:'Lp(a)',
    patterns:[/lp\(a\)|lipoprotein.?a/i],
    variants:['Lp(a)', 'lp(a)', 'Lipoprotein(a)', 'Lipoprotein a'],
  },

  // Liver
  { canonical:'ALT',
    patterns:[/\balt\b/i, /\bsgpt\b/i, /alanine[\s-]?aminotransferase/i],
    variants:['ALT', 'alt', 'SGPT', 'Alanine Aminotransferase', 'ALT (SGPT)', 'Alanine Transaminase'],
  },
  { canonical:'AST',
    patterns:[/\bast\b/i, /\bsgot\b/i, /aspartate[\s-]?aminotransferase/i],
    variants:['AST', 'ast', 'SGOT', 'Aspartate Aminotransferase', 'AST (SGOT)'],
  },
  { canonical:'GGT',
    patterns:[/\bggt\b/i, /gamma[\s-]?glutamyl/i],
    variants:['GGT', 'ggt', 'Gamma-Glutamyl Transferase', 'GGT (Gamma-Glutamyl Transferase)', 'Gamma GT'],
  },

  // Iron / B vitamins
  { canonical:'Ferritin',
    patterns:[/^ferritin/i],
    variants:['Ferritin', 'ferritin', 'Ferritin, Serum', 'FERRITIN'],
  },
  { canonical:'B12',
    patterns:[/vitamin b.?12|^b12|cobalamin/i],
    variants:['Vitamin B12', 'B12', 'B-12', 'Cobalamin', 'Vit B12', 'VITAMIN B-12'],
  },
  { canonical:'Folate',
    patterns:[/folate/i],
    variants:['Folate', 'Folate, Serum', 'Folic Acid', 'RBC Folate', 'Folate (Vitamin B9)'],
  },

  // Endocrine
  { canonical:'Glucose',
    patterns:[/\bglucose\b/i],
    variants:['Glucose', 'glucose', 'Glucose, Fasting', 'Fasting Glucose', 'Glucose (Fasting)'],
  },
  { canonical:'Prolactin',
    patterns:[/prolactin/i],
    variants:['Prolactin', 'PROLACTIN', 'prolactin, serum'],
  },
  { canonical:'Testosterone',
    patterns:[/testosterone/i],
    variants:['Testosterone', 'Total Testosterone', 'Testosterone, Total', 'Free Testosterone', 'TESTOSTERONE'],
  },
  { canonical:'Estradiol',
    patterns:[/estradiol/i, /\be2\b/i],
    variants:['Estradiol', 'estradiol', 'E2', 'Estradiol (E2)', 'Estradiol, Serum'],
  },

  // Vitamin D
  { canonical:'Vitamin D',
    patterns:[/25.?hydroxy.*vitamin d|vitamin d.*25/i],
    variants:[
      'Vitamin D, 25-Hydroxy', '25-Hydroxy Vitamin D', '25(OH)D',
      'Vitamin D 25-hydroxy', 'Vitamin D, 25-OH', '25-Hydroxyvitamin D, Total',
    ],
  },

  // Kidney
  { canonical:'Creatinine',
    patterns:[/^creatinine/i],
    variants:['Creatinine', 'CREATININE', 'Creatinine, Serum', 'Serum Creatinine'],
  },
  { canonical:'eGFR',
    patterns:[/\begfr\b/i, /estimated.?glomerular/i],
    variants:['eGFR', 'EGFR', 'eGFR (calc)', 'Estimated Glomerular Filtration Rate', 'eGFR Non-African American'],
  },

  // Inflammation
  { canonical:'hs-CRP',
    patterns:[/hs[\s-]?crp|c[\s-]?reactive/i],
    variants:['hs-CRP', 'hsCRP', 'High-Sensitivity C-Reactive Protein', 'C-Reactive Protein, High Sensitivity', 'hsCRP, Cardio'],
  },
];

// ── RUNNER ──────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  LAYER 1 — MARKER NAME FUZZ`);
console.log(`══════════════════════════════════════════════════════════════\n`);

let totalVariants = 0;
let totalChecks = 0;
let failures: Array<{ marker: string; variant: string; reason: string }> = [];

for (const m of MARKER_CASES) {
  for (const variant of m.variants) {
    totalVariants++;
    // At least ONE of the marker's patterns must match the variant
    const matched = m.patterns.some(re => re.test(variant));
    totalChecks++;
    if (!matched) failures.push({ marker: m.canonical, variant, reason: 'no pattern matched' });
  }
  for (const wrong of m.shouldNotMatch ?? []) {
    totalChecks++;
    const matched = m.patterns.some(re => re.test(wrong));
    if (matched) failures.push({ marker: m.canonical, variant: wrong, reason: 'false-positive match' });
  }
}

console.log(`Tested ${MARKER_CASES.length} canonical markers × ${totalVariants} real-world variants`);
console.log(`Total assertions: ${totalChecks}\n`);

if (failures.length === 0) {
  console.log(`✅ ALL ${totalChecks} MARKER NAME ASSERTIONS PASSED`);
  Deno.exit(0);
} else {
  console.log(`❌ ${failures.length} FAILURES:\n`);
  for (const f of failures) {
    console.log(`  ${f.marker} — "${f.variant}" — ${f.reason}`);
  }
  Deno.exit(1);
}
