// supabase/functions/extract-labs/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { pdfText, pdfBase64, drawDate } = body;

    // Build the message content based on what the client sent
    let messages;

    if (pdfBase64) {
      // Raw PDF sent as base64 — use Claude's document reading
      messages = [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          {
            type: 'text',
            text: `You are a medical lab report parser. First determine if this PDF is a medical laboratory report. If it is NOT a lab report (e.g. bank statement, resume, invoice, or any non-medical document), return: { "draw_date": null, "lab_name": null, "ordering_provider": null, "values": [] }\n\nIf it IS a lab report, extract all laboratory test values.\n\nReturn ONLY valid JSON — no markdown, no explanation.\n\nReturn: { "draw_date": "YYYY-MM-DD or null", "lab_name": "name or null", "ordering_provider": "name or null", "values": [{ "marker_name": "name", "value": 97.0, "unit": "IU/L", "standard_low": 0, "standard_high": 44, "standard_flag": "normal|low|high|critical_low|critical_high", "category": "metabolic|cardiovascular|liver|kidney|thyroid|hormones|nutrients|cbc|inflammation|other" }] }\n\nInclude every single lab value. value must be a number. IMPORTANT: If lab values use international units (mmol/L, umol/L, nmol/L), convert them to US conventional units (mg/dL, ng/mL, ug/dL) before returning. Common conversions: glucose mmol/L x 18 = mg/dL, cholesterol mmol/L x 38.67 = mg/dL, triglycerides mmol/L x 88.57 = mg/dL, creatinine umol/L / 88.4 = mg/dL, calcium mmol/L x 4.0 = mg/dL, uric acid umol/L / 59.48 = mg/dL. Always return values in US conventional units with the US unit label.`,
          },
        ],
      }];
    } else if (pdfText && pdfText.length >= 50) {
      // Pre-extracted text sent from client
      const prompt = `You are a medical lab report parser. Extract all laboratory test values from the following lab report text.\n\nReturn ONLY valid JSON — no markdown, no explanation.\n\nLab report text:\n${pdfText.slice(0, 12000)}\n\nReturn: { "draw_date": "YYYY-MM-DD or null", "lab_name": "name or null", "ordering_provider": "name or null", "values": [{ "marker_name": "name", "value": 97.0, "unit": "IU/L", "standard_low": 0, "standard_high": 44, "standard_flag": "normal|low|high|critical_low|critical_high", "category": "metabolic|cardiovascular|liver|kidney|thyroid|hormones|nutrients|cbc|inflammation|other" }] }\n\nInclude every single lab value. value must be a number. IMPORTANT: If lab values use international units (mmol/L, umol/L, nmol/L), convert them to US conventional units (mg/dL, ng/mL, ug/dL) before returning. Common conversions: glucose mmol/L x 18 = mg/dL, cholesterol mmol/L x 38.67 = mg/dL, triglycerides mmol/L x 88.57 = mg/dL, creatinine umol/L / 88.4 = mg/dL, calcium mmol/L x 4.0 = mg/dL, uric acid umol/L / 59.48 = mg/dL. Always return values in US conventional units with the US unit label.`;
      messages = [{ role: 'user', content: prompt }];
    } else {
      return new Response(JSON.stringify({ error: 'No PDF data provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8000, messages }),
    });

    if (!response.ok) { const err = await response.text(); return new Response(JSON.stringify({ error: 'AI extraction failed', detail: err }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    const aiResponse = await response.json();
    const cleaned = (aiResponse.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      const lb = cleaned.lastIndexOf('}');
      parsed = JSON.parse(lb > 0 ? cleaned.slice(0, lb + 1) : cleaned);
    } catch { return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    if (!parsed.values || !Array.isArray(parsed.values)) return new Response(JSON.stringify({ error: 'Missing values array' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (drawDate) parsed.draw_date = drawDate;

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
