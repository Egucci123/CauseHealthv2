// supabase/functions/_shared/supplementLabInteractions.ts
//
// Filtered injection of supplement→lab interaction knowledge into the
// wellness-plan prompt. The original prompt listed all 17 entries
// statically on every call; most users take 0–4 supplements so the
// other 13+ entries were dead weight.
//
// This filter matches the user's actual current_supplements list against
// known interactions and returns only the lines that apply. Universal —
// every patient gets the entries that match their actual stack.

interface InteractionRule {
  /** Patterns that match the supplement's name/category. */
  match: RegExp[];
  /** The interaction note that gets injected into the prompt. */
  note: string;
}

const RULES: InteractionRule[] = [
  {
    match: [/biotin/i, /vitamin h/i],
    note: 'Biotin (>1mg/day): falsely alters TSH/T3/T4/Troponin/Vit D — pause 72hr before retest.',
  },
  {
    match: [/creatine\b/i],
    note: 'Creatine: raises serum creatinine ~10–20% (artifact, not kidney damage); use cystatin-C for true GFR.',
  },
  {
    match: [/vitamin d\d?/i, /\bd3\b/i, /cholecalciferol/i, /calciferol/i],
    note: 'Vitamin D3: raises 25-OH-D; if user already on D3, "low D" needs dose review, not new D.',
  },
  {
    match: [/b\s*12/i, /cobalamin/i, /methylcobalamin/i, /hydroxocobalamin/i],
    note: 'B12 supplementation: makes serum B12 unreliable; use MMA/homocysteine if concerned.',
  },
  {
    match: [/^iron\b/i, /ferrous/i, /iron bisglycinate/i, /iron protein/i],
    note: 'Iron: raises ferritin/iron/sat — don\'t add iron without checking current ferritin.',
  },
  {
    match: [/niacin/i, /\bb3\b/i, /nicotinic acid/i, /nicotinamide/i],
    note: 'Niacin (≥500mg): raises HDL, lowers TG/LDL, can elevate ALT/uric acid/glucose.',
  },
  {
    match: [/omega\s*-?\s*3/i, /epa\b/i, /dha\b/i, /fish oil/i, /krill/i],
    note: 'Omega-3 (≥2g EPA/DHA): lowers TG and CRP; thins blood — caution with anticoagulants.',
  },
  {
    match: [/berberine/i],
    note: 'Berberine: lowers fasting glucose/A1c/LDL — overlaps with metformin effect.',
  },
  {
    match: [/magnesium/i, /^mag\b/i],
    note: 'Magnesium: corrects suboptimal Mg, supports BP and insulin sensitivity.',
  },
  {
    match: [/vitamin k\s*2?/i, /menaquinone/i, /\bmk-?7\b/i],
    note: 'Vitamin K2: critical with warfarin (affects INR) — never recommend without MD.',
  },
  {
    match: [/dhea/i],
    note: 'DHEA: raises DHEA-S, downstream estradiol/testosterone.',
  },
  {
    match: [/testosterone/i, /\btrt\b/i, /androgel/i],
    note: 'TRT/testosterone: raises Hct (polycythemia risk), suppresses LH/FSH.',
  },
  {
    match: [/whey/i, /casein/i, /protein powder/i, /^protein\b/i],
    note: 'Whey/high protein: raises BUN slightly (not kidney pathology).',
  },
  {
    match: [/curcumin/i, /turmeric/i],
    note: 'Curcumin: lowers CRP and ALT; mild blood thinner.',
  },
  {
    match: [/\btmg\b/i, /trimethylglycine/i, /betaine anhydrous/i, /methylfolate/i, /5-mthf/i],
    note: 'TMG/methylfolate/B12: lowers homocysteine.',
  },
  {
    match: [/saw palmetto/i, /serenoa/i],
    note: 'Saw palmetto: can lower PSA (mask BPH/cancer detection).',
  },
  {
    match: [/ashwagandha/i, /withania/i],
    note: 'Ashwagandha: lowers cortisol; can raise T4 — caution in hyperthyroid.',
  },
  {
    match: [/vitamin c\b/i, /ascorbic acid/i, /ascorbate/i],
    note: 'Vitamin C high-dose: can raise serum glucose readings on some glucometers.',
  },
];

