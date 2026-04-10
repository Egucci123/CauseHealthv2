// supabase/functions/analyze-labs/index.ts
// Deploy with: supabase functions deploy analyze-labs
// Requires: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { drawId, userId } = await req.json();
    if (!drawId || !userId) return new Response(JSON.stringify({ error: 'drawId and userId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [{ data: labValues }, { data: profile }, { data: meds }, { data: symptoms }] = await Promise.all([
      supabase.from('lab_values').select('*').eq('draw_id', drawId),
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('medications').select('*').eq('user_id', userId).eq('is_active', true),
      supabase.from('symptoms').select('*').eq('user_id', userId),
    ]);

    if (!labValues?.length) return new Response(JSON.stringify({ error: 'No lab values found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const labStr = labValues.map((v: any) => `${v.marker_name}: ${v.value} ${v.unit} (Std: ${v.standard_low ?? '?'}–${v.standard_high ?? '?'})${v.optimal_flag ? ` [${v.optimal_flag.toUpperCase()}]` : ''}`).join('\n');
    const medsStr = (meds ?? []).map((m: any) => m.name).join(', ');
    const sympStr = (symptoms ?? []).map((s: any) => `${s.symptom} (${s.severity}/10)`).join(', ');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 8000,
        system: `You are CauseHealth AI — a clinical health intelligence system. Return ONLY valid JSON. CRITICAL RULES:
1. Flag EVERY value outside optimal range as a priority finding — do not skip any.
2. PATTERN RECOGNITION: Connect abnormal values across organ systems. Look for multi-marker patterns that suggest undiagnosed conditions (e.g., elevated platelets + elevated RDW = iron deficiency or myeloproliferative disorder; low HDL + borderline glucose = metabolic syndrome). Each pattern should be in the "patterns" array with markers_involved, description, and likely_cause.
3. VALUES ABOVE OPTIMAL BUT WITHIN STANDARD RANGE ARE NOT SAFE. MANDATORY follow-ups:
   Platelets >300 → JAK2 + peripheral smear. RDW >13 → iron + B12/folate. Glucose >90 → insulin + HOMA-IR. TSH >2.5 or <1.0 → free T3/T4 + antibodies. ALT >25 → liver ultrasound. Vitamin D <40 → repletion. Homocysteine >8 → B12/folate/B6. hs-CRP >1 → inflammatory workup. WBC >10 → differential. 3+ suboptimal values across systems → autoimmune + celiac + metabolic screening. No "within normal limits" dismissals.
4. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning. A finding borderline in a 50-year-old may be urgent in an 18-year-old.
5. EARLY DETECTION is the primary goal — find what a 12-minute doctor appointment would miss.
5. Frame as educational information for discussion with a healthcare provider.`,
        messages: [{ role: 'user', content: `Analyze these labs:\n\nPatient: ${profile?.sex ?? 'unknown'}\nMedications: ${medsStr || 'None'}\nSymptoms: ${sympStr || 'None'}\n\nLab Results:\n${labStr}\n\nReturn JSON: { "priority_findings": [{ "marker": "", "value": "", "flag": "urgent|monitor|optimal", "headline": "", "explanation": "" }], "patterns": [{ "pattern_name": "", "severity": "critical|high|medium", "markers_involved": [], "description": "", "likely_cause": "" }], "medication_connections": [{ "medication": "", "lab_finding": "", "connection": "" }], "missing_tests": [{ "test_name": "", "why_needed": "", "icd10": "", "priority": "urgent|high|moderate" }], "immediate_actions": [], "summary": "" }` }],
      }),
    });

    if (!response.ok) return new Response(JSON.stringify({ error: 'Analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const aiRes = await response.json();
    let cleaned = (aiRes.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lb = cleaned.lastIndexOf('}');
    if (lb > 0) cleaned = cleaned.slice(0, lb + 1);
    let analysis;
    try { analysis = JSON.parse(cleaned); } catch { return new Response(JSON.stringify({ error: 'Parse failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    await supabase.from('lab_draws').update({ analysis_result: analysis, processing_status: 'complete' }).eq('id', drawId);

    // Generate priority alerts from analysis findings
    if (analysis.priority_findings && Array.isArray(analysis.priority_findings)) {
      // Clear old alerts for this draw
      await supabase.from('priority_alerts').delete().eq('draw_id', drawId);
      const alerts = analysis.priority_findings.map((f: any) => ({
        user_id: userId,
        draw_id: drawId,
        status: f.flag === 'urgent' ? 'urgent' : f.flag === 'monitor' ? 'monitor' : 'optimal',
        title: f.headline || f.marker,
        description: f.explanation || null,
        source: f.marker || null,
        action_label: 'View Lab Detail',
        action_path: `/labs/${drawId}`,
        dismissed: false,
      }));
      if (alerts.length > 0) {
        await supabase.from('priority_alerts').insert(alerts);
      }
    }

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
