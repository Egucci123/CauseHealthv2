// src/hooks/useEngineDepletions.ts
//
// UNIVERSAL DEPLETION DATA SOURCE FOR THE UI
// ==========================================
// Replaces the 16-entry hardcoded client-side medicationDepletions data
// file with the live backend engine output. The backend covers 35 drug
// classes / 314 brand+generic names; this hook surfaces all of them.
//
// Reads from the latest wellness_plans row's medication_depletions
// array (preferred) and falls back to doctor_prep_documents if the
// wellness plan isn't generated yet. Returns a Map keyed by lowercased
// brand/generic name -> all matching depletions for that med.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

export interface EngineDepletion {
  medication: string;          // user's actual med name(s) that matched, joined by " / "
  med_class: string;           // canonical key (e.g. 'statin', 'ppi')
  nutrient: string;
  mechanism: string;
  severity: 'high' | 'moderate' | 'low';
  monitoring_test: string | null;
  clinical_effects: string[];
  recommended_supplement_key?: string;
}

export interface EngineDepletionMap {
  /** All depletions for a user's medication name (case-insensitive lookup). */
  byMedName: Map<string, EngineDepletion[]>;
  /** All depletions keyed by med_class (so we can cover branded names
   *  without an exact match — anything matching that drug class). */
  byMedClass: Map<string, EngineDepletion[]>;
  /** Flat list — for diagnostics. */
  all: EngineDepletion[];
}

function buildMap(deps: EngineDepletion[]): EngineDepletionMap {
  const byMedName = new Map<string, EngineDepletion[]>();
  const byMedClass = new Map<string, EngineDepletion[]>();
  for (const d of deps) {
    // Split joined "Atorvastatin / Lipitor" back into individual names.
    const names = String(d.medication ?? '').split(/\s*\/\s*/).map(s => s.trim().toLowerCase()).filter(Boolean);
    for (const n of names) {
      const arr = byMedName.get(n) ?? [];
      arr.push(d);
      byMedName.set(n, arr);
    }
    const cls = String(d.med_class ?? '').toLowerCase();
    if (cls) {
      const arr = byMedClass.get(cls) ?? [];
      arr.push(d);
      byMedClass.set(cls, arr);
    }
  }
  return { byMedName, byMedClass, all: deps };
}

export function useEngineDepletions() {
  const { user } = useAuthStore();
  const userId = user?.id;

  return useQuery<EngineDepletionMap>({
    queryKey: ['engine-depletions', userId],
    enabled: !!userId,
    queryFn: async () => {
      // 1) Prefer the latest wellness plan — refreshed on every gen.
      const { data: wp } = await supabase
        .from('wellness_plans')
        .select('plan_data')
        .eq('user_id', userId!)
        .eq('generation_status', 'complete')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const wpDeps = (wp?.plan_data as any)?.medication_depletions;
      if (Array.isArray(wpDeps) && wpDeps.length > 0) return buildMap(wpDeps as EngineDepletion[]);

      // 2) Fallback to the doctor-prep document.
      const { data: dp } = await supabase
        .from('doctor_prep_documents')
        .select('document_data')
        .eq('user_id', userId!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const dpDeps = (dp?.document_data as any)?.medication_depletions;
      if (Array.isArray(dpDeps) && dpDeps.length > 0) return buildMap(dpDeps as EngineDepletion[]);

      // 3) Nothing generated yet — return empty map.
      return buildMap([]);
    },
    staleTime: 60_000,
  });
}

/** Given a user's medication name, look up every depletion the engine
 *  produced for that med. Falls back to medClass match when the exact
 *  name isn't in the map (catches brand/generic mismatches). */
export function lookupDepletions(
  map: EngineDepletionMap | undefined,
  medName: string,
): EngineDepletion[] {
  if (!map) return [];
  const key = medName.toLowerCase().trim();
  const direct = map.byMedName.get(key);
  if (direct && direct.length > 0) return direct;
  // Fuzzy: any entry whose joined medication string contains this name.
  const fuzzy = map.all.filter(d =>
    String(d.medication ?? '').toLowerCase().includes(key),
  );
  return fuzzy;
}
