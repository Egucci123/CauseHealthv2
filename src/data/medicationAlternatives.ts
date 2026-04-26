// src/data/medicationAlternatives.ts
// Curated pharmaceutical, natural, and lifestyle alternatives for common medications.
// Educational only — alternatives must be discussed with the prescribing physician.

import type { MedicationAlternative } from './medicationDepletions';

export const MEDICATION_ALTERNATIVES: Record<string, MedicationAlternative[]> = {
  // ── STATINS ─────────────────────────────────────────────────────────────────
  atorvastatin: [
    { name: 'Rosuvastatin (Crestor)', type: 'pharmaceutical', reason: 'Less hepatotoxic than atorvastatin at equivalent LDL-lowering doses; better choice if liver enzymes elevated.', caution: 'Still depletes CoQ10 — supplement either way.' },
    { name: 'Pravastatin (Pravachol)', type: 'pharmaceutical', reason: 'Hydrophilic statin — less muscle and CNS penetration, lower myopathy risk. Often better tolerated.' },
    { name: 'Ezetimibe (Zetia)', type: 'pharmaceutical', reason: 'Blocks intestinal cholesterol absorption — different mechanism, no muscle pain, no CoQ10 depletion. Can replace or combine at lower statin dose.' },
    { name: 'PCSK9 inhibitors (Repatha, Praluent)', type: 'pharmaceutical', reason: 'For very high cardiovascular risk or familial hypercholesterolemia. Injectable; no muscle effects.', caution: 'Expensive, often requires prior auth.' },
    { name: 'Bempedoic acid (Nexletol)', type: 'pharmaceutical', reason: 'For statin-intolerant patients. Lowers LDL without muscle penetration.' },
    { name: 'Red yeast rice + CoQ10', type: 'natural', reason: 'Contains naturally occurring monacolin K (lovastatin-like compound). Best for mild-moderate elevations. Always pair with CoQ10.', caution: 'Same myopathy risk as statins; not for severe hypercholesterolemia.' },
    { name: 'Bergamot extract (BPF)', type: 'natural', reason: 'Citrus polyphenols shown in RCTs to lower LDL 24-30% and triglycerides 30-40%. Improves HDL.', caution: 'May potentiate statin effects if combined.' },
    { name: 'Soluble fiber (psyllium, oat beta-glucan)', type: 'lifestyle', reason: 'Binds bile acids; lowers LDL 5-10%. Free, safe, supports gut health.' },
    { name: 'Mediterranean diet + omega-3', type: 'lifestyle', reason: 'PREDIMED trial: 30% reduction in cardiovascular events vs. low-fat diet. Targets root cause if insulin resistance is present.' },
  ],
  rosuvastatin: [
    { name: 'Pravastatin (Pravachol)', type: 'pharmaceutical', reason: 'Hydrophilic — even lower myopathy risk if you experience muscle pain on rosuvastatin.' },
    { name: 'Ezetimibe (Zetia)', type: 'pharmaceutical', reason: 'Different mechanism. Combine with low-dose statin for fewer side effects, same LDL drop.' },
    { name: 'Bergamot extract (BPF)', type: 'natural', reason: 'RCT-backed LDL and triglyceride reduction. Pairs well with low-dose statin.' },
    { name: 'Soluble fiber + plant sterols', type: 'lifestyle', reason: 'Compounding effect — fiber + sterols + Mediterranean diet can reduce LDL 20-25% without medication.' },
  ],
  simvastatin: [
    { name: 'Rosuvastatin (Crestor)', type: 'pharmaceutical', reason: 'Newer statin with better drug-interaction profile. Simvastatin has many drug-drug interactions (amiodarone, verapamil, diltiazem).' },
    { name: 'Pravastatin (Pravachol)', type: 'pharmaceutical', reason: 'Hydrophilic — much lower myopathy risk than simvastatin, especially at higher doses.' },
    { name: 'Ezetimibe (Zetia)', type: 'pharmaceutical', reason: 'Add-on or replacement. No muscle effects.' },
    { name: 'Red yeast rice + CoQ10', type: 'natural', reason: 'Natural monacolin K. Best for mild elevations or patients seeking statin-free options.' },
  ],

  // ── PPIs ────────────────────────────────────────────────────────────────────
  omeprazole: [
    { name: 'Famotidine (Pepcid)', type: 'pharmaceutical', reason: 'H2 blocker — less depletion of B12, magnesium, calcium than PPIs. Effective for mild-moderate reflux.', caution: 'Less potent than PPIs for severe GERD or erosive esophagitis.' },
    { name: 'Cimetidine (Tagamet)', type: 'pharmaceutical', reason: 'Older H2 blocker, generic and inexpensive. Useful for occasional reflux.', caution: 'Multiple drug interactions — less commonly used.' },
    { name: 'Sucralfate (Carafate)', type: 'pharmaceutical', reason: 'Coats ulcers without affecting acid production. No nutrient depletion.' },
    { name: 'DGL licorice (deglycyrrhizinated)', type: 'natural', reason: 'Stimulates mucus production protecting esophagus and stomach lining. Studies show comparable efficacy to cimetidine for ulcers.' },
    { name: 'Zinc carnosine (PepZinGI)', type: 'natural', reason: 'Repairs gastric mucosa; clinically validated for H. pylori-related and NSAID-induced damage.' },
    { name: 'Slippery elm + marshmallow root', type: 'natural', reason: 'Mucilaginous herbs that coat and soothe esophageal lining.' },
    { name: 'Identify and remove triggers', type: 'lifestyle', reason: 'Common: coffee, alcohol, chocolate, spicy/fatty foods, eating within 3 hours of bed. Removing these often resolves GERD without medication.' },
    { name: 'Elevate head of bed 6-8 inches', type: 'lifestyle', reason: 'Prevents nocturnal reflux. Bedrisers are cheap and immediate.' },
  ],
  pantoprazole: [
    { name: 'Famotidine (Pepcid)', type: 'pharmaceutical', reason: 'H2 blocker with significantly less B12/magnesium depletion than PPIs.' },
    { name: 'DGL licorice', type: 'natural', reason: 'Mucosal protection without acid suppression.' },
    { name: 'Diet + lifestyle modification', type: 'lifestyle', reason: 'Trigger identification, weight loss if applicable, smaller meals, no late eating.' },
  ],
  esomeprazole: [
    { name: 'Famotidine (Pepcid)', type: 'pharmaceutical', reason: 'Less aggressive acid suppression — fewer long-term depletion concerns.' },
    { name: 'DGL licorice + zinc carnosine', type: 'natural', reason: 'Combination for mucosal repair without affecting acid production.' },
  ],

  // ── DIABETES ────────────────────────────────────────────────────────────────
  metformin: [
    { name: 'Semaglutide (Ozempic)', type: 'pharmaceutical', reason: 'GLP-1 agonist — better A1c reduction, weight loss, cardiovascular benefit. No B12 depletion.', caution: 'Higher cost; GI side effects common initially.' },
    { name: 'Tirzepatide (Mounjaro)', type: 'pharmaceutical', reason: 'Dual GIP/GLP-1 agonist — most effective glucose-lowering and weight loss medication available.' },
    { name: 'SGLT2 inhibitors (Jardiance, Farxiga)', type: 'pharmaceutical', reason: 'Glucose excreted in urine. Cardiovascular and kidney protection benefits beyond glucose control.' },
    { name: 'Berberine', type: 'natural', reason: 'Multiple RCTs show comparable A1c reduction to metformin. Same AMPK activation mechanism. Best for prediabetes or mild T2D.', caution: 'Interactions with other medications; consult prescriber.' },
    { name: 'Cinnamon extract (Cinnulin PF)', type: 'natural', reason: 'Studies show 0.3-0.5% A1c reduction. Adjunctive — not standalone therapy.' },
    { name: 'Low-carbohydrate diet', type: 'lifestyle', reason: 'Most effective intervention for T2D reversal. Virta Health trials show 60% T2D reversal at 1 year.' },
    { name: 'Time-restricted eating (16:8)', type: 'lifestyle', reason: 'Improves insulin sensitivity independent of weight loss. Free, safe.' },
  ],

  // ── BLOOD PRESSURE ──────────────────────────────────────────────────────────
  lisinopril: [
    { name: 'Losartan (Cozaar)', type: 'pharmaceutical', reason: 'ARB — same blood pressure efficacy without ACE-induced cough. No zinc depletion.' },
    { name: 'Telmisartan (Micardis)', type: 'pharmaceutical', reason: 'ARB with longest half-life and metabolic benefits (PPAR-gamma activity).' },
    { name: 'Beetroot (dietary nitrates)', type: 'natural', reason: 'RCTs show 4-10 mmHg systolic reduction. Boosts nitric oxide for vasodilation.' },
    { name: 'Hibiscus tea', type: 'natural', reason: 'Multiple RCTs show 7-12 mmHg systolic reduction. Comparable to low-dose ACE inhibitor for stage 1 hypertension.' },
    { name: 'DASH diet', type: 'lifestyle', reason: 'Documented 8-14 mmHg systolic reduction. Most evidence-based dietary intervention for hypertension.' },
    { name: 'Reduce sodium + increase potassium', type: 'lifestyle', reason: 'Specifically: <2300mg sodium, >4700mg potassium daily. Highest-leverage dietary change.' },
  ],
  metoprolol: [
    { name: 'Carvedilol (Coreg)', type: 'pharmaceutical', reason: 'Alpha-beta blocker with antioxidant properties. Often better tolerated; preferred for heart failure.' },
    { name: 'Bisoprolol (Zebeta)', type: 'pharmaceutical', reason: 'More cardioselective than metoprolol — fewer pulmonary and central side effects.' },
    { name: 'CoQ10 + magnesium', type: 'natural', reason: 'Replenishes what beta blockers deplete; may reduce fatigue side effects.' },
    { name: 'Hawthorn berry extract', type: 'natural', reason: 'For mild blood pressure and mild heart failure. Cardiotonic without negative inotropic effect.' },
    { name: 'Aerobic exercise', type: 'lifestyle', reason: 'Most effective non-pharmaceutical intervention for resting heart rate and blood pressure. 30 min × 5 days/week.' },
  ],
  hydrochlorothiazide: [
    { name: 'Chlorthalidone', type: 'pharmaceutical', reason: 'Stronger 24-hour effect than HCTZ; better cardiovascular outcomes data.' },
    { name: 'Indapamide (Lozol)', type: 'pharmaceutical', reason: 'Less metabolic disruption than HCTZ — gentler on glucose and lipids.' },
    { name: 'Spironolactone (Aldactone)', type: 'pharmaceutical', reason: 'Potassium-sparing — no potassium/magnesium depletion. Excellent for resistant hypertension.' },
    { name: 'Dandelion root extract', type: 'natural', reason: 'Mild natural diuretic; potassium-rich (so no depletion). For mild fluid retention.' },
  ],

  // ── IBD ─────────────────────────────────────────────────────────────────────
  mesalamine: [
    { name: 'Budesonide (Uceris, Entocort)', type: 'pharmaceutical', reason: 'Targeted-release corticosteroid for flares. High first-pass metabolism — 90% less systemic effect than prednisone.', caution: 'For flares only, not maintenance.' },
    { name: 'Sulfasalazine', type: 'pharmaceutical', reason: 'Older 5-ASA with better evidence for IBD-associated arthritis. Same folate depletion concern.' },
    { name: 'Curcumin (high-bioavailability)', type: 'natural', reason: 'RCTs show curcumin + mesalamine more effective than mesalamine alone for UC remission. Adjunct, not replacement.' },
    { name: 'Boswellia serrata (AKBA)', type: 'natural', reason: 'Inhibits 5-LOX inflammation pathway. Studies show comparable to mesalamine for mild-moderate UC.' },
    { name: 'Wormwood (Artemisia absinthium)', type: 'natural', reason: 'RCTs in Crohn\'s show steroid-sparing effect.', caution: 'Not for ulcerative colitis (different evidence).' },
    { name: 'Specific Carbohydrate Diet (SCD)', type: 'lifestyle', reason: 'Eliminates fermentable carbs that feed dysbiotic bacteria. Strong anecdotal and emerging RCT evidence in IBD.' },
    { name: 'Methylfolate supplementation', type: 'natural', reason: 'Bypasses the DHFR inhibition mesalamine causes. Always pair with mesalamine — not optional.' },
  ],
  methotrexate: [
    { name: 'Leucovorin (folinic acid) rescue', type: 'pharmaceutical', reason: 'Standard of care to mitigate methotrexate folate depletion. Always paired.' },
    { name: 'Sulfasalazine', type: 'pharmaceutical', reason: 'For IBD-related arthritis — folate depletion less severe.' },
    { name: 'Methylfolate (NOT folic acid)', type: 'natural', reason: 'Synthetic folic acid blocks methotrexate efficacy. Methylfolate is bioactive and safer.' },
  ],
  ustekinumab: [
    { name: 'Risankizumab (Skyrizi)', type: 'pharmaceutical', reason: 'IL-23 selective inhibitor — newer biologic with stronger IBD efficacy data, less infection risk.' },
    { name: 'Vedolizumab (Entyvio)', type: 'pharmaceutical', reason: 'Gut-selective integrin inhibitor — no systemic immunosuppression, much lower infection risk.' },
    { name: 'Adalimumab (Humira)', type: 'pharmaceutical', reason: 'Anti-TNF — different mechanism. Switch if losing response to ustekinumab.' },
    { name: 'Curcumin + boswellia', type: 'natural', reason: 'Anti-inflammatory adjuncts for ongoing symptoms despite biologic therapy.' },
    { name: 'Specific Carbohydrate Diet or low-FODMAP', type: 'lifestyle', reason: 'Reduces dysbiosis-driven inflammation that biologics alone can\'t address.' },
  ],

  // ── ANTIDEPRESSANTS ─────────────────────────────────────────────────────────
  sertraline: [
    { name: 'Escitalopram (Lexapro)', type: 'pharmaceutical', reason: 'Often better tolerated; cleaner side effect profile.' },
    { name: 'Bupropion (Wellbutrin)', type: 'pharmaceutical', reason: 'NDRI — no sexual side effects, energizing rather than sedating. Different mechanism.' },
    { name: 'Vilazodone (Viibryd)', type: 'pharmaceutical', reason: 'Combined SSRI + 5-HT1A partial agonist. Faster onset, fewer sexual side effects.' },
    { name: 'SAM-e (S-adenosylmethionine)', type: 'natural', reason: 'Multiple RCTs show comparable efficacy to tricyclics for mild-moderate depression.', caution: 'May trigger mania in bipolar; check first.' },
    { name: 'Saffron (Crocus sativus)', type: 'natural', reason: 'RCT-backed; comparable to fluoxetine for mild-moderate depression at 30mg/day.' },
    { name: 'Omega-3 high EPA (>2g)', type: 'natural', reason: 'EPA-dominant formulations show antidepressant effect in meta-analyses, especially as adjunct.' },
    { name: 'CBT or psychodynamic therapy', type: 'lifestyle', reason: 'STAR*D and many RCTs: equivalent efficacy to SSRIs for mild-moderate depression, with longer-lasting effects.' },
    { name: 'Aerobic exercise (150 min/week)', type: 'lifestyle', reason: 'Meta-analyses show effect sizes comparable to SSRIs. Better for prevention of relapse.' },
  ],

  // ── THYROID ────────────────────────────────────────────────────────────────
  levothyroxine: [
    { name: 'Liothyronine (Cytomel) added', type: 'pharmaceutical', reason: 'For poor T4→T3 converters. Combination T4/T3 therapy improves symptoms in some patients with persistent hypothyroid symptoms despite normal TSH.' },
    { name: 'Desiccated thyroid (Armour, NP Thyroid)', type: 'pharmaceutical', reason: 'Contains both T4 and T3 plus calcitonin. Some patients feel significantly better than on levothyroxine alone.', caution: 'Not standardized like synthetic; requires careful dose titration.' },
    { name: 'Selenium (200 mcg)', type: 'natural', reason: 'Required cofactor for T4→T3 conversion. Especially important for Hashimoto\'s — reduces TPO antibodies in RCTs.' },
    { name: 'Tyrosine + iodine support', type: 'natural', reason: 'Building blocks for thyroid hormone synthesis.', caution: 'Iodine in Hashimoto\'s can worsen autoimmunity — test first.' },
    { name: 'Address gut health (gluten, leaky gut)', type: 'lifestyle', reason: 'Hashimoto\'s strongly linked to celiac and intestinal permeability. Gluten elimination reduces antibodies in many patients.' },
  ],

  // ── DIURETICS ──────────────────────────────────────────────────────────────
  furosemide: [
    { name: 'Torsemide (Demadex)', type: 'pharmaceutical', reason: 'Better bioavailability and longer half-life. Less ototoxicity. Better outcomes data in heart failure.' },
    { name: 'Spironolactone (Aldactone)', type: 'pharmaceutical', reason: 'Potassium-sparing — no electrolyte depletion. Combination therapy reduces dose needed.' },
    { name: 'Magnesium + potassium repletion', type: 'natural', reason: 'Mandatory if continuing furosemide — depletion causes muscle cramps, arrhythmias, fatigue.' },
  ],

  // ── BENZODIAZEPINES ─────────────────────────────────────────────────────────
  alprazolam: [
    { name: 'Buspirone (Buspar)', type: 'pharmaceutical', reason: 'Non-addictive anxiolytic for generalized anxiety. No tolerance or withdrawal.' },
    { name: 'Hydroxyzine (Vistaril)', type: 'pharmaceutical', reason: 'Antihistamine with anxiolytic properties. Non-addictive, useful for occasional anxiety.' },
    { name: 'L-theanine (200mg)', type: 'natural', reason: 'Increases alpha brain waves; calm-alert state. RCT evidence for acute anxiety.' },
    { name: 'Ashwagandha (KSM-66)', type: 'natural', reason: 'Adaptogen with strong RCT evidence for chronic anxiety and cortisol reduction.' },
    { name: 'CBT for anxiety', type: 'lifestyle', reason: 'Long-term first-line treatment. More durable than benzo therapy.' },
  ],

  // ── CONTRACEPTIVES ─────────────────────────────────────────────────────────
  'oral contraceptive': [
    { name: 'Copper IUD (Paragard)', type: 'pharmaceutical', reason: 'Hormone-free contraception; no nutrient depletion of B6/B12/folate/zinc/magnesium.' },
    { name: 'Levonorgestrel IUD (Mirena)', type: 'pharmaceutical', reason: 'Localized progestin, minimal systemic effects. Less depletion than oral OCPs.' },
    { name: 'Progestin-only pill (mini-pill)', type: 'pharmaceutical', reason: 'No estrogen — fewer cardiovascular and depletion concerns.' },
    { name: 'Fertility awareness method (FAM/NFP)', type: 'lifestyle', reason: 'When practiced correctly, comparable efficacy to OCPs. Apps like Natural Cycles are FDA-approved.' },
    { name: 'Methylfolate + B-complex repletion', type: 'natural', reason: 'Mandatory if continuing OCP — depletes B6, B12, folate, zinc, magnesium, CoQ10.' },
  ],
};

export function getAlternatives(medicationName: string): MedicationAlternative[] {
  const key = medicationName.toLowerCase().trim();
  if (MEDICATION_ALTERNATIVES[key]) return MEDICATION_ALTERNATIVES[key];
  // Try matching any key contained in the medication name (handles "Atorvastatin 40mg" etc.)
  for (const [k, v] of Object.entries(MEDICATION_ALTERNATIVES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [];
}
