// supabase/functions/_shared/retestRegistry.ts
//
// SINGLE SOURCE OF TRUTH for every test the app ever recommends.
//
// Every retest entry in wellness_plans.retest_timeline AND every test in
// doctor_prep.tests_to_request comes from this registry — same canonical
// name, same ICD-10, same insurance copy. Dedup is by canonical key, not
// regex on AI-generated strings (which is how "DHEA-S" appeared twice in
// Nona's plan).
//
// Adding a test: pick canonical key, fill all fields. The registry is the
// schema. Injectors call `pushRetestByKey(plan, 'thyroid_antibodies', ...)`
// — never construct a marker name string by hand.

/** Which specialist routinely orders this test. Drives the wellness-plan
 *  routing UI so users walk into each specialist visit with a focused,
 *  defensible ask — instead of handing 20 tests to a PCP who'll order 8. */
export type Specialist =
  | 'pcp'             // Primary care — basics any PCP orders without pushback
  | 'gi'              // Gastroenterology — UC/Crohn's/IBS/celiac/calprotectin
  | 'hepatology'      // Liver-specific — ultrasound, FibroScan, advanced liver panels
  | 'cardiology'      // Cardiology — ApoB, Lp(a), CAC score
  | 'endocrinology'   // Endocrine — full thyroid panel, hormones, advanced metabolic
  | 'sleep_medicine'  // Sleep — polysomnography, HSAT
  | 'rheumatology'    // ANA, RF, anti-CCP, complement, autoimmune workup
  | 'nephrology'      // Kidney-specific advanced
  | 'hematology'      // SPEP, free light chains, advanced heme
  | 'functional'      // Functional medicine — RBC mineral panels, organic acids
  | 'imaging'         // Non-blood: ultrasound, FibroScan, CAC, DEXA
  | 'mental_health';  // PHQ-9, GAD-7 — screening tools

export interface RetestDef {
  key: string;                       // canonical id, e.g. 'thyroid_antibodies'
  canonical: string;                 // user-facing test name (the doctor will recognize)
  icd10: string;
  icd10Description: string;
  insuranceNote: string;             // why insurance covers this with the ICD-10
  defaultPriority: 'urgent' | 'high' | 'moderate';
  /** Default specialist routing for this test. The AI can override per-patient
   *  (e.g. an ApoB ordered by an internist who's into preventive cards stays
   *  pcp), but the registry default ensures we have a sane fallback. */
  specialist?: Specialist;
  // Aliases so we can detect when the AI returned a string referring to this
  // test (and avoid double-adding it). Generous — match brand+abbrev+full name.
  aliases: RegExp[];
  // Whether this test belongs in: w=wellness retest_timeline, d=doctor prep, both
  surfaces?: 'both' | 'wellness' | 'doctor_prep';
}

