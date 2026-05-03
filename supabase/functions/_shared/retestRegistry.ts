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

export interface RetestDef {
  key: string;                       // canonical id, e.g. 'thyroid_antibodies'
  canonical: string;                 // user-facing test name (the doctor will recognize)
  icd10: string;
  icd10Description: string;
  insuranceNote: string;             // why insurance covers this with the ICD-10
  defaultPriority: 'urgent' | 'high' | 'moderate';
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
    aliases: [/thyroid panel/i, /\btsh\b/i, /free t[34]\b/i, /\bft[34]\b/i],
    surfaces: 'both',
  },
  {
    key: 'thyroid_antibodies',
    canonical: "Hashimoto's Antibodies (TPO Ab + Thyroglobulin Ab)",
    icd10: 'E06.3',
    icd10Description: "Autoimmune thyroiditis (Hashimoto's)",
    insuranceNote: 'Covered for any patient with thyroid dysfunction or family history.',
    defaultPriority: 'high',
    aliases: [/\btpo( ab)?\b/i, /thyroid peroxidase/i, /thyroglobulin ab/i, /thyroid antibod/i, /\btg ab\b/i],
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
    insuranceNote: 'Once-in-lifetime test, covered with family history of CV disease.',
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
    insuranceNote: 'Universally covered every 3 yr from age 35.',
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
    insuranceNote: 'Covered with fatigue, neuropathy, age >50, or PPI/metformin use.',
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
    insuranceNote: 'Covered with low T, infertility, irregular cycles.',
    defaultPriority: 'moderate',
    aliases: [/prolactin/i],
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
    insuranceNote: 'Universally covered for males 45+.',
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
  {
    key: 'dexa_if_long_term',
    canonical: 'DEXA Scan (Bone Density)',
    icd10: 'Z13.820',
    icd10Description: 'Encounter for screening for osteoporosis',
    insuranceNote: 'Covered for women 65+, men 70+, or earlier with steroid use.',
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
];

const BY_KEY = new Map<string, RetestDef>(REGISTRY.map(r => [r.key, r]));

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

/** Final pass: dedup by canonical key, drop empty markers, cap. */
export function finalizeRetestTimeline(retestTimeline: any[], cap: number): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
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
    }
    out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}

export const RETEST_REGISTRY = REGISTRY;
