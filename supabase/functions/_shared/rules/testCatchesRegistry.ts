// supabase/functions/_shared/rules/testCatchesRegistry.ts
//
// "WHAT THIS TEST CATCHES" REGISTRY
// =================================
// Every confirmatory test on a condition card gets a one-line "what
// it actually reveals" explanation. Same wording on every surface.
// Universal across users — same test → same explanation.
//
// READING LEVEL: 6th grade. Short sentences. No jargon without a
// plain-English chaser. If a doctor word slips in, follow it with
// "(what that means: ...)".
//
// IMPORTANT: regex order matters — first match wins. Always anchor
// short tokens (alt/ast/ck/lh/fsh/rf) with \b word boundaries so they
// don't match inside other words (e.g. "fAST" inside "fasting").

export interface TestCatches {
  /** Pattern that matches the confirmatory test string (case-insensitive). */
  pattern: RegExp;
  /** What the test catches — one sentence in plain English (6th grade). */
  catches: string;
}

const REGISTRY: TestCatches[] = [
  // ── Liver / hepatic ─────────────────────────────────────────────────
  { pattern: /liver ultrasound|hepatic ultrasound/i, catches: 'A picture of your liver to see if fat is building up inside it. No needles, no radiation, about $200.' },
  { pattern: /fibroscan|transient elastography/i, catches: 'A painless scan that measures how stiff your liver is and how much fat it holds. Tells the doctor if any damage is just fat or has started turning into scar tissue.' },
  { pattern: /\bggt\b|gamma[\s-]?glutamyl/i, catches: 'A liver enzyme. Helps the doctor figure out whether your liver irritation is from fat, alcohol, or a blocked bile duct.' },
  { pattern: /\balt\b|\bsgpt\b/i, catches: 'A liver enzyme that leaks into the blood when liver cells are stressed. Main early warning that the liver needs help.' },
  { pattern: /\bast\b|\bsgot\b/i, catches: 'A second liver enzyme. Comparing it to ALT helps point to the cause (alcohol, fatty liver, etc.).' },

  // ── Metabolic / insulin / dyslipidemia ──────────────────────────────
  // NOTE: this MUST come before any \bast\b-style pattern that could
  // catch "fAST" inside "fasting". Above ALT/AST patterns are now \b-anchored.
  { pattern: /fasting insulin|homa[\s-]?ir/i, catches: 'Shows if your pancreas is working overtime to keep blood sugar normal. Catches the problem years before A1c looks high. A score above 2.5 = insulin resistance.' },
  { pattern: /\bapob\b|apolipoprotein b/i, catches: 'Counts the actual cholesterol particles that get stuck in artery walls. A better heart-attack predictor than regular LDL.' },
  { pattern: /\blp\(a\)|lipoprotein.?a/i, catches: 'A genetic heart-risk marker. Only need to check it once in your life. About 1 in 5 people have a high level — it raises heart risk no matter how clean the diet is.' },
  { pattern: /coronary artery calcium|\bcac\b/i, catches: 'A quick CT scan that counts plaque in your heart arteries. A score of 0 means almost no risk; over 100 means it\'s time to get serious.' },
  { pattern: /hs[\s-]?crp|c[\s-]?reactive/i, catches: 'Measures hidden inflammation in your body. High levels raise heart-attack risk on their own and tell the doctor how aggressive to be with treatment.' },
  { pattern: /a1c|hba1c|hemoglobin a1c/i, catches: 'Your average blood sugar over the last 3 months. Watch zone is 5.4%+, prediabetes 5.7–6.4%, diabetes 6.5%+.' },
  { pattern: /lipid panel|cholesterol panel/i, catches: 'The standard cholesterol blood test. Total, LDL ("bad"), HDL ("good"), and triglycerides — your basic heart-risk numbers.' },
  { pattern: /uric acid/i, catches: 'High levels cause gout and kidney stones, and quietly raise blood pressure and heart risk. Often goes up alongside insulin resistance.' },

  // ── Hematology / hydration ──────────────────────────────────────────
  { pattern: /hydration trial/i, catches: 'A simple at-home test: drink 3 liters of water a day (with electrolytes) for 2 weeks, then recheck blood. If the high red-cell count drops, you were just dehydrated — not a blood disease.' },
  { pattern: /repeat cbc|cbc.*after trial|cbc \+ albumin/i, catches: 'A second blood count after the hydration trial. Confirms the high numbers came from low water — not from your bone marrow making too many cells.' },
  { pattern: /urine specific gravity/i, catches: 'A cheap urine test that shows how concentrated your pee is. A reading above 1.025 means you\'re dehydrated.' },
  { pattern: /\bcbc\b|complete blood count/i, catches: 'Counts your red cells, white cells, and platelets. Flags anemia, infection, low B12 or iron, and bone-marrow problems.' },
  { pattern: /reticulocyte/i, catches: 'Counts brand-new red blood cells. Tells the doctor if your body is actively making more cells (real overproduction) or just running on low water (dehydration).' },
  { pattern: /\bepo\b|erythropoietin/i, catches: 'The hormone that tells bone marrow to make red cells. High = body is starved for oxygen at night (often sleep apnea); low = a true blood disease.' },
  { pattern: /jak2/i, catches: 'A genetic test for a rare bone-marrow disease (polycythemia vera). Only ordered when other clues (low EPO, very high hemoglobin) point that way.' },

  // ── Sleep / OSA ─────────────────────────────────────────────────────
  { pattern: /stop[\s-]?bang/i, catches: 'A free 8-question quiz for sleep apnea. Takes 1 minute. A score of 3 or more catches 9 out of 10 cases.' },
  { pattern: /home sleep study|hsat|polysomnography|sleep apnea screening|sleep study/i, catches: 'You wear a small device at home overnight. It records breathing and oxygen levels to confirm or rule out sleep apnea. Usually $200–$500 and often covered.' },
  { pattern: /overnight pulse oximetry|nocturnal pulse ox/i, catches: 'A fingertip clip that tracks oxygen levels while you sleep. Repeated drops below 90% point to sleep apnea. Cheaper than a full sleep study.' },

  // ── Thyroid ─────────────────────────────────────────────────────────
  { pattern: /tpo antibod|thyroid peroxidase/i, catches: 'Confirms Hashimoto\'s — an autoimmune cause of low thyroid. Positive in 95% of cases, often before TSH looks abnormal.' },
  { pattern: /thyroglobulin antibod|tg.?ab/i, catches: 'A second autoimmune thyroid marker. Catches some Hashimoto\'s cases that the TPO test misses.' },
  { pattern: /reverse t3|rt3/i, catches: 'An "off-switch" version of thyroid hormone. High levels mean stress, illness, or under-eating is blocking your active hormone.' },
  { pattern: /free t3|t3 free/i, catches: 'The active thyroid hormone your body actually uses. Low Free T3 explains tired/cold/foggy symptoms even when the basic TSH test looks normal.' },
  { pattern: /free t4|t4 free/i, catches: 'The pre-active thyroid hormone. Low Free T4 can point to a brain (pituitary) problem instead of a thyroid problem.' },
  { pattern: /thyroid panel|tsh.*free t/i, catches: 'A full thyroid workup — TSH alone misses some real problems. Adds Free T4 and Free T3 for a complete picture.' },

  // ── Gut / IBD ───────────────────────────────────────────────────────
  { pattern: /fecal calprotectin/i, catches: 'A stool test that detects gut inflammation. Goes up when inflammatory bowel disease (IBD) is active, even before symptoms come back.' },
  { pattern: /celiac|tt?g[\s-]?iga|total iga/i, catches: 'Screens for celiac disease (gluten intolerance). Positive tTG-IgA with normal total IgA is the standard combo to rule it in or out.' },

  // ── Kidney ──────────────────────────────────────────────────────────
  { pattern: /uacr|microalbumin/i, catches: 'A simple urine test. Catches early kidney damage from diabetes or high blood pressure — years before standard kidney tests show a problem.' },
  { pattern: /cystatin c/i, catches: 'A more accurate kidney test for people with very high or very low muscle mass (regular creatinine misleads in both directions).' },

  // ── Hormones ────────────────────────────────────────────────────────
  { pattern: /testosterone panel|total t.*free t.*shbg|testosterone.*total.*free/i, catches: 'A full male-hormone workup — Total T, Free T, SHBG, Estradiol, LH, and FSH. Together they show the full picture instead of just one number.' },
  { pattern: /total testosterone|^testosterone$/i, catches: 'The basic male-hormone test. If it\'s low or borderline, the doctor adds Free T, SHBG, and LH/FSH to dig deeper.' },
  { pattern: /free testosterone/i, catches: 'The active testosterone your body actually uses. Can be low even when total testosterone looks normal — this often explains the symptoms.' },
  { pattern: /\bshbg\b|sex[\s-]?hormone[\s-]?binding/i, catches: 'A protein that holds testosterone in storage. High SHBG locks testosterone away; low SHBG is a clue for insulin resistance.' },
  { pattern: /estradiol/i, catches: 'The main estrogen hormone. Important for men too — high levels (often from belly fat) cause mood swings, low drive, and breast tissue.' },
  { pattern: /\blh\b|luteinizing hormone/i, catches: 'A signal from the brain to the testes (or ovaries). Tells the doctor if low testosterone is from the testes or from the brain/pituitary.' },
  { pattern: /\bfsh\b|follicle.?stimulating/i, catches: 'A pituitary hormone that pairs with LH. Confirms whether the cause of low hormones is upstream (brain) or downstream (gonads).' },
  { pattern: /dhea[\s-]?s|dehydroepiandrosterone/i, catches: 'An adrenal-gland hormone. Low levels show up with chronic stress; high levels are common in PCOS.' },
  { pattern: /am cortisol|morning cortisol/i, catches: 'Measures your main stress hormone first thing in the morning. Screens for adrenal problems like Addison\'s or Cushing\'s.' },
  { pattern: /prolactin/i, catches: 'A pituitary hormone. High levels mess with fertility, sex drive, and periods, and can point to a small pituitary tumor.' },

  // ── Vitamins / nutrients ────────────────────────────────────────────
  { pattern: /vitamin d|25.?hydroxy/i, catches: 'Your vitamin D level. Drives mood, immune function, and bone health. Best zone is 40–60 ng/mL.' },
  { pattern: /b12.*workup|b12.*mma|methylmalonic.*homocysteine/i, catches: 'A deeper B12 check (MMA + homocysteine). Catches "hidden" B12 deficiency that the basic blood test misses.' },
  { pattern: /vitamin b12|cobalamin|^b12/i, catches: 'Your B12 level. Borderline numbers need an MMA test to confirm. Often gets depleted by metformin, acid blockers, or gut issues.' },
  { pattern: /folate workup|serum.*rbc folate|rbc folate/i, catches: 'A deeper folate (B9) check. RBC folate shows your last 3 months of stores — best for catching depletion from drugs like mesalamine or methotrexate.' },
  { pattern: /\bmma\b|methylmalonic/i, catches: 'A confirmation test for low B12 at the cell level. Useful when the regular B12 number is in a grey zone.' },
  { pattern: /homocysteine/i, catches: 'A marker that goes up when B12, folate, or B6 are low. High levels also raise heart-disease risk on their own.' },
  { pattern: /iron panel|^iron\b|tibc|transferrin sat/i, catches: 'A full look at iron — both stores and how iron moves through the blood. Catches fatigue, hair loss, and restless legs before hemoglobin drops.' },
  { pattern: /ferritin/i, catches: 'Your iron storage number. Below 50 starts driving hair loss; below 30 = iron deficiency, even if hemoglobin still looks fine.' },
  { pattern: /rbc magnesium|red.?cell magnesium/i, catches: 'Magnesium inside the cells, where it actually works. Much more accurate than the standard blood test (which only sees 1% of body magnesium).' },

  // ── Lipid sub-tests ─────────────────────────────────────────────────
  { pattern: /particle size|nmr|small dense/i, catches: 'Sorts your LDL into big fluffy particles vs. small dense ones. The small dense kind is what actually clogs arteries.' },

  // ── Inflammation / autoimmune ───────────────────────────────────────
  { pattern: /\besr\b|sed rate|erythrocyte sedimentation/i, catches: 'A general inflammation marker. Pairs with CRP for autoimmune workups — if both are high, something inflammatory is active.' },
  { pattern: /ana reflex|antinuclear antibod/i, catches: 'A starting test for autoimmune diseases like lupus. If positive, the lab automatically runs the next round (titer + pattern + specific antibodies).' },
  { pattern: /anti.?ccp|cyclic citrull/i, catches: 'A very specific test for rheumatoid arthritis. Positive in most RA cases, often before joints start showing damage.' },
  { pattern: /rheumatoid factor|\brf\b/i, catches: 'A rheumatoid arthritis antibody. Less specific than anti-CCP, but standard. If both come back positive, RA is very likely.' },

  // ── Statin / muscle ─────────────────────────────────────────────────
  { pattern: /creatine kinase|\bck\b/i, catches: 'A muscle-damage marker. Used to rule out muscle injury from statins — if it\'s more than 5× normal, the statin needs to stop.' },
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
