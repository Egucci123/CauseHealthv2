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
  /** 2026-05-12-38: embedded canonical supplement details — populated
   *  from SUPPLEMENT_BASE so the Medications tab doesn't depend on the
   *  per-user supplement_stack (which is cap-filtered). */
  recommended_supplement?: {
    nutrient: string;
    dose: string;
    form: string;
    timing: string;
    why_short: string;
    practical_note: string;
  } | null;
}

export interface EngineAlternative {
  current_medication: string;
  reason_to_consider: string;
  pharmaceutical_alternatives: Array<{ name: string; reason: string }>;
  natural_alternatives: Array<{ name: string; reason: string }>;
}

export interface EngineDepletionMap {
  /** All depletions for a user's medication name (case-insensitive lookup). */
  byMedName: Map<string, EngineDepletion[]>;
  /** All depletions keyed by med_class (so we can cover branded names
   *  without an exact match — anything matching that drug class). */
  byMedClass: Map<string, EngineDepletion[]>;
  /** Flat list — for diagnostics. */
  all: EngineDepletion[];
  /** Medication alternatives — engine output keyed by current_medication
   *  (lowercased). Empty when no alternatives engine rule fired. */
  alternativesByMed: Map<string, EngineAlternative[]>;
  alternativesAll: EngineAlternative[];
}

function buildMap(deps: EngineDepletion[], alts: EngineAlternative[]): EngineDepletionMap {
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
  const alternativesByMed = new Map<string, EngineAlternative[]>();
  for (const a of alts) {
    const key = String(a.current_medication ?? '').toLowerCase().trim();
    if (!key) continue;
    const arr = alternativesByMed.get(key) ?? [];
    arr.push(a);
    alternativesByMed.set(key, arr);
  }
  return { byMedName, byMedClass, all: deps, alternativesByMed, alternativesAll: alts };
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
      const wpAlts = (wp?.plan_data as any)?.medication_alternatives;
      if (Array.isArray(wpDeps) && wpDeps.length > 0) {
        return buildMap(
          wpDeps as EngineDepletion[],
          (Array.isArray(wpAlts) ? wpAlts : []) as EngineAlternative[],
        );
      }

      // 2) Fallback to the doctor-prep document.
      const { data: dp } = await supabase
        .from('doctor_prep_documents')
        .select('document_data')
        .eq('user_id', userId!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const dpDeps = (dp?.document_data as any)?.medication_depletions;
      const dpAlts = (dp?.document_data as any)?.medication_alternatives;
      if (Array.isArray(dpDeps) && dpDeps.length > 0) {
        return buildMap(
          dpDeps as EngineDepletion[],
          (Array.isArray(dpAlts) ? dpAlts : []) as EngineAlternative[],
        );
      }

      // 3) Nothing generated yet — return empty map.
      return buildMap([], []);
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

/** Given a user's medication name + the engine's depletion classification,
 *  return any "consider switching" alternatives the engine flagged. Matches
 *  the current_medication string the engine emits (e.g. "Atorvastatin",
 *  "Metformin", "PPI", "GLP-1 receptor agonist"). */
export function lookupAlternatives(
  map: EngineDepletionMap | undefined,
  medName: string,
  medClass: string | undefined,
): EngineAlternative[] {
  if (!map) return [];
  const name = medName.toLowerCase().trim();
  const cls = (medClass ?? '').toLowerCase().trim();
  const matches: EngineAlternative[] = [];
  for (const a of map.alternativesAll) {
    const cur = String(a.current_medication ?? '').toLowerCase();
    if (cur.includes(name) || name.includes(cur)) { matches.push(a); continue; }
    if (cls && (cur.includes(cls) || cls.includes(cur))) matches.push(a);
  }
  return matches;
}