// ── Drug-class interaction warnings for the PRACTICAL_NOTE field ──────
// These were a static list in the prompt's PRACTICAL_NOTE rule. Only a
// few apply per patient depending on their meds. Build the conditional
// list based on the user's actual medications so the AI only sees the
// flags it could conceivably trigger.

interface DrugInteractionRule {
  /** Regex matched against the user's medication list. */
  med: RegExp[];
  /** Warning text format: "supplement+drug (consequence)" */
  warning: string;
}

const DRUG_INTERACTION_FLAGS: DrugInteractionRule[] = [
  { med: [/statin\b|atorvastatin|rosuvastatin|simvastatin|pravastatin|pitavastatin/i],
    warning: 'berberine+statin (both liver-processed, check with doctor)' },
  { med: [/warfarin|coumadin/i],
    warning: 'vitamin K2+warfarin (affects INR, MD only); curcumin+warfarin (potentiation); omega-3+warfarin (additive bleeding)' },
  { med: [/ssri|sertraline|fluoxetine|escitalopram|citalopram|paroxetine/i],
    warning: 'St John\'s Wort+SSRI (serotonin syndrome — never combine)' },
  { med: [/levothyroxine|synthroid|t4|liothyronine|cytomel/i],
    warning: 'calcium/iron+levothyroxine (separate by 4 hours); magnesium+levothyroxine (2 hours)' },
  { med: [/antibiotic|amoxicillin|azithromycin|doxycycline|cipro|levofloxacin|tetracycline/i],
    warning: 'magnesium/calcium/iron+antibiotic (separate by 2 hours)' },
  { med: [/aspirin|clopidogrel|plavix|apixaban|eliquis|rivaroxaban|xarelto/i],
    warning: 'curcumin+blood thinner (potentiation); omega-3+anticoagulant (caution)' },
  { med: [/finasteride|tamoxifen|aromatase inhibitor|leuprolide|estrogen-receptor/i],
    warning: 'DHEA+hormone-cancer history (avoid); saw palmetto+PSA monitoring (masks BPH/cancer)' },
];

/** Build the prompt-injectable list of drug-supplement interaction
 *  warnings for THIS patient's meds. Returns either:
 *  - "High-impact interactions to flag if relevant: ..." (specific list)
 *  - empty string (no relevant interactions, AI skips this guidance)
 */
export function buildDrugInteractionFlags(medsStr: string): string {
  if (!medsStr || medsStr.trim().toLowerCase() === 'none') return '';
  const lower = medsStr.toLowerCase();
  const matched: string[] = [];
  for (const rule of DRUG_INTERACTION_FLAGS) {
    if (rule.med.some(re => re.test(lower))) matched.push(rule.warning);
  }
  if (matched.length === 0) return '';
  return ` High-impact interactions to flag if relevant for THIS patient's meds: ${matched.join('; ')}.`;
}

/** Filter the interaction reference to entries that match the user's
 *  current_supplements list. Returns the formatted block (with header +
 *  closing reminder) ready to inject. Empty string if no matches. */
export function buildSupplementLabInteractionBlock(suppsStr: string): string {
  if (!suppsStr || suppsStr.trim().toLowerCase() === 'none') return '';
  const lower = suppsStr.toLowerCase();
  const matched: string[] = [];
  for (const rule of RULES) {
    if (rule.match.some(re => re.test(lower))) matched.push(rule.note);
  }
  if (matched.length === 0) return '';
  return `SUPPLEMENT-LAB INTERACTION KNOWLEDGE (the user is on these — interpret labs accordingly):
${matched.map(n => `- ${n}`).join('\n')}
If the user is on a supplement that explains an "abnormal" lab (e.g., creatine→creatinine, biotin→TSH), call that out in summary instead of treating it as pathology.

`;
}
