// src/data/conditions.ts
export interface Condition {
  name:     string;
  category: string;
  icd10?:   string;
}

export const CONDITIONS: Condition[] = [
  { name: 'High Cholesterol (Hyperlipidemia)',     category: 'Cardiovascular', icd10: 'E78.5' },
  { name: 'Familial Hypercholesterolemia',          category: 'Cardiovascular', icd10: 'E78.01' },
  { name: 'High Blood Pressure (Hypertension)',    category: 'Cardiovascular', icd10: 'I10' },
  { name: 'Atrial Fibrillation',                   category: 'Cardiovascular', icd10: 'I48.91' },
  { name: 'Coronary Artery Disease',               category: 'Cardiovascular', icd10: 'I25.10' },
  { name: 'Heart Failure',                          category: 'Cardiovascular', icd10: 'I50.9' },
  { name: 'Type 2 Diabetes',                       category: 'Metabolic',      icd10: 'E11.9' },
  { name: 'Pre-Diabetes / Insulin Resistance',     category: 'Metabolic',      icd10: 'R73.09' },
  { name: 'Metabolic Syndrome',                    category: 'Metabolic',      icd10: 'E88.81' },
  { name: 'Fatty Liver Disease (NAFLD/MAFLD)',     category: 'Metabolic',      icd10: 'K76.0' },
  { name: 'Obesity',                               category: 'Metabolic',      icd10: 'E66.9' },
  { name: 'High Triglycerides',                    category: 'Metabolic',      icd10: 'E78.1' },
  { name: 'Gout',                                  category: 'Metabolic',      icd10: 'M10.9' },
  { name: 'Ulcerative Colitis (UC)',               category: 'Autoimmune',     icd10: 'K51.90' },
  { name: "Crohn's Disease",                       category: 'Autoimmune',     icd10: 'K50.90' },
  { name: "Hashimoto's Thyroiditis",               category: 'Autoimmune',     icd10: 'E06.3' },
  { name: 'Rheumatoid Arthritis',                  category: 'Autoimmune',     icd10: 'M06.9' },
  { name: 'Psoriasis',                             category: 'Autoimmune',     icd10: 'L40.9' },
  { name: 'Psoriatic Arthritis',                   category: 'Autoimmune',     icd10: 'L40.50' },
  { name: 'Lupus (SLE)',                           category: 'Autoimmune',     icd10: 'M32.9' },
  { name: 'Multiple Sclerosis',                    category: 'Autoimmune',     icd10: 'G35' },
  { name: 'Celiac Disease',                        category: 'Autoimmune',     icd10: 'K90.0' },
  { name: 'Ankylosing Spondylitis',                category: 'Autoimmune',     icd10: 'M45.9' },
  { name: 'Alopecia Areata',                       category: 'Autoimmune',     icd10: 'L63.9' },
  { name: 'Vitiligo',                              category: 'Autoimmune',     icd10: 'L80' },
  { name: 'Hypothyroidism',                        category: 'Thyroid',        icd10: 'E03.9' },
  { name: 'Hyperthyroidism',                       category: 'Thyroid',        icd10: 'E05.90' },
  { name: "Graves' Disease",                       category: 'Thyroid',        icd10: 'E05.00' },
  { name: 'Thyroid Nodules',                       category: 'Thyroid',        icd10: 'E04.9' },
  { name: 'PCOS (Polycystic Ovary Syndrome)',      category: 'Hormonal',       icd10: 'E28.2' },
  { name: 'Low Testosterone (Hypogonadism)',       category: 'Hormonal',       icd10: 'E29.1' },
  { name: 'Adrenal Insufficiency',                 category: 'Hormonal',       icd10: 'E27.40' },
  { name: 'Menopause / Perimenopause',             category: 'Hormonal',       icd10: 'N95.1' },
  { name: 'Endometriosis',                         category: 'Hormonal',       icd10: 'N80.9' },
  { name: 'GERD / Acid Reflux',                   category: 'Gastrointestinal', icd10: 'K21.0' },
  { name: 'IBS (Irritable Bowel Syndrome)',        category: 'Gastrointestinal', icd10: 'K58.9' },
  { name: 'SIBO (Small Intestinal Bacterial Overgrowth)', category: 'Gastrointestinal', icd10: 'K63.4' },
  { name: 'Gastroparesis',                         category: 'Gastrointestinal', icd10: 'K31.84' },
  { name: 'H. Pylori',                             category: 'Gastrointestinal', icd10: 'B96.81' },
  { name: 'Depression',                            category: 'Mental Health',  icd10: 'F32.9' },
  { name: 'Anxiety',                               category: 'Mental Health',  icd10: 'F41.9' },
  { name: 'Bipolar Disorder',                      category: 'Mental Health',  icd10: 'F31.9' },
  { name: 'ADHD',                                  category: 'Mental Health',  icd10: 'F90.9' },
  { name: 'PTSD',                                  category: 'Mental Health',  icd10: 'F43.10' },
  { name: 'Sleep Apnea (Obstructive)',             category: 'Sleep',          icd10: 'G47.33' },
  { name: 'Insomnia',                              category: 'Sleep',          icd10: 'G47.00' },
  { name: 'Fibromyalgia',                          category: 'Musculoskeletal', icd10: 'M79.7' },
  { name: 'Osteoarthritis',                        category: 'Musculoskeletal', icd10: 'M19.90' },
  { name: 'Osteoporosis',                          category: 'Musculoskeletal', icd10: 'M81.0' },
  { name: 'Vitamin D Deficiency',                  category: 'Nutritional',    icd10: 'E55.9' },
  { name: 'Iron Deficiency Anemia',                category: 'Nutritional',    icd10: 'D50.9' },
  { name: 'B12 Deficiency',                        category: 'Nutritional',    icd10: 'D51.9' },
  { name: 'Kidney Disease (CKD)',                  category: 'Kidney',         icd10: 'N18.9' },
  { name: 'Asthma',                                category: 'Respiratory',    icd10: 'J45.909' },
  { name: 'Migraine',                              category: 'Neurological',   icd10: 'G43.909' },
  { name: 'Neuropathy',                            category: 'Neurological',   icd10: 'G62.9' },
];

export function searchConditions(query: string): Condition[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return CONDITIONS.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q)
  ).slice(0, 8);
}

export const COMMON_CONDITIONS = [
  'High Cholesterol (Hyperlipidemia)',
  "Hashimoto's Thyroiditis",
  'Hypothyroidism',
  'Ulcerative Colitis (UC)',
  "Crohn's Disease",
  'Type 2 Diabetes',
  'Pre-Diabetes / Insulin Resistance',
  'Metabolic Syndrome',
  'Fatty Liver Disease (NAFLD/MAFLD)',
  'PCOS (Polycystic Ovary Syndrome)',
  'Sleep Apnea (Obstructive)',
  'Anxiety',
  'Depression',
  'GERD / Acid Reflux',
  'Psoriasis',
  'Rheumatoid Arthritis',
];
