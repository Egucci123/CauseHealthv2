// supabase/functions/_synthetic-tests/index.ts
//
// Runs the synthetic patient test bench. POST to this endpoint → JSON
// summary of pass/fail per patient. Use as CI gate before deploying any
// generation function that depends on the deterministic engines.
//
// curl -X POST <url>/functions/v1/_synthetic-tests -H "apikey: <anon>"
//   → { ok: true, total: 5, passed: 5, failed: 0, results: [...] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { runSyntheticTests, PATIENTS } from '../_shared/syntheticPatients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const results = runSyntheticTests();
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  return new Response(
    JSON.stringify({
      ok: failed === 0,
      total: PATIENTS.length,
      passed,
      failed,
      results,
    }, null, 2),
    {
      status: failed === 0 ? 200 : 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
