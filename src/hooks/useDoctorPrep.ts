// src/hooks/useDoctorPrep.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useState, useEffect } from 'react';

export interface TestToRequest {
  test_name: string; clinical_justification: string;
  icd10_primary: string; icd10_description: string;
  icd10_secondary?: string; icd10_secondary_description?: string;
  priority: 'urgent' | 'high' | 'moderate'; insurance_note: string;
  /** Where this test belongs at follow-up. Mirrors the wellness plan's
   *  retest_timeline.specialist so PDFs + UI can group by venue (PCP /
   *  GI / Imaging / etc.). */
  specialist?: 'pcp' | 'gi' | 'imaging' | 'functional' | 'mental_health'
    | 'cardiology' | 'endocrinology' | 'sleep_medicine' | 'hepatology'
    | 'rheumatology' | 'nephrology' | 'hematology';
}

export interface DoctorPrepDocument {
  generated_at: string; document_date: string; chief_complaint: string; hpi: string; pmh: string;
  executive_summary?: string[];
  medications: Array<{ name: string; dose?: string; notable_depletion?: string | null }>;
  review_of_systems: Record<string, string>;
  lab_summary: {
    draw_date: string; lab_name: string;
    urgent_findings: Array<{ marker: string; value: string; flag: string; clinical_note: string }>;
    other_abnormal: Array<{ marker: string; value: string; flag: string }>;
  };
  tests_to_request: TestToRequest[];
  advanced_screening?: TestToRequest[];
  discussion_points: string[];
  medication_alternatives?: Array<{
    current_medication: string;
    /** 1 sentence — the specific finding in THIS patient that warrants
     *  considering an alternative (ALT 97 elevation on atorvastatin, etc.).
     *  Empty string if not applicable. */
    reason_to_consider?: string;
    pharmaceutical_alternatives: Array<{ name: string; reason: string }>;
    natural_alternatives: Array<{ name: string; reason: string }>;
  }>;
  patient_questions?: string[];
  functional_medicine_note?: string;
  /** Differential diagnosis: conditions the data fits but the user
   *  hasn't been diagnosed with. Sourced from the wellness plan's
   *  suspected_conditions. Rendered separately from tests_to_request. */
  possible_conditions?: Array<{
    name: string;
    category?: string;
    confidence?: 'high' | 'moderate' | 'low';
    evidence?: string;
    confirmatory_tests?: string[];
    icd10?: string;
    what_to_ask_doctor?: string;
    source?: 'ai' | 'deterministic';
  }>;
}

// Module-level generation state — survives component unmount/remount
let activeGeneration: Promise<DoctorPrepDocument> | null = null;
let generatingFlag = false;
// (removed: lastGenerationTime — cooldown now server-side via regen cap)

export function useLatestDoctorPrep() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['doctor-prep', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('doctor_prep_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const doc = data.document_data as DoctorPrepDocument;
      (doc as any)._createdAt = data.created_at;
      return doc;
    },
    enabled: !!userId, staleTime: 30 * 1000, refetchOnMount: 'always',
  });
}

export function useGenerateDoctorPrep() {
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const [generating, setGenerating] = useState(generatingFlag);

  // On mount, if a generation is already in flight, attach to it
  useEffect(() => {
    if (activeGeneration && generatingFlag) {
      setGenerating(true);
      activeGeneration
        .then((data) => { if (data) qc.setQueryData(['doctor-prep', userId], data); })
        .catch(() => {})
        .finally(() => setGenerating(false));
    }
  }, [qc, userId]);

  const generate = async () => {
    if (!userId) throw new Error('Not authenticated');
    // Only short-circuit on genuinely-in-flight generations (mirror
    // useWellnessPlan fix). Stale completed promises were causing
    // Regenerate clicks to no-op until page refresh.
    if (activeGeneration && generatingFlag) return activeGeneration;
    activeGeneration = null;
    // (Removed: 30s cooldown — redundant with server-side regen cap.)

    generatingFlag = true;
    setGenerating(true);

    // Capture start time for the recovery path. iOS Safari kills fetches
    // when the tab backgrounds / screen locks, but the edge function keeps
    // running and saves to DB. On fetch failure, we look for a doc that
    // landed AFTER startedAt and consume that as a successful response.
    const startedAt = new Date().toISOString();

    // Grab the user's JWT for the Authorization header.
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

    activeGeneration = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-doctor-prep`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ userId }),
      keepalive: true,
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Generation failed');
      qc.setQueryData(['doctor-prep', userId], data as DoctorPrepDocument);
      return data as DoctorPrepDocument;
    }).catch(async (err: any) => {
      // Recovery: check DB for a doc saved after startedAt.
      try {
        const { data: recovered } = await supabase
          .from('doctor_prep_documents')
          .select('document_data, created_at')
          .eq('user_id', userId)
          .gte('created_at', startedAt)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recovered?.document_data) {
          console.log('[doctor-prep] recovered doc from DB after fetch dropped', { startedAt, recoveredAt: recovered.created_at });
          qc.setQueryData(['doctor-prep', userId], recovered.document_data as DoctorPrepDocument);
          return recovered.document_data as DoctorPrepDocument;
        }
      } catch (recoverErr) {
        console.warn('[doctor-prep] recovery query failed:', recoverErr);
      }
      throw err;
    }).finally(() => {
      activeGeneration = null;
      generatingFlag = false;
      setGenerating(false);
      // Belt-and-suspenders: invalidate so any subscriber refetches even
      // if the setQueryData above missed for any reason.
      qc.invalidateQueries({ queryKey: ['doctor-prep', userId] });
    });

    return activeGeneration;
  };

  return { generate, generating };
}
