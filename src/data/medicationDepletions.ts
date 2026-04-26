// src/data/medicationDepletions.ts
// Complete clinical medication-nutrient depletion database

export interface DepletionEntry {
  nutrient: string; severity: 'critical' | 'significant' | 'moderate';
  mechanism: string; clinical_effects: string[]; intervention: string;
  dose: string; form: string; timing: string; contraindications?: string[];
}

export interface MedicationAlternative {
  name: string;
  type: 'pharmaceutical' | 'natural' | 'lifestyle';
  reason: string;
  caution?: string;
}

export interface MedicationDepletionProfile {
  genericName: string; brandNames: string[]; drugClass: string;
  depletions: DepletionEntry[]; interactions: string[]; notes?: string;
  alternatives?: MedicationAlternative[];
}

export const MEDICATION_DEPLETIONS: Record<string, MedicationDepletionProfile> = {
  atorvastatin: {
    genericName: 'Atorvastatin', brandNames: ['Lipitor'], drugClass: 'HMG-CoA Reductase Inhibitor (Statin)',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'critical', mechanism: 'Statins block the mevalonate pathway, required for both cholesterol and CoQ10 synthesis. CoQ10 is essential for mitochondrial energy production.', clinical_effects: ['Muscle pain and weakness (myopathy)', 'Exercise intolerance', 'Fatigue', 'Heart failure risk'], intervention: 'Supplement with Ubiquinol (reduced form) — better absorbed than Ubiquinone', dose: '200–400mg daily', form: 'Ubiquinol (not Ubiquinone)', timing: 'With largest meal — fat-soluble' },
      { nutrient: 'Vitamin D', severity: 'moderate', mechanism: 'Statins alter vitamin D metabolism through cholesterol synthesis pathway interference.', clinical_effects: ['Worsened statin myopathy', 'Immune dysfunction', 'Bone density loss'], intervention: 'Monitor serum 25-OH-D. Supplement if below 50 ng/mL.', dose: '2000–5000 IU daily', form: 'Vitamin D3 (cholecalciferol)', timing: 'With fatty meal' },
    ],
    interactions: ['fibrates', 'niacin', 'amiodarone'], notes: 'Myopathy risk is dose-dependent. Risk increases significantly at doses above 40mg/day.',
  },
  rosuvastatin: {
    genericName: 'Rosuvastatin', brandNames: ['Crestor'], drugClass: 'HMG-CoA Reductase Inhibitor (Statin)',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'critical', mechanism: 'Same mevalonate pathway blockade as all statins.', clinical_effects: ['Muscle pain and weakness', 'Fatigue', 'Exercise intolerance'], intervention: 'Ubiquinol supplementation', dose: '200–400mg daily', form: 'Ubiquinol', timing: 'With largest meal' },
    ],
    interactions: ['fibrates', 'niacin'],
  },
  simvastatin: {
    genericName: 'Simvastatin', brandNames: ['Zocor'], drugClass: 'HMG-CoA Reductase Inhibitor (Statin)',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'critical', mechanism: 'Mevalonate pathway blockade.', clinical_effects: ['Myopathy', 'Rhabdomyolysis risk at high doses', 'Fatigue'], intervention: 'Ubiquinol supplementation — especially critical at doses ≥40mg', dose: '200–400mg daily', form: 'Ubiquinol', timing: 'With fat-containing meal' },
      { nutrient: 'Vitamin D', severity: 'moderate', mechanism: 'Cholesterol precursor pathway interference.', clinical_effects: ['Immune dysfunction', 'Bone density concerns'], intervention: 'Monitor and supplement', dose: '2000–4000 IU daily', form: 'Vitamin D3', timing: 'With meal' },
    ],
    interactions: ['amiodarone', 'verapamil', 'diltiazem', 'fibrates'],
  },
  omeprazole: {
    genericName: 'Omeprazole', brandNames: ['Prilosec', 'Zegerid'], drugClass: 'Proton Pump Inhibitor (PPI)',
    depletions: [
      { nutrient: 'Vitamin B12', severity: 'critical', mechanism: 'B12 absorption requires gastric acid to cleave it from food proteins. PPIs dramatically reduce gastric acid.', clinical_effects: ['Peripheral neuropathy', 'Megaloblastic anemia', 'Cognitive decline', 'Fatigue', 'Depression'], intervention: 'Methylcobalamin preferred — bypasses absorption issue', dose: '1000mcg daily sublingual', form: 'Methylcobalamin sublingual', timing: 'Sublingual — held under tongue', contraindications: ["Leber's disease (cyanocobalamin form)"] },
      { nutrient: 'Magnesium', severity: 'significant', mechanism: 'PPIs impair active magnesium transport. FDA issued a warning in 2011.', clinical_effects: ['Muscle cramps and spasms', 'Cardiac arrhythmias', 'Hypomagnesemia-induced hypocalcemia'], intervention: 'Supplement and monitor serum magnesium', dose: '200–400mg elemental daily', form: 'Magnesium glycinate (best tolerated)', timing: 'With food, split into 2 doses' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Gastric acid required for optimal zinc absorption.', clinical_effects: ['Immune dysfunction', 'Poor wound healing', 'Hair loss'], intervention: 'Supplement with chelated zinc', dose: '15–30mg elemental daily', form: 'Zinc bisglycinate or picolinate', timing: 'With food' },
      { nutrient: 'Iron', severity: 'moderate', mechanism: 'Gastric acid converts ferric iron to ferrous iron. PPIs reduce this conversion.', clinical_effects: ['Iron deficiency anemia', 'Fatigue', 'Cognitive issues'], intervention: 'Take iron with vitamin C — not at same time as PPI', dose: 'Per iron panel results — do not supplement without testing', form: 'Ferrous bisglycinate', timing: 'Separate from PPI by 4+ hours; take with vitamin C' },
      { nutrient: 'Calcium', severity: 'moderate', mechanism: 'Calcium carbonate requires gastric acid for dissolution. Calcium citrate is absorbed acid-independently.', clinical_effects: ['Increased fracture risk (FDA warning)', 'Osteoporosis'], intervention: 'Use calcium citrate only — not carbonate in PPI users', dose: '500mg calcium citrate twice daily', form: 'Calcium citrate ONLY', timing: 'With meals, split doses' },
    ],
    interactions: ['metformin', 'methotrexate', 'clopidogrel'], notes: 'Long-term PPI use (>1 year) substantially increases depletion severity.',
  },
  pantoprazole: {
    genericName: 'Pantoprazole', brandNames: ['Protonix'], drugClass: 'Proton Pump Inhibitor (PPI)',
    depletions: [
      { nutrient: 'Vitamin B12', severity: 'critical', mechanism: 'Gastric acid suppression impairs B12 release from food proteins.', clinical_effects: ['Neuropathy', 'Anemia', 'Cognitive decline'], intervention: 'Methylcobalamin sublingual', dose: '1000mcg daily sublingual', form: 'Methylcobalamin', timing: 'Sublingual' },
      { nutrient: 'Magnesium', severity: 'significant', mechanism: 'Impaired intestinal magnesium transport.', clinical_effects: ['Muscle cramps', 'Arrhythmias', 'Hypocalcemia'], intervention: 'Magnesium glycinate supplementation', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Reduced gastric acid impairs zinc absorption.', clinical_effects: ['Immune dysfunction', 'Hair loss'], intervention: 'Zinc bisglycinate', dose: '15–30mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
    ],
    interactions: ['metformin'],
  },
  metformin: {
    genericName: 'Metformin', brandNames: ['Glucophage', 'Fortamet', 'Glumetza'], drugClass: 'Biguanide (Type 2 Diabetes)',
    depletions: [
      { nutrient: 'Vitamin B12', severity: 'critical', mechanism: 'Metformin competitively inhibits calcium-dependent B12-intrinsic factor complex absorption in the terminal ileum. Dose-dependent and worsens with duration.', clinical_effects: ['Peripheral neuropathy (often misattributed to diabetic neuropathy)', 'Megaloblastic anemia', 'Cognitive decline', 'Elevated homocysteine'], intervention: 'Annual B12 monitoring. Methylcobalamin preferred.', dose: '1000–2000mcg daily sublingual', form: 'Methylcobalamin sublingual', timing: 'Sublingual away from metformin' },
      { nutrient: 'Folate (B9)', severity: 'significant', mechanism: 'Metformin reduces intestinal folate absorption and may impair folate metabolism.', clinical_effects: ['Elevated homocysteine', 'Cardiovascular risk', 'Megaloblastic anemia'], intervention: 'Use methylfolate (not folic acid) to bypass MTHFR issues', dose: '400–800mcg methylfolate daily', form: 'Methylfolate (5-MTHF)', timing: 'With meal' },
    ],
    interactions: ['ppis', 'h2_blockers'], notes: 'ADA guidelines recommend annual B12 monitoring for all metformin users.',
  },
  mesalamine: {
    genericName: 'Mesalamine', brandNames: ['Asacol', 'Pentasa', 'Lialda', 'Delzicol'], drugClass: '5-Aminosalicylic Acid (IBD)',
    depletions: [
      { nutrient: 'Folate (B9)', severity: 'significant', mechanism: 'Mesalamine inhibits dihydrofolate reductase, impairing folate synthesis and recycling.', clinical_effects: ['Elevated homocysteine', 'Megaloblastic anemia', 'Hair thinning and loss', 'Neural tube defects in pregnancy'], intervention: 'Use methylfolate — bypasses DHFR inhibition', dose: '400–800mcg methylfolate daily', form: 'Methylfolate (5-MTHF) — NOT folic acid', timing: 'With meal' },
      { nutrient: 'Vitamin B12', severity: 'moderate', mechanism: 'GI inflammation from IBD itself impairs B12 absorption in the terminal ileum.', clinical_effects: ['Neuropathy', 'Fatigue', 'Anemia'], intervention: 'Methylcobalamin supplementation', dose: '1000mcg daily', form: 'Methylcobalamin', timing: 'Sublingual for best absorption' },
    ],
    interactions: ['methotrexate', 'warfarin'], notes: 'Hair loss in IBD patients on mesalamine is often folate deficiency, not the disease itself.',
  },
  methotrexate: {
    genericName: 'Methotrexate', brandNames: ['Rheumatrex', 'Trexall', 'Otrexup'], drugClass: 'Disease-Modifying Antirheumatic Drug (DMARD)',
    depletions: [
      { nutrient: 'Folate (B9)', severity: 'critical', mechanism: 'Methotrexate is a folate antagonist — it directly inhibits dihydrofolate reductase (DHFR), blocking folate synthesis.', clinical_effects: ['Mouth sores (mucositis)', 'GI toxicity', 'Megaloblastic anemia', 'Liver toxicity', 'Hair loss'], intervention: 'Leucovorin or methylfolate — NOT folic acid. Discuss timing with rheumatologist.', dose: '5mg folinic acid within 24h of MTX dose, then 1mg methylfolate on non-MTX days', form: 'Folinic acid (leucovorin) or methylfolate', timing: 'Do NOT take on same day as methotrexate', contraindications: ['Do not take folic acid within 24 hours of MTX dose'] },
    ],
    interactions: ['NSAIDs', 'PPIs', 'trimethoprim'], notes: 'Folate supplementation is standard of care with MTX.',
  },
  metoprolol: {
    genericName: 'Metoprolol', brandNames: ['Lopressor', 'Toprol-XL'], drugClass: 'Beta-1 Selective Adrenergic Blocker',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'significant', mechanism: 'Beta-blockers reduce CoQ10 synthesis by interfering with HMG-CoA reductase activity.', clinical_effects: ['Fatigue', 'Exercise intolerance', 'Worsened heart failure', 'Dyspnea'], intervention: 'CoQ10/Ubiquinol supplementation', dose: '200–300mg Ubiquinol daily', form: 'Ubiquinol', timing: 'With meal' },
      { nutrient: 'Melatonin', severity: 'moderate', mechanism: 'Beta-blockers suppress nocturnal melatonin secretion by blocking beta-adrenergic receptors on the pineal gland.', clinical_effects: ['Insomnia', 'Sleep quality impairment', 'Fatigue'], intervention: 'Low-dose melatonin before bed', dose: '0.5–3mg melatonin', form: 'Immediate-release melatonin', timing: '30–60 minutes before bedtime' },
    ],
    interactions: ['statins', 'calcium_channel_blockers'],
  },
  furosemide: {
    genericName: 'Furosemide', brandNames: ['Lasix'], drugClass: 'Loop Diuretic',
    depletions: [
      { nutrient: 'Potassium', severity: 'critical', mechanism: 'Loop diuretics block Na-K-2Cl cotransporter causing massive potassium wasting.', clinical_effects: ['Cardiac arrhythmias', 'Muscle weakness', 'Cramping', 'Fatigue'], intervention: 'Potassium monitoring and supplementation.', dose: '20–40mEq potassium daily (prescription)', form: 'Potassium chloride (prescription)', timing: 'With food', contraindications: ['Do not supplement without monitoring serum potassium'] },
      { nutrient: 'Magnesium', severity: 'significant', mechanism: 'Loop diuretics increase urinary magnesium excretion. Hypomagnesemia perpetuates hypokalemia.', clinical_effects: ['Muscle cramps', 'Arrhythmias', 'Worsens potassium depletion'], intervention: 'Magnesium glycinate — replace before or alongside potassium', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Increased urinary zinc excretion.', clinical_effects: ['Immune dysfunction', 'Wound healing impairment'], intervention: 'Zinc bisglycinate', dose: '15–25mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
      { nutrient: 'Thiamine (B1)', severity: 'significant', mechanism: 'Loop diuretics increase urinary thiamine excretion. Critical in heart failure patients.', clinical_effects: ['Worsened heart failure', 'Peripheral neuropathy', 'Wernicke encephalopathy'], intervention: 'Thiamine supplementation', dose: '100–300mg daily', form: 'Thiamine HCl or benfotiamine', timing: 'With meal' },
    ],
    interactions: ['statins', 'digoxin'],
  },
  hydrochlorothiazide: {
    genericName: 'Hydrochlorothiazide', brandNames: ['HCTZ', 'Microzide'], drugClass: 'Thiazide Diuretic',
    depletions: [
      { nutrient: 'Potassium', severity: 'significant', mechanism: 'Thiazides inhibit Na-Cl cotransporter causing potassium loss.', clinical_effects: ['Arrhythmias', 'Muscle weakness', 'Fatigue'], intervention: 'Dietary potassium and monitoring', dose: '20–40mEq — per monitoring', form: 'Potassium citrate', timing: 'With food' },
      { nutrient: 'Magnesium', severity: 'moderate', mechanism: 'Increased urinary magnesium excretion.', clinical_effects: ['Muscle cramps', 'Compounds potassium depletion'], intervention: 'Magnesium glycinate', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Increased urinary zinc excretion.', clinical_effects: ['Immune dysfunction'], intervention: 'Zinc bisglycinate', dose: '15–25mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
    ],
    interactions: ['NSAIDs', 'lithium'],
  },
  sertraline: {
    genericName: 'Sertraline', brandNames: ['Zoloft'], drugClass: 'Selective Serotonin Reuptake Inhibitor (SSRI)',
    depletions: [
      { nutrient: 'Folate (B9)', severity: 'significant', mechanism: 'SSRIs reduce dietary folate absorption. Low folate is associated with SSRI non-response.', clinical_effects: ['Elevated homocysteine', 'Antidepressant resistance', 'Fatigue'], intervention: 'Methylfolate augments SSRI response', dose: '400–800mcg methylfolate daily', form: 'Methylfolate (5-MTHF)', timing: 'Morning with meal' },
      { nutrient: 'Melatonin', severity: 'moderate', mechanism: 'SSRIs alter serotonin metabolism disrupting the serotonin-melatonin conversion cycle.', clinical_effects: ['Sleep onset difficulty', 'Sleep quality issues'], intervention: 'Low-dose melatonin', dose: '0.5–1mg', form: 'Immediate release melatonin', timing: '30 min before bedtime' },
    ],
    interactions: ['MAOIs', 'triptans', 'tramadol'],
  },
  prednisone: {
    genericName: 'Prednisone', brandNames: ['Deltasone', 'Rayos'], drugClass: 'Corticosteroid',
    depletions: [
      { nutrient: 'Calcium', severity: 'critical', mechanism: 'Corticosteroids reduce calcium absorption, increase urinary excretion, and suppress osteoblast activity — directly causing bone loss.', clinical_effects: ['Osteoporosis', 'Fracture risk', 'Avascular necrosis (chronic use)'], intervention: 'Calcium citrate + Vitamin D3 + Vitamin K2 — bone protection triad', dose: '1000–1500mg calcium citrate daily, 4000 IU D3, 100–200mcg K2 MK-7', form: 'Calcium citrate (not carbonate), D3, MK-7', timing: 'Split calcium doses with meals; D3 with fat' },
      { nutrient: 'Potassium', severity: 'significant', mechanism: 'Corticosteroids activate mineralocorticoid receptors causing sodium retention and potassium excretion.', clinical_effects: ['Hypokalemia', 'Weakness', 'Arrhythmias'], intervention: 'Dietary potassium and monitoring', dose: 'Per monitoring', form: 'Potassium citrate', timing: 'With food' },
      { nutrient: 'Vitamin D', severity: 'significant', mechanism: 'Corticosteroids impair vitamin D activation and action at the receptor level.', clinical_effects: ['Worsened osteoporosis', 'Immune dysfunction'], intervention: 'Higher dose D3', dose: '4000–6000 IU daily', form: 'Vitamin D3', timing: 'With fat-containing meal' },
      { nutrient: 'Magnesium', severity: 'moderate', mechanism: 'Increased urinary magnesium excretion.', clinical_effects: ['Muscle weakness', 'Cramping', 'Bone loss'], intervention: 'Magnesium glycinate', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Corticosteroids increase urinary zinc excretion.', clinical_effects: ['Immune suppression', 'Poor wound healing'], intervention: 'Zinc bisglycinate', dose: '15–30mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
    ],
    interactions: ['NSAIDs', 'diuretics', 'statins'], notes: 'Bone protection protocol is standard of care for corticosteroid use >3 months.',
  },
};

export const COMPOUNDING_INTERACTIONS: Array<{ drugs: string[]; nutrient: string; risk: 'severe' | 'significant' | 'moderate'; detail: string }> = [
  { drugs: ['metformin', 'omeprazole'], nutrient: 'Vitamin B12', risk: 'severe', detail: 'Metformin impairs B12 absorption at the ileum while PPIs impair release from food proteins. Combined use dramatically accelerates B12 depletion. Annual monitoring is essential.' },
  { drugs: ['metformin', 'pantoprazole'], nutrient: 'Vitamin B12', risk: 'severe', detail: 'Same mechanism as metformin + omeprazole. Combined B12 depletion risk is multiplicative.' },
  { drugs: ['furosemide', 'prednisone'], nutrient: 'Potassium', risk: 'severe', detail: 'Both drugs cause potassium wasting through different mechanisms. Combined use creates severe hypokalemia risk. Regular electrolyte monitoring is mandatory.' },
  { drugs: ['furosemide', 'hydrochlorothiazide'], nutrient: 'Magnesium', risk: 'significant', detail: 'Combining loop and thiazide diuretics compounds magnesium wasting. Hypomagnesemia perpetuates potassium depletion.' },
  { drugs: ['atorvastatin', 'metoprolol'], nutrient: 'CoQ10', risk: 'significant', detail: 'Statins and beta-blockers both deplete CoQ10 through different mechanisms. Combined use roughly doubles CoQ10 depletion.' },
  { drugs: ['mesalamine', 'methotrexate'], nutrient: 'Folate', risk: 'severe', detail: 'Both drugs are folate antagonists. Combined use creates severe folate depletion.' },
  { drugs: ['prednisone', 'omeprazole'], nutrient: 'Calcium', risk: 'significant', detail: 'Prednisone causes calcium malabsorption; omeprazole further impairs calcium carbonate absorption. Use calcium citrate only.' },
];

export function getDepletionProfile(medName: string): MedicationDepletionProfile | null {
  const normalized = medName.toLowerCase().replace(/[^a-z]/g, '');
  for (const [key, profile] of Object.entries(MEDICATION_DEPLETIONS)) {
    if (normalized.includes(key) || key.includes(normalized.slice(0, 6))) return profile;
    if (profile.brandNames.some(bn => { const b = bn.toLowerCase().replace(/[^a-z]/g, ''); return b.includes(normalized) || normalized.includes(b); })) return profile;
  }
  return null;
}

export function getInteractions(medNames: string[]) {
  const normalized = medNames.map(m => m.toLowerCase());
  return COMPOUNDING_INTERACTIONS.filter(interaction =>
    interaction.drugs.every(drug => normalized.some(med => med.includes(drug) || drug.includes(med.split(' ')[0])))
  );
}

export function synthesizeDepletions(medNames: string[]) {
  const nutrientMap = new Map<string, { sources: string[]; maxSeverity: 'critical' | 'significant' | 'moderate'; depletion: DepletionEntry }>();
  const severityRank = { critical: 3, significant: 2, moderate: 1 };

  medNames.forEach(medName => {
    const profile = getDepletionProfile(medName);
    if (!profile) return;
    profile.depletions.forEach(dep => {
      const existing = nutrientMap.get(dep.nutrient);
      if (!existing) { nutrientMap.set(dep.nutrient, { sources: [profile.genericName], maxSeverity: dep.severity, depletion: dep }); }
      else { existing.sources.push(profile.genericName); if (severityRank[dep.severity] > severityRank[existing.maxSeverity]) { existing.maxSeverity = dep.severity; existing.depletion = dep; } }
    });
  });

  return Array.from(nutrientMap.entries()).map(([nutrient, data]) => ({ nutrient, ...data })).sort((a, b) => severityRank[b.maxSeverity] - severityRank[a.maxSeverity]);
}
