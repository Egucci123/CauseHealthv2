// supabase/functions/extract-labs/index.ts
// Deploy with: supabase functions deploy extract-labs
// Set secret: supabase secrets set ANTHROPIC_API_KEY=your_key

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { pdfText, drawDate } = await req.json();
    if (!pdfText || pdfText.length < 50) return new Response(JSON.stringify({ error: 'PDF text too short' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const prompt = `You are a medical lab report parser. Extract all laboratory test values from the following lab report text.\n\nReturn ONLY valid JSON — no markdown, no explanation.\n\nLab report text:\n${pdfText.slice(0, 12000)}\n\nReturn: { "draw_date": "YYYY-MM-DD or null", "lab_name": "name or null", "ordering_provider": "name or null", "values": [{ "marker_name": "name", "value": 97.0, "unit": "IU/L", "standard_low": 0, "standard_high": 44, "standard_flag": "normal|low|high|critical_low|critical_high", "category": "metabolic|cardiovascular|liver|kidney|thyroid|hormones|nutrients|cbc|inflammation|other" }] }\n\nInclude every single lab value. value must be a number.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
    });

    if (!response.ok) { const err = await response.text(); return new Response(JSON.stringify({ error: 'AI extraction failed', detail: err }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    const aiResponse = await response.json();
    const cleaned = (aiResponse.content?.[0]?.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    if (!parsed.values || !Array.isArray(parsed.values)) return new Response(JSON.stringify({ error: 'Missing values array' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (drawDate) parsed.draw_date = drawDate;

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
