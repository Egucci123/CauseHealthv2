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
          system: `You are CauseHealth AI — a clinical health intelligence system. Return ONLY valid JSON. Write explanations in plain, simple language that anyone can understand — no medical jargon without immediately explaining it. CRITICAL RULES:
1. Flag EVERY value outside optimal range as a priority finding — do not skip any.
2. PATTERN RECOGNITION: Connect abnormal values across organ systems. Look for multi-marker patterns (e.g., elevated platelets + elevated RDW = iron deficiency; low HDL + borderline glucose = metabolic syndrome). Each pattern goes in the "patterns" array.
3. VALUES ABOVE OPTIMAL BUT WITHIN STANDARD RANGE ARE NOT SAFE. MANDATORY follow-ups (apply ALL that match):
   CORE PATTERNS:
   - Platelets >450 → JAK2 V617F + peripheral smear (rule out essential thrombocythemia/MPN).
   - Platelets >300 with elevated RDW or fatigue → iron panel + JAK2 if persistent.
   - RDW >13 → iron panel + B12/folate + reticulocyte count.
   - Glucose >90 → fasting insulin + HOMA-IR (insulin resistance hides behind 'normal' glucose).
   - HbA1c >5.4 → fasting insulin + HOMA-IR even if glucose normal.
   - TSH >2.5 OR <1.0 → free T3 + free T4 + TPO + thyroglobulin antibodies.
   - ALT >25 → liver ultrasound + hepatitis panel + GGT (NAFLD starts well before 'abnormal').
   - AST/ALT ratio >2 → screen for alcoholic liver disease + macrocytic anemia.
   - Triglyceride/HDL ratio >3.5 → strongest insulin resistance predictor; order fasting insulin + HOMA-IR + ApoB.
   - Vitamin D <40 → repletion + recheck 8 weeks.
   - Homocysteine >8 → B12/folate/B6 + consider MTHFR.
   - hs-CRP >1 → full inflammatory workup + autoimmune screening.
   - WBC >10 → differential + infection/inflammation workup.
   - 3+ suboptimal values across organ systems → autoimmune + celiac + metabolic screening.
   - Ferritin <30 even with normal Hgb → functional iron deficiency (causes hair loss/fatigue/brain fog).
   - Low HDL (<50F/<40M) in young adult → insulin resistance + ApoB.
   - MCV >92 without anemia → B12/folate or alcohol/liver disease.
   - MCV <82 without anemia → iron deficiency or thalassemia trait → hemoglobin electrophoresis.
   - MCH/MCV mismatch (low MCV with normal MCH) → thalassemia trait screening (often missed).
   - Elevated globulin >3.0 → SPEP/UPEP for paraprotein (myeloma screening, especially in young adults).
   - Globulin >3.5 in patient under 40 → urgent SPEP + free light chains.
   - Calcium >10 (especially repeated) → PTH + vitamin D + 24h urine calcium (hyperparathyroidism).
   - Calcium variability across draws → repeat with PTH simultaneously.
   - Low CO2 <23 → metabolic acidosis workup (renal tubular acidosis, chronic diarrhea, malabsorption).
   - Polyuria/dilute urine + low specific gravity (<1.005) → diabetes insipidus screening.
   - Eosinophils >5% or absolute >0.5 → parasitic stool studies + IgE + atopic disease workup.
   - Lymphocytes >40% with absolute >4.0 → flow cytometry if persistent (CLL screening), check EBV/CMV.
   - Reverse T3 elevation (when tested) → assess for chronic stress, illness, or thyroid hormone resistance.
   - Positive ANA → reflex panel (anti-dsDNA, anti-Sm, anti-Ro/La, anti-Scl-70, anti-Jo-1).
   - Bilirubin 1.0-1.5 with normal liver enzymes → fractionate (Gilbert syndrome vs hemolysis).
   - Uric acid >6 (F) or >7 (M) in young adult → metabolic syndrome screening + consider lifestyle.
   - Elevated RBC + hematocrit at upper limit + bilirubin elevated → secondary polycythemia vs MPN (JAK2 + EPO level).
   No "within normal limits" dismissals.
4. AGE/SEX CONTEXT: Apply age and sex-appropriate reasoning.
5. FEMALE HORMONE RULE: Do NOT interpret estradiol, progesterone, FSH, or LH as abnormal in premenopausal females unless the value is extreme (e.g., FSH >40, estradiol <10 or >500, progesterone >30). These hormones vary dramatically by menstrual cycle phase. Do NOT build clinical narratives like "estrogen dominance" from a single blood draw without knowing cycle day.
6. EARLY DETECTION is the primary goal — find what a 12-minute doctor appointment would miss.
7. Write headlines and explanations in plain English. Instead of "hepatocellular dysfunction" say "your liver is working harder than it should." Keep explanations to 1-2 sentences max.
8. Frame as educational information for discussion with a healthcare provider.`,
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
