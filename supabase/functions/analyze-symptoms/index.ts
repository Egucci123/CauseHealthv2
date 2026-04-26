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
    const [symptomsRes, medsRes, profileRes, latestDrawRes] = await Promise.all([
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('profiles').select('sex, date_of_birth').eq('id', userId).single(),
      supabase.from('lab_draws').select('id').eq('user_id', userId).eq('processing_status', 'complete').order('draw_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const symptoms = symptomsRes.data ?? []; const meds = medsRes.data ?? [];
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
        system: `You are CauseHealth AI. Return ONLY valid JSON. Connect symptoms to root causes using the patient's actual labs and medications.

CRITICAL RULES:
1. SEX-SPECIFIC RANGES: Use sex-appropriate reference ranges. NEVER use male testosterone ranges (e.g., 300-1000 ng/dL) for a female patient. For females: testosterone 15-70 ng/dL, free T 0.5-5.0 pg/mL, estradiol varies by cycle.
2. FEMALE HORMONES: Do NOT call estradiol, progesterone, FSH, or LH abnormal in premenopausal females unless extreme (FSH >40, estradiol <10 or >500, progesterone >30). These vary dramatically by cycle phase.
3. PRIORITY ACTIONS: Maximum 4 actions total — the highest-leverage next steps. Do NOT generate 8-10 actions. Pick the most important.
4. TESTS: One focused workup per "suggested_tests" entry — same organ system only. Do NOT bundle "iron + thyroid + autoimmune + celiac" into one row. Each test name should be ordering-friendly.
5. WRITING STYLE: Plain English. Instead of "HPA-axis dysregulation" say "your stress hormones are elevated." Instead of "hepatocellular dysfunction" say "your liver is working harder than it should." Each "explanation" and "likely_mechanism" should be 1-2 sentences max — not paragraphs.
6. DO NOT speculate about conditions the patient has no evidence for. Only flag autoimmune conditions with supporting symptoms AND lab clues.
7. Frame as educational. Always recommend discussing with a healthcare provider.`,
        messages: [{ role: 'user', content: `Analyze symptoms for root causes.

PATIENT: ${age ? `${age}yo` : 'age unknown'} ${sex}
SYMPTOMS:
${sympStr}

MEDICATIONS: ${medsStr}

ABNORMAL LABS:
${labStr}

Return ONLY valid JSON: { "symptom_connections": [{ "symptom": "", "severity": 7, "root_causes": [{ "cause": "", "type": "lab_finding|medication_depletion|autoimmune|lifestyle|unknown", "confidence": "high|moderate|low", "evidence": "1 sentence plain English", "lab_marker": null }], "interventions": [] }], "patterns": [{ "pattern_name": "", "confidence": "high|moderate|low", "severity": "critical|high|moderate", "symptoms_involved": [], "explanation": "1-2 sentences plain English", "likely_mechanism": "1-2 sentences", "suggested_tests": ["one focused test per entry, no bundling"], "icd10_codes": [] }], "autoimmune_flags": [{ "condition": "", "supporting_symptoms": [], "supporting_labs": [], "confidence": "", "next_step": "1 sentence" }], "priority_actions": [{ "action": "", "urgency": "immediate|this_week|this_month", "rationale": "1 sentence why" }], "summary": "3-4 sentence overview connecting the dots" }` }],
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
