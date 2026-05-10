// supabase/functions/_shared/rules/testCatchesRegistry.ts
//
// "WHAT THIS TEST CATCHES" REGISTRY
// =================================
// Every confirmatory test on a condition card gets a one-line "what
// it actually reveals" explanation. Same wording on every surface.
// Universal across users — same test → same explanation.
//
// To add a new test: append the regex + description below. Patient sees
// the explanation under the test name on the Possible Conditions card.

export interface TestCatches {
  /** Pattern that matches the confirmatory test string (case-insensitive). */
  pattern: RegExp;
  /** What the test catches — one sentence in plain English. */
  catches: string;
}

const REGISTRY: TestCatches[] = [
  // ── Liver / hepatic ─────────────────────────────────────────────────
  { pattern: /liver ultrasound|hepatic ultrasound/i, catches: 'Imaging that detects fatty infiltration (steatosis) — non-invasive, ~$200, covered with abnormal LFTs.' },
  { pattern: /fibroscan|transient elastography/i, catches: 'Quantifies liver stiffness (fibrosis stage) and fat content (CAP score) — distinguishes simple fatty liver from progressing fibrosis.' },
  { pattern: /\bggt\b|gamma[\s-]?glutamyl/i, catches: 'Sensitive liver/biliary marker — clarifies if elevated ALT/AST is hepatocellular vs cholestatic.' },
  { pattern: /alt|sgpt/i, catches: 'Liver-cell injury marker — primary screen for hepatic stress.' },
  { pattern: /ast|sgot/i, catches: 'Liver-cell injury marker — AST/ALT ratio differentiates causes (alcohol, NAFLD, etc.).' },

  // ── Metabolic / insulin / dyslipidemia ──────────────────────────────
  { pattern: /fasting insulin|homa[\s-]?ir/i, catches: 'Catches hyperinsulinemia BEFORE A1c crosses the diabetic range — pancreas is overworking to keep glucose normal. HOMA-IR >2.5 = insulin resistance.' },
  { pattern: /\bapob\b|apolipoprotein b/i, catches: 'Counts the actual plaque-forming particles — more predictive of heart attack risk than LDL alone, especially on a statin.' },
  { pattern: /\blp\(a\)|lipoprotein.?a/i, catches: 'Once-in-a-lifetime genetic CV risk marker — independent of diet, lifestyle, statins; affects 20% of people.' },
  { pattern: /coronary artery calcium|\bcac\b/i, catches: 'CT scan that quantifies actual arterial plaque buildup — score of 0 = essentially no heart disease; >100 = aggressive prevention.' },
  { pattern: /hs[\s-]?crp|c[\s-]?reactive/i, catches: 'Systemic inflammation marker — independently raises 10-yr CV risk and predicts response to statins/lifestyle.' },
  { pattern: /a1c|hba1c|hemoglobin a1c/i, catches: '3-month average blood sugar — tracks glycemic control. Watch tier ≥5.4%; prediabetic 5.7–6.4%; diabetic ≥6.5%.' },
  { pattern: /lipid panel|cholesterol panel/i, catches: 'Standard cardiovascular risk panel — TC, LDL, HDL, triglycerides, VLDL.' },
  { pattern: /uric acid/i, catches: 'Metabolic syndrome amplifier — high levels predict gout, hypertension, kidney stones, and CV risk.' },

  // ── Hematology / hydration ──────────────────────────────────────────
  { pattern: /hydration trial/i, catches: 'Diagnostic test masquerading as a treatment — if blood counts normalize after 2 weeks of 3L/day water + electrolytes, it was hemoconcentration not erythrocytosis.' },
  { pattern: /repeat cbc|cbc.*after trial|cbc \+ albumin/i, catches: 'Confirms hemoconcentration resolved — RBC, Hct, Hgb should drop into normal range with adequate plasma volume.' },
  { pattern: /urine specific gravity/i, catches: 'Direct measure of urine concentration — >1.025 confirms dehydration; pairs with the hydration trial as the cheapest possible workup.' },
  { pattern: /\bcbc\b|complete blood count/i, catches: 'Red cells, white cells, platelets, plus indices that flag iron deficiency, B12 deficiency, infection, or marrow issues.' },
  { pattern: /reticulocyte/i, catches: 'Young-red-cell count — distinguishes active overproduction (high retic) from passive elevation (low/normal retic = hemoconcentration).' },
  { pattern: /\bepo\b|erythropoietin/i, catches: 'The hormone that drives red-cell production — high in nocturnal hypoxemia (sleep apnea); low in primary polycythemia vera.' },
  { pattern: /jak2/i, catches: 'Genetic test for primary polycythemia vera — only ordered if other markers (low EPO, high Hgb >18.5) point that way.' },

  // ── Sleep / OSA ─────────────────────────────────────────────────────
  { pattern: /stop[\s-]?bang/i, catches: '8-question screening tool — score ≥3 has 90% sensitivity for moderate-severe sleep apnea. Free, takes 1 minute.' },
  { pattern: /home sleep study|hsat|polysomnography|sleep apnea screening|sleep study/i, catches: 'Records overnight breathing, oxygen saturation, and movements — confirms or rules out OSA. Covered with positive STOP-BANG; ~$200-500 at-home.' },
  { pattern: /overnight pulse oximetry|nocturnal pulse ox/i, catches: 'Tracks blood oxygen overnight — repeated drops below 90% support OSA diagnosis. Cheaper than a full sleep study.' },

  // ── Thyroid ─────────────────────────────────────────────────────────
  { pattern: /tpo antibod|thyroid peroxidase/i, catches: 'Confirms autoimmune Hashimoto\'s — present in 95% of cases. Positive even before TSH crosses the abnormal range.' },
  { pattern: /thyroglobulin antibod|tg.?ab/i, catches: 'Pairs with TPO — second autoimmune thyroid antibody. Catches a subset of Hashimoto\'s cases TPO misses.' },
  { pattern: /reverse t3|rt3/i, catches: 'Inactive thyroid metabolite — high values point to impaired T4→T3 conversion (stress, illness, low calorie state).' },
  { pattern: /free t3|t3 free/i, catches: 'Active thyroid hormone — most clinically meaningful. Low Free T3 explains symptoms even when TSH is normal.' },
  { pattern: /free t4|t4 free/i, catches: 'Pre-conversion thyroid hormone — low value suggests pituitary issue or central hypothyroidism.' },
  { pattern: /thyroid panel|tsh.*free t/i, catches: 'Comprehensive thyroid function — TSH alone misses central hypothyroidism and impaired conversion.' },

  // ── Gut / IBD ───────────────────────────────────────────────────────
  { pattern: /fecal calprotectin/i, catches: 'IBD disease-activity marker — elevated value means active inflammation, even before symptoms return.' },
  { pattern: /celiac|tt?g[\s-]?iga|total iga/i, catches: 'Celiac antibody screen — positive tTG-IgA + low total IgA rules in/out gluten enteropathy.' },

  // ── Kidney ──────────────────────────────────────────────────────────
  { pattern: /uacr|microalbumin/i, catches: 'Earliest sign of diabetic / hypertensive kidney damage — catches it before creatinine rises.' },
  { pattern: /cystatin c/i, catches: 'eGFR alternative that\'s more accurate in muscular or low-muscle patients (creatinine misleads in both directions).' },

  // ── Hormones ────────────────────────────────────────────────────────
  { pattern: /testosterone panel|total t.*free t.*shbg|testosterone.*total.*free/i, catches: 'Comprehensive male hormonal baseline — Total + Free + Bioavailable + SHBG + Estradiol + LH + FSH paint the full picture.' },
  { pattern: /total testosterone|^testosterone$/i, catches: 'Standard male hormonal screen — first check; if low or low-normal, expand to free + SHBG + LH/FSH.' },
  { pattern: /free testosterone/i, catches: 'Active hormone unbound to SHBG — what your tissues actually use. Low Free T explains symptoms even with normal Total T.' },
  { pattern: /\bshbg\b|sex[\s-]?hormone[\s-]?binding/i, catches: 'Carrier protein — high SHBG locks up testosterone (lowers Free T); low SHBG suggests insulin resistance.' },
  { pattern: /estradiol/i, catches: 'Important for males too — high E2 (often from belly fat aromatizing T) drives breast tissue, mood swings, low libido.' },
  { pattern: /\blh\b|luteinizing hormone/i, catches: 'Pituitary signal to testes — distinguishes testicular failure (high LH) from pituitary issue (low LH).' },
  { pattern: /\bfsh\b|follicle.?stimulating/i, catches: 'Pairs with LH — confirms primary vs secondary cause of low testosterone or amenorrhea.' },
  { pattern: /dhea[\s-]?s|dehydroepiandrosterone/i, catches: 'Adrenal androgen — low DHEA-S in chronic stress / HPA-axis dysfunction; high in PCOS.' },
  { pattern: /am cortisol|morning cortisol/i, catches: 'Adrenal output — abnormal AM cortisol screens for HPA-axis issues, Addison\'s, Cushing\'s.' },
  { pattern: /prolactin/i, catches: 'Pituitary hormone — high levels disrupt fertility, libido, menstrual cycles; rules out pituitary adenoma.' },

  // ── Vitamins / nutrients ────────────────────────────────────────────
  { pattern: /vitamin d|25.?hydroxy/i, catches: 'Functional D status — drives mood, immunity, bone, autoimmunity. Optimal 40-60 ng/mL.' },
  { pattern: /b12.*workup|b12.*mma|methylmalonic.*homocysteine/i, catches: 'Tissue B12 status — MMA + homocysteine catch functional deficiency that serum B12 alone misses.' },
  { pattern: /vitamin b12|cobalamin|^b12/i, catches: 'Direct B12 level — borderline values need MMA confirmation; depleted by metformin / PPIs / chronic GI issues.' },
  { pattern: /folate workup|serum.*rbc folate|rbc folate/i, catches: 'Tissue folate status — RBC folate reflects 3-month stores (gold standard). Catches mesalamine / methotrexate depletion.' },
  { pattern: /\bmma\b|methylmalonic/i, catches: 'Confirms B12 functional deficiency at the cellular level when serum B12 is borderline.' },
  { pattern: /homocysteine/i, catches: 'Methylation marker — elevated value = functional B12 / folate / B6 deficiency, plus independent CV risk factor.' },
  { pattern: /iron panel|^iron\b|tibc|transferrin sat/i, catches: 'Iron stores + transport — fatigue, hair loss, restless legs all show up here BEFORE hemoglobin drops.' },
  { pattern: /ferritin/i, catches: 'Iron storage protein — low ferritin = depleted reserves; <50 drives hair shedding; <30 = clinically iron-deficient.' },
  { pattern: /rbc magnesium|red.?cell magnesium/i, catches: 'Intracellular Mg — far more sensitive than serum Mg (which only reflects 1% of body stores).' },

  // ── Lipid sub-tests ─────────────────────────────────────────────────
  { pattern: /particle size|nmr|small dense/i, catches: 'Lipid particle profiling — small-dense LDL is the plaque-forming subtype; quantifies what standard LDL doesn\'t reveal.' },

  // ── Inflammation / autoimmune ───────────────────────────────────────
  { pattern: /\besr\b|sed rate|erythrocyte sedimentation/i, catches: 'Non-specific inflammation marker — sensitive but not specific; pairs with CRP for autoimmune workup.' },
  { pattern: /ana reflex|antinuclear antibod/i, catches: 'Autoimmune screen — positive ANA prompts reflex titer + pattern + dsDNA / Smith / RNP confirmation.' },
  { pattern: /anti.?ccp|cyclic citrull/i, catches: 'Highly specific for rheumatoid arthritis — positive in 60-70% of RA cases, often before joint damage shows.' },
  { pattern: /rheumatoid factor|^rf\b/i, catches: 'RA antibody — less specific than anti-CCP but standard. RF + anti-CCP both positive = high RA likelihood.' },

  // ── Statin / muscle ─────────────────────────────────────────────────
  { pattern: /creatine kinase|^ck\b/i, catches: 'Muscle injury marker — rules out statin-induced myopathy; >5× ULN warrants stopping the statin.' },
];

/**
 * Look up the "what this test catches" sentence for a confirmatory test.
 * Returns empty string if no match — frontend then just shows the test name.
 * Universal across users.
 */
export function catchesFor(testName: string): string {
  if (!testName) return '';
  for (const entry of REGISTRY) {
    if (entry.pattern.test(testName)) return entry.catches;
  }
  return '';
}

/**
 * Transform a list of plain-string confirmatory_tests into {test, why} objects
 * with the "catches" line attached. Frontend already renders {test, why}.
 */
export function enrichConfirmatoryTests(tests: any[]): Array<{ test: string; why: string }> {
  if (!Array.isArray(tests)) return [];
  return tests
    .map((t: any) => {
      const test = typeof t === 'string' ? t : (t?.test ?? '');
      if (!test) return null;
      const existingWhy = typeof t === 'string' ? '' : String(t?.why ?? '');
      const why = existingWhy || catchesFor(test);
      return { test, why };
    })
    .filter((x): x is { test: string; why: string } => x !== null);
}
