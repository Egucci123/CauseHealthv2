// supabase/functions/_shared/regenCap.ts
//
// Universal regen-cap helper used by generate-wellness-plan,
// generate-doctor-prep, and analyze-labs. Same hash-of-lab-values
// approach across all three so the user sees consistent limits:
//
//   - 2 wellness plans per lab dataset
//   - 2 doctor preps per lab dataset
//   - 2 lab analyses per lab dataset
//
// Uploading genuinely new labs (different values) produces a different
// hash → fresh count for that new dataset. Re-uploading the same
// numbers does not reset the cap.

export const REGEN_CAP = 2;

/** Stable SHA-256 hash of the canonicalised lab values for a draw. */
export async function hashLabsForDraw(supabase: any, drawId: string): Promise<string> {
  const { data: vals } = await supabase
    .from('lab_values')
    .select('marker_name, value, unit')
    .eq('draw_id', drawId);
  if (!vals?.length) return '';
  const canonical = [...vals]
    .sort((a: any, b: any) => String(a.marker_name ?? '').localeCompare(String(b.marker_name ?? '')))
    .map((v: any) => {
      const num = typeof v.value === 'number' ? v.value : parseFloat(String(v.value ?? ''));
      const rounded = Number.isFinite(num) ? num.toFixed(2) : String(v.value ?? '');
      return `${String(v.marker_name ?? '').trim().toLowerCase()}|${rounded}|${String(v.unit ?? '').trim().toLowerCase()}`;
    })
    .join(';');
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Find all draws by this user in the last 14 days that share the same
 *  lab-value hash as the given draw. Returns including the given draw. */
export async function findMatchingDrawIds(supabase: any, userId: string, drawId: string): Promise<string[]> {
  const currentHash = await hashLabsForDraw(supabase, drawId);
  if (!currentHash) return [drawId];
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentDraws } = await supabase
    .from('lab_draws')
    .select('id, draw_date')
    .eq('user_id', userId)
    .gte('draw_date', fourteenDaysAgo.slice(0, 10));
  const out: string[] = [drawId];
  for (const d of recentDraws ?? []) {
    if (d.id === drawId) continue;
    const h = await hashLabsForDraw(supabase, d.id);
    if (h && h === currentHash) out.push(d.id);
  }
  return out;
}

/** Result of a cap check. */
export interface RegenCapResult {
  allowed: boolean;
  used: number;
  cap: number;
}

/**
 * Check whether the user can generate another artifact of `kind` for
 * this lab dataset. `kind` controls which table is counted from. Each
 * artifact has its own count — wellness plans don't deduct from doctor
 * preps' budget, etc.
 */
export async function checkRegenCap(
  supabase: any,
  userId: string,
  drawId: string,
  kind: 'wellness_plan' | 'doctor_prep',
): Promise<RegenCapResult> {
  const matchingDrawIds = await findMatchingDrawIds(supabase, userId, drawId);
  let used = 0;
  if (kind === 'wellness_plan') {
    const { count } = await supabase
      .from('wellness_plans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('draw_id', matchingDrawIds)
      .eq('generation_status', 'complete');
    used = count ?? 0;
  } else if (kind === 'doctor_prep') {
    const { count } = await supabase
      .from('doctor_prep_documents')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('draw_id', matchingDrawIds);
    used = count ?? 0;
  }
  return { allowed: used < REGEN_CAP, used, cap: REGEN_CAP };
}

/** Build the standard 429 error response body for cap-reached cases. */
export function regenLimitError(kind: string, used: number, cap: number) {
  const label = kind === 'wellness_plan' ? 'wellness plans'
    : kind === 'doctor_prep' ? 'doctor prep documents'
    : kind === 'analysis' ? 'lab analyses'
    : 'generations';
  return {
    error: `You've used all ${cap} ${label} for these lab values. Upload genuinely new labs (different values) to start fresh.`,
    code: 'REGEN_LIMIT_REACHED',
    limit: cap,
    used,
    kind,
  };
}
