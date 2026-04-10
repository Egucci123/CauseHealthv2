// src/lib/medicalSearch.ts
// Real-time medical database search using free NIH/NLM APIs
// No API key needed. Returns results in milliseconds.

export interface MedSearchResult {
  name: string;
  form?: string;
}

export interface ConditionSearchResult {
  name: string;
  icd10: string;
}

// ── Medication Search (NLM RxTerms) ─────────────────────────────────────────
// Returns FDA-approved drug names with dosage forms
export async function searchMedicationsAPI(query: string): Promise<MedSearchResult[]> {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(query)}&maxList=10`
    );
    if (!res.ok) return [];
    const data = await res.json();
    // data[1] = display strings, data[2] = extra fields
    const names: string[] = data[1] ?? [];
    return names.map(n => {
      // Extract name and form: "hydroCHLOROthiazide (Oral Pill)" → { name: "hydroCHLOROthiazide", form: "Oral Pill" }
      const match = n.match(/^(.+?)\s*\((.+?)\)$/);
      if (match) return { name: match[1].trim(), form: match[2].trim() };
      return { name: n.trim() };
    });
  } catch {
    return [];
  }
}

// ── Condition Search (NLM ICD-10-CM) ────────────────────────────────────────
// Returns diagnosis names with ICD-10 codes
export async function searchConditionsAPI(query: string): Promise<ConditionSearchResult[]> {
  if (!query || query.length < 2) return [];
  try {
    const res = await fetch(
      `https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?sf=code,name&terms=${encodeURIComponent(query)}&maxList=10`
    );
    if (!res.ok) return [];
    const data = await res.json();
    // data[3] = array of [code, name] pairs
    const pairs: string[][] = data[3] ?? [];
    return pairs.map(([code, name]) => ({ icd10: code, name }));
  } catch {
    return [];
  }
}
