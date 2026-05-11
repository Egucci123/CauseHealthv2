// src/data/symptoms.ts
export interface SymptomCategory {
  id:       string;
  label:    string;
  icon:     string;
  symptoms: string[];
}

export const SYMPTOM_CATEGORIES: SymptomCategory[] = [
  {
    id: 'energy', label: 'Energy & Fatigue', icon: 'bolt',
    symptoms: ['Chronic fatigue', 'Low energy', 'Afternoon energy crash', 'Fatigue after exercise', 'Morning fatigue despite sleep', 'Mental exhaustion', 'Physical exhaustion'],
  },
  {
    id: 'hair_skin', label: 'Hair, Skin & Nails', icon: 'face',
    symptoms: ['Diffuse hair thinning', 'Receding hairline', 'Patchy hair loss', 'Hair loss — no family history', 'Dry brittle hair', 'Dry skin', 'Acne', 'Hirsutism — excess facial or body hair', 'Brittle nails', 'Nail ridging', 'Slow wound healing', 'Rashes', 'Eczema'],
  },
  {
    id: 'muscle_joint', label: 'Muscle & Joints', icon: 'accessibility',
    symptoms: ['Muscle pain', 'Muscle weakness', 'Joint pain', 'Joint stiffness', 'Morning stiffness', 'Muscle cramps', 'Muscle twitching', 'Reduced exercise tolerance', 'Back pain', 'Hip pain'],
  },
  {
    id: 'digestion', label: 'Digestion & Gut', icon: 'health_and_safety',
    symptoms: ['Bloating', 'Gas', 'Constipation', 'Diarrhea', 'Loose stools', 'Abdominal pain', 'Nausea', 'Acid reflux', 'Heartburn', 'Food sensitivities', 'Alternating bowel habits'],
  },
  {
    id: 'brain', label: 'Brain & Mental', icon: 'psychology',
    symptoms: ['Brain fog', 'Poor memory', 'Difficulty concentrating', 'Word-finding difficulty', 'Mental slowness', 'Depression', 'Anxiety', 'Mood swings', 'Irritability', 'Low motivation', 'New or worsening headaches', 'Migraines', 'Visual changes — vision changes'],
  },
  {
    id: 'hormones', label: 'Hormones & Mood', icon: 'monitor_heart',
    symptoms: ['Low libido', 'Irregular periods', 'Amenorrhea — no period 3+ months', 'Heavy periods', 'PMS', 'Hot flashes', 'Night sweats', 'Galactorrhea — breast or nipple discharge', 'Mood swings', 'Low testosterone symptoms', 'Erectile dysfunction', 'Gynecomastia — male breast tissue', 'Weight gain — hormonal pattern', 'Fertility concerns — infertility'],
  },
  {
    id: 'sleep', label: 'Sleep', icon: 'bedtime',
    symptoms: ['Difficulty falling asleep', 'Waking during night', 'Unrefreshing sleep', 'Snoring', 'Daytime sleepiness', 'Sleep apnea', 'Vivid dreams', 'Restless legs'],
  },
  {
    id: 'weight', label: 'Weight & Metabolism', icon: 'monitor_weight',
    symptoms: ['Weight gain despite diet', 'Difficulty losing weight', 'Unexplained weight loss', 'Increased hunger', 'Sugar cravings', 'Increased thirst', 'Frequent urination', 'Cold intolerance', 'Heat intolerance', 'Slow metabolism'],
  },
  {
    id: 'cardiovascular', label: 'Cardiovascular', icon: 'cardiology',
    symptoms: ['Heart palpitations', 'Chest discomfort', 'Shortness of breath', 'High blood pressure', 'Swelling in legs', 'Cold hands and feet', 'Dizziness on standing'],
  },
  {
    id: 'immune', label: 'Immune System', icon: 'shield',
    symptoms: ['Frequent infections', 'Slow recovery from illness', 'Recurring sinus infections', 'Allergies worsening', 'Autoimmune flares', 'Inflammation', 'Swollen lymph nodes'],
  },
];
