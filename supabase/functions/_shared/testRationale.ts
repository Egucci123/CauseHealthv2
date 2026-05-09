// supabase/functions/_shared/testRationale.ts
//
// Universal rationale library for confirmatory tests in suspected_conditions.
//
// Every "Tests to confirm" recommendation has to answer the user's question:
// "If my labs already show this, why do I need ANOTHER test?" The answer is
// always one of six things — quantification, staging, treatment-unlock,
// tracking baseline, differential, or safety. This file maps common test
// names to the specific rationale for each.
//
// Used by suspectedConditionsBackstop.ts to convert plain string[] of test
// names into the {test, why} shape the UI now renders. The AI prompt also
// references these themes so AI-generated rationales align stylistically.

export interface TestWithWhy {
  test: string;
  why: string;
}

const RATIONALE: Record<string, string> = {
  // ── Thyroid ────────────────────────────────────────────────────────────
  'TPO Antibodies':
    'Distinguishes Hashimoto\'s (autoimmune) from non-autoimmune subclinical hypothyroidism. Same TSH, completely different long-term trajectory — autoimmune disease progresses, non-autoimmune often resolves. Treatment thresholds and replacement strategy differ.',
  'Thyroglobulin Antibodies':
    'Adds sensitivity for autoimmune thyroiditis when TPO is negative — about 5–10% of Hashimoto\'s is TgAb-only. Without this, you can falsely rule out autoimmune cause.',
  'Free T4':
    'Measures the active hormone available to your tissues. TSH alone misses central hypothyroidism (pituitary problem) and over/under-replacement on levothyroxine. Free T4 is what your cells actually see.',
  'Free T3':
    'The metabolically active hormone. Identifies impaired T4→T3 conversion (common in inflammation, low ferritin, low selenium) — TSH and Free T4 can both look fine while Free T3 is low and you feel hypothyroid.',
  'Reverse T3':
    'Detects "low-T3 syndrome" — the body shunting T4 into the inactive reverse T3 form during chronic stress, illness, or starvation. Explains hypothyroid symptoms with normal TSH/T4.',
  'Thyroid Ultrasound':
    'Looks for goiter, nodules, or the heterogeneous pattern characteristic of Hashimoto\'s. Catches structural disease antibody panels miss.',

  // ── Insulin resistance / metabolic ─────────────────────────────────────
  'Fasting Insulin':
    'Quantifies insulin resistance via HOMA-IR (insulin × glucose / 405). Gives a real number for severity — guides whether diet alone is enough or you need metformin / GLP-1. Also distinguishes early IR (high insulin, normal glucose, pancreas winning) from late-stage IR (insulin dropping, glucose creeping — pancreas failing). Same A1c, very different urgency.',
  'Fasting Insulin + HOMA-IR':
    'Quantifies insulin resistance via HOMA-IR (insulin × glucose / 405). Gives a real number for severity — guides whether diet alone is enough or you need metformin / GLP-1. Also distinguishes early IR (high insulin, normal glucose, pancreas winning) from late-stage IR (insulin dropping, glucose creeping — pancreas failing). Same A1c, very different urgency.',
  'HOMA-IR':
    'Calculated from fasting insulin + fasting glucose. The actual number that decides intervention intensity and that insurance/clinicians want documented before prescribing metformin or GLP-1.',
  'HbA1c':
    'Three-month average blood glucose. Confirms the trend isn\'t a one-day fluke and provides a baseline to track intervention response.',
  'HbA1c (repeat in 3 months)':
    'A1c lags about 3 months — re-running confirms whether interventions are working. Without a repeat, you\'re guessing if the diet/medication is moving the needle.',
  'Repeat HbA1c on a separate day to confirm':
    'ADA diagnostic criteria require two abnormal results before formally diagnosing diabetes. A single high A1c could be acute illness or lab error — confirmation prevents a lifetime diagnosis off one bad day.',
  'Fasting glucose (repeat)':
    'Same logic: ADA needs two consistent results before formal diagnosis. Eliminates the chance the first reading was non-fasting or stress-related.',
  'Comprehensive metabolic panel + UACR (kidney)':
    'UACR (urine albumin-creatinine ratio) detects diabetic kidney disease 5–10 years before creatinine rises. Caught early it\'s reversible; caught late it\'s permanent. CMP gives baseline kidney + liver function to monitor.',
  'UACR':
    'Detects early diabetic / hypertensive kidney damage years before creatinine moves. Reversible if caught early, permanent if not.',
  'Lipid panel (extended)':
    'Adds ApoB and Lp(a) to standard lipids. ApoB is a more accurate cardiovascular risk marker than LDL alone (it counts every atherogenic particle). Lp(a) is genetically determined and adds independent risk regardless of diet.',
  'Dilated eye exam (baseline retinopathy screen)':
    'Diabetic retinopathy can be present at diagnosis and is asymptomatic until vision loss. Annual exams catch it when laser/injections still preserve vision.',

  // ── PCOS / androgens ───────────────────────────────────────────────────
  'Free Testosterone':
    'Measures bioavailable androgen — total testosterone misses cases where SHBG is low and free fraction is high. The free number drives PCOS symptoms (hirsutism, acne, hair loss).',
  'SHBG':
    'Sex hormone binding globulin. Low SHBG amplifies free testosterone effects even when total looks fine — common pattern in insulin-resistant PCOS.',
  'Pelvic Ultrasound':
    'Looks for the polycystic ovary morphology (12+ follicles per ovary or volume >10 mL). Confirms the "PCO" half of PCOS when androgens + irregular cycles fit.',

  // ── NAFLD / liver ──────────────────────────────────────────────────────
  'Liver Ultrasound':
    'Detects fatty infiltration directly. Can grade severity (mild/moderate/severe steatosis) and screen for nodules. Non-invasive first-line imaging for NAFLD workup.',
  'GGT':
    'Adds sensitivity for NAFLD over ALT alone (ALT can be normal in advanced disease). Also distinguishes alcoholic vs non-alcoholic patterns and flags biliary involvement.',
  'FibroScan if available':
    'Measures liver stiffness — quantifies fibrosis stage non-invasively. Decides whether NAFLD is "fatty but reversible" or "fibrotic, refer to hepatology." Avoids unnecessary biopsy in mild cases and catches the cases that need it.',

  // ── Anemia / iron ──────────────────────────────────────────────────────
  'Iron Panel (Iron, TIBC, Transferrin Saturation, Ferritin)':
    'Distinguishes the cause of anemia — iron deficiency (low ferritin, low sat, high TIBC), anemia of chronic disease (low iron, low TIBC, normal/high ferritin), or thalassemia trait (normal iron, low MCV). Same low Hgb, three different treatments.',
  'Reticulocyte count':
    'Measures bone marrow response. High retic = marrow trying (acute blood loss, hemolysis); low retic = marrow not responding (iron/B12/folate deficiency, marrow disease). Without this, you can\'t tell where the problem actually is.',
  'Stool occult blood (rule out GI source)':
    'Iron deficiency in adults requires GI bleed rule-out. Missing a colon cancer because you assumed iron deficiency was "just diet" is the textbook avoidable miss.',

  // ── Sleep apnea ────────────────────────────────────────────────────────
  'Home sleep study (HSAT)':
    'Confirms OSA and quantifies severity (AHI). Gates CPAP coverage and titration. Without a number, "you snore" doesn\'t get treated.',
  'Polysomnography':
    'Gold-standard sleep study. Catches central apnea, complex apnea, and other sleep disorders an HSAT misses. Required if home study is equivocal or comorbidities suggest non-OSA cause.',

  // ── Cardiac / lipid ────────────────────────────────────────────────────
  'ApoB':
    'Counts every atherogenic particle (LDL + VLDL + IDL + Lp(a)) in one number. Stronger predictor of cardiovascular events than LDL-C alone. Discordance between LDL and ApoB (LDL "fine", ApoB high) identifies the small-dense-LDL pattern your standard panel misses.',
  'Lp(a)':
    'Genetically determined lipoprotein. Independent CV risk factor regardless of diet/statins. One-time test (rarely changes) but radically alters risk stratification — a high Lp(a) means treating LDL more aggressively from younger.',
  'hs-CRP':
    'Inflammation marker. Adds independent CV risk information when LDL is borderline. Decides whether borderline lipids need a statin or can wait.',
  'Coronary Calcium Score (CAC)':
    'Direct visualization of coronary artery plaque. A score of 0 means very low 10-year event risk regardless of cholesterol; >100 means established disease and changes statin/aspirin decisions immediately. Resolves "should I start a statin?" with an actual answer.',

  // ── Hypertension / endocrine ───────────────────────────────────────────
  'Aldosterone:Renin ratio':
    'Screens for primary aldosteronism — present in ~10% of hypertensives, especially resistant cases. Curable surgically if unilateral. Often missed on standard hypertension workup.',
  'Plasma metanephrines':
    'Rules out pheochromocytoma. Rare but life-threatening; episodic headaches + palpitations + sweats + hypertension warrant the screen.',
  'Cortisol (AM serum + late-night salivary)':
    'Screens for Cushing\'s. Late-night salivary catches early cases serum cortisol misses. Indicated when central obesity + glucose intolerance + hypertension cluster.',

  // ── Autoimmune / inflammatory ──────────────────────────────────────────
  'ANA':
    'Screens for systemic autoimmune disease (lupus, scleroderma, mixed connective tissue). Positive triggers ENA panel for specific antibodies. Negative effectively rules out major systemic autoimmune in symptomatic patients.',
  'CCP antibodies':
    'Specific for rheumatoid arthritis (~95% specificity). Positive in early RA before joint damage shows on imaging — catches it when DMARDs can prevent erosions.',
  'Celiac panel (TTG-IgA + total IgA)':
    'Screens for celiac while patient is still eating gluten. Total IgA needed because IgA deficiency causes false-negative TTG. Indicated for unexplained anemia, GI symptoms, fatigue, or first-degree relative.',

  // ── Hemoconcentration / hydration ──────────────────────────────────────
  'Hydration trial (3L water/day + electrolytes) for 14 days':
    'Cheapest and safest first move when albumin + Hgb + Hct are all elevated together. If hemoconcentration is the cause, the entire pattern reverses on a re-test in 2 weeks. If it doesn\'t, you\'ve ruled out the most common explanation and earned the right to escalate to OSA / EPO / marrow workup.',
  'Repeat CBC + albumin after trial':
    'After 14 days of adequate hydration, this confirms whether the elevated RBC line + albumin pattern resolves (hemoconcentration → reversed) or persists (true erythrocytosis → escalate workup). Without this measurement, you can\'t tell which path you\'re on.',
  'Urine specific gravity (random sample)':
    'Direct measure of urine concentration. >1.025 strongly suggests dehydration. Free, fast, and confirms what the blood-side pattern is hinting at.',
};

