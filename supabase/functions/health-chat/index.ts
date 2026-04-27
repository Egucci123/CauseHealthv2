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
    const [profileRes, medsRes, symptomsRes, conditionsRes, suppsRes, latestDrawRes, wellnessPlanRes, doctorPrepRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
      supabase.from('conditions').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('user_supplements').select('name, dose').eq('user_id', userId).eq('is_active', true),
      supabase.from('lab_draws').select('id, draw_date, lab_name').eq('user_id', userId).order('draw_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('wellness_plans').select('plan_data').eq('user_id', userId).eq('generation_status', 'complete').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('doctor_prep_documents').select('document_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const profile = profileRes.data;
    const meds = medsRes.data ?? [];
    const symptoms = symptomsRes.data ?? [];
    const conditions = conditionsRes.data ?? [];
    const userSupps = suppsRes.data ?? [];
    const userSuppsStr = userSupps.map((s: any) => `${s.name}${s.dose ? ` (${s.dose})` : ''}`).join(', ') || 'None';
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

    const systemPrompt = `You are CauseHealth AI — a personal health partner. You know this patient. Speak like a smart friend, not a textbook.

VOICE RULES (CRITICAL):
- 6th-grade reading level. No medical jargon without a plain-English definition right after.
- MAX 4 SHORT LINES per reply for simple questions. Use bullets, not paragraphs.
- Lead each bullet with a verb or an emoji.
- "Stress hormone" not "cortisol." "Iron stores" not "ferritin." "Inflammation marker" not "hs-CRP."
- After your answer, ALWAYS suggest 2-3 follow-up chips the user can tap. Format on the LAST line ONLY:
  CHIPS: [chip 1] | [chip 2] | [chip 3]
- Keep chip text under 6 words each.
- If the question is complex, give a 1-line summary first, then offer to expand.

PATIENT CONTEXT:
- ${age ? `${age}yo` : 'Age unknown'} ${profile?.sex ?? ''}, ${profile?.first_name ?? 'Patient'}
- Conditions: ${condStr}
- Medications: ${medsStr}
- Symptoms: ${sympStr}

LATEST LAB VALUES:
${labStr}

CURRENT WELLNESS PLAN SUMMARY: ${planSummary}
PLAN-RECOMMENDED SUPPLEMENTS: ${supplements}
USER-REPORTED SUPPLEMENTS (already taking — factor lab interactions): ${userSuppsStr}

SUPPLEMENT LAB-INTERACTION CHEAT SHEET (use when explaining a value):
- Creatine raises serum creatinine artifactually (not kidney damage). Cystatin-C gives true GFR.
- Biotin >1mg distorts TSH/T3/T4/Troponin/Vit D — pause 72h before retest.
- B12 supplementation makes serum B12 unreliable; MMA/homocysteine are the real check.
- Iron, Vitamin D3 supplements directly raise their lab values — abnormal "high" may just be intake.
- Niacin lowers LDL/TG, raises HDL, can elevate ALT/uric acid/glucose.
- Omega-3 lowers TG and CRP; thins blood.
- Berberine lowers glucose/A1c/LDL.
- TRT raises Hct, suppresses LH/FSH.
- Vitamin K2 affects INR (warfarin).
- Curcumin lowers CRP/ALT.
- TMG/methylfolate/B12 lower homocysteine.
- Saw palmetto can lower PSA (mask BPH/cancer signal).
- Ashwagandha lowers cortisol; can raise T4.
- Whey/high protein nudges BUN up (not kidney pathology).
If a "high" or "low" value matches one of the user's supplements, mention the link instead of treating it as pathology.

DOCTOR PREP EXECUTIVE SUMMARY:
${execSummary || 'Not generated yet'}

DOCTOR PREP KEY DISCUSSION POINTS:
${discussionPoints || 'Not generated yet'}

ROOT CAUSE ANALYSIS: ${prepSummary}

PANEL GAPS (tests not ordered but recommended for this patient):
${panelGapStr}

PLAN MODE: ${planMode}

EARLY DETECTION RULES — apply these to lab discussion, but NEVER scare the user with rare-disease screening for borderline values:
- RDW >13 → mention iron + B12/folate assessment
- Glucose >90 → mention fasting insulin + HOMA-IR for insulin resistance
- TSH >2.5 or <1.0 → mention free T3/T4 + thyroid antibodies
- ALT >25 → mention liver imaging + lifestyle (most fatty liver fixes itself with diet/walking)
- Ferritin <30 with normal hemoglobin → mention functional iron deficiency
- Low HDL (<50F/<40M) in young adult → mention insulin resistance screening
- Any value outside optimal range — explain in plain English, suggest lifestyle FIRST.

COMMON-BUT-MISSED CONDITIONS — surface these aggressively when patterns suggest them (1-10% prevalence, routinely missed):
- PCOS (women): testosterone + DHEA-S + LH:FSH + fasting insulin if irregular cycles, acne, hair issues, insulin resistance.
- Hashimoto's: TPO + thyroglobulin antibodies if TSH outside 1.0-2.5 or thyroid symptoms.
- Subclinical hypothyroidism: Free T3 + Free T4 + reverse T3 if TSH 2.5-4.5 with symptoms.
- Low T (men): total + free T + SHBG + estradiol if fatigue, weight gain, low libido.
- Perimenopause (women 35-50): FSH + estradiol + progesterone + AMH for cycle/mood/sleep changes.
- Adrenal/HPA-axis: AM cortisol + DHEA-S for chronic stress fatigue.
- Functional iron deficiency: full iron panel for ferritin <50, hair loss, fatigue (esp menstruating women).
- B12 status: MMA + homocysteine if B12 <500 or cognitive symptoms.
- NAFLD: liver ultrasound + GGT for any ALT >25.
- Celiac: tTG-IgA + total IgA for GI symptoms, iron deficiency, autoimmune disease.
- SIBO: breath test for persistent bloating + post-meal gas.
- Sleep apnea: STOP-BANG for snoring, daytime fatigue, weight, hypertension.
- Endometriosis: pelvic ultrasound for pelvic pain, heavy bleeding.

LIFESTYLE-FIRST RULE FOR RARE DISEASES (CRITICAL): Most abnormal labs in young adults improve with 90 days of clean diet, movement, sleep, and targeted supplementation. Do NOT recommend rare-disease screening unless the user hits a HARD urgent threshold:
- JAK2 V617F → only mention if platelets >450 OR (RBC >6.0 AND Hct >54). Borderline-high RBC/Hct alone is NOT enough.
- Celiac panel → only if persistent malabsorption + iron deficiency + GI symptoms.
- HLA-B27 → only if persistent inflammatory back pain >90 days unresponsive to lifestyle.
- ANA reflex panel → only if ANA already positive.
- Myeloma screening → only with globulin >3.5 + age <40 or persistent hypercalcemia.
- Hereditary panels → only with strong family history or specific lab pattern (ferritin >300 + sat >45% for hemochromatosis).
If the user asks "what tests should I get," default to ROUTINE PCP-orderable tests (lipid NMR, fasting insulin, iron panel, thyroid, vitamin D, liver ultrasound, hsCRP). Rare-disease screening is the SECOND visit, not the first.

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
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, system: systemPrompt, messages }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const aiRes = await response.json();
    let reply = aiRes.content?.[0]?.text ?? 'I could not generate a response. Please try again.';

    // Parse out the CHIPS: line — return reply + chips separately
    let chips: string[] = [];
    const chipMatch = reply.match(/CHIPS:\s*(.+?)$/im);
    if (chipMatch) {
      chips = chipMatch[1].split('|').map((c: string) => c.trim().replace(/^\[|\]$/g, '').trim()).filter((c: string) => c.length > 0).slice(0, 3);
      reply = reply.replace(/CHIPS:\s*.+?$/im, '').trim();
    }

    return new Response(JSON.stringify({ reply, chips }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
