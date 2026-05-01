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
    genericName: 'Atorvastatin', brandNames: ['Lipitor'], drugClass: 'Statin',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'critical', mechanism: 'Statins lower cholesterol by blocking the same pathway your body uses to make CoQ10 — the molecule your muscles and heart need to produce energy. Less CoQ10 means muscles run out of fuel faster.', clinical_effects: ['Muscle pain and weakness', 'Exercise intolerance', 'Fatigue', 'Possible heart strain'], intervention: 'Supplement with Ubiquinol (the absorbable form) — most patients on statins should add this.', dose: '200–400mg daily', form: 'Ubiquinol (not Ubiquinone)', timing: 'With largest meal — fat-soluble' },
      { nutrient: 'Vitamin D', severity: 'moderate', mechanism: 'Statins can lower vitamin D levels because cholesterol is the building block your skin uses to make vitamin D from sunlight.', clinical_effects: ['Worsened muscle pain on the statin', 'Lower immune resilience', 'Bone density loss over time'], intervention: 'Ask your doctor to check 25-OH vitamin D. Supplement only if below 50 ng/mL.', dose: '2000–5000 IU daily (after testing)', form: 'Vitamin D3 (cholecalciferol)', timing: 'With fatty meal' },
    ],
    interactions: ['fibrates', 'niacin', 'amiodarone'], notes: 'Muscle pain risk goes up at doses above 40mg/day.',
  },
  rosuvastatin: {
    genericName: 'Rosuvastatin', brandNames: ['Crestor'], drugClass: 'Statin',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'critical', mechanism: 'Like all statins: lowering cholesterol also lowers CoQ10, the energy molecule muscles depend on.', clinical_effects: ['Muscle pain and weakness', 'Fatigue', 'Exercise intolerance'], intervention: 'Supplement Ubiquinol — standard pairing for anyone on a statin.', dose: '200–400mg daily', form: 'Ubiquinol', timing: 'With largest meal' },
    ],
    interactions: ['fibrates', 'niacin'],
  },
  simvastatin: {
    genericName: 'Simvastatin', brandNames: ['Zocor'], drugClass: 'Statin',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'critical', mechanism: 'Same as other statins: blocks the cholesterol pathway your body also uses to build CoQ10 for muscle energy.', clinical_effects: ['Muscle pain', 'Severe muscle breakdown at high doses', 'Fatigue'], intervention: 'Ubiquinol — especially important at 40mg or higher.', dose: '200–400mg daily', form: 'Ubiquinol', timing: 'With fat-containing meal' },
      { nutrient: 'Vitamin D', severity: 'moderate', mechanism: 'Statins reduce the cholesterol your skin needs to convert sunlight into vitamin D.', clinical_effects: ['Lower immunity', 'Bone density concerns'], intervention: 'Test first; supplement only if low.', dose: '2000–4000 IU daily (after testing)', form: 'Vitamin D3', timing: 'With meal' },
    ],
    interactions: ['amiodarone', 'verapamil', 'diltiazem', 'fibrates'],
  },
  omeprazole: {
    genericName: 'Omeprazole', brandNames: ['Prilosec', 'Zegerid'], drugClass: 'Acid Reducer (PPI)',
    depletions: [
      { nutrient: 'Vitamin B12', severity: 'critical', mechanism: 'Your stomach needs acid to release B12 from food. PPIs shut off most stomach acid, so B12 from food gets locked away.', clinical_effects: ['Numbness or tingling in hands and feet', 'Anemia', 'Brain fog', 'Fatigue', 'Low mood'], intervention: 'Ask your doctor to test B12 (and MMA if borderline). If low, use sublingual methylcobalamin.', dose: '1000mcg daily sublingual (after testing)', form: 'Methylcobalamin sublingual', timing: 'Held under the tongue', contraindications: ["Leber's disease (cyanocobalamin form)"] },
      { nutrient: 'Magnesium', severity: 'significant', mechanism: 'Long-term PPI use blocks how your gut absorbs magnesium. The FDA flagged this in 2011.', clinical_effects: ['Muscle cramps', 'Irregular heartbeat', 'Low calcium symptoms'], intervention: 'Ask your doctor to check magnesium. Empirical magnesium glycinate is reasonable after 2+ years on a PPI.', dose: '200–400mg elemental daily', form: 'Magnesium glycinate (best tolerated)', timing: 'With food, split into 2 doses' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Stomach acid helps release zinc from food. Less acid means less zinc absorbed.', clinical_effects: ['Frequent infections', 'Slow wound healing', 'Hair thinning'], intervention: 'Test zinc + copper first; supplement if low.', dose: '15–30mg elemental daily (after testing)', form: 'Zinc bisglycinate or picolinate', timing: 'With food' },
      { nutrient: 'Iron', severity: 'moderate', mechanism: 'Stomach acid converts iron from food into the form your gut can absorb. PPIs reduce that conversion.', clinical_effects: ['Iron-deficiency anemia', 'Fatigue', 'Brain fog'], intervention: 'ALWAYS test ferritin, iron, TIBC, and saturation first — never supplement iron blind.', dose: 'Per iron panel results — do not supplement without testing', form: 'Ferrous bisglycinate', timing: 'Separate from PPI by 4+ hours; take with vitamin C' },
      { nutrient: 'Calcium', severity: 'moderate', mechanism: 'Calcium carbonate (the cheap form) needs stomach acid to dissolve. Calcium citrate works without acid.', clinical_effects: ['Higher fracture risk over time', 'Bone density loss'], intervention: 'If you take calcium, switch to calcium citrate. PPI users should never take calcium carbonate.', dose: '500mg calcium citrate twice daily', form: 'Calcium citrate ONLY', timing: 'With meals, split doses' },
    ],
    interactions: ['metformin', 'methotrexate', 'clopidogrel'], notes: 'After 1+ year of daily PPI use, depletions get noticeably worse.',
  },
  pantoprazole: {
    genericName: 'Pantoprazole', brandNames: ['Protonix'], drugClass: 'Acid Reducer (PPI)',
    depletions: [
      { nutrient: 'Vitamin B12', severity: 'critical', mechanism: 'Stomach acid is needed to free B12 from food. PPIs block that acid.', clinical_effects: ['Numbness or tingling', 'Anemia', 'Brain fog'], intervention: 'Test B12 first; supplement methylcobalamin if low.', dose: '1000mcg daily sublingual (after testing)', form: 'Methylcobalamin', timing: 'Sublingual' },
      { nutrient: 'Magnesium', severity: 'significant', mechanism: 'PPIs reduce how well your gut absorbs magnesium.', clinical_effects: ['Muscle cramps', 'Irregular heartbeat', 'Low calcium'], intervention: 'Ask doctor to check magnesium; empirical glycinate reasonable after 2+ years.', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Less stomach acid means less zinc gets absorbed from food.', clinical_effects: ['Frequent infections', 'Hair thinning'], intervention: 'Test first; supplement if low.', dose: '15–30mg daily (after testing)', form: 'Zinc bisglycinate', timing: 'With food' },
    ],
    interactions: ['metformin'],
  },
  metformin: {
    genericName: 'Metformin', brandNames: ['Glucophage', 'Fortamet', 'Glumetza'], drugClass: 'Diabetes (Biguanide)',
    depletions: [
      { nutrient: 'Vitamin B12', severity: 'critical', mechanism: 'Metformin blocks the part of your small intestine that absorbs B12. The longer you take it, the worse it gets.', clinical_effects: ['Numbness or tingling in hands and feet (often blamed on diabetes itself)', 'Anemia', 'Brain fog', 'Higher homocysteine on labs'], intervention: 'Annual B12 + MMA + homocysteine testing. Empirical B12 is reasonable after 5+ years on metformin.', dose: '1000–2000mcg daily sublingual (test first if possible)', form: 'Methylcobalamin sublingual', timing: 'Sublingual, separated from metformin' },
      { nutrient: 'Folate (B9)', severity: 'significant', mechanism: 'Metformin reduces how much folate your gut absorbs from food.', clinical_effects: ['Higher homocysteine on labs', 'Cardiovascular risk', 'Anemia'], intervention: 'Ask your doctor to test serum folate + RBC folate first. If low, methylfolate (not folic acid).', dose: '400–800mcg methylfolate daily (after testing)', form: 'Methylfolate (5-MTHF)', timing: 'With meal' },
    ],
    interactions: ['ppis', 'h2_blockers'], notes: 'The American Diabetes Association recommends checking B12 yearly for anyone on metformin.',
  },
  mesalamine: {
    genericName: 'Mesalamine', brandNames: ['Asacol', 'Pentasa', 'Lialda', 'Delzicol'], drugClass: 'Anti-inflammatory (IBD)',
    depletions: [
      { nutrient: 'Folate (B9)', severity: 'significant', mechanism: 'Mesalamine blocks the enzyme your body uses to recycle folate. Folate runs low even with a normal diet.', clinical_effects: ['Higher homocysteine on labs', 'Anemia', 'Hair thinning', 'Pregnancy risk if folate is low'], intervention: 'Ask your doctor to test serum folate + RBC folate. If low, methylfolate (NOT regular folic acid).', dose: '400–800mcg methylfolate daily (after testing)', form: 'Methylfolate (5-MTHF) — NOT folic acid', timing: 'With meal' },
      { nutrient: 'Vitamin B12', severity: 'moderate', mechanism: 'IBD inflammation in the small intestine reduces B12 absorption — this is from the disease itself, not directly the drug.', clinical_effects: ['Numbness or tingling', 'Fatigue', 'Anemia'], intervention: 'Test B12 + MMA first; supplement methylcobalamin if low.', dose: '1000mcg daily (after testing)', form: 'Methylcobalamin', timing: 'Sublingual for best absorption' },
    ],
    interactions: ['methotrexate', 'warfarin'], notes: 'Hair thinning on mesalamine is often low folate — not the IBD itself. Worth testing.',
  },
  methotrexate: {
    genericName: 'Methotrexate', brandNames: ['Rheumatrex', 'Trexall', 'Otrexup'], drugClass: 'Immunosuppressant (DMARD)',
    depletions: [
      { nutrient: 'Folate (B9)', severity: 'critical', mechanism: 'Methotrexate works by blocking folate — that is how it slows the immune system. So it always lowers folate.', clinical_effects: ['Mouth sores', 'Stomach upset', 'Anemia', 'Liver strain', 'Hair loss'], intervention: 'Folate replacement is standard with methotrexate. Use leucovorin or methylfolate — NOT plain folic acid. Coordinate timing with your rheumatologist.', dose: '5mg folinic acid within 24h of MTX dose, then 1mg methylfolate on non-MTX days', form: 'Folinic acid (leucovorin) or methylfolate', timing: 'Do NOT take on the same day as methotrexate', contraindications: ['Do not take folic acid within 24 hours of MTX dose'] },
    ],
    interactions: ['NSAIDs', 'PPIs', 'trimethoprim'], notes: 'Folate replacement is standard of care with methotrexate — your rheumatologist should already have this set up.',
  },
  metoprolol: {
    genericName: 'Metoprolol', brandNames: ['Lopressor', 'Toprol-XL'], drugClass: 'Beta Blocker',
    depletions: [
      { nutrient: 'CoQ10 (Ubiquinol)', severity: 'significant', mechanism: 'Beta blockers reduce CoQ10 — the molecule your heart and muscles use for energy.', clinical_effects: ['Fatigue', 'Exercise intolerance', 'Shortness of breath'], intervention: 'Ubiquinol is reasonable to add — long safety record.', dose: '200–300mg Ubiquinol daily', form: 'Ubiquinol', timing: 'With meal' },
      { nutrient: 'Melatonin', severity: 'moderate', mechanism: 'Beta blockers block the signal your brain uses to make melatonin at night, so sleep gets disrupted.', clinical_effects: ['Trouble falling asleep', 'Poor sleep quality', 'Fatigue'], intervention: 'Low-dose melatonin before bed if sleep is affected.', dose: '0.5–3mg melatonin', form: 'Immediate-release melatonin', timing: '30–60 minutes before bedtime' },
    ],
    interactions: ['statins', 'calcium_channel_blockers'],
  },
  furosemide: {
    genericName: 'Furosemide', brandNames: ['Lasix'], drugClass: 'Loop Diuretic',
    depletions: [
      { nutrient: 'Potassium', severity: 'critical', mechanism: 'Loop diuretics make your kidneys flush out a lot of potassium along with the extra fluid.', clinical_effects: ['Irregular heartbeat', 'Muscle weakness', 'Cramping', 'Fatigue'], intervention: 'Your doctor must monitor potassium and prescribe replacement — never supplement on your own.', dose: '20–40mEq potassium daily (prescription only)', form: 'Potassium chloride (prescription)', timing: 'With food', contraindications: ['Do not supplement without monitoring serum potassium'] },
      { nutrient: 'Magnesium', severity: 'significant', mechanism: 'Same flushing effect drains magnesium too. Low magnesium also makes potassium harder to keep up.', clinical_effects: ['Muscle cramps', 'Irregular heartbeat', 'Worse potassium loss'], intervention: 'Magnesium glycinate — replace alongside potassium.', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Extra urine output also drains zinc.', clinical_effects: ['Frequent infections', 'Slow wound healing'], intervention: 'Zinc bisglycinate', dose: '15–25mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
      { nutrient: 'Thiamine (B1)', severity: 'significant', mechanism: 'Loop diuretics flush out thiamine — and thiamine is critical for the heart, especially in heart failure.', clinical_effects: ['Worsening heart failure', 'Numbness in feet', 'Confusion (severe cases)'], intervention: 'Thiamine supplementation is reasonable for anyone on chronic loop diuretics.', dose: '100–300mg daily', form: 'Thiamine HCl or benfotiamine', timing: 'With meal' },
    ],
    interactions: ['statins', 'digoxin'],
  },
  hydrochlorothiazide: {
    genericName: 'Hydrochlorothiazide', brandNames: ['HCTZ', 'Microzide'], drugClass: 'Thiazide Diuretic',
    depletions: [
      { nutrient: 'Potassium', severity: 'significant', mechanism: 'Thiazides flush potassium out through the kidneys, just less aggressively than loop diuretics.', clinical_effects: ['Irregular heartbeat', 'Muscle weakness', 'Fatigue'], intervention: 'Eat potassium-rich foods; supplement only with doctor monitoring.', dose: '20–40mEq — per monitoring', form: 'Potassium citrate', timing: 'With food' },
      { nutrient: 'Magnesium', severity: 'moderate', mechanism: 'Same flushing effect drains magnesium.', clinical_effects: ['Muscle cramps', 'Compounds potassium loss'], intervention: 'Magnesium glycinate', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Extra urine output drains zinc.', clinical_effects: ['Frequent infections'], intervention: 'Zinc bisglycinate', dose: '15–25mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
    ],
    interactions: ['NSAIDs', 'lithium'],
  },
  sertraline: {
    genericName: 'Sertraline', brandNames: ['Zoloft'], drugClass: 'Antidepressant (SSRI)',
    depletions: [
      { nutrient: 'Folate (B9)', severity: 'significant', mechanism: 'SSRIs reduce folate absorption. People with low folate often respond worse to SSRIs.', clinical_effects: ['Higher homocysteine on labs', 'SSRI not working as well', 'Fatigue'], intervention: 'Test serum folate + RBC folate first. If low, methylfolate can help the SSRI work better.', dose: '400–800mcg methylfolate daily (after testing)', form: 'Methylfolate (5-MTHF)', timing: 'Morning with meal' },
      { nutrient: 'Melatonin', severity: 'moderate', mechanism: 'SSRIs change how serotonin gets converted into melatonin at night, which can disrupt sleep.', clinical_effects: ['Trouble falling asleep', 'Poor sleep quality'], intervention: 'Low-dose melatonin before bed.', dose: '0.5–1mg', form: 'Immediate release melatonin', timing: '30 min before bedtime' },
    ],
    interactions: ['MAOIs', 'triptans', 'tramadol'],
  },
  prednisone: {
    genericName: 'Prednisone', brandNames: ['Deltasone', 'Rayos'], drugClass: 'Corticosteroid',
    depletions: [
      { nutrient: 'Calcium', severity: 'critical', mechanism: 'Steroids block calcium absorption, drain it through urine, AND slow down the cells that build new bone — three hits at once. That is why long-term steroids cause osteoporosis.', clinical_effects: ['Bone loss (osteoporosis)', 'Fracture risk', 'Hip joint damage with long use'], intervention: 'Bone protection set: calcium citrate + Vitamin D3 + Vitamin K2. Ask your doctor to coordinate.', dose: '1000–1500mg calcium citrate daily, 4000 IU D3, 100–200mcg K2 MK-7', form: 'Calcium citrate (not carbonate), D3, MK-7', timing: 'Split calcium doses with meals; D3 with fat' },
      { nutrient: 'Potassium', severity: 'significant', mechanism: 'Steroids cause your body to hold sodium and dump potassium.', clinical_effects: ['Low potassium', 'Weakness', 'Irregular heartbeat'], intervention: 'Eat potassium-rich foods; doctor monitoring for replacement.', dose: 'Per monitoring', form: 'Potassium citrate', timing: 'With food' },
      { nutrient: 'Vitamin D', severity: 'significant', mechanism: 'Steroids interfere with how your body activates and uses vitamin D.', clinical_effects: ['Worse bone loss', 'Lower immunity'], intervention: 'Higher-dose D3 is part of the bone-protection set.', dose: '4000–6000 IU daily', form: 'Vitamin D3', timing: 'With fat-containing meal' },
      { nutrient: 'Magnesium', severity: 'moderate', mechanism: 'More magnesium gets flushed in urine.', clinical_effects: ['Muscle weakness', 'Cramping', 'Bone loss'], intervention: 'Magnesium glycinate', dose: '200–400mg daily', form: 'Magnesium glycinate', timing: 'With food' },
      { nutrient: 'Zinc', severity: 'moderate', mechanism: 'Steroids increase how much zinc you lose through urine.', clinical_effects: ['Frequent infections', 'Slow wound healing'], intervention: 'Zinc bisglycinate', dose: '15–30mg daily', form: 'Zinc bisglycinate', timing: 'With food' },
    ],
    interactions: ['NSAIDs', 'diuretics', 'statins'], notes: 'For steroid use longer than 3 months, the bone-protection set (calcium citrate + D3 + K2) is standard care.',
  },
  ustekinumab: {
    genericName: 'Ustekinumab', brandNames: ['Stelara'], drugClass: 'Biologic (IL-12/23 inhibitor)',
    depletions: [],
    interactions: ['live vaccines'], notes: 'Targeted biologics like Stelara work by blocking specific immune signals — they don\'t cause the broad nutrient depletions that small-molecule drugs do. Worth watching: vitamin D (immune modulation), and infection risk means baseline labs and vaccine planning matter more than supplementation.',
  },
  adalimumab: {
    genericName: 'Adalimumab', brandNames: ['Humira'], drugClass: 'Biologic (Anti-TNF)',
    depletions: [],
    interactions: ['live vaccines', 'methotrexate (often co-prescribed)'], notes: 'Anti-TNF biologics like Humira target one immune pathway and don\'t deplete nutrients the way oral immunosuppressants do. The bigger concerns are infection screening (TB, hepatitis), vaccine timing, and watching for the conditions Humira treats (IBD, RA, psoriasis) — each has its own nutrient priorities.',
  },
  infliximab: {
    genericName: 'Infliximab', brandNames: ['Remicade', 'Inflectra', 'Renflexis'], drugClass: 'Biologic (Anti-TNF)',
    depletions: [],
    interactions: ['live vaccines', 'methotrexate (often co-prescribed)'], notes: 'Like Humira, Remicade is targeted — it doesn\'t cause the kind of nutrient depletions oral immunosuppressants do. Active IBD itself often drives iron, B12, vitamin D, and folate deficiencies, so labs should track those even though the drug isn\'t directly causing them.',
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