const REGISTRY: RetestDef[] = [
  // ── Thyroid ────────────────────────────────────────────────────────────
  {
    key: 'thyroid_panel',
    canonical: 'Thyroid Panel (TSH + Free T4 + Free T3)',
    icd10: 'E03.9',
    icd10Description: 'Hypothyroidism, unspecified',
    insuranceNote: 'Universally covered — quarterly when on replacement.',
    defaultPriority: 'high',
    aliases: [/thyroid panel/i, /\btsh\b/i, /free\s*t[34]\b/i, /\bft[34]\b/i, /reverse\s*t3/i, /\brt3\b/i, /thyroid\s*workup/i],
    surfaces: 'both',
  },
  {
    key: 'thyroid_antibodies',
    canonical: "Hashimoto's Antibodies (TPO Ab + Thyroglobulin Ab)",
    icd10: 'E06.3',
    icd10Description: "Autoimmune thyroiditis (Hashimoto's)",
    insuranceNote: 'Covered for any patient with thyroid dysfunction or family history.',
    defaultPriority: 'high',
    aliases: [/\btpo( ab| antibod| anti-body)?\b/i, /thyroid peroxidase/i, /thyroglobulin\s+(ab|antibod|anti-body)/i, /thyroid\s+antibod/i, /\btg\s*(ab|antibod)\b/i, /\bhashimoto'?s?\s+antibod/i],
    surfaces: 'both',
  },
  {
    key: 'reverse_t3',
    canonical: 'Reverse T3 (rT3)',
    icd10: 'E03.9',
    icd10Description: 'Hypothyroidism, unspecified',
    insuranceNote: 'Often paid out-of-pocket ($30-60); critical when patient symptomatic on replacement.',
    defaultPriority: 'moderate',
    aliases: [/reverse ?t3/i, /\brt3\b/i],
    surfaces: 'both',
  },
  {
    key: 'tsi_antibodies',
    canonical: 'TSI (Thyroid Stimulating Immunoglobulin)',
    icd10: 'E05.0',
    icd10Description: 'Thyrotoxicosis with diffuse goiter',
    insuranceNote: 'Covered when hyperthyroid suspected/confirmed.',
    defaultPriority: 'high',
    aliases: [/\btsi\b/i, /thyroid stimulating immuno/i, /trab\b/i],
  },

  // ── Lipids / cardio ────────────────────────────────────────────────────
  {
    key: 'lipid_panel',
    canonical: 'Lipid Panel',
    icd10: 'E78.5',
    icd10Description: 'Hyperlipidemia, unspecified',
    insuranceNote: 'Universally covered as standard preventive care.',
    defaultPriority: 'high',
    aliases: [/^lipid panel$/i, /\blipid (profile|panel)\b/i, /cholesterol panel/i],
    surfaces: 'both',
  },
  {
    key: 'lipid_panel_extended',
    canonical: 'Lipid Panel + ApoB + Lp(a)',
    icd10: 'E78.5',
    icd10Description: 'Hyperlipidemia, unspecified',
    insuranceNote: 'ApoB and Lp(a) covered with documented dyslipidemia or family history.',
    defaultPriority: 'high',
    aliases: [/lipid.*apob/i, /apob.*lp\(?a\)?/i, /lipid panel.*extended/i],
    surfaces: 'both',
  },
  {
    key: 'apob',
    canonical: 'ApoB (Apolipoprotein B)',
    icd10: 'E78.5',
    icd10Description: 'Hyperlipidemia, unspecified',
    insuranceNote: 'Covered with documented dyslipidemia or CV risk.',
    defaultPriority: 'high',
    aliases: [/\bapob\b/i, /apolipoprotein ?b/i],
    surfaces: 'both',
  },
  {
    key: 'lp_a',
    canonical: 'Lp(a) — Lipoprotein(a)',
    icd10: 'E78.5',
    icd10Description: 'Hyperlipidemia (Lp(a) screening)',
    insuranceNote: 'Once-in-lifetime test. Covered with dyslipidemia, family history of premature CV disease, established ASCVD, or for any adult ≥18 per ACC 2023 (advocate for it — most PCPs will order with the right code).',
    defaultPriority: 'high',
    aliases: [/\blp ?\(a\)/i, /lipoprotein\W*a\b/i],
    surfaces: 'both',
  },
  {
    key: 'hs_crp',
    canonical: 'High-Sensitivity C-Reactive Protein (hs-CRP)',
    icd10: 'R74.0',
    icd10Description: 'Nonspecific elevation of inflammation marker',
    insuranceNote: 'Universally covered for CV risk + autoimmune monitoring.',
    defaultPriority: 'high',
    aliases: [/hs[-\s]?crp/i, /high.*sensitiv.*c[-\s]?reactive/i, /c[-\s]?reactive protein/i],
    surfaces: 'both',
  },
  {
    key: 'cac_score',
    canonical: 'Coronary Artery Calcium (CAC) Score',
    icd10: 'Z13.6',
    icd10Description: 'Cardiovascular disorder screening',
    insuranceNote: '~$100-200 OOP; covered with intermediate CV risk + dyslipidemia.',
    defaultPriority: 'high',
    aliases: [/coronary.*calcium/i, /\bcac (score)?\b/i, /agatston/i, /calcium score/i],
    surfaces: 'both',
  },
  {
    key: 'glyca',
    canonical: 'GlycA (Glycoprotein Acetylation)',
    icd10: 'R74.0',
    icd10Description: 'Composite inflammation marker',
    insuranceNote: 'Better inflammation marker than CRP alone; check coverage by lab.',
    defaultPriority: 'moderate',
    aliases: [/\bglyca\b/i, /glycoprotein acet/i],
  },
  {
    key: 'nt_probnp_if_hf',
    canonical: 'NT-proBNP',
    icd10: 'I50.9',
    icd10Description: 'Heart failure, unspecified',
    insuranceNote: 'Covered when HF suspected or confirmed.',
    defaultPriority: 'high',
    aliases: [/nt[-\s]?probnp/i, /\bbnp\b/i],
    surfaces: 'both',
  },

  // ── Metabolic ──────────────────────────────────────────────────────────
  {
    key: 'hba1c',
    canonical: 'Hemoglobin A1c',
    icd10: 'R73.09',
    icd10Description: 'Other abnormal glucose',
    insuranceNote: 'Covered annually with watch-tier A1c (≥5.4%), prediabetic dx, BMI ≥25, family history, or PCOS. Standard 3-year screening for adults 35+.',
    defaultPriority: 'high',
    aliases: [/\bhba1c\b/i, /hemoglobin a1c/i, /\ba1c\b/i, /glycated hgb/i],
    surfaces: 'both',
  },
  {
    key: 'fasting_insulin_homa_ir',
    canonical: 'Fasting Insulin + HOMA-IR (calculated)',
    icd10: 'R73.09',
    icd10Description: 'Insulin resistance / abnormal glucose',
    insuranceNote: 'Covered with metabolic syndrome features.',
    defaultPriority: 'high',
    aliases: [/fasting insulin/i, /homa[-\s]?ir/i, /insulin resistance test/i],
    surfaces: 'both',
  },
  {
    key: 'liver_panel',
    canonical: 'Liver Panel (ALT, AST, ALP, GGT, Bilirubin)',
    icd10: 'R74.0',
    icd10Description: 'Abnormal liver function tests',
    insuranceNote: 'Universally covered with documented LFT abnormality or hepatotoxic med.',
    defaultPriority: 'high',
    aliases: [/liver panel/i, /\bggt\b/i, /\balt\b.*\bast\b/i],
    surfaces: 'both',
  },
  {
    key: 'ggt',
    canonical: 'GGT (Gamma-Glutamyl Transferase)',
    icd10: 'R74.0',
    icd10Description: 'Abnormal liver function tests',
    insuranceNote: 'Covered when LFTs are abnormal.',
    defaultPriority: 'high',
    aliases: [/\bggt\b/i, /gamma[-\s]?glutamyl/i],
    surfaces: 'both',
  },
  {
    key: 'liver_ultrasound',
    canonical: 'Liver Ultrasound (NAFLD assessment)',
    icd10: 'K76.9',
    icd10Description: 'Liver disease, unspecified',
    insuranceNote: 'Covered with persistent LFT abnormality.',
    defaultPriority: 'high',
    aliases: [/liver ultrasound/i, /hepatic ultrasound/i, /\bnafld\b.*ultrasound/i],
  },

  // ── CBC / iron / B-vitamins ────────────────────────────────────────────
  {
    key: 'cbc',
    canonical: 'Complete Blood Count (CBC) with Differential',
    icd10: 'D64.9',
    icd10Description: 'Anemia, unspecified',
    insuranceNote: 'Universally covered.',
    defaultPriority: 'high',
    aliases: [/\bcbc\b/i, /complete blood count/i, /differential/i],
    surfaces: 'both',
  },
  {
    key: 'iron_panel',
    canonical: 'Iron Panel (Iron, TIBC, Ferritin, Transferrin Saturation)',
    icd10: 'D64.9',
    icd10Description: 'Iron deficiency / anemia evaluation',
    insuranceNote: 'Universally covered for fatigue, hair loss, IBD, menstruating women.',
    defaultPriority: 'high',
    aliases: [/iron panel/i, /ferritin/i, /\btibc\b/i, /transferrin/i],
    surfaces: 'both',
  },
  {
    key: 'vit_b12',
    canonical: 'Vitamin B12',
    icd10: 'E53.8',
    icd10Description: 'Deficiency of other specified B-group vitamins',
    insuranceNote: 'Covered with fatigue, neuropathy, macrocytic anemia, age >50, IBD, or chronic PPI / metformin / GLP-1 use.',
    defaultPriority: 'moderate',
    aliases: [/\bb[-\s]?12\b/i, /cobalamin/i],
  },
  {
    key: 'vit_b12_workup',
    canonical: 'B12 Workup (Serum B12 + MMA + Homocysteine)',
    icd10: 'E53.8',
    icd10Description: 'B12 deficiency workup',
    insuranceNote: 'MMA + homocysteine confirm tissue deficiency when serum B12 borderline.',
    defaultPriority: 'high',
    aliases: [/b12.*workup/i, /b12.*mma/i, /methylmalonic/i, /\bmma\b/i, /homocysteine/i],
    surfaces: 'both',
  },
  {
    key: 'vit_b12_workup_if_long_term',
    canonical: 'B12 Workup (long-term med)',
    icd10: 'E53.8',
    icd10Description: 'B12 deficiency workup (medication-related)',
    insuranceNote: 'Indicated for long-term metformin / PPI use.',
    defaultPriority: 'moderate',
    aliases: [/b12.*long[-\s]?term/i, /b12.*metformin/i, /b12.*ppi/i],
  },
  {
    key: 'folate_workup',
    canonical: 'Folate Workup (Serum + RBC Folate)',
    icd10: 'D52.9',
    icd10Description: 'Folate deficiency, unspecified',
    insuranceNote: 'RBC folate reflects 3-month stores (gold standard).',
    defaultPriority: 'high',
    aliases: [/folate/i, /folic acid/i, /5[-\s]?mthf/i],
    surfaces: 'both',
  },
  {
    key: 'rbc_magnesium',
    canonical: 'RBC Magnesium',
    icd10: 'E83.42',
    icd10Description: 'Hypomagnesemia',
    insuranceNote: 'More sensitive than serum Mg (which reflects only 1% of body Mg).',
    defaultPriority: 'moderate',
    aliases: [/rbc.*magnesium/i, /magnesium.*rbc/i, /erythrocyte magnesium/i],
    surfaces: 'both',
  },
  {
    key: 'vit_d_25oh',
    canonical: 'Vitamin D (25-hydroxy)',
    icd10: 'E55.9',
    icd10Description: 'Vitamin D deficiency, unspecified',
    insuranceNote: 'Universally covered baseline + 12-week recheck if low.',
    defaultPriority: 'high',
    aliases: [/vitamin d/i, /25[-\s]?oh.*d/i, /25.?hydroxy.?vitamin/i],
    surfaces: 'both',
  },

  // ── CMP / kidney ───────────────────────────────────────────────────────
  {
    key: 'cmp',
    canonical: 'Comprehensive Metabolic Panel (CMP)',
    icd10: 'Z00.00',
    icd10Description: 'General medical exam without complaint',
    insuranceNote: 'Universally covered.',
    defaultPriority: 'high',
    aliases: [/\bcmp\b/i, /comprehensive metabolic/i, /chem[-\s]?14/i],
    surfaces: 'both',
  },
  {
    key: 'cystatin_c_egfr',
    canonical: 'Cystatin C + eGFR',
    icd10: 'N18.9',
    icd10Description: 'CKD, unspecified',
    insuranceNote: 'More sensitive than creatinine — covered for CKD, HTN, diabetes.',
    defaultPriority: 'high',
    aliases: [/cystatin/i, /\begfr\b/i],
    surfaces: 'both',
  },
  {
    key: 'uacr',
    canonical: 'Urine Albumin/Creatinine Ratio (UACR)',
    icd10: 'R80.9',
    icd10Description: 'Proteinuria, unspecified',
    insuranceNote: 'ADA-recommended annually for diabetes/HTN — universally covered.',
    defaultPriority: 'high',
    aliases: [/\buacr\b/i, /albumin\W*creatinine/i, /microalbumin/i],
    surfaces: 'both',
  },
  {
    key: 'pth',
    canonical: 'PTH (Parathyroid Hormone)',
    icd10: 'E55.9',
    icd10Description: 'Vitamin D / parathyroid evaluation',
    insuranceNote: 'Covered with low D, bone disease, abnormal calcium.',
    defaultPriority: 'moderate',
    aliases: [/\bpth\b/i, /parathyroid hormone/i],
    surfaces: 'both',
  },
  {
    key: 'ionized_calcium',
    canonical: 'Ionized Calcium',
    icd10: 'E83.59',
    icd10Description: 'Disorders of calcium metabolism',
    insuranceNote: 'Covered with bone disease, low vit D, abnormal PTH.',
    defaultPriority: 'moderate',
    aliases: [/ionized calcium/i, /free calcium/i],
  },
  {
    key: 'ctx_telopeptide',
    canonical: 'CTX (C-telopeptide) Bone Resorption Marker',
    icd10: 'M81.0',
    icd10Description: 'Osteoporosis bone-loss assessment',
    insuranceNote: 'Covered with diagnosed osteoporosis/osteopenia.',
    defaultPriority: 'moderate',
    aliases: [/\bctx\b.*telopeptide/i, /c[-\s]?telopeptide/i, /bone resorption/i],
  },

  // ── Hormones ───────────────────────────────────────────────────────────
  {
    key: 'androgen_panel',
    canonical: 'Androgen Panel (Total T + Free T + DHEA-S)',
    icd10: 'E28.2',
    icd10Description: 'Hyperandrogenism / PCOS workup',
    insuranceNote: 'Covered with PCOS or androgen-pattern symptoms.',
    defaultPriority: 'high',
    aliases: [/androgen panel/i, /total ?t.*free ?t/i, /\bdhea[-\s]?s\b/i, /dhea sulfate/i],
    surfaces: 'both',
  },
  {
    key: 'shbg',
    canonical: 'SHBG (Sex Hormone Binding Globulin)',
    icd10: 'E34.9',
    icd10Description: 'Endocrine disorder, unspecified',
    insuranceNote: 'Covered with hormone replacement or PCOS.',
    defaultPriority: 'moderate',
    aliases: [/\bshbg\b/i, /sex hormone binding/i],
    surfaces: 'both',
  },
  {
    key: 'estradiol_progesterone_testosterone',
    canonical: 'Female Hormone Panel (Estradiol + Progesterone + Total/Free Testosterone)',
    icd10: 'E28.39',
    icd10Description: 'Other primary ovarian failure / menopause workup',
    insuranceNote: 'Covered with menopausal/perimenopausal symptoms.',
    defaultPriority: 'high',
    aliases: [/female hormone/i, /estradiol.*progesterone/i, /\be2\b.*\bp4\b/i],
    surfaces: 'both',
  },
  {
    key: 'estradiol_male',
    canonical: 'Estradiol (Sensitive)',
    icd10: 'E29.1',
    icd10Description: 'Testicular hypofunction / TRT monitoring',
    insuranceNote: 'Covered for males on TRT.',
    defaultPriority: 'moderate',
    aliases: [/estradiol/i, /\be2\b/i],
  },
  {
    key: 'testosterone_total_free',
    canonical: 'Testosterone (Total + Free) + SHBG',
    icd10: 'E29.1',
    icd10Description: 'Testicular hypofunction',
    insuranceNote: 'Covered for males with low-T symptoms or once-in-lifetime baseline.',
    defaultPriority: 'high',
    aliases: [/testosterone.*total/i, /total.*testosterone/i, /free testosterone/i],
    surfaces: 'both',
  },
  {
    key: 'lh_fsh',
    canonical: 'LH + FSH',
    icd10: 'E23.0',
    icd10Description: 'Hypopituitarism / central vs primary',
    insuranceNote: 'Covered for low T (males), menopause workup (females).',
    defaultPriority: 'moderate',
    aliases: [/\blh\b.*\bfsh\b/i, /\bfsh\b.*\blh\b/i, /luteinizing/i, /follicle stimulating/i],
  },
  {
    key: 'prolactin',
    canonical: 'Prolactin',
    icd10: 'E22.1',
    icd10Description: 'Hyperprolactinemia',
    insuranceNote: 'Covered with low T, infertility, irregular cycles, galactorrhea.',
    defaultPriority: 'moderate',
    aliases: [/prolactin/i],
  },
  {
    key: 'beta_hcg_pregnancy_rule_out',
    canonical: 'β-hCG (Pregnancy Rule-Out)',
    icd10: 'Z32.01',
    icd10Description: 'Encounter for pregnancy test',
    insuranceNote: 'Universally covered when ruling out pregnancy before hormonal workup.',
    defaultPriority: 'high',
    aliases: [/\bhcg\b/i, /pregnancy test/i, /beta.?hcg/i],
    surfaces: 'both',
  },
  {
    key: 'mri_pituitary_referral',
    canonical: 'MRI Pituitary (with contrast)',
    icd10: 'E22.1',
    icd10Description: 'Hyperprolactinemia — imaging if persistently elevated',
    insuranceNote: 'Covered with documented hyperprolactinemia after reversible causes ruled out.',
    defaultPriority: 'moderate',
    aliases: [/mri pituitary/i, /pituitary mri/i, /sella mri/i],
    surfaces: 'both',
  },
  {
    key: 'female_androgen_panel',
    canonical: 'Female Androgen Panel (Total T + Free T + SHBG + DHEA-S)',
    icd10: 'E28.39',
    icd10Description: 'Other primary ovarian dysfunction (low-libido / androgen-deficiency workup)',
    insuranceNote: 'Covered with documented low libido, fatigue, or HSDD evaluation.',
    defaultPriority: 'moderate',
    aliases: [/female androgen/i, /female testosterone/i],
    surfaces: 'both',
  },
  // ── Universal preventive screening (USPSTF A/B grade — ACA $0 covered) ──
  {
    key: 'hepatitis_c_one_time',
    canonical: 'Hepatitis C Antibody Screen (one-time)',
    icd10: 'Z11.59',
    icd10Description: 'Encounter for screening for other viral diseases',
    insuranceNote: 'USPSTF B grade — ACA $0 covered. One-time for all adults 18-79.',
    defaultPriority: 'high',
    aliases: [/hep(?:atitis)?\s*c\b/i, /\bhcv\b/i],
    surfaces: 'both',
  },
  {
    key: 'hiv_one_time',
    canonical: 'HIV Screen (one-time)',
    icd10: 'Z11.4',
    icd10Description: 'Encounter for screening for human immunodeficiency virus [HIV]',
    insuranceNote: 'USPSTF A grade — ACA $0 covered. One-time for all adults 15-65.',
    defaultPriority: 'high',
    aliases: [/\bhiv\b/i, /human immunodeficiency/i],
    surfaces: 'both',
  },
  {
    key: 'colorectal_screening',
    canonical: 'Colorectal Cancer Screening (Colonoscopy / Cologuard / FIT)',
    icd10: 'Z12.11',
    icd10Description: 'Encounter for screening for malignant neoplasm of colon',
    insuranceNote: 'USPSTF B grade — ACA $0 covered for adults 45-75. Colonoscopy every 10y, FIT annual, Cologuard every 3y.',
    defaultPriority: 'high',
    aliases: [/colonoscopy/i, /cologuard/i, /fit test/i, /colorectal/i],
    surfaces: 'both',
  },
  {
    key: 'aaa_ultrasound',
    canonical: 'Abdominal Aortic Aneurysm (AAA) Ultrasound — one-time',
    icd10: 'Z13.6',
    icd10Description: 'Encounter for screening for cardiovascular disorders',
    insuranceNote: 'USPSTF B grade — ACA $0 covered. One-time for men 65-75 who ever smoked.',
    defaultPriority: 'moderate',
    aliases: [/\baaa\b.*ultrasound/i, /abdominal aortic/i],
    surfaces: 'both',
  },
  {
    key: 'homocysteine',
    canonical: 'Homocysteine',
    icd10: 'E72.11',
    icd10Description: 'Homocystinuria / hyperhomocysteinemia',
    insuranceNote: 'Covered with documented B12/folate deficiency, family hx CV disease, or methylation workup.',
    defaultPriority: 'moderate',
    aliases: [/homocysteine/i],
    surfaces: 'both',
  },
  {
    key: 'fasting_insulin_universal',
    canonical: 'Fasting Insulin + HOMA-IR',
    icd10: 'R73.09',
    icd10Description: 'Other abnormal glucose / pre-diabetes workup',
    insuranceNote: 'Covered with metabolic syndrome features, prediabetes, PCOS, or weight resistance.',
    defaultPriority: 'moderate',
    aliases: [/fasting insulin/i, /\bhoma[-_]?ir\b/i],
    surfaces: 'both',
  },
  {
    key: 'uacr_universal',
    canonical: 'Urine Albumin/Creatinine Ratio (UACR)',
    icd10: 'R80.9',
    icd10Description: 'Proteinuria, unspecified',
    insuranceNote: 'Universally covered baseline kidney screen — earliest hypertensive/diabetic nephropathy marker.',
    defaultPriority: 'moderate',
    aliases: [/uacr/i, /urine\s*albumin/i, /microalbumin/i],
    surfaces: 'both',
  },
  {
    key: 'cortisol_am_baseline',
    canonical: 'AM Cortisol (baseline stress / HPA axis)',
    icd10: 'R45.7',
    icd10Description: 'State of emotional shock and stress',
    insuranceNote: 'Covered with documented fatigue, weight changes, or HPA-pattern symptoms.',
    defaultPriority: 'moderate',
    aliases: [/cortisol.*am/i, /morning cortisol/i, /8am cortisol/i],
    surfaces: 'both',
  },
  {
    key: 'am_cortisol_if_hpa',
    canonical: 'AM Cortisol + DHEA-S',
    icd10: 'E27.40',
    icd10Description: 'Unspecified adrenocortical insufficiency',
    insuranceNote: 'Covered with chronic fatigue + HPA-pattern symptoms.',
    defaultPriority: 'moderate',
    aliases: [/am cortisol/i, /morning cortisol/i, /8am cortisol/i, /\bcortisol\b/i],
    surfaces: 'both',
  },
  {
    key: 'psa_if_male_45',
    canonical: 'PSA (Prostate-Specific Antigen)',
    icd10: 'Z12.5',
    icd10Description: 'Screening for prostate malignancy',
    insuranceNote: 'Covered for males 45+. Earlier with family history of prostate cancer, African ancestry, or BRCA mutation per AUA shared-decision guidance.',
    defaultPriority: 'moderate',
    aliases: [/\bpsa\b/i, /prostate specific/i],
  },

  // ── Autoimmune / inflammation ──────────────────────────────────────────
  {
    key: 'esr',
    canonical: 'ESR (Erythrocyte Sedimentation Rate)',
    icd10: 'R70.0',
    icd10Description: 'Elevated sedimentation rate',
    insuranceNote: 'Universally covered for autoimmune workup.',
    defaultPriority: 'moderate',
    aliases: [/\besr\b/i, /sed rate/i, /sedimentation rate/i],
    surfaces: 'both',
  },
  {
    key: 'ana_reflex',
    canonical: 'ANA with Reflex',
    icd10: 'M32.9',
    icd10Description: 'Systemic lupus / autoimmune workup',
    insuranceNote: 'Covered with autoimmune symptoms or positive screen.',
    defaultPriority: 'moderate',
    aliases: [/\bana\b/i, /antinuclear antib/i],
    surfaces: 'both',
  },
  {
    key: 'rf_anti_ccp',
    canonical: 'RF + Anti-CCP',
    icd10: 'M06.9',
    icd10Description: 'Rheumatoid arthritis workup',
    insuranceNote: 'Covered with inflammatory joint symptoms >6 weeks.',
    defaultPriority: 'moderate',
    aliases: [/rheumatoid factor/i, /\brf\b.*ccp/i, /anti[-\s]?ccp/i],
  },
  {
    key: 'fecal_calprotectin',
    canonical: 'Fecal Calprotectin',
    icd10: 'K50.90',
    icd10Description: 'IBD disease activity marker',
    insuranceNote: 'Covered for any IBD patient — quarterly monitoring.',
    defaultPriority: 'high',
    aliases: [/calprotectin/i, /fecal cal/i],
    surfaces: 'both',
  },
  {
    key: 'celiac_serology',
    canonical: 'Celiac Serology (tTG-IgA + Total IgA)',
    icd10: 'K90.0',
    icd10Description: 'Celiac disease screening',
    insuranceNote: 'Universally covered with GI symptoms or autoimmune dx.',
    defaultPriority: 'high',
    aliases: [/celiac/i, /tissue transglutaminase/i, /\bttg[-\s]?iga\b/i],
    surfaces: 'both',
  },
  {
    key: 'ssa_ssb_antibodies',
    canonical: 'SSA + SSB Antibodies',
    icd10: 'M35.0',
    icd10Description: "Sjögren's syndrome workup",
    insuranceNote: "Covered with sicca symptoms or positive ANA.",
    defaultPriority: 'moderate',
    aliases: [/\bssa\b/i, /\bssb\b/i, /\bro\b.*\bla\b.*antibod/i, /anti[-\s]?ro/i, /anti[-\s]?la/i],
  },

  // ── Misc ────────────────────────────────────────────────────────────────
  {
    key: 'uric_acid',
    canonical: 'Uric Acid',
    icd10: 'E79.0',
    icd10Description: 'Hyperuricemia',
    insuranceNote: 'Universally covered.',
    defaultPriority: 'moderate',
    aliases: [/uric acid/i, /\burate\b/i],
    surfaces: 'both',
  },
  {
    key: 'kidney_function',
    canonical: 'Kidney Function Panel (BUN + Creatinine + eGFR)',
    icd10: 'N18.9',
    icd10Description: 'Renal function assessment',
    insuranceNote: 'Universally covered.',
    defaultPriority: 'moderate',
    aliases: [/kidney function/i, /\bbun\b.*creatinine/i, /renal panel/i],
  },
  {
    key: 'ck_if_muscle_symptoms',
    canonical: 'Creatine Kinase (CK)',
    icd10: 'M62.82',
    icd10Description: 'Rhabdomyolysis / myopathy rule-out',
    insuranceNote: 'Covered with statin + muscle symptoms.',
    defaultPriority: 'high',
    aliases: [/\bck\b(?!d)/i, /creatine kinase/i, /\bcpk\b/i],
    surfaces: 'both',
  },
  {
    key: 'd_dimer',
    canonical: 'D-dimer',
    icd10: 'D68.69',
    icd10Description: 'Thrombophilia / clotting workup',
    insuranceNote: 'Covered with VTE concerns or post-COVID.',
    defaultPriority: 'moderate',
    aliases: [/d[-\s]?dimer/i],
  },
  {
    key: 'eosinophil_count',
    canonical: 'Eosinophil Count (from CBC differential)',
    icd10: 'D72.1',
    icd10Description: 'Eosinophilia',
    insuranceNote: 'Already part of CBC w/ diff.',
    defaultPriority: 'moderate',
    aliases: [/eosinophil/i],
  },
  {
    key: 'total_ige_if_allergic',
    canonical: 'Total IgE',
    icd10: 'J45.909',
    icd10Description: 'Asthma / allergic workup',
    insuranceNote: 'Covered with asthma or atopic disease.',
    defaultPriority: 'moderate',
    aliases: [/total ige/i, /\bige\b/i],
  },
  {
    key: 'mammogram_if_due',
    canonical: 'Mammogram',
    icd10: 'Z12.31',
    icd10Description: 'Encounter for screening for malignant neoplasm of breast',
    insuranceNote: 'Universally covered for women 40+.',
    defaultPriority: 'moderate',
    aliases: [/mammogram/i, /mammography/i],
  },
  // ── Female standard-of-care baseline ────────────────────────────────
  {
    key: 'pap_smear_female_21_65',
    canonical: 'Cervical Cancer Screening (Pap smear, with HPV co-test if ≥30)',
    icd10: 'Z12.4',
    icd10Description: 'Encounter for screening for malignant neoplasm of cervix',
    insuranceNote: 'Universally covered ACA preventive — Pap every 3 years (21-29); Pap + HPV co-test every 5 years (30-65).',
    defaultPriority: 'moderate',
    aliases: [/pap\s*smear/i, /cervical\s*(cancer\s*)?screen/i, /hpv\s*co.?test/i, /\bpap\b/i],
  },
  {
    key: 'thyroid_antibodies_female_baseline',
    canonical: 'Thyroid Antibodies (TPO + Tg) — female baseline',
    icd10: 'Z13.29',
    icd10Description: 'Encounter for screening for other suspected endocrine disorder',
    insuranceNote: 'Often covered with documented thyroid symptoms or family history; ~$30-80 cash-pay otherwise. Women have 5-8x higher risk of autoimmune thyroid disease than men.',
    defaultPriority: 'moderate',
    aliases: [/thyroid\s*antibodies/i, /tpo\s*(ab\b|antibod)/i, /thyroglobulin\s*antibod/i, /hashimoto/i],
  },
  {
    key: 'amh_reproductive_age',
    canonical: 'AMH (Anti-Müllerian Hormone)',
    icd10: 'E28.39',
    icd10Description: 'Other primary ovarian failure / ovarian reserve assessment',
    insuranceNote: 'Covered with fertility evaluation indication; $50-100 cash-pay otherwise.',
    defaultPriority: 'moderate',
    aliases: [/\bamh\b/i, /anti.?m[uü]llerian/i, /ovarian\s*reserve/i],
  },
  {
    key: 'dexa_female_65_or_risk',
    canonical: 'DEXA Scan (Bone Density)',
    icd10: 'Z13.820',
    icd10Description: 'Encounter for screening for osteoporosis',
    insuranceNote: 'USPSTF: women ≥65 universal, men ≥70 universal. Earlier for either sex with chronic steroid use, prior fragility fracture, low BMI, smoking, IBD, hyperparathyroidism, hypogonadism, family history.',
    defaultPriority: 'high',
    aliases: [/\bdexa\b/i, /bone density/i, /\bdxa\b/i],
  },
  {
    key: 'sti_screen_sexually_active',
    canonical: 'STI Screening (Chlamydia, Gonorrhea ± HIV)',
    icd10: 'Z11.3',
    icd10Description: 'Encounter for screening for infections with a predominantly sexual mode of transmission',
    insuranceNote: 'ACA preventive — annual screening for sexually active women <25; risk-based after that. Sexually active men: discuss with PCP.',
    defaultPriority: 'moderate',
    aliases: [/sti\s*screen/i, /chlamydia/i, /gonorrhea/i, /sexually\s+transmit/i],
  },
  {
    key: 'dexa_if_long_term',
    canonical: 'DEXA Scan (Bone Density)',
    icd10: 'Z13.820',
    icd10Description: 'Encounter for screening for osteoporosis',
    insuranceNote: 'Covered for women 65+ / men 70+; earlier with chronic steroid use, IBD, malabsorption, low BMI, prior fragility fracture, or hyperparathyroidism.',
    defaultPriority: 'moderate',
    aliases: [/\bdexa\b/i, /bone density/i, /\bdxa\b/i],
  },
  {
    key: 'inr_if_warfarin',
    canonical: 'INR / PT',
    icd10: 'D68.318',
    icd10Description: 'Coagulation monitoring on anticoagulant',
    insuranceNote: 'Universally covered for warfarin patients.',
    defaultPriority: 'high',
    aliases: [/\binr\b/i, /\bpt\b.*ptt/i, /prothrombin time/i],
  },
  {
    key: 'ekg_if_dose_high',
    canonical: 'EKG (Resting)',
    icd10: 'R94.31',
    icd10Description: 'Abnormal cardiac conduction monitoring',
    insuranceNote: 'Covered with QT-prolonging meds at higher doses.',
    defaultPriority: 'moderate',
    aliases: [/\bekg\b/i, /\becg\b/i, /electrocardio/i],
  },

  // ── Comprehensive male hormonal panel (Phase 1 addition) ──────────────
  // Used by the universal male testosterone injector. Covers the full
  // workup any modern PCP can order with the right ICD-10.
  {
    key: 'testosterone_panel_male',
    canonical: 'Testosterone Panel (Total T + Free T + Bioavailable T + SHBG + Estradiol + LH + FSH)',
    icd10: 'E29.1',
    icd10Description: 'Testicular hypofunction / male hormonal evaluation',
    insuranceNote: 'Covered with documented symptom (fatigue / low libido / weight resistance) or low-normal Total T. Modern PCPs order this routinely with R53.83 or N52.9.',
    defaultPriority: 'moderate',
    aliases: [
      /testosterone\s*panel/i,
      /total\s*t.*free\s*t.*bioavailable/i,
      /\bbioavailable\s*t\b/i,
      /total\s*testosterone[,\s]*shbg[,\s]*estradiol/i,
    ],
    surfaces: 'both',
  },

  // ── PCOS Panel (Phase 1 addition) ─────────────────────────────────────
  // Universal female PCOS workup with cycle/acne/hirsutism cluster.
  {
    key: 'pcos_panel',
    canonical: 'PCOS Panel (Total T + Free T + DHEA-S + LH:FSH ratio + SHBG + Fasting Insulin)',
    icd10: 'E28.2',
    icd10Description: 'Polycystic ovarian syndrome',
    insuranceNote: 'Universally covered with documented cycle/skin symptom or PCOS dx.',
    defaultPriority: 'high',
    aliases: [
      /pcos\s*panel/i,
      /androgen.*lh.*fsh.*insulin/i,
      /total\s*t.*free\s*t.*dhea/i,
    ],
    surfaces: 'both',
  },

  // ── Sleep Apnea Screening (Phase 1 addition) ──────────────────────────
  // STOP-BANG questionnaire + sleep study referral. Universal injector
  // fires for polycythemia + IR / sleep symptoms / weight resistance.
  {
    key: 'sleep_apnea_screening',
    canonical: 'Sleep Apnea Screening (STOP-BANG questionnaire + sleep study referral if positive)',
    icd10: 'G47.30',
    icd10Description: 'Sleep apnea, unspecified',
    insuranceNote: 'STOP-BANG is free in-office; sleep study covered with documented symptom pattern.',
    defaultPriority: 'moderate',
    specialist: 'sleep_medicine',
    aliases: [
      /sleep\s*apnea/i,
      /\bhsat\b/i,
      /\bpsg\b/i,
      /polysomnography/i,
      /stop[\s-]?bang/i,
    ],
    surfaces: 'both',
  },

  // ── Macrocytic anemia → B-vitamin escalation (Phase 1 addition) ───────
  {
    key: 'b_vitamin_workup_macrocytic',
    canonical: 'B-Vitamin Workup (Serum B12 + RBC Folate + MMA + Homocysteine)',
    icd10: 'D52.9',
    icd10Description: 'Folate deficiency anemia, unspecified',
    insuranceNote: 'Universally covered when MCV is elevated (macrocytic pattern).',
    defaultPriority: 'high',
    aliases: [
      /b[\s-]?vitamin\s*workup/i,
      /b12.*folate.*mma/i,
      /macrocytic.*workup/i,
    ],
    surfaces: 'both',
  },

  // ── Microcytic anemia → Hemoglobin Electrophoresis (Phase 1 addition) ─
  {
    key: 'hgb_electrophoresis',
    canonical: 'Hemoglobin Electrophoresis',
    icd10: 'D56.9',
    icd10Description: 'Thalassemia, unspecified',
    insuranceNote: 'Covered when iron panel is normal in microcytic anemia.',
    defaultPriority: 'moderate',
    specialist: 'hematology',
    aliases: [
      /hemoglobin\s*electrophoresis/i,
      /hb\s*electrophoresis/i,
    ],
  },

  // ── Comprehensive CK injector (Phase 1 addition; covers statin baseline) ─
  // Existing 'ck_if_muscle_symptoms' key is for symptomatic case; this
  // covers any statin user (baseline) per AHA/ACC monitoring.
  {
    key: 'ck_statin_baseline',
    canonical: 'Creatine Kinase (CK)',
    icd10: 'M62.82',
    icd10Description: 'Rhabdomyolysis (rule-out, statin monitoring)',
    insuranceNote: 'Universally covered with statin medication code; routine baseline + 12-week.',
    defaultPriority: 'moderate',
    aliases: [/\bck\b/i, /creatine\s*kinase/i],
    surfaces: 'both',
  },
];

const BY_KEY = new Map<string, RetestDef>(REGISTRY.map(r => [r.key, r]));

/** Default specialist routing per canonical test key.
 *
 *  PHILOSOPHY: PCP is the default for nearly every blood test. A good PCP
 *  CAN order ApoB, Lp(a), Free T3, Reverse T3, MMA, RBC magnesium, AM
 *  cortisol — and with the right ICD-10 + insurance note (which we provide),
 *  most will. Sending users to 12 specialists creates copay sticker shock
 *  ($50-200 × 12 = brutal) and isn't how healthcare actually works.
 *
 *  We only route OUT of PCP for:
 *    - imaging: non-blood studies that need separate orders (ultrasound,
 *      FibroScan, CAC, DEXA, sleep study) — different copay/visit anyway
 *    - functional: tests that are RARELY covered by insurance even with
 *      good ICD-10s (DUTCH, organic acids, comprehensive stool, food
 *      sensitivity panels). Functional MDs / DTC labs are the cash-pay path.
 *    - mental_health: PHQ-9 / GAD-7 — done in any PCP visit, but framed
 *      separately as it's a screening tool not bloodwork.
 *
 *  Everything else is PCP with the right ICD-10. If the PCP refuses, the
 *  per-test insurance_note explains how to escalate. */
const SPECIALIST_BY_KEY: Record<string, Specialist> = {
  // ── Imaging & non-blood studies (separate orders) ──────────────────
  cac_score:         'imaging',
  liver_ultrasound:  'imaging',
  mammogram_if_due:  'imaging',
  dexa_if_long_term: 'imaging',
  ekg_if_dose_high:  'imaging',

  // ── GI-domain tests (universal — these are GI's bread and butter) ──
  // These belong with the GI doctor regardless of who's seeing the patient.
  // Calprotectin specifically is rarely PCP-ordered.
  fecal_calprotectin: 'gi',
  celiac_serology:    'gi',

  // Functional / cash-pay routing intentionally empty.
  // Most "advanced" bloodwork (ApoB, Lp(a), Reverse T3, MMA, RBC Mg,
  // AM cortisol, hormone panels, autoimmune workup) DOES get covered with
  // proper ICD-10 — those stay in PCP.
};

/** Resolve the specialist for a canonical test key. Registry's per-row
 *  `specialist` wins if set; otherwise SPECIALIST_BY_KEY; default 'pcp'. */
export function specialistForKey(key: string): Specialist {
  const def = BY_KEY.get(key);
  if (def?.specialist) return def.specialist;
  return SPECIALIST_BY_KEY[key] ?? 'pcp';
}

/** Look up a test by canonical key. */
export function getRetest(key: string): RetestDef | undefined {
  return BY_KEY.get(key);
}

/**
 * Push a test into the retest_timeline by canonical key. Dedups against
 * everything already there (by alias regex on existing entries' marker text).
 *
 * `whyShort` is the key insight in 6-15 words; trigger letter prepended.
 * `trigger` is one of (a)/(b)/(c)/(d)/(e) per the universal triage rule.
 *
 * Returns true if inserted, false if it was already present.
 */
export function pushRetestByKey(
  retestTimeline: any[],
  key: string,
  whyShort: string,
  trigger: 'a' | 'b' | 'c' | 'd' | 'e',
  retestAt: string = '12 weeks',
): boolean {
  const def = BY_KEY.get(key);
  if (!def) return false;

  // Dedup: does any existing entry's marker match any of this test's aliases?
  for (const existing of retestTimeline) {
    const text = String(existing?.marker ?? '');
    if (def.aliases.some(re => re.test(text))) return false;
    // Also compare on canonical name (cheap exact-substring guard)
    if (text === def.canonical) return false;
  }

  retestTimeline.push({
    marker: def.canonical,
    retest_at: retestAt,
    why: `(${trigger}) ${whyShort}`,
    why_short: whyShort,
    icd10: def.icd10,
    icd10_description: def.icd10Description,
    priority: def.defaultPriority,
    insurance_note: def.insuranceNote,
    specialist: specialistForKey(def.key),
    emoji: '🧪',
    _key: def.key,                  // canonical key for downstream dedup
  });
  return true;
}

/** Detect if a key is already represented in a retest_timeline. */
export function hasRetestByKey(retestTimeline: any[], key: string): boolean {
  const def = BY_KEY.get(key);
  if (!def) return false;
  return retestTimeline.some(r => {
    if (r?._key === key) return true;
    const text = String(r?.marker ?? '');
    return def.aliases.some(re => re.test(text));
  });
}

/** Once-in-lifetime baseline tests. If the user has a measured value
 *  for one of these in their current draw AND that value is in healthy
 *  tier, we should NEVER add it back to the retest list. Lp(a) is the
 *  textbook example — it's genetically determined and stable for life,
 *  so once you've measured it normal, retesting it is clinical waste. */
const ONCE_IN_LIFETIME_KEYS = new Set([
  'lp_a',
  // ApoB is NOT once-in-lifetime — it tracks intervention response. Keep
  // retestable.
]);

/** Final pass: dedup by canonical key, drop empty markers, cap, and
 *  drop tests whose canonical marker is already measured + healthy in
 *  the current draw (so retests don't re-recommend tests the patient
 *  just got back normal).
 *
 *  @param retestTimeline  the list of test recommendations the AI +
 *    deterministic injectors produced
 *  @param cap  hard maximum
 *  @param currentLabs  current draw's lab values — used to decide which
 *    tests are already-measured-and-healthy. When omitted (e.g. for
 *    first-time users), no health-tier suppression happens.
 */
export function finalizeRetestTimeline(
  retestTimeline: any[],
  cap: number,
  currentLabs?: Array<{ marker_name?: string | null; optimal_flag?: string | null; standard_flag?: string | null }>,
): any[] {
  const seen = new Set<string>();
  const out: any[] = [];

  // Build a map: canonical-key → tier (0 = healthy, 3 = critical) for the
  // current draw's labs. Used to suppress retest entries whose canonical
  // marker is already in the draw at healthy tier.
  const currentTierByKey = new Map<string, number>();
  if (currentLabs && currentLabs.length > 0) {
    const TIER_MAP: Record<string, number> = {
      healthy: 0, optimal: 0, normal: 0,
      watch: 1, watchlist: 1, borderline: 1,
      low: 2, high: 2, abnormal: 2, out_of_range: 2,
      critical: 3, critical_low: 3, critical_high: 3, urgent: 3,
    };
    for (const lv of currentLabs) {
      const flag = String(lv.optimal_flag ?? lv.standard_flag ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
      const tier = TIER_MAP[flag];
      if (tier === undefined) continue;
      const name = String(lv.marker_name ?? '');
      // Match against registry to find canonical key
      for (const def of REGISTRY) {
        if (def.aliases.some(re => re.test(name))) {
          // Track LOWEST tier (most healthy) we've seen for this key
          const prev = currentTierByKey.get(def.key);
          if (prev === undefined || tier < prev) currentTierByKey.set(def.key, tier);
          break;
        }
      }
    }
  }

  for (const r of retestTimeline) {
    const marker = String(r?.marker ?? '').trim();
    if (!marker) continue;
    // Find canonical key — prefer the one we set, else infer from alias match
    let key: string | undefined = r?._key;
    if (!key) {
      for (const def of REGISTRY) {
        if (def.aliases.some(re => re.test(marker))) { key = def.key; break; }
      }
    }
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);

      // ── RETEST SUPPRESSION (only for once-in-lifetime tests) ─────
      // Previously dropped any test where the marker was in the current
      // draw at healthy tier — but that defeated the point of the retest:
      // tracking direction-of-travel after the wellness protocol. If TSH
      // was 1.93 today and the patient sleeps better + loses weight, you
      // want to see if it shifts at the 12-week mark. Same for B12, A1c,
      // lipids, vitamin D — every standard baseline gets re-measured.
      // Only ONCE_IN_LIFETIME_KEYS (Lp(a), genetic markers) get suppressed
      // when present + healthy — those don't change with intervention.
      const currentTier = currentTierByKey.get(key);
      if (currentTier === 0 && ONCE_IN_LIFETIME_KEYS.has(key)) continue;
    }
    // Backfill specialist routing on AI-generated entries that didn't have one
    if (!r.specialist) {
      r.specialist = key ? specialistForKey(key) : 'pcp';
    }
    out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}

export const RETEST_REGISTRY = REGISTRY;
