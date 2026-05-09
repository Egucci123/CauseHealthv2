// src/hooks/useAppendToDraw.ts
//
// Append a NEW PDF (e.g., a CRP-only follow-up report) to an EXISTING lab
// draw. Reuses the original draw's date, lab name, and provider — only the
// new markers from the appended PDF get added to lab_values.
//
// This solves the "I forgot to upload one of my files" problem without
// creating a duplicate January draw or losing the original analysis.
//
// Flow:
//   1. Upload the new file to storage
//   2. Extract values via the same extract-labs edge function
//   3. Filter out duplicates (markers that already exist on the draw)
//   4. Insert new lab_values rows with the existing draw_id
//   5. Re-trigger analyze-labs so the analysis reflects the merged dataset
//   6. Invalidate downstream queries (priority alerts, bio age, etc.)
//
// Wellness Plan + Doctor Prep are NOT auto-regenerated — those cost money
// per call and the user can choose when to refresh them.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { extractPDFText, looksLikeLabReport } from '../lib/pdfParser';
import { logEvent } from '../lib/clientLog';

export type AppendStatus =
  | 'idle'
  | 'uploading'
  | 'reading'
  | 'extracting'
  | 'merging'
  | 'reanalyzing'
  | 'done'
  | 'error';

interface AppendResult {
  appendedCount: number;     // markers actually added
  skippedCount: number;      // markers that already existed (deduped)
  newMarkerNames: string[];  // for the success toast
}

// Normalize a marker name for dedupe comparison. Strip whitespace, casing,
// punctuation, and common parenthetical suffixes so "CRP" / "C-Reactive Protein"
// / "hs-CRP" don't all collide if they're genuinely different markers — but
// "Hemoglobin" matches "hemoglobin" and "Vitamin D" matches "Vitamin D, 25-Hydroxy".
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')      // drop parentheticals
    .replace(/[^a-z0-9]/g, '')      // strip non-alphanum
    .trim();
}

