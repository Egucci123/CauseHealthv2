// supabase/functions/_shared/medicationAliases.ts
//
// SINGLE SOURCE OF TRUTH for medications. Maps brand names + generic names
// to drug classes, then declares each class's:
//   - depletes      : nutrients the drug depletes (universal evidence-based list)
//   - requiresTest  : labs to monitor when on this drug
//   - implies       : conditions this drug implies the user has (e.g. Armour → hypothyroid)
//   - empiricalSupp : supplements with strong evidence for empirical (no-test-first) supplementation
//
// All injectors and prompts use `isOnMed()` from here — no inline regex.

export interface MedClassDef {
  key: string;                    // canonical id, e.g. 'statin'
  label: string;
  aliases: RegExp[];              // brand + generic names users actually type
  depletes?: string[];            // nutrient keys
  requiresTest?: string[];        // retest registry keys
  impliesConditions?: string[];   // condition registry keys
  empiricalSupp?: string[];       // supplement registry keys (no test-first needed)
}

// Order: by clinical importance for our reasoning. New entries — append.
export const MED_CLASSES: MedClassDef[] = [
  // ── Thyroid replacement ────────────────────────────────────────────────
  // The Nona Lynn case. On any thyroid replacement → infer hypothyroid path.
  {
    key: 'thyroid_replacement',
    label: 'Thyroid replacement (T4 / T3 / NDT)',
    aliases: [
      /\barmour\b/i,
      /levothyroxine/i,
      /\bsynthroid\b/i,
      /nature[-\s]?throid/i,
      /np[-\s]?thyroid/i,
      /\bcytomel\b/i,
      /liothyronine/i,
      /\bndt\b/i,
      /\bt[34]\b.*therapy/i,
      /\bunithroid\b/i,
      /levoxyl/i,
      /tirosint/i,
      /euthyrox/i,
    ],
    requiresTest: ['thyroid_panel', 'reverse_t3'],
    impliesConditions: ['hashimotos'],
  },
  {
    key: 'antithyroid',
    label: 'Antithyroid medication',
    aliases: [
      /methimazole/i,
      /tapazole/i,
      /\bptu\b/i,
      /propylthiouracil/i,
    ],
    requiresTest: ['thyroid_panel', 'cbc', 'liver_panel'],
    impliesConditions: ['graves'],
  },

  // ── Lipid drugs ─────────────────────────────────────────────────────────
  {
    key: 'statin',
    label: 'Statin',
    aliases: [
      /atorvastatin/i, /\blipitor\b/i,
      /rosuvastatin/i, /\bcrestor\b/i, /\bezallor\b/i,
      /simvastatin/i, /\bzocor\b/i,
      /pravastatin/i, /\bpravachol\b/i,
      /lovastatin/i, /\bmevacor\b/i, /\baltoprev\b/i,
      /pitavastatin/i, /\blivalo\b/i, /\bzypitamag\b/i,
      /fluvastatin/i, /\blescol\b/i,
    ],
    depletes: ['coq10'],
    requiresTest: ['liver_panel', 'ck_if_muscle_symptoms'],
    impliesConditions: ['hyperlipidemia'],
    empiricalSupp: ['coq10', 'milk_thistle'],
  },
  {
    key: 'pcsk9',
    label: 'PCSK9 inhibitor',
    aliases: [
      /evolocumab/i, /repatha/i,
      /alirocumab/i, /praluent/i,
      /inclisiran/i, /leqvio/i,
    ],
    requiresTest: ['lipid_panel_extended', 'apob'],
    impliesConditions: ['hyperlipidemia'],
  },
  {
    key: 'ezetimibe',
    label: 'Ezetimibe',
    aliases: [/ezetimibe/i, /\bzetia\b/i, /vytorin/i],
    requiresTest: ['lipid_panel_extended'],
    impliesConditions: ['hyperlipidemia'],
  },
  {
    key: 'fibrate',
    label: 'Fibrate',
    aliases: [/gemfibrozil/i, /lopid/i, /fenofibrate/i, /tricor/i, /trilipix/i],
    requiresTest: ['liver_panel', 'lipid_panel'],
    impliesConditions: ['hyperlipidemia'],
  },

  // ── Diabetes drugs ──────────────────────────────────────────────────────
  {
    key: 'metformin',
    label: 'Metformin',
    aliases: [/metformin/i, /glucophage/i, /glumetza/i, /fortamet/i, /riomet/i],
    depletes: ['vit_b12'],
    requiresTest: ['vit_b12_workup_if_long_term'],
    impliesConditions: ['t2d'],
  },
  {
    key: 'sglt2',
    label: 'SGLT2 inhibitor',
    aliases: [/empagliflozin/i, /jardiance/i, /dapagliflozin/i, /farxiga/i, /canagliflozin/i, /invokana/i],
    requiresTest: ['cmp', 'uacr'],
    impliesConditions: ['t2d'],
  },
  {
    key: 'glp1',
    label: 'GLP-1 agonist',
    aliases: [/semaglutide/i, /ozempic/i, /wegovy/i, /rybelsus/i, /liraglutide/i, /victoza/i, /saxenda/i, /tirzepatide/i, /mounjaro/i, /zepbound/i, /dulaglutide/i, /trulicity/i],
    requiresTest: ['hba1c', 'lipid_panel'],
    impliesConditions: ['t2d'],
  },
  {
    key: 'sulfonylurea',
    label: 'Sulfonylurea',
    aliases: [/glipizide/i, /glucotrol/i, /glyburide/i, /diabeta/i, /micronase/i, /glimepiride/i, /amaryl/i],
    requiresTest: ['hba1c'],
    impliesConditions: ['t2d'],
  },
  {
    key: 'insulin',
    label: 'Insulin',
    aliases: [/\binsulin\b/i, /lantus/i, /levemir/i, /humalog/i, /novolog/i, /tresiba/i, /toujeo/i, /basaglar/i, /apidra/i, /\bnph\b/i, /humulin/i, /novolin/i],
    requiresTest: ['hba1c'],
    impliesConditions: ['t2d'],
  },

  // ── BP drugs ────────────────────────────────────────────────────────────
  {
    key: 'ace_inhibitor',
    label: 'ACE inhibitor',
    aliases: [/lisinopril/i, /enalapril/i, /benazepril/i, /captopril/i, /ramipril/i, /quinapril/i, /\bprinivil\b/i, /zestril/i, /vasotec/i, /lotensin/i],
    requiresTest: ['cmp', 'uacr'],
    impliesConditions: ['hypertension'],
  },
  {
    key: 'arb',
    label: 'ARB (angiotensin receptor blocker)',
    aliases: [/losartan/i, /cozaar/i, /valsartan/i, /diovan/i, /olmesartan/i, /benicar/i, /telmisartan/i, /micardis/i, /irbesartan/i, /avapro/i, /candesartan/i, /atacand/i],
    requiresTest: ['cmp', 'uacr'],
    impliesConditions: ['hypertension'],
  },
  {
    key: 'beta_blocker',
    label: 'Beta blocker',
    aliases: [/metoprolol/i, /lopressor/i, /toprol/i, /atenolol/i, /tenormin/i, /propranolol/i, /inderal/i, /carvedilol/i, /coreg/i, /bisoprolol/i, /zebeta/i, /labetalol/i, /nebivolol/i, /bystolic/i],
    requiresTest: ['lipid_panel', 'a1c'],
    impliesConditions: ['hypertension'],
  },
  {
    key: 'ccb',
    label: 'Calcium channel blocker',
    aliases: [/amlodipine/i, /norvasc/i, /diltiazem/i, /cardizem/i, /verapamil/i, /calan/i, /nifedipine/i, /procardia/i, /felodipine/i, /plendil/i],
    impliesConditions: ['hypertension'],
  },
  {
    key: 'diuretic_thiazide',
    label: 'Thiazide diuretic',
    aliases: [/hydrochlorothiazide/i, /\bhctz\b/i, /chlorthalidone/i, /microzide/i, /thalitone/i, /indapamide/i, /lozol/i],
    depletes: ['rbc_magnesium', 'potassium'],
    requiresTest: ['cmp', 'rbc_magnesium', 'uric_acid'],
    impliesConditions: ['hypertension'],
  },
  {
    key: 'diuretic_loop',
    label: 'Loop diuretic',
    aliases: [/furosemide/i, /lasix/i, /torsemide/i, /demadex/i, /bumetanide/i, /bumex/i, /ethacrynic/i],
    depletes: ['rbc_magnesium', 'potassium', 'thiamine'],
    requiresTest: ['cmp', 'rbc_magnesium'],
    impliesConditions: ['hypertension'],
  },
  {
    key: 'diuretic_potassium_sparing',
    label: 'Potassium-sparing diuretic',
    aliases: [/spironolactone/i, /aldactone/i, /eplerenone/i, /inspra/i, /amiloride/i, /triamterene/i, /dyrenium/i],
    requiresTest: ['cmp'],
  },

  // ── PPI / H2 / antacids ────────────────────────────────────────────────
  {
    key: 'ppi',
    label: 'Proton pump inhibitor',
    aliases: [/omeprazole/i, /prilosec/i, /pantoprazole/i, /protonix/i, /esomeprazole/i, /nexium/i, /lansoprazole/i, /prevacid/i, /rabeprazole/i, /aciphex/i, /dexlansoprazole/i, /dexilant/i],
    depletes: ['vit_b12', 'rbc_magnesium', 'iron'],
    requiresTest: ['vit_b12_workup_if_long_term', 'rbc_magnesium'],
    impliesConditions: ['gerd'],
    empiricalSupp: ['rbc_magnesium_glycinate_long_term'],
  },
  {
    key: 'h2_blocker',
    label: 'H2 blocker',
    aliases: [/famotidine/i, /pepcid/i, /cimetidine/i, /tagamet/i, /nizatidine/i, /axid/i, /ranitidine/i],
    impliesConditions: ['gerd'],
  },

  // ── Steroids ────────────────────────────────────────────────────────────
  {
    key: 'steroid_oral',
    label: 'Oral corticosteroid',
    aliases: [/prednisone/i, /prednisolone/i, /methylprednisolone/i, /medrol/i, /dexamethasone/i, /decadron/i, /hydrocortisone (?!cream)/i],
    depletes: ['vit_d', 'calcium', 'potassium'],
    requiresTest: ['vit_d_25oh', 'cmp', 'a1c', 'dexa_if_long_term'],
    empiricalSupp: ['vit_d_3', 'calcium_with_d'],
  },
  {
    key: 'inhaled_steroid',
    label: 'Inhaled corticosteroid',
    aliases: [/fluticasone/i, /flovent/i, /advair/i, /budesonide/i, /pulmicort/i, /symbicort/i, /mometasone/i, /asmanex/i, /ciclesonide/i, /alvesco/i, /beclomethasone/i, /qvar/i],
    impliesConditions: ['asthma'],
  },
  {
    key: 'beta_agonist_inhaler',
    label: 'Beta agonist inhaler',
    aliases: [/albuterol/i, /proair/i, /ventolin/i, /levalbuterol/i, /xopenex/i, /salmeterol/i, /serevent/i, /formoterol/i],
    impliesConditions: ['asthma'],
  },

  // ── IBD-specific ────────────────────────────────────────────────────────
  {
    key: 'mesalamine_5asa',
    label: '5-ASA / Mesalamine',
    aliases: [/mesalamine/i, /sulfasalazine/i, /asacol/i, /pentasa/i, /lialda/i, /apriso/i, /azulfidine/i, /rowasa/i, /canasa/i, /balsalazide/i, /colazal/i, /olsalazine/i, /dipentum/i],
    depletes: ['folate', 'vit_b12'],
    requiresTest: ['folate_workup', 'vit_b12_workup'],
    impliesConditions: ['ibd'],
  },
  {
    key: 'biologic_ibd',
    label: 'IBD biologic / immunomodulator',
    aliases: [/ustekinumab/i, /stelara/i, /infliximab/i, /remicade/i, /adalimumab/i, /humira/i, /vedolizumab/i, /entyvio/i, /azathioprine/i, /imuran/i, /6[-\s]?mp\b/i, /mercaptopurine/i, /tofacitinib/i, /xeljanz/i],
    impliesConditions: ['ibd'],
  },

  // ── Antidepressants / anti-anxiety ──────────────────────────────────────
  {
    key: 'ssri',
    label: 'SSRI antidepressant',
    aliases: [/sertraline/i, /zoloft/i, /fluoxetine/i, /prozac/i, /escitalopram/i, /lexapro/i, /citalopram/i, /celexa/i, /paroxetine/i, /paxil/i, /fluvoxamine/i, /luvox/i, /vilazodone/i, /viibryd/i, /vortioxetine/i, /trintellix/i],
    requiresTest: ['cmp'],
    impliesConditions: ['depression'],
  },
  {
    key: 'snri',
    label: 'SNRI antidepressant',
    aliases: [/duloxetine/i, /cymbalta/i, /venlafaxine/i, /effexor/i, /desvenlafaxine/i, /pristiq/i, /levomilnacipran/i, /fetzima/i],
    requiresTest: ['cmp', 'lipid_panel'],
    impliesConditions: ['depression'],
  },
  {
    key: 'tca',
    label: 'Tricyclic antidepressant',
    aliases: [/amitriptyline/i, /elavil/i, /nortriptyline/i, /pamelor/i, /imipramine/i, /tofranil/i, /clomipramine/i, /anafranil/i, /doxepin/i, /sinequan/i],
    requiresTest: ['ekg_if_dose_high'],
    impliesConditions: ['depression'],
  },
  {
    key: 'maoi',
    label: 'MAOI antidepressant',
    aliases: [/phenelzine/i, /nardil/i, /tranylcypromine/i, /parnate/i, /selegiline/i, /emsam/i, /isocarboxazid/i, /marplan/i],
    impliesConditions: ['depression'],
  },
  {
    key: 'benzodiazepine',
    label: 'Benzodiazepine',
    aliases: [/alprazolam/i, /xanax/i, /lorazepam/i, /ativan/i, /clonazepam/i, /klonopin/i, /diazepam/i, /valium/i, /temazepam/i, /restoril/i],
  },

  // ── Hormone replacement / TRT ──────────────────────────────────────────
  {
    key: 'trt',
    label: 'Testosterone replacement therapy',
    aliases: [/testosterone (cypionate|enanthate|injection|gel|cream|patch|pellet)/i, /\btrt\b/i, /androgel/i, /testim/i, /fortesta/i, /natesto/i, /aveed/i, /xyosted/i],
    requiresTest: ['testosterone_total_free', 'cbc', 'estradiol_male', 'lipid_panel', 'psa_if_male_45'],
    impliesConditions: ['low_testosterone_male'],
  },
  {
    key: 'hrt_estrogen',
    label: 'HRT (estrogen / estradiol)',
    aliases: [/estradiol/i, /\bestrace\b/i, /\bclimara\b/i, /\bvivelle\b/i, /\bdivigel\b/i, /\bevamist\b/i, /\bpremarin\b/i, /conjugated estrogen/i],
    requiresTest: ['lipid_panel', 'mammogram_if_due'],
    impliesConditions: ['menopause_postmenopause'],
  },
  {
    key: 'hrt_progesterone',
    label: 'HRT (progesterone)',
    aliases: [/progesterone/i, /\bprometrium\b/i, /\bcrinone\b/i, /\bendometrin\b/i, /medroxyprogesterone/i, /\bprovera\b/i],
    impliesConditions: ['menopause_postmenopause'],
  },

  // ── Other hepatotoxic / nephrotoxic ─────────────────────────────────────
  // Class for the milk-thistle injector. Drugs known to stress liver but
  // not in the statin/PPI/etc lists. Add liberally — empirical liver
  // protection is broadly safe.
  {
    key: 'hepatotoxic_other',
    label: 'Other hepatotoxic medications',
    aliases: [
      /methotrexate/i, /\bmtx\b/i,
      /isoniazid/i, /\binh\b/i,
      /valproate/i, /valproic/i, /\bdepakote\b/i, /\bdepakene\b/i,
      /amiodarone/i, /\bcordarone\b/i, /pacerone/i,
      /azathioprine/i, /imuran/i,
    ],
    requiresTest: ['liver_panel'],
    empiricalSupp: ['milk_thistle'],
  },

  // ── Anticoagulants ──────────────────────────────────────────────────────
  {
    key: 'anticoagulant',
    label: 'Anticoagulant',
    aliases: [/warfarin/i, /coumadin/i, /apixaban/i, /eliquis/i, /rivaroxaban/i, /xarelto/i, /dabigatran/i, /pradaxa/i, /edoxaban/i, /savaysa/i],
    requiresTest: ['cbc', 'inr_if_warfarin'],
  },

  // ── Gout ────────────────────────────────────────────────────────────────
  {
    key: 'allopurinol',
    label: 'Allopurinol',
    aliases: [/allopurinol/i, /zyloprim/i, /aloprim/i],
    requiresTest: ['uric_acid', 'cmp'],
    impliesConditions: ['gout'],
  },
  {
    key: 'febuxostat',
    label: 'Febuxostat',
    aliases: [/febuxostat/i, /uloric/i],
    requiresTest: ['uric_acid', 'liver_panel'],
    impliesConditions: ['gout'],
  },
];

const BY_KEY = new Map<string, MedClassDef>(MED_CLASSES.map(m => [m.key, m]));

export function isOnMed(userMedsText: string, key: string): boolean {
  const def = BY_KEY.get(key);
  if (!def) return false;
  return def.aliases.some(re => re.test(userMedsText));
}

/** All med-class keys that match the user's medication list. */
export function detectMedClasses(userMedsText: string): string[] {
  const hits: string[] = [];
  for (const m of MED_CLASSES) {
    if (m.aliases.some(re => re.test(userMedsText))) hits.push(m.key);
  }
  return hits;
}

/** Convenience: union of every test required by any med the user is on. */
export function requiredTestsFromMeds(userMedsText: string): string[] {
  const set = new Set<string>();
  for (const m of MED_CLASSES) {
    if (!m.requiresTest) continue;
    if (m.aliases.some(re => re.test(userMedsText))) {
      m.requiresTest.forEach(t => set.add(t));
    }
  }
  return [...set];
}

export function getMedClass(key: string): MedClassDef | undefined {
  return BY_KEY.get(key);
}

export const MEDICATION_REGISTRY = MED_CLASSES;
