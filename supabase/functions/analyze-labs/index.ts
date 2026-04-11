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
    const age = profile?.date_of_birth ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / 31557600000) : null;

    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 120000); // 120s — Supabase allows up to 150s
    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        signal: apiController.signal,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 6000,
          system: `You are CauseHealth AI — a clinical health intelligence system. Return ONLY valid JSON. CRITICAL RULES:
1. Flag EVERY value outside optimal range as a priority finding — do not skip any.
2. PATTERN RECOGNITION: Connect abnormal values across organ systems. Look for multi-marker patterns that suggest undiagnosed conditions (e.g., elevated platelets + elevated RDW = iron deficiency or myeloproliferative disorder; low HDL + borderline glucose = metabolic syndrome). Each pattern should be in the "patterns" array with markers_involved, description, and likely_cause.
3. VALUES ABOVE OPTIMAL BUT WITHIN STANDARD RANGE ARE NOT SAFE. MANDATORY follow-ups:
   Platelets >300 → JAK2 + peripheral smear. RDW >13 → iron + B12/folate. Glucose >90 → insulin + HOMA-IR. TSH >2.5 or <1.0 → free T3/T4 + antibodies. ALT >25 → liver ultrasound. Vitamin D <40 → repletion. Homocysteine >8 → B12/folate/B6. hs-CRP >1 → inflammatory workup. WBC >10 → differential. 3+ suboptimal values → autoimmune + celiac + metabolic screening. Ferritin <30 even with normal Hgb → functional iron deficiency. Low HDL (<50F/<40M) in young adult → insulin resistance. MCV >92 without anemia → B12/folate. MCV <82 → iron + hemoglobin electrophoresis. Elevated globulin >3.0 → autoimmune/infection. Calcium >10 → hyperparathyroidism. Low CO2 <23 → metabolic acidosis workup. Young female with weight gain + fatigue + normal TSH → ALWAYS check free T3/T4 + antibodies + insulin + celiac. No "within normal limits" dismissals.
4. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning. A finding borderline in a 50-year-old may be urgent in an 18-year-old.
5. EARLY DETECTION is the primary goal — find what a 12-minute doctor appointment would miss.
6. Frame as educational information for discussion with a healthcare provider.`,
        messages: [{ role: 'user', content: `Analyze these labs:\n\nPatient: ${age ? `${age}yo ` : ''}${profile?.sex ?? 'unknown'}\nMedications: ${medsStr || 'None'}\nSymptoms: ${sympStr || 'None'}\n\nLab Results:\n${labStr}\n\nReturn JSON: { "priority_findings": [{ "marker": "", "value": "", "flag": "urgent|monitor|optimal", "headline": "", "explanation": "" }], "patterns": [{ "pattern_name": "", "severity": "critical|high|medium", "markers_involved": [], "description": "", "likely_cause": "" }], "medication_connections": [{ "medication": "", "lab_finding": "", "connection": "" }], "missing_tests": [{ "test_name": "", "why_needed": "", "icd10": "", "priority": "urgent|high|moderate" }], "immediate_actions": [], "summary": "" }` }],
        }),
      });
    } catch (e: any) {
      clearTimeout(apiTimeout);
      if (e?.name === 'AbortError') {
        await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
        return new Response(JSON.stringify({ error: 'Analysis timed out — please retry from your lab detail page' }), { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw e;
    }
    clearTimeout(apiTimeout);

    if (!response.ok) {
      await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
      return new Response(JSON.stringify({ error: 'Analysis failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const aiRes = await response.json();
    const rawText = aiRes.content?.[0]?.text ?? '';
    const stopReason = aiRes.stop_reason ?? 'unknown';
    console.log(`[analyze-labs] stop_reason=${stopReason}, output_length=${rawText.length}`);
    let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const lb = cleaned.lastIndexOf('}');
    if (lb > 0) cleaned = cleaned.slice(0, lb + 1);
    let analysis;
    try { analysis = JSON.parse(cleaned); } catch (parseErr) {
      console.error(`[analyze-labs] Parse failed. stop_reason=${stopReason}, first 500 chars:`, cleaned.slice(0, 500));
      // If truncated (max_tokens hit), try to salvage by closing open arrays/objects
      if (stopReason === 'max_tokens') {
        try {
          // Close any open arrays and objects
          let salvaged = cleaned;
          // Count open brackets
          const openBraces = (salvaged.match(/\{/g) || []).length - (salvaged.match(/\}/g) || []).length;
          const openBrackets = (salvaged.match(/\[/g) || []).length - (salvaged.match(/\]/g) || []).length;
          // Remove trailing comma and incomplete values
          salvaged = salvaged.replace(/,\s*$/, '').replace(/,\s*"[^"]*"?\s*$/, '');
          for (let i = 0; i < openBrackets; i++) salvaged += ']';
          for (let i = 0; i < openBraces; i++) salvaged += '}';
          analysis = JSON.parse(salvaged);
          console.log('[analyze-labs] Salvaged truncated JSON successfully');
        } catch {
          await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
          return new Response(JSON.stringify({ error: 'Parse failed — AI output was truncated' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        await supabase.from('lab_draws').update({ processing_status: 'failed' }).eq('id', drawId);
        return new Response(JSON.stringify({ error: `Parse failed: ${String(parseErr)}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Ensure panel_gaps array exists
    if (!Array.isArray(analysis.panel_gaps)) analysis.panel_gaps = [];

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

    // Log detections — track every value outside optimal that standard labs call "normal"
    if (labValues && labValues.length > 0) {
      const detections = labValues
        .filter((v: any) => v.optimal_flag && v.optimal_flag !== 'optimal' && (!v.standard_flag || v.standard_flag === 'normal'))
        .map((v: any) => ({
          user_id: userId,
          detection_type: 'suboptimal_within_standard',
          marker_name: v.marker_name,
          value: v.value,
          optimal_high: v.optimal_high,
          standard_high: v.standard_high,
          condition_flagged: analysis.priority_findings?.find((f: any) => f.marker?.toLowerCase().includes(v.marker_name?.toLowerCase()))?.headline || null,
          test_recommended: analysis.missing_tests?.[0]?.test_name || null,
          severity: v.optimal_flag === 'deficient' || v.optimal_flag === 'elevated' ? 'critical' : v.optimal_flag === 'suboptimal_low' || v.optimal_flag === 'suboptimal_high' ? 'moderate' : 'moderate',
          was_within_standard_range: true,
        }));
      if (detections.length > 0) {
        await supabase.from('detections').delete().eq('user_id', userId);
        await supabase.from('detections').insert(detections);
      }
    }

    return new Response(JSON.stringify(analysis), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    // Mark draw as failed so it doesn't stay stuck in "processing"
    try {
      const body = await req.clone().json().catch(() => null);
      if (body?.drawId) {
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        await sb.from('lab_draws').update({ processing_status: 'failed' }).eq('id', body.drawId);
      }
    } catch { /* best-effort */ }
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