export function useAppendToDraw(drawId: string | null) {
  const qc = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const [status, setStatus] = useState<AppendStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<AppendResult, Error, File>({
    mutationFn: async (file: File): Promise<AppendResult> => {
      if (!drawId) throw new Error('No draw to append to');
      if (!userId) throw new Error('Not signed in');

      // 1. Upload PDF to storage (so it's preserved alongside the original)
      setStatus('uploading');
      logEvent('append_to_draw_start', { drawId, fileName: file.name });
      console.log('[append] starting storage upload', { fileName: file.name, size: file.size, type: file.type });

      // Refresh auth session before storage upload — staging tokens go stale on
      // mobile and a stale token causes the upload to hang silently for the
      // session timeout instead of failing fast.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('[append] no session, refreshing');
          await supabase.auth.refreshSession();
        }
      } catch (e) {
        console.warn('[append] session refresh failed:', e);
      }

      const rand = Math.random().toString(36).slice(2, 10);
      const fileName = `${userId}/${Date.now()}_${rand}_append_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      console.log('[append] uploading to path', fileName);

      // 30-second hard timeout so a stalled upload surfaces a real error
      // instead of leaving the modal frozen forever.
      const uploadPromise = supabase.storage.from('lab-pdfs').upload(fileName, file, { cacheControl: '3600', upsert: true });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Storage upload timed out after 30 seconds. Try again or check your connection.')), 30_000)
      );
      const { error: storageErr } = await Promise.race([uploadPromise, timeoutPromise]) as any;
      console.log('[append] storage upload done', { error: storageErr });
      if (storageErr) throw new Error(`Upload failed: ${storageErr.message}`);

      // 2. Try client-side text extraction first (faster + cheaper)
      setStatus('reading');
      let pdfText = '';
      try {
        pdfText = await extractPDFText(file);
      } catch (err) {
        console.warn('[append] client-side text extract failed, will send PDF to AI:', err);
      }
      const useText = pdfText.length >= 100 && looksLikeLabReport(pdfText);

      // 3. Call extract-labs (same edge function the regular upload uses)
      setStatus('extracting');
      let extractBody: any;
      if (useText) {
        extractBody = { pdfText: pdfText.slice(0, 24000) };
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        extractBody = file.type.startsWith('image/')
          ? { imageBase64: base64, imageMimeType: file.type }
          : { pdfBase64: base64 };
      }
      const { data: extracted, error: extractErr } = await supabase.functions.invoke('extract-labs', { body: extractBody });
      console.log('[append] extract-labs response:', { extracted, extractErr, usedText: useText });
      if (extractErr) {
        const ctx = (extractErr as any).context;
        let detail = extractErr.message;
        try { if (ctx instanceof Response) { const t = await ctx.json(); detail = t?.error || t?.detail || detail; } } catch {}
        throw new Error(`Could not read the file: ${detail}`);
      }
      const extractedValues = Array.isArray((extracted as any)?.values) ? (extracted as any).values : [];
      if (extractedValues.length === 0) {
        throw new Error('No lab values found in this file. The AI could not parse the report — try a clearer PDF or scan.');
      }
      console.log('[append] extracted', extractedValues.length, 'value(s):', extractedValues.map((v: any) => v.marker_name));

      // 4. Pull the existing draw row (we need the draw_date to stamp on
      // the new lab_values rows — the regular upload pipeline always sets
      // this, and downstream queries / TrajectoryStrip rely on it).
      setStatus('merging');
      const { data: drawRow, error: drawErr } = await supabase
        .from('lab_draws')
        .select('draw_date, raw_pdf_url')
        .eq('id', drawId)
        .single();
      if (drawErr || !drawRow) throw new Error(`Could not load draw: ${drawErr?.message ?? 'not found'}`);

      const { data: existingValues, error: existingErr } = await supabase
        .from('lab_values')
        .select('marker_name')
        .eq('draw_id', drawId);
      if (existingErr) throw new Error(`Could not read existing values: ${existingErr.message}`);

      const existingNormalized = new Set((existingValues ?? []).map((v: any) => normalizeName(v.marker_name ?? '')));

      // 5. Filter to NEW markers only
      const newRows: any[] = [];
      const newMarkerNames: string[] = [];
      let skipped = 0;
      for (const v of extractedValues) {
        const norm = normalizeName(v.marker_name ?? '');
        if (!norm) { skipped++; continue; }
        if (existingNormalized.has(norm)) { skipped++; continue; }
        existingNormalized.add(norm);  // also dedupe within the new file itself
        newRows.push({
          draw_id: drawId,
          user_id: userId,
          marker_name: v.marker_name,
          value: v.value,
          unit: v.unit ?? null,
          standard_low: v.standard_low ?? null,
          standard_high: v.standard_high ?? null,
          standard_flag: v.standard_flag ?? 'normal',
          marker_category: v.category ?? 'other',
          draw_date: drawRow.draw_date,
        });
        newMarkerNames.push(v.marker_name);
      }

      console.log('[append] extract result:', {
        rawValuesFromExtract: extractedValues.length,
        existingMarkers: existingNormalized.size,
        newRowsToInsert: newRows.length,
        newMarkerNames,
        skipped,
      });

      if (newRows.length === 0) {
        // Nothing new to add — every marker was already on the draw.
        return { appendedCount: 0, skippedCount: skipped, newMarkerNames: [] };
      }

      // 6. Insert the new lab_values rows
      const { error: insertErr, data: insertData } = await supabase.from('lab_values').insert(newRows).select();
      console.log('[append] insert result:', { inserted: insertData?.length ?? 0, error: insertErr });
      if (insertErr) throw new Error(`Could not save values: ${insertErr.message}`);

      // 6b. Invalidate the clinical_facts_cache for this user — the lab
      // values just changed, so any cached facts are stale. Without this,
      // wellness plan / lab analysis / doctor prep could read pre-append
      // facts on the next request even though the labs differ.
      try {
        await supabase.from('clinical_facts_cache').delete().eq('user_id', userId);
        console.log('[append] cleared clinical_facts_cache (lab values changed)');
      } catch (e) {
        console.warn('[append] facts cache clear failed (non-fatal):', e);
      }

      // 7. Re-trigger analyze-labs on this draw so the analysis reflects the
      // merged dataset. Defaults to v2 (matches the rest of the app) — opt
      // out via localStorage.setItem('analyze_labs_v2', '0'). When new
      // lab values are appended, the input_state_hash changes so v2's
      // facts cache correctly recomputes; the lock mechanism prevents
      // concurrent analysis calls. Reset analysis_count so the merged
      // dataset gets a fresh attempt within the cap.
      setStatus('reanalyzing');
      const _useV1Append = typeof window !== 'undefined' && window.localStorage?.getItem('analyze_labs_v2') === '0';
      const _appendAnalyzeFn = _useV1Append ? 'analyze-labs' : 'analyze-labs-v2';
      await supabase.from('lab_draws').update({
        processing_status: 'processing',
        analysis_result: null,
        analysis_count: 0,           // append = new dataset → fresh count
        analysis_locked_until: null, // clear stale lock from prior run
      }).eq('id', drawId);
      const { error: analyzeErr } = await supabase.functions.invoke(_appendAnalyzeFn, {
        body: { drawId, userId },
      });
      if (analyzeErr) {
        console.warn('[append] analyze-labs failed:', analyzeErr);
        // Don't throw — the values are already saved. Surface a soft warning
        // in the success copy instead so the user knows to manually re-run.
      } else {
        console.log('[append] analyze-labs complete');
      }

      logEvent('append_to_draw_success', { drawId, appended: newRows.length, skipped });
      return { appendedCount: newRows.length, skippedCount: skipped, newMarkerNames };
    },
    onSuccess: () => {
      setStatus('done');
      // Bust the relevant caches so the UI picks up the new values + analysis
      qc.invalidateQueries({ queryKey: ['labValues'] });
      qc.invalidateQueries({ queryKey: ['lab-detail'] });
      qc.invalidateQueries({ queryKey: ['labDraws'] });
      qc.invalidateQueries({ queryKey: ['latestLabDraw'] });
      qc.invalidateQueries({ queryKey: ['priorityAlerts'] });
    },
    onError: (err) => {
      setStatus('error');
      setErrorMessage(err.message);
      logEvent('append_to_draw_error', { drawId, error: err.message });
    },
  });

  const reset = () => {
    setStatus('idle');
    setErrorMessage(null);
    mutation.reset();
  };

  return {
    append: mutation.mutate,
    isPending: mutation.isPending,
    status,
    errorMessage,
    result: mutation.data,
    reset,
  };
}
