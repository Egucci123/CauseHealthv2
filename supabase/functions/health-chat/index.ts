// supabase/functions/health-chat/index.ts
// AI health chat — knows the user's labs, meds, symptoms, conditions, wellness plan
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { userId, message, history } = await req.json();
    if (!userId || !message) return new Response(JSON.stringify({ error: 'userId and message required' }), { status: 400, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Load ALL user health context in parallel
    const [profileRes, medsRes, symptomsRes, conditionsRes, latestDrawRes, wellnessPlanRes, doctorPrepRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id, draw_date, lab_name').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('wellness_plans').select('plan_data').eq('user_id', userId).eq('generation_status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('doctor_prep_documents').select('document_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const meds = medsRes.data ?? [];
    const symptoms = symptomsRes.data ?? [];
    const conditions = conditionsRes.data ?? [];
    let labValues: any[] = [];

    if (latestDrawRes.data) {
      const { data } = await supabase.from('lab_values').select('*').eq('draw_id', latestDrawRes.data.id);
      labValues = data ?? [];
    }

    const age = profile?.date_of_birth ? new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : null;
    const condStr = conditions.map((c: any) => c.name).join(', ') || 'None reported';
    const medsStr = meds.map((m: any) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join(', ') || 'None';
    const sympStr = symptoms.map((s: any) => `${s.symptom} (${s.severity}/10)`).join(', ') || 'None';
    const labStr = labValues.map((v: any) =>
      `${v.marker_name}: ${v.value} ${v.unit ?? ''} [${v.optimal_flag ?? 'unknown'}]`
    ).join('\n') || 'No labs uploaded';

    // Wellness plan summary
    const planData = wellnessPlanRes.data?.plan_data as any;
    const planSummary = planData?.summary ?? 'No wellness plan generated yet';
    const supplements = planData?.supplement_stack?.map((s: any) => `${s.nutrient} ${s.dose}`).join(', ') ?? 'None';

    // Doctor prep data
    const prepData = doctorPrepRes.data?.document_data as any;
    const prepSummary = prepData?.functional_medicine_note ?? 'No doctor prep generated yet';
    const execSummary = Array.isArray(prepData?.executive_summary) ? prepData.executive_summary.join('\n') : '';
    const discussionPoints = Array.isArray(prepData?.discussion_points) ? prepData.discussion_points.map((p: any) => typeof p === 'string' ? p : Object.values(p).filter((v: any) => typeof v === 'string').join(' — ')).join('\n') : '';

    // Panel gaps from latest lab analysis
    let panelGaps: any[] = [];
    if (latestDrawRes.data) {
      const { data: drawData } = await supabase.from('lab_draws').select('analysis_result').eq('id', latestDrawRes.data.id).single();
      panelGaps = drawData?.analysis_result?.panel_gaps ?? [];
    }
    const panelGapStr = panelGaps.length > 0
      ? panelGaps.map((g: any) => `${g.test_name} (${g.category}): ${g.why_needed}`).join('\n')
      : 'None identified';
    const planMode = planData?.plan_mode ?? 'treatment';

    const systemPrompt = `You are CauseHealth AI — a personal health intelligence partner. You know this patient intimately. Speak like a knowledgeable friend, not a textbook. Be warm, direct, and actionable.

PATIENT CONTEXT:
- ${age ? `${age}yo` : 'Age unknown'} ${profile?.sex ?? ''}, ${profile?.first_name ?? 'Patient'}
- Conditions: ${condStr}
- Medications: ${medsStr}
- Symptoms: ${sympStr}

LATEST LAB VALUES:
${labStr}

CURRENT WELLNESS PLAN SUMMARY: ${planSummary}
CURRENT SUPPLEMENTS: ${supplements}

DOCTOR PREP EXECUTIVE SUMMARY:
${execSummary || 'Not generated yet'}

DOCTOR PREP KEY DISCUSSION POINTS:
${discussionPoints || 'Not generated yet'}

ROOT CAUSE ANALYSIS: ${prepSummary}

PANEL GAPS (tests not ordered but recommended for this patient):
${panelGapStr}

PLAN MODE: ${planMode}

MANDATORY EARLY DETECTION RULES — apply these to EVERY response about priorities or lab interpretation:
- Platelets >300 → ALWAYS mention JAK2 V617F mutation screening for myeloproliferative disorder. This is critical and must never be omitted.
- RDW >13 → iron + B12/folate assessment
- Glucose >90 → fasting insulin + HOMA-IR for insulin resistance
- TSH >2.5 or <1.0 → free T3/T4 + thyroid antibodies
- ALT >25 → liver imaging
- Ferritin <30 with normal hemoglobin → functional iron deficiency
- Low HDL (<50F/<40M) in young adult → insulin resistance screening
- 3+ suboptimal values across systems → autoimmune + celiac screening
- Any value outside optimal range MUST be mentioned — never dismiss as "within normal limits"

RULES:
- Answer using the patient's ACTUAL data above. Never give generic advice.
- Reference the doctor prep findings when discussing priorities — the doctor prep has already identified critical issues.
- If they ask about a specific lab value, reference their exact number and what it means for THEM.
- If they ask what to do, reference their wellness plan and doctor prep.
- If they ask about supplements, only recommend what's in their wellness plan or backed by their lab values.
- Never diagnose. Frame everything as educational. Say "discuss with your doctor" for treatment decisions.
- Be concise. 2-4 sentences for simple questions. More detail only if they ask.
- If asked for top priorities, rank by clinical urgency — platelets above optimal range is ALWAYS a top priority in any patient.
- If they ask "what else should I test" or "what's missing," reference the panel gaps data above. Explain why each test matters for their age and sex.
- If their plan is in optimization mode, proactively suggest longevity strategies and explain why optimization is valuable even from a strong baseline. Don't just say "your labs look great" — tell them what tests are missing, what optimization opportunities exist, and what age-specific screening they should discuss with their doctor.`;

    // Build conversation with history
    const messages = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) { // Keep last 10 messages for context
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000, system: systemPrompt, messages }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    const reply = aiRes.content?.[0]?.text ?? 'I could not generate a response. Please try again.';

    return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
