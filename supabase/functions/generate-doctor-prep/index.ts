// supabase/functions/generate-doctor-prep/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userId } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const [profileRes, medsRes, symptomsRes, conditionsRes, latestDrawRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId).order('severity', { ascending: false }),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id, draw_date, lab_name').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data; const meds = medsRes.data ?? []; const symptoms = symptomsRes.data ?? [];
    const conditions = conditionsRes.data ?? []; const latestDraw = latestDrawRes.data;
    let labValues: any[] = [];
    if (latestDraw) { const { data } = await supabase.from('lab_values').select('*').eq('draw_id', latestDraw.id); labValues = data ?? []; }

    const age = profile?.date_of_birth ? new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : null;
    const medsStr = meds.map((m: any) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('\n') || 'None';
    const sympStr = symptoms.slice(0, 10).map((s: any) => `${s.symptom} - Severity: ${s.severity}/10`).join('\n') || 'None';
    const condStr = conditions.map((c: any) => c.name).join(', ') || 'None reported';

    const allLabsStr = labValues.map((v: any) =>
      `${v.marker_name}: ${v.value} ${v.unit ?? ''} (Ref: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'}) ${v.standard_flag && v.standard_flag !== 'normal' ? '[' + v.standard_flag.toUpperCase() + ']' : ''}`
    ).join('\n') || 'No labs';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 4000,
        system: `You are CauseHealth AI. Return ONLY valid JSON. Write a concise clinical visit prep document.

CRITICAL RULES:
1. EVERY lab value outside optimal range MUST be addressed. Do NOT skip ANY abnormal finding, even if it seems unrelated to the chief complaint. Every monitor/urgent value gets a discussion point and test recommendation.
2. PATTERN RECOGNITION: Look for multi-marker patterns that point to specific undiagnosed conditions. Connect abnormal values across organ systems. Examples of patterns to detect (apply universally, not just these):
   - Elevated platelets + elevated RDW + fatigue → iron deficiency anemia, chronic inflammation, or myeloproliferative disorder — order iron panel, peripheral smear, JAK2 if persistent
   - Elevated globulin + low albumin → chronic infection, autoimmune disease, or liver dysfunction
   - Low HDL + elevated triglycerides + borderline glucose → metabolic syndrome / insulin resistance
   - Elevated liver enzymes + elevated bilirubin → hepatotoxicity, hemolysis, or biliary disease
   - Low CO2 + low chloride → metabolic acidosis, chronic diarrhea, or renal tubular issue
   - Elevated WBC + elevated RDW + fatigue → occult infection, stress response, or hematologic process
   Flag EVERY pattern you find in the executive_summary and dedicate a discussion_point to each. The goal is EARLY DETECTION — find what the doctor's 12-minute appointment will miss.
3. VALUES ABOVE OPTIMAL BUT WITHIN STANDARD RANGE ARE NOT SAFE TO IGNORE. If a value exceeds optimal range, it requires investigation even if the standard lab report says "normal." This is what CauseHealth exists for. MANDATORY follow-up rules (apply to ALL patients):
   - Platelets >300 → peripheral smear + JAK2 V617F mutation (myeloproliferative screening)
   - RDW >13 → iron panel + B12/folate + reticulocyte count (early anemia/deficiency detection)
   - Fasting glucose >90 → fasting insulin + HOMA-IR (insulin resistance often hides behind "normal" glucose)
   - TSH >2.5 OR <1.0 → free T3 + free T4 + TPO + thyroglobulin antibodies (subclinical thyroid disease)
   - ALT >25 → liver ultrasound + hepatitis panel (fatty liver disease starts well before "abnormal" range)
   - Vitamin D <40 → repletion protocol + recheck in 8 weeks
   - Homocysteine >8 → B12/folate/B6 + consider MTHFR (cardiovascular and neurologic risk)
   - hs-CRP >1 → full inflammatory workup + autoimmune screening
   - WBC >10 → differential + infection/inflammation workup
   - Any combination of 3+ suboptimal values across different organ systems → screen for autoimmune disease, celiac, and metabolic syndrome regardless of chief complaint
   YOUNG ADULT EARLY DETECTION (under 30 — these are commonly missed for YEARS):
   - Ferritin <30 even with normal hemoglobin → functional iron deficiency (causes fatigue, hair loss, brain fog LONG before anemia shows)
   - Low HDL (<50 female, <40 male) in teens/20s → early metabolic syndrome, NOT "just genetics" — test insulin
   - Elevated MCV (>92) without anemia → early B12 or folate deficiency, alcohol use, or liver disease
   - Low MCV (<82) without anemia → iron deficiency or thalassemia trait — test iron panel + hemoglobin electrophoresis
   - Elevated lymphocytes or monocytes even "within range" → chronic viral infection (EBV, CMV), autoimmune activation
   - ALP elevated in a young adult who's done growing → liver or bone disease, NOT just "normal growth"
   - Bilirubin 1.0-1.2 "high normal" + fatigue → Gilbert syndrome (benign but explains symptoms) or early hemolysis
   - Protein/albumin ratio abnormal (elevated globulin >3.0) → chronic infection, autoimmune disease, or early multiple myeloma screening
   - Calcium >10.0 repeatedly → primary hyperparathyroidism (missed for decades in young patients)
   - Low CO2 (<23) + low chloride → chronic metabolic acidosis, renal tubular acidosis, or chronic diarrhea/malabsorption
   - Uric acid >6 in young female or >7 in young male → gout risk, metabolic syndrome, kidney stone risk — lifestyle intervention NOW
   - ANY unexplained weight gain + fatigue + normal TSH in young female → ALWAYS check free T3, free T4, TPO antibodies, fasting insulin, cortisol, and celiac panel
   No "within normal limits" dismissals. Ever.
4. AGE AND SEX CONTEXT: Always consider the patient's age and sex when evaluating findings. A value that is "normal" for a 50-year-old male may be concerning in an 18-year-old female. Apply age/sex-appropriate clinical reasoning.

FORMAT: executive_summary (3-5 bullets), HPI (3-5 sentences — mention ALL abnormal values), ROS (1-2 sentences/system), discussion_points (5-8 items covering EVERY abnormal finding, 2-3 sentences each, lead with the ask), patient_questions (3-5 plain language), functional_medicine_note (3-4 sentences).

TESTS (8-10 total, tiered urgent/high/moderate/baseline): Test every medication-depleted nutrient. Combine related tests. For every abnormal value, include follow-up testing. Borderline metabolic→fasting insulin+HOMA-IR. Autoimmune patient→screen celiac+thyroid.

PANEL GAP SCREENING: Beyond tests driven by abnormal findings, identify standard baseline panels MISSING from the uploaded labs. For this patient's age and sex, recommend tests that should be part of a comprehensive workup but were not ordered. Add these to tests_to_request with priority "baseline" and clinical_justification explaining why this test is age/sex-appropriate even without abnormal findings. Use ICD-10 Z00.00 (General adult medical examination) for baseline screening. Examples: thyroid panel if no TSH present, lipid panel if no cardiovascular markers, vitamin D if not tested, ferritin/iron panel for females, fasting insulin for metabolic screening, hormone panel for age 35+. Even if all uploaded values are optimal, there are always panels that should have been ordered.

MEDICATION ALTERNATIVES: For each med, 2-3 pharmaceutical alternatives AND 2-3 natural alternatives. Brief reason each.

ICD-10: Use most specific code. Corrections applied post-generation.

Be concise. Scannable in 5 minutes.`,
        messages: [{ role: 'user', content: `Generate clinical visit prep document.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${profile?.sex ?? ''}
DIAGNOSED CONDITIONS: ${condStr}
MEDICATIONS:\n${medsStr}
SYMPTOMS:\n${sympStr}
LAB DATE: ${latestDraw?.draw_date ?? 'unknown'} LAB: ${latestDraw?.lab_name ?? 'unknown'}

ALL LAB VALUES:
${allLabsStr.slice(0, 4000)}

Return JSON:
{"generated_at":"${new Date().toISOString()}","document_date":"${new Date().toISOString().split('T')[0]}","executive_summary":["3-5 critical bullet points"],"chief_complaint":"one sentence","hpi":"3-5 sentences covering ALL abnormal organ systems","pmh":"","medications":[{"name":"","dose":"","notable_depletion":"nutrient + organ impact in one line"}],"review_of_systems":{"constitutional":"1-2 sentences","cardiovascular":"","gastrointestinal":"","musculoskeletal":"","neurological":"","endocrine":"","hematologic":"","integumentary":""},"lab_summary":{"draw_date":"","lab_name":"","urgent_findings":[{"marker":"","value":"with unit","flag":"HIGH or LOW","clinical_note":"1 sentence"}],"other_abnormal":[{"marker":"","value":"with unit","flag":""}]},"tests_to_request":[{"test_name":"","clinical_justification":"2-3 sentences","icd10_primary":"most specific code","icd10_description":"","icd10_secondary":"","icd10_secondary_description":"","priority":"urgent|high|moderate","insurance_note":"1 sentence"}],"discussion_points":["2-3 sentences each, lead with the ask"],"medication_alternatives":[{"current_medication":"exact name","pharmaceutical_alternatives":[{"name":"","reason":"why this may be better for this patient — fewer side effects, less organ stress, better suited to their conditions"}],"natural_alternatives":[{"name":"","reason":"evidence-based rationale for this patient's specific situation"}]}],"patient_questions":["plain language questions to ask the doctor"],"functional_medicine_note":"3-4 sentence root cause synthesis"}` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace > 0) rawText = rawText.slice(0, lastBrace + 1);
    let doc;
    try { doc = JSON.parse(rawText); } catch (e) { throw new Error('Failed to parse AI response as JSON'); }

    // ── ICD-10 CORRECTION MAP — runs after AI, zero tokens, deterministic ────
    try {
      const fixes = {
        'E11.9': ['R73.03', 'Prediabetes'], 'E11.65': ['R73.03', 'Prediabetes'],
        'E89.0': ['E06.3', 'Autoimmune thyroiditis'],
        'Z13.1': ['K90.0', 'Celiac disease'], 'Z13.3': ['K90.0', 'Celiac disease'],
        'Z13.0': ['D64.9', 'Anemia, unspecified'],
        'T36.0X5A': ['K71.9', 'Toxic liver disease'], 'T36.0X5D': ['K71.9', 'Toxic liver disease'],
        'E78.5': ['E78.2', 'Mixed hyperlipidemia'], 'E78.9': ['E78.2', 'Mixed hyperlipidemia'],
        'F39': ['R41.82', 'Altered mental status'], 'F06.7': ['R41.82', 'Altered mental status'],
        'D45': ['D75.1', 'Secondary polycythemia'],
        'M79.3': ['M79.1', 'Myalgia'], 'R52': ['M25.50', 'Joint pain, unspecified'],
        'E55.0': ['E55.9', 'Vitamin D deficiency'], 'D50.0': ['D50.9', 'Iron deficiency anemia'],
        'D51.0': ['D51.9', 'B12 deficiency anemia'], 'D52.0': ['D52.9', 'Folate deficiency anemia'],
        'K50.00': ['K50.90', 'Crohn disease, unspecified'], 'K51.00': ['K51.90', 'Ulcerative colitis, unspecified'],
        'E04.9': ['E06.3', 'Autoimmune thyroiditis'], 'E01.8': ['E03.9', 'Hypothyroidism'],
        'E66.01': ['E66.9', 'Obesity, unspecified'],
        'R53.1': ['R53.83', 'Other fatigue'], 'G93.3': ['R53.83', 'Other fatigue'],
        'L65.1': ['L65.9', 'Nonscarring hair loss'], 'L63.9': ['L65.9', 'Nonscarring hair loss'],
      };
      if (doc.tests_to_request) {
        for (const t of doc.tests_to_request) {
          const f1 = fixes[t.icd10_primary];
          if (f1) { t.icd10_primary = f1[0]; t.icd10_description = f1[1]; }
          if (t.icd10_secondary) {
            const f2 = fixes[t.icd10_secondary];
            if (f2) { t.icd10_secondary = f2[0]; t.icd10_secondary_description = f2[1]; }
          }
        }
      }
    } catch (e) { console.error('ICD-10 correction error:', e); }

    // Validate required fields before saving — never save corrupt/partial documents
    if (!doc.chief_complaint && !doc.hpi && !doc.executive_summary) {
      return new Response(JSON.stringify({ error: 'Generated document is incomplete — missing required fields' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // Ensure arrays are arrays, not undefined
    if (!Array.isArray(doc.tests_to_request)) doc.tests_to_request = [];
    if (!Array.isArray(doc.medications)) doc.medications = [];
    if (!Array.isArray(doc.discussion_points)) doc.discussion_points = [];
    if (!Array.isArray(doc.executive_summary)) doc.executive_summary = [];
    if (!Array.isArray(doc.patient_questions)) doc.patient_questions = [];
    if (!Array.isArray(doc.medication_alternatives)) doc.medication_alternatives = [];
    if (!doc.review_of_systems) doc.review_of_systems = {};
    if (!doc.lab_summary) doc.lab_summary = { draw_date: '', lab_name: '', urgent_findings: [], other_abnormal: [] };
    if (!doc.generated_at) doc.generated_at = new Date().toISOString();
    if (!doc.document_date) doc.document_date = new Date().toISOString().split('T')[0];

    await supabase.from('doctor_prep_documents').insert({ user_id: userId, document_data: doc });
    return new Response(JSON.stringify(doc), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
