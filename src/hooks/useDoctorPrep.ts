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
    pharmaceutical_alternatives: Array<{ name: string; reason: string }>;
    natural_alternatives: Array<{ name: string; reason: string }>;
  }>;
  patient_questions?: string[];
  functional_medicine_note?: string;
}

// Module-level generation state — survives component unmount/remount
let activeGeneration: Promise<DoctorPrepDocument> | null = null;
let generatingFlag = false;
let lastGenerationTime = 0;

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
    if (activeGeneration) return activeGeneration;
    // Rate limit: minimum 30 seconds between generations
    if (Date.now() - lastGenerationTime < 30000) throw new Error('Please wait before regenerating');

    generatingFlag = true;
    lastGenerationTime = Date.now();
    setGenerating(true);

    // Grab the user's JWT for the Authorization header. Without this, the
    // edge function returns 401 and the button does nothing — same auth
    // pattern as generate-wellness-plan and analyze-labs.
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
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Generation failed');
      qc.setQueryData(['doctor-prep', userId], data as DoctorPrepDocument);
      return data as DoctorPrepDocument;
    }).finally(() => {
      activeGeneration = null;
      generatingFlag = false;
      setGenerating(false);
    });

    return activeGeneration;
  };

  return { generate, generating };
}
