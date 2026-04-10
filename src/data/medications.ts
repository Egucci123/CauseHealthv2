// src/data/medications.ts
export interface MedicationEntry {
  generic:    string;
  brands:     string[];
  category:   string;
  depletes:   string[];
}

export const MEDICATIONS: MedicationEntry[] = [
  // Statins
  { generic: 'Atorvastatin',    brands: ['Lipitor'],          category: 'Statin',          depletes: ['coq10', 'vitamin_d'] },
  { generic: 'Rosuvastatin',    brands: ['Crestor'],          category: 'Statin',          depletes: ['coq10'] },
  { generic: 'Simvastatin',     brands: ['Zocor'],            category: 'Statin',          depletes: ['coq10', 'vitamin_d'] },
  { generic: 'Pravastatin',     brands: ['Pravachol'],        category: 'Statin',          depletes: ['coq10'] },
  { generic: 'Lovastatin',      brands: ['Mevacor'],          category: 'Statin',          depletes: ['coq10'] },
  // IBD / GI
  { generic: 'Mesalamine',      brands: ['Asacol', 'Lialda', 'Pentasa', 'Delzicol', 'Apriso'], category: 'IBD', depletes: ['folate', 'b12'] },
  { generic: 'Methotrexate',    brands: ['Trexall', 'Rasuvo'], category: 'Immunosuppressant', depletes: ['folate'] },
  { generic: 'Ustekinumab',     brands: ['Stelara'],          category: 'Biologic',        depletes: [] },
  { generic: 'Infliximab',      brands: ['Remicade'],         category: 'Biologic',        depletes: [] },
  { generic: 'Adalimumab',      brands: ['Humira'],           category: 'Biologic',        depletes: [] },
  { generic: 'Vedolizumab',     brands: ['Entyvio'],          category: 'Biologic',        depletes: [] },
  { generic: 'Budesonide',      brands: ['Entocort', 'Uceris'], category: 'Corticosteroid', depletes: ['calcium', 'vitamin_d', 'magnesium', 'zinc', 'potassium'] },
  // Diabetes
  { generic: 'Metformin',       brands: ['Glucophage', 'Glumetza'], category: 'Diabetes',  depletes: ['b12', 'folate'] },
  { generic: 'Semaglutide',     brands: ['Ozempic', 'Wegovy'],      category: 'GLP-1',     depletes: [] },
  { generic: 'Tirzepatide',     brands: ['Mounjaro', 'Zepbound'],   category: 'GLP-1',     depletes: [] },
  { generic: 'Glipizide',       brands: ['Glucotrol'],              category: 'Diabetes',  depletes: ['coq10'] },
  // Blood pressure
  { generic: 'Lisinopril',      brands: ['Zestril', 'Prinivil'],    category: 'ACE Inhibitor', depletes: ['zinc'] },
  { generic: 'Amlodipine',      brands: ['Norvasc'],                category: 'Calcium Channel Blocker', depletes: [] },
  { generic: 'Metoprolol',      brands: ['Lopressor', 'Toprol'],    category: 'Beta Blocker', depletes: ['coq10'] },
  { generic: 'Atenolol',        brands: ['Tenormin'],               category: 'Beta Blocker', depletes: ['coq10'] },
  { generic: 'Hydrochlorothiazide', brands: ['HCTZ', 'Microzide'],  category: 'Diuretic',  depletes: ['potassium', 'magnesium', 'zinc'] },
  { generic: 'Furosemide',      brands: ['Lasix'],                  category: 'Diuretic',  depletes: ['potassium', 'magnesium', 'zinc', 'calcium'] },
  { generic: 'Spironolactone',  brands: ['Aldactone'],              category: 'Diuretic',  depletes: ['magnesium', 'zinc'] },
  { generic: 'Losartan',        brands: ['Cozaar'],                 category: 'ARB',       depletes: [] },
  { generic: 'Valsartan',       brands: ['Diovan'],                 category: 'ARB',       depletes: [] },
  // Cholesterol
  { generic: 'Ezetimibe',       brands: ['Zetia'],                  category: 'Cholesterol', depletes: [] },
  { generic: 'Fenofibrate',     brands: ['Tricor', 'Fenoglide'],    category: 'Cholesterol', depletes: ['coq10'] },
  // Thyroid
  { generic: 'Levothyroxine',   brands: ['Synthroid', 'Levoxyl'],   category: 'Thyroid',   depletes: ['calcium'] },
  { generic: 'Liothyronine',    brands: ['Cytomel'],                category: 'Thyroid',   depletes: [] },
  // Antidepressants
  { generic: 'Sertraline',      brands: ['Zoloft'],                 category: 'SSRI',      depletes: ['folate', 'melatonin'] },
  { generic: 'Escitalopram',    brands: ['Lexapro'],                category: 'SSRI',      depletes: ['folate', 'melatonin'] },
  { generic: 'Fluoxetine',      brands: ['Prozac'],                 category: 'SSRI',      depletes: ['folate', 'melatonin'] },
  { generic: 'Paroxetine',      brands: ['Paxil'],                  category: 'SSRI',      depletes: ['folate', 'melatonin'] },
  { generic: 'Bupropion',       brands: ['Wellbutrin', 'Zyban'],    category: 'Antidepressant', depletes: [] },
  { generic: 'Duloxetine',      brands: ['Cymbalta'],               category: 'SNRI',      depletes: [] },
  { generic: 'Venlafaxine',     brands: ['Effexor'],                category: 'SNRI',      depletes: [] },
  { generic: 'Aripiprazole',    brands: ['Abilify'],                category: 'Antipsychotic', depletes: [] },
  { generic: 'Quetiapine',      brands: ['Seroquel'],               category: 'Antipsychotic', depletes: [] },
  { generic: 'Lithium',         brands: ['Lithobid'],               category: 'Mood Stabilizer', depletes: ['folate', 'b12', 'magnesium'] },
  // PPIs
  { generic: 'Omeprazole',      brands: ['Prilosec'],               category: 'PPI',       depletes: ['b12', 'magnesium', 'zinc', 'iron', 'calcium'] },
  { generic: 'Pantoprazole',    brands: ['Protonix'],               category: 'PPI',       depletes: ['b12', 'magnesium', 'zinc', 'iron'] },
  { generic: 'Esomeprazole',    brands: ['Nexium'],                 category: 'PPI',       depletes: ['b12', 'magnesium', 'zinc', 'iron'] },
  { generic: 'Lansoprazole',    brands: ['Prevacid'],               category: 'PPI',       depletes: ['b12', 'magnesium', 'zinc'] },
  { generic: 'Famotidine',      brands: ['Pepcid'],                 category: 'H2 Blocker', depletes: ['b12'] },
  // Pain
  { generic: 'Ibuprofen',       brands: ['Advil', 'Motrin'],        category: 'NSAID',     depletes: ['folic_acid', 'iron', 'zinc'] },
  { generic: 'Naproxen',        brands: ['Aleve', 'Naprosyn'],      category: 'NSAID',     depletes: ['folic_acid', 'iron'] },
  { generic: 'Celecoxib',       brands: ['Celebrex'],               category: 'NSAID',     depletes: ['folic_acid'] },
  { generic: 'Prednisone',      brands: ['Deltasone'],              category: 'Corticosteroid', depletes: ['calcium', 'vitamin_d', 'magnesium', 'zinc', 'potassium', 'vitamin_c'] },
  { generic: 'Methylprednisolone', brands: ['Medrol'],              category: 'Corticosteroid', depletes: ['calcium', 'vitamin_d', 'magnesium', 'zinc'] },
  { generic: 'Gabapentin',      brands: ['Neurontin'],              category: 'Anticonvulsant', depletes: [] },
  { generic: 'Pregabalin',      brands: ['Lyrica'],                 category: 'Anticonvulsant', depletes: [] },
  // Antibiotics
  { generic: 'Amoxicillin',     brands: ['Amoxil'],                 category: 'Antibiotic', depletes: ['b_vitamins', 'probiotics', 'vitamin_k'] },
  { generic: 'Azithromycin',    brands: ['Zithromax', 'Z-Pack'],    category: 'Antibiotic', depletes: ['probiotics', 'vitamin_k'] },
  { generic: 'Doxycycline',     brands: ['Vibramycin'],             category: 'Antibiotic', depletes: ['calcium', 'magnesium', 'b_vitamins'] },
  { generic: 'Ciprofloxacin',   brands: ['Cipro'],                  category: 'Antibiotic', depletes: ['magnesium', 'zinc', 'b_vitamins', 'probiotics'] },
  // Hormones
  { generic: 'Oral Contraceptive', brands: ['Various'],             category: 'Contraceptive', depletes: ['b6', 'b12', 'folate', 'zinc', 'magnesium', 'coq10'] },
  { generic: 'Levonorgestrel',  brands: ['Mirena', 'Kyleena'],      category: 'Contraceptive', depletes: [] },
  { generic: 'Testosterone',    brands: ['AndroGel', 'Testim'],     category: 'Hormone',   depletes: [] },
  { generic: 'Estradiol',       brands: ['Estrace', 'Vivelle'],     category: 'Hormone',   depletes: ['magnesium', 'b6'] },
  // Blood thinners
  { generic: 'Warfarin',        brands: ['Coumadin'],               category: 'Anticoagulant', depletes: ['vitamin_k'] },
  { generic: 'Apixaban',        brands: ['Eliquis'],                category: 'Anticoagulant', depletes: [] },
  { generic: 'Rivaroxaban',     brands: ['Xarelto'],                category: 'Anticoagulant', depletes: [] },
  // ADHD
  { generic: 'Amphetamine',     brands: ['Adderall', 'Vyvanse'],    category: 'ADHD',      depletes: ['zinc', 'magnesium', 'vitamin_c'] },
  { generic: 'Methylphenidate', brands: ['Ritalin', 'Concerta'],    category: 'ADHD',      depletes: ['zinc', 'magnesium'] },
  { generic: 'Atomoxetine',     brands: ['Strattera'],              category: 'ADHD',      depletes: [] },
  // Misc
  { generic: 'Allopurinol',     brands: ['Zyloprim'],               category: 'Gout',      depletes: [] },
  { generic: 'Colchicine',      brands: ['Colcrys'],                category: 'Gout',      depletes: ['b12', 'calcium'] },
  { generic: 'Hydroxychloroquine', brands: ['Plaquenil'],           category: 'Autoimmune', depletes: [] },
  { generic: 'Azathioprine',    brands: ['Imuran'],                 category: 'Immunosuppressant', depletes: [] },
  { generic: 'Mycophenolate',   brands: ['CellCept'],               category: 'Immunosuppressant', depletes: [] },
  { generic: 'Finasteride',     brands: ['Propecia', 'Proscar'],    category: 'Hair / Prostate', depletes: [] },
  { generic: 'Minoxidil',       brands: ['Rogaine'],                category: 'Hair',      depletes: [] },
  { generic: 'Isotretinoin',    brands: ['Accutane'],               category: 'Acne',      depletes: ['vitamin_a', 'zinc'] },
  { generic: 'Leflunomide',     brands: ['Arava'],                  category: 'Rheumatology', depletes: [] },
  // Benzodiazepines
  { generic: 'Alprazolam',      brands: ['Xanax'],                  category: 'Benzodiazepine', depletes: ['melatonin'] },
  { generic: 'Lorazepam',       brands: ['Ativan'],                 category: 'Benzodiazepine', depletes: ['melatonin'] },
  { generic: 'Clonazepam',      brands: ['Klonopin'],               category: 'Benzodiazepine', depletes: ['melatonin'] },
  { generic: 'Diazepam',        brands: ['Valium'],                 category: 'Benzodiazepine', depletes: ['melatonin'] },
  // Sleep
  { generic: 'Zolpidem',        brands: ['Ambien'],                 category: 'Sleep Aid',      depletes: [] },
  { generic: 'Trazodone',       brands: ['Desyrel'],                category: 'Sleep Aid',      depletes: [] },
  { generic: 'Suvorexant',      brands: ['Belsomra'],               category: 'Sleep Aid',      depletes: [] },
  // Antihistamines
  { generic: 'Cetirizine',      brands: ['Zyrtec'],                 category: 'Antihistamine',  depletes: [] },
  { generic: 'Loratadine',      brands: ['Claritin'],               category: 'Antihistamine',  depletes: [] },
  { generic: 'Fexofenadine',    brands: ['Allegra'],                category: 'Antihistamine',  depletes: [] },
  { generic: 'Diphenhydramine', brands: ['Benadryl'],               category: 'Antihistamine',  depletes: [] },
  { generic: 'Montelukast',     brands: ['Singulair'],              category: 'Allergy/Asthma', depletes: [] },
  // Seizure / Anticonvulsants
  { generic: 'Levetiracetam',   brands: ['Keppra'],                 category: 'Anticonvulsant', depletes: ['calcium', 'vitamin_d'] },
  { generic: 'Lamotrigine',     brands: ['Lamictal'],               category: 'Anticonvulsant', depletes: ['folate'] },
  { generic: 'Valproic Acid',   brands: ['Depakote', 'Depakene'],   category: 'Anticonvulsant', depletes: ['folate', 'carnitine', 'zinc', 'selenium'] },
  { generic: 'Topiramate',      brands: ['Topamax'],                category: 'Anticonvulsant', depletes: ['b12', 'folate'] },
  { generic: 'Carbamazepine',   brands: ['Tegretol'],               category: 'Anticonvulsant', depletes: ['folate', 'vitamin_d', 'calcium', 'b12'] },
  { generic: 'Phenytoin',       brands: ['Dilantin'],               category: 'Anticonvulsant', depletes: ['folate', 'vitamin_d', 'calcium', 'b12', 'vitamin_k'] },
  // Migraine
  { generic: 'Sumatriptan',     brands: ['Imitrex'],                category: 'Migraine',       depletes: [] },
  { generic: 'Rizatriptan',     brands: ['Maxalt'],                 category: 'Migraine',       depletes: [] },
  { generic: 'Propranolol',     brands: ['Inderal'],                category: 'Beta Blocker',   depletes: ['coq10', 'melatonin'] },
  { generic: 'Amitriptyline',   brands: ['Elavil'],                 category: 'TCA',            depletes: ['coq10', 'b2'] },
  // Osteoporosis
  { generic: 'Alendronate',     brands: ['Fosamax'],                category: 'Bisphosphonate', depletes: ['calcium', 'magnesium'] },
  { generic: 'Risedronate',     brands: ['Actonel'],                category: 'Bisphosphonate', depletes: ['calcium'] },
  { generic: 'Denosumab',       brands: ['Prolia'],                 category: 'Osteoporosis',   depletes: [] },
  // Asthma
  { generic: 'Albuterol',       brands: ['ProAir', 'Ventolin'],     category: 'Bronchodilator', depletes: ['potassium', 'magnesium'] },
  { generic: 'Fluticasone',     brands: ['Flovent', 'Flonase'],     category: 'Corticosteroid', depletes: ['calcium', 'vitamin_d'] },
  { generic: 'Budesonide/Formoterol', brands: ['Symbicort'],        category: 'Inhaler',        depletes: ['calcium', 'vitamin_d', 'potassium'] },
  // Opioids
  { generic: 'Oxycodone',       brands: ['OxyContin', 'Percocet'],  category: 'Opioid',         depletes: ['testosterone', 'vitamin_d'] },
  { generic: 'Hydrocodone',     brands: ['Vicodin', 'Norco'],       category: 'Opioid',         depletes: ['testosterone', 'vitamin_d'] },
  { generic: 'Tramadol',        brands: ['Ultram'],                 category: 'Opioid',         depletes: [] },
  { generic: 'Buprenorphine',   brands: ['Suboxone', 'Subutex'],    category: 'Opioid',         depletes: ['testosterone'] },
  // Muscle relaxants
  { generic: 'Cyclobenzaprine', brands: ['Flexeril'],               category: 'Muscle Relaxant', depletes: [] },
  { generic: 'Baclofen',        brands: ['Lioresal'],               category: 'Muscle Relaxant', depletes: [] },
  { generic: 'Tizanidine',      brands: ['Zanaflex'],               category: 'Muscle Relaxant', depletes: [] },
  // Cancer / Oncology
  { generic: 'Tamoxifen',       brands: ['Nolvadex'],               category: 'Oncology',       depletes: ['vitamin_d', 'calcium'] },
  { generic: 'Letrozole',       brands: ['Femara'],                 category: 'Oncology',       depletes: ['vitamin_d', 'calcium'] },
  { generic: 'Anastrozole',     brands: ['Arimidex'],               category: 'Oncology',       depletes: ['vitamin_d'] },
  // Rheumatology JAK inhibitors
  { generic: 'Tofacitinib',     brands: ['Xeljanz'],                category: 'JAK Inhibitor',  depletes: [] },
  { generic: 'Baricitinib',     brands: ['Olumiant'],               category: 'JAK Inhibitor',  depletes: [] },
  { generic: 'Upadacitinib',    brands: ['Rinvoq'],                 category: 'JAK Inhibitor',  depletes: [] },
  // Other biologics
  { generic: 'Secukinumab',     brands: ['Cosentyx'],               category: 'Biologic',       depletes: [] },
  { generic: 'Dupilumab',       brands: ['Dupixent'],               category: 'Biologic',       depletes: [] },
  { generic: 'Rituximab',       brands: ['Rituxan'],                category: 'Biologic',       depletes: [] },
  { generic: 'Risankizumab',    brands: ['Skyrizi'],                category: 'Biologic',       depletes: [] },
  { generic: 'Guselkumab',      brands: ['Tremfya'],                category: 'Biologic',       depletes: [] },
  // Diabetes expanded
  { generic: 'Insulin Glargine', brands: ['Lantus', 'Basaglar'],    category: 'Insulin',        depletes: ['magnesium'] },
  { generic: 'Insulin Lispro',  brands: ['Humalog'],                category: 'Insulin',        depletes: [] },
  { generic: 'Empagliflozin',   brands: ['Jardiance'],              category: 'SGLT2 Inhibitor', depletes: ['magnesium'] },
  { generic: 'Dapagliflozin',   brands: ['Farxiga'],                category: 'SGLT2 Inhibitor', depletes: ['magnesium'] },
  { generic: 'Canagliflozin',   brands: ['Invokana'],               category: 'SGLT2 Inhibitor', depletes: ['magnesium', 'phosphorus'] },
  { generic: 'Sitagliptin',     brands: ['Januvia'],                category: 'DPP-4 Inhibitor', depletes: [] },
  { generic: 'Pioglitazone',    brands: ['Actos'],                  category: 'Diabetes',       depletes: [] },
  // Blood pressure expanded
  { generic: 'Enalapril',       brands: ['Vasotec'],                category: 'ACE Inhibitor',  depletes: ['zinc'] },
  { generic: 'Ramipril',        brands: ['Altace'],                 category: 'ACE Inhibitor',  depletes: ['zinc'] },
  { generic: 'Carvedilol',      brands: ['Coreg'],                  category: 'Beta Blocker',   depletes: ['coq10'] },
  { generic: 'Nebivolol',       brands: ['Bystolic'],               category: 'Beta Blocker',   depletes: ['coq10'] },
  { generic: 'Diltiazem',       brands: ['Cardizem'],               category: 'Calcium Channel Blocker', depletes: [] },
  { generic: 'Nifedipine',      brands: ['Procardia'],              category: 'Calcium Channel Blocker', depletes: [] },
  { generic: 'Irbesartan',      brands: ['Avapro'],                 category: 'ARB',            depletes: [] },
  { generic: 'Olmesartan',      brands: ['Benicar'],                category: 'ARB',            depletes: [] },
  { generic: 'Clonidine',       brands: ['Catapres'],               category: 'Antihypertensive', depletes: ['coq10'] },
  // GI expanded
  { generic: 'Ondansetron',     brands: ['Zofran'],                 category: 'Anti-nausea',    depletes: [] },
  { generic: 'Sucralfate',      brands: ['Carafate'],               category: 'GI',             depletes: [] },
  { generic: 'Dicyclomine',     brands: ['Bentyl'],                 category: 'GI',             depletes: [] },
  { generic: 'Sulfasalazine',   brands: ['Azulfidine'],             category: 'IBD',            depletes: ['folate'] },
  { generic: 'Balsalazide',     brands: ['Colazal'],                category: 'IBD',            depletes: ['folate'] },
];

export function searchMedications(query: string): MedicationEntry[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return MEDICATIONS.filter(med =>
    med.generic.toLowerCase().includes(q) ||
    med.brands.some(b => b.toLowerCase().includes(q))
  ).slice(0, 8);
}