/** Pattern-based fallback when a test isn't in the rationale library.
 *  Generates a test-specific rationale based on common test families so
 *  multiple confirmatory_tests don't all show identical boilerplate. */
function patternFallback(testName: string): string {
  const t = testName.toLowerCase();
  if (/\bfasting\s*insulin|homa[\s-]?ir|c[\s-]?peptide\b/.test(t))
    return 'Quantifies insulin secretion at fasting state. Identifies hyperinsulinemia driving lipid + weight pattern even when glucose looks normal.';
  if (/\bogtt|oral\s*glucose\s*tolerance/.test(t))
    return 'Reveals postprandial glucose dysregulation that fasting glucose alone misses. 2-hour value >140 confirms impaired glucose tolerance.';
  if (/\bcontinuous\s*glucose|cgm\b/.test(t))
    return 'Real-time glucose pattern over 14 days; reveals post-meal spikes and overnight variability invisible to fasting labs.';
  if (/\bggt\b|gamma[\s-]?glutamyl/.test(t))
    return 'Distinguishes hepatic from biliary cause of ALT/AST elevation. Elevated GGT alongside ALT supports fatty liver or alcohol-related stress.';
  if (/\bliver\s*ultrasound|fibroscan|elastography|cap\s*score/.test(t))
    return 'Imaging confirms steatosis (fatty liver) and stages fibrosis non-invasively. Determines whether ALT elevation needs aggressive intervention.';
  if (/\bana\b|antinuclear/.test(t))
    return 'Screens for autoimmune overlap conditions. Negative result rules out the major autoimmune liver/connective-tissue causes; positive flags rheumatology referral.';
  if (/\bfree\s*t[34]|thyroid\s*panel/.test(t))
    return 'Free T3 and Free T4 measure thyroid hormone availability at the tissue level. Catches hypothyroidism patterns when TSH alone looks normal.';
  if (/\biron\s*panel|ferritin|tibc|transferrin/.test(t))
    return 'Confirms iron status. Ferritin <30 indicates deficiency; 30–50 functional deficiency. Pairs with hair loss / fatigue workup.';
  if (/\bb12|methylmalonic|homocysteine/.test(t))
    return 'MMA and homocysteine confirm tissue-level B12 deficiency when serum B12 is normal-but-low.';
  if (/\bfolate/.test(t))
    return 'Confirms folate status; mesalamine and other UC medications can deplete folate over time even with normal diet.';
  if (/\bsleep\s*apnea|hsat|polysomnography|stop[\s-]?bang/.test(t))
    return 'Confirms or rules out obstructive sleep apnea — common driver of elevated RBC/Hct, fatigue, and metabolic dysfunction.';
  if (/\bapob\b|apolipoprotein/.test(t))
    return 'Measures plaque-forming particle count directly. Better predictor of cardiovascular risk than LDL-C alone, especially with high triglycerides.';
  if (/\blp\(?a\)?/.test(t))
    return 'Genetic cardiovascular risk marker. Elevated Lp(a) is a once-in-lifetime test that flags risk a normal lipid panel misses.';
  if (/\bcoronary\s*calcium|cac\s*score/.test(t))
    return 'Imaging quantifies coronary artery plaque burden. Elevated score in a young patient warrants more aggressive statin/lifestyle intervention.';
  if (/\burine\s*specific\s*gravity|osmolality/.test(t))
    return '>1.025 specific gravity or elevated osmolality confirms dehydration as the cause of elevated RBC/Hct, sparing a hematology workup.';
  if (/\bfecal\s*calprotectin|calprotectin/.test(t))
    return 'Objective marker of intestinal inflammation. Quantifies UC activity independent of how the patient feels; guides medication adjustment.';
  if (/\buric\s*acid/.test(t))
    return 'Screens for hyperuricemia in metabolic syndrome / joint complaints. Elevated uric acid worsens cardiovascular and renal risk.';
  if (/\bttg|celiac\s*serology|gliadin/.test(t))
    return 'Screens for celiac disease while still eating gluten. Total IgA needed because IgA deficiency causes false negatives.';
  // True fallback when no pattern matches — short, generic, but not the
  // 30-word boilerplate that was leaking before.
  return 'Confirmatory test that quantifies the pattern and tracks response.';
}

/** Convert a list of test names (legacy string[]) into {test, why} objects
 *  with a clinical rationale attached. Used by deterministic backstops. */
export function attachWhys(tests: string[]): TestWithWhy[] {
  return tests.map((t) => ({
    test: t,
    why: RATIONALE[t] ?? patternFallback(t),
  }));
}
