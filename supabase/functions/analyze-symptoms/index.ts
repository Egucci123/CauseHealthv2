// supabase/functions/analyze-symptoms/index.ts
// Deploy: supabase functions deploy analyze-symptoms
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
    const [symptomsRes, medsRes, suppsRes, profileRes, latestDrawRes] = await Promise.all([
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
      supabase.from('profiles').select('sex, date_of_birth').eq('id', userId).single(),
      supabase.from('lab_draws').select('id').eq('user_id', userId).eq('processing_status', 'complete').order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const symptoms = symptomsRes.data ?? []; const meds = medsRes.data ?? [];
    const supps = suppsRes.data ?? [];
    const suppsStr = supps.map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ') || 'None';
    if (symptoms.length === 0) return new Response(JSON.stringify({ error: 'No symptoms to analyze' }), { status: 400, headers: corsHeaders });

    let labValues: any[] = [];
    if (latestDrawRes.data) { const { data } = await supabase.from('lab_values').select('marker_name, value, unit, optimal_flag').eq('draw_id', latestDrawRes.data.id).neq('optimal_flag', 'optimal'); labValues = data ?? []; }

    const profile = profileRes.data;
    const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;
    const sex = profile?.sex ?? 'unknown';

    const sympStr = symptoms.map((s: any) => `${s.symptom} (severity: ${s.severity}/10, category: ${s.category})`).join('\n');
    const medsStr = meds.map((m: any) => m.name).join(', ') || 'None';
    const labStr = labValues.map((v: any) => `${v.marker_name}: ${v.value} ${v.unit} [${v.optimal_flag}]`).join('\n') || 'No abnormal findings';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
        system: `You are CauseHealth AI. Return ONLY valid JSON.

VOICE RULES (CRITICAL — every string in the JSON):
- 6th-grade reading level. No medical jargon without plain-English definition.
- One sentence per field max. Use words a 12-year-old understands.
- "Stress hormone" not "cortisol". "Inflammation" not "hs-CRP". "Thyroid is sluggish" not "hypothyroidism."
- Every pattern + autoimmune flag gets an "emoji" field as visual anchor.
- Add a "body_systems" array to each pattern (subset of: brain, heart, gut, hormones, energy, immune, blood, liver, kidney, joints, skin) so we can highlight a body diagram.

CRITICAL RULES:
1. SEX-SPECIFIC RANGES: Use sex-appropriate reference ranges. NEVER use male testosterone ranges (e.g., 300-1000 ng/dL) for a female patient. For females: testosterone 15-70 ng/dL, free T 0.5-5.0 pg/mL, estradiol varies by cycle.
2. FEMALE HORMONES: Do NOT call estradiol, progesterone, FSH, or LH abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary dramatically by cycle phase.
3. PRIORITY ACTIONS: Maximum 4 actions total — the highest-leverage next steps. Do NOT generate 8-10 actions. Pick the most important.
4. TESTS: One focused workup per "suggested_tests" entry — same organ system only. Do NOT bundle "iron + thyroid + autoimmune + celiac" into one row. Each test name should be ordering-friendly.
5. WRITING STYLE: Plain English. Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Instead of "hepatocellular dysfunction" say "your liver is working harder than it should." Each "explanation" and "likely_mechanism" should be 1-2 sentences max — not paragraphs.
6. DO NOT speculate about conditions the patient has no evidence for. Only flag autoimmune conditions with supporting symptoms AND lab clues.
7. Frame as educational. Always recommend discussing with a healthcare provider.

8. LIFESTYLE-FIRST GATE FOR suggested_tests (CRITICAL):
   Default users are overwhelmed and lazy — do NOT scare them with rare-disease screening on day 1. Most abnormal labs in young adults improve with 90 days of lifestyle change.
   ABSOLUTE BLOCKLIST — these tests CAN NEVER appear in suggested_tests unless the patient hits the hard urgent threshold:
     - JAK2 V617F → only when platelets >450 OR (RBC >6.0 AND Hct >54).
     - Celiac panel → only with persistent malabsorption + iron deficiency + GI symptoms.
     - HLA-B27 → only with persistent inflammatory back pain >90 days unresponsive to lifestyle.
     - ANA reflex → only when ANA already positive.
     - Myeloma panel (SPEP/UPEP) → only with globulin >3.5 + age <40 or persistent hypercalcemia.
     - Hereditary hemochromatosis genetics → only with ferritin >300 + sat >45%.
     - MTHFR genetics → never.
     - Pituitary MRI → only with prolactin >100.
     - 24h urinary cortisol → only with multiple Cushing's stigmata.
   Default suggested_tests should be ROUTINE PCP-orderable: lipid NMR, fasting insulin, iron panel, thyroid (Free T3/T4 + TPO), vitamin D, liver ultrasound, hsCRP, basic celiac IF GI symptoms. Rare-disease screening is the SECOND visit's job.`,
        messages: [{ role: 'user', content: `Analyze symptoms for root causes.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${sex}
SYMPTOMS:
${sympStr}

MEDICATIONS: ${medsStr}
SUPPLEMENTS (factor into root-cause reasoning — e.g., creatine raises creatinine artifact, biotin distorts thyroid labs, niacin can cause flushing/elevated liver enzymes, ashwagandha lowers cortisol, B12 supplementation can mask deficiency symptoms): ${suppsStr}

ABNORMAL LABS:
${labStr}

Return ONLY valid JSON: { "headline": "one 12-word verdict in plain English", "symptom_connections": [{ "emoji": "", "symptom": "", "severity": 7, "root_causes": [{ "cause": "", "type": "lab_finding|medication_depletion|autoimmune|lifestyle|unknown", "confidence": "high|moderate|low", "evidence": "1 sentence plain English", "lab_marker": null }], "interventions": [] }], "patterns": [{ "emoji": "", "pattern_name": "plain English (e.g. 'Tired and hormones off')", "body_systems": ["brain","hormones","energy"], "confidence": "high|moderate|low", "severity": "critical|high|moderate", "symptoms_involved": [], "explanation": "1 sentence plain English", "likely_mechanism": "1 sentence — no jargon", "suggested_tests": ["one focused test per entry"], "icd10_codes": [] }], "autoimmune_flags": [{ "emoji": "", "condition": "", "supporting_symptoms": [], "supporting_labs": [], "confidence": "", "next_step": "1 sentence" }], "priority_actions": [{ "emoji": "", "action": "verb-led 1 sentence", "urgency": "immediate|this_week|this_month", "rationale": "1 sentence why" }], "summary": "3 short sentences connecting the dots" }` }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    let rawText = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace > 0) rawText = rawText.slice(0, lastBrace + 1);
    const result = JSON.parse(rawText);
    await supabase.from('symptom_analyses').insert({ user_id: userId, analysis_data: result });
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
