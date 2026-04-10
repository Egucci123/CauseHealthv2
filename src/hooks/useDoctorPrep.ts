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

export function useLatestDoctorPrep() {
  const userId = useAuthStore(s => s.user?.id);
  return useQuery({
    queryKey: ['doctor-prep', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.from('doctor_prep_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data ? (data.document_data as DoctorPrepDocument) : null;
    },
    enabled: !!userId, staleTime: 5 * 60 * 1000,
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
        .then(() => { qc.invalidateQueries({ queryKey: ['doctor-prep'] }); })
        .catch(() => {})
        .finally(() => setGenerating(false));
    }
  }, [qc]);

  const generate = async () => {
    if (!userId) throw new Error('Not authenticated');
    if (activeGeneration) return activeGeneration; // Already in flight

    const { data: { session } } = await supabase.auth.getSession();

    generatingFlag = true;
    setGenerating(true);

    activeGeneration = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-doctor-prep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
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
