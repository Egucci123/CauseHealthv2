// src/store/labUploadStore.ts
// Zustand store for lab upload — persists across component mount/unmount
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useAuthStore } from './authStore';
import { extractPDFText, looksLikeLabReport } from '../lib/pdfParser';

export type UploadPhase = 'idle' | 'uploading' | 'extracting' | 'reviewing' | 'analyzing' | 'complete' | 'error' | 'manual';

export interface ExtractedValue {
  id: string; marker_name: string; value: number; unit: string;
  standard_low: number | null; standard_high: number | null;
  standard_flag: string; category: string;
}

export interface ExtractionResult {
  draw_date: string | null; lab_name: string | null;
  ordering_provider: string | null; values: ExtractedValue[];
}

interface LabUploadStore {
  phase: UploadPhase;
  progress: number;
  statusMessage: string;
  drawId: string | null;
  extraction: ExtractionResult | null;
  errorMessage: string | null;
  completedDrawId: string | null;
  isRunning: boolean;

  reset: () => void;
  startUpload: (files: File[], userId: string) => void;
  confirmAndAnalyze: (values: ExtractedValue[], overrides: { drawDate?: string; labName?: string }, userId: string) => void;
  updateExtraction: (values: ExtractedValue[]) => void;
  resumeFromDraw: (userId: string) => Promise<void>;
}

// Module-level progress animation — survives across function calls
let _progressInterval: ReturnType<typeof setInterval> | null = null;
function startProgress(set: (s: Partial<LabUploadStore>) => void, from: number, to: number, durationMs: number) {
  if (_progressInterval) clearInterval(_progressInterval);
  let current = from;
  const step = (to - from) / (durationMs / 500);
  _progressInterval = setInterval(() => { current = Math.min(current + step, to); set({ progress: Math.round(current) }); }, 500);
}
function stopProgress() { if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; } }

export const useLabUploadStore = create<LabUploadStore>((set, get) => ({
  phase: 'idle', progress: 0, statusMessage: '', drawId: null,
  extraction: null, errorMessage: null, completedDrawId: null, isRunning: false,

  reset: () => set({ phase: 'idle', progress: 0, statusMessage: '', drawId: null, extraction: null, errorMessage: null, completedDrawId: null, isRunning: false }),

  updateExtraction: (values) => set(s => ({ extraction: s.extraction ? { ...s.extraction, values } : null })),

  // Hydrate the store from a draw already in the DB. Called on /labs/upload mount
  // so users who navigated away during a pending review come back to where they left off.
  resumeFromDraw: async (userId: string) => {
    if (get().isRunning || get().phase !== 'idle') return;
    try {
      // Find the most recent draw that's NOT complete (still in flight)
      const { data: drawRows } = await supabase
        .from('lab_draws')
        .select('*')
        .eq('user_id', userId)
        .neq('processing_status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1);
      const draw = drawRows?.[0];
      if (!draw) return;

      // Pull any lab_values already saved for this draw
      const { data: vals } = await supabase
        .from('lab_values')
        .select('*')
        .eq('draw_id', draw.id);

      if (!vals || vals.length === 0) {
        // No values saved → upload itself was interrupted before extraction finished.
        // Cleanup the orphan draw so the user can start fresh.
        await supabase.from('lab_draws').delete().eq('id', draw.id);
        return;
      }

      // Reconstruct ExtractedValue shape from DB rows so the review UI works
      const extraction: ExtractionResult = {
        draw_date: draw.draw_date,
        lab_name: draw.lab_name,
        ordering_provider: draw.ordering_provider,
        values: vals.map((v: any) => ({
          id: v.id,
          marker_name: v.marker_name,
          value: Number(v.value),
          unit: v.unit ?? '',
          standard_low: v.standard_low,
          standard_high: v.standard_high,
          standard_flag: v.standard_flag ?? 'normal',
          category: v.marker_category ?? 'other',
        })),
      };

      // If the draw is already analyzing on the server, show that. Otherwise resume review.
      const phase: UploadPhase = draw.processing_status === 'processing' && draw.analysis_result ? 'complete' : 'reviewing';
      set({
        phase,
        progress: phase === 'reviewing' ? 90 : 100,
        drawId: draw.id,
        extraction,
        completedDrawId: phase === 'complete' ? draw.id : null,
        statusMessage: phase === 'reviewing'
          ? `Welcome back — ${vals.length} values ready to review.`
          : 'Analysis complete.',
        isRunning: false,
      });
    } catch (e) {
      console.warn('[LabUpload] resumeFromDraw failed:', e);
    }
  },

  startUpload: (files, userId) => {
    if (get().isRunning) return;
    set({ isRunning: true });

    // Fire and forget — this promise runs independently of React
    (async () => {
      const fileCount = files.length;
      const plural = fileCount > 1;
      set({ phase: 'uploading', progress: 0, statusMessage: `[v623] Uploading ${fileCount} file${plural ? 's' : ''} to secure storage...`, errorMessage: null });

      try {
        // ── Free-tier cap: 1 lab upload per rolling 30 days ──
        // Pro / comp users have no cap. Server-enforced — but we check client-side
        // first so we never delete the user's files trying to upload over the cap.
        const profile = useAuthStore.getState().profile;
        const isPro = profile && (profile.subscriptionTier === 'pro' || profile.subscriptionTier === 'comp')
          && (profile.subscriptionStatus === 'active' || profile.subscriptionStatus === 'trialing');
        if (!isPro) {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
          const { count } = await supabase.from('lab_draws').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', thirtyDaysAgo);
          if ((count ?? 0) >= 1) {
            set({
              phase: 'error', isRunning: false,
              errorMessage: 'Free plan includes 1 lab upload per month. Upgrade to Pro ($19/mo) for unlimited uploads, or redeem a code in Settings.',
            });
            return;
          }
        }

        // 0. Ensure fresh auth session — critical for mobile where tokens go stale
        try {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          if (!currentSession) {
            await supabase.auth.refreshSession();
          }
        } catch (authErr) {
          console.error('[LabUpload] Auth refresh failed:', authErr);
        }

        // 1. Upload PDFs to storage
        const storagePaths: string[] = [];
        for (const file of files) {
          const rand = Math.random().toString(36).slice(2, 10);
          const fileName = `${userId}/${Date.now()}_${rand}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error } = await supabase.storage.from('lab-pdfs').upload(fileName, file, { cacheControl: '3600', upsert: true });
          if (error) throw new Error(`Storage upload failed: ${error.message}`);
          storagePaths.push(fileName);
        }
        set({ statusMessage: `${plural ? 'All files' : 'File'} received securely.`, progress: 20 });

        // 2. Create lab_draws record
        const { data: draw, error: drawErr } = await supabase.from('lab_draws').insert({
          user_id: userId, raw_pdf_url: storagePaths[0], processing_status: 'processing',
          draw_date: new Date().toISOString().split('T')[0],
        }).select().single();
        if (drawErr || !draw) throw new Error('Failed to create lab record');
        set({ drawId: draw.id });

        // 3. Try client-side text extraction first (PDFs only)
        set({ phase: 'extracting', statusMessage: `Reading ${plural ? `${fileCount} lab reports` : 'your lab report'}...`, progress: 35 });

        const isImageFile = (f: File) => f.type.startsWith('image/');
        const imageFiles = files.filter(isImageFile);
        const pdfFiles = files.filter(f => !isImageFile(f));

        const allTexts: string[] = [];
        let anyLooksLikeLab = imageFiles.length > 0; // Images bypass text-extract; trust the AI
        for (let i = 0; i < pdfFiles.length; i++) {
          if (plural) set({ statusMessage: `Reading file ${i + 1} of ${fileCount}: ${pdfFiles[i].name}`, progress: 35 + Math.round((i / fileCount) * 15) });
          try {
            const text = await extractPDFText(pdfFiles[i]);
            if (text && text.length >= 50) { allTexts.push(text); if (looksLikeLabReport(text)) anyLooksLikeLab = true; }
          } catch (err) { console.warn(`[LabUpload] Could not read ${pdfFiles[i].name}:`, err); }
        }

        const combinedText = allTexts.join('\n---NEW DOCUMENT---\n');
        const textExtractionFailed = !combinedText || combinedText.length < 100;

        // 4. Build request body — use text if available, otherwise send raw PDF to Claude
        set({ statusMessage: 'Identifying lab values...', progress: 55 });

        if (!textExtractionFailed && !anyLooksLikeLab) {
          set({ phase: 'manual', statusMessage: `${plural ? "These files don't appear" : "This file doesn't appear"} to be standard lab reports. Please enter values manually.`, isRunning: false });
          return;
        }

        let allValues: any[] = [];
        let extractedDrawDate: string | null = null;
        let extractedLabName: string | null = null;
        let extractedProvider: string | null = null;

        // ── Process IMAGE files (phone camera photos) ── always sent to AI as images
        if (imageFiles.length > 0) {
          let lastError = '';
          for (let i = 0; i < imageFiles.length; i++) {
            set({ statusMessage: `Reading photo ${i + 1} of ${imageFiles.length}...`, progress: 55 });
            startProgress(set, 55, 80, 30000);
            try {
              const arrayBuffer = await imageFiles[i].arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
              const base64 = btoa(binary);
              // Map mime: convert HEIC/HEIF to jpeg as fallback (browsers usually can't display HEIC inline anyway)
              let mime = imageFiles[i].type || 'image/jpeg';
              if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) mime = 'image/jpeg';
              const { data: imgData, error: invokeErr } = await supabase.functions.invoke('extract-labs', {
                body: { imageBase64: base64, imageMimeType: mime },
              });
              stopProgress();
              if (invokeErr) {
                const ctx = (invokeErr as any).context;
                let detail = invokeErr.message;
                try { if (ctx instanceof Response) { const t = await ctx.json(); detail = t?.error || t?.detail || JSON.stringify(t); } } catch {}
                lastError = detail;
                continue;
              }
              if (imgData?.values) allValues.push(...imgData.values);
              if (imgData?.draw_date && !extractedDrawDate) extractedDrawDate = imgData.draw_date;
              if (imgData?.lab_name && !extractedLabName) extractedLabName = imgData.lab_name;
              if (imgData?.ordering_provider && !extractedProvider) extractedProvider = imgData.ordering_provider;
            } catch (err: any) {
              stopProgress();
              lastError = err?.message || String(err);
            }
          }
          if (allValues.length === 0 && pdfFiles.length === 0) {
            await supabase.from('lab_draws').delete().eq('id', draw.id);
            set({ phase: 'error', errorMessage: `Could not read your photo. ${lastError ? `Error: ${lastError}` : 'Try a sharper, well-lit shot or upload a PDF.'}`, isRunning: false });
            return;
          }
        }

        if (textExtractionFailed && pdfFiles.length > 0) {
          // Client-side extraction failed — send each PDF to Claude individually
          let lastError = '';
          for (let i = 0; i < pdfFiles.length; i++) {
            set({ statusMessage: `Sending PDF ${i + 1} of ${pdfFiles.length} to AI...`, progress: 50 });
            startProgress(set, 50, 85, 60000); // Animate 50→85% over ~60s
            for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const arrayBuffer = await pdfFiles[i].arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
              const base64 = btoa(binary);

              // Use supabase.functions.invoke — it auto-refreshes the JWT
              const { data: pdfData, error: invokeErr } = await supabase.functions.invoke('extract-labs', {
                body: { pdfBase64: base64 },
              });
              stopProgress();
              if (invokeErr) {
                const ctx = (invokeErr as any).context;
                let detail = invokeErr.message;
                try { if (ctx instanceof Response) { const t = await ctx.json(); detail = t?.error || t?.detail || JSON.stringify(t); } } catch {}
                lastError = detail;
                continue;
              }
              if (pdfData?.values) allValues.push(...pdfData.values);
              if (pdfData?.draw_date && !extractedDrawDate) extractedDrawDate = pdfData.draw_date;
              if (pdfData?.lab_name && !extractedLabName) extractedLabName = pdfData.lab_name;
              if (pdfData?.ordering_provider && !extractedProvider) extractedProvider = pdfData.ordering_provider;
              break;
            } catch (err: any) {
              lastError = err?.message || String(err);
            }
            } // end retry loop
          }

          if (allValues.length === 0) {
            stopProgress();
            await supabase.from('lab_draws').delete().eq('id', draw.id);
            set({ phase: 'error', errorMessage: `Could not extract lab values. ${lastError ? `Error: ${lastError}` : 'Try using manual entry.'}`, isRunning: false });
            return;
          }
        } else if (!textExtractionFailed && pdfFiles.length > 0) {
          // Text extraction worked — send combined text in one call
          set({ statusMessage: 'Analyzing lab values...', progress: 55 });
          startProgress(set, 55, 85, 30000); // Animate 55→85% over ~30s (text path is faster)
          const maxChars = Math.min(fileCount * 12000, 24000);

          const { data: textData, error: textErr } = await supabase.functions.invoke('extract-labs', {
            body: { pdfText: combinedText.slice(0, maxChars) },
          });
          stopProgress();
          if (textErr) {
            let detail = textErr.message;
            try { const ctx = (textErr as any).context; if (ctx instanceof Response) { const t = await ctx.json(); detail = t?.error || t?.detail || JSON.stringify(t); } } catch {}
            throw new Error(`Extraction failed: ${detail}`);
          }
          if (Array.isArray(textData?.values)) allValues.push(...textData.values);
          if (textData?.draw_date && !extractedDrawDate) extractedDrawDate = textData.draw_date;
          if (textData?.lab_name && !extractedLabName) extractedLabName = textData.lab_name;
          if (textData?.ordering_provider && !extractedProvider) extractedProvider = textData.ordering_provider;
        }

        // Build extraction result from merged values
        const data = { draw_date: extractedDrawDate, lab_name: extractedLabName, ordering_provider: extractedProvider, values: allValues };

        const extraction = data as ExtractionResult;
        if (extraction.values) {
          extraction.values = extraction.values.filter(v => v.value !== 0 && v.value != null && v.marker_name?.trim());
          // Deduplicate by marker name — keep the first occurrence
          const seen = new Set<string>();
          extraction.values = extraction.values.filter(v => {
            const key = v.marker_name.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        if (!extraction.values?.length) {
          await supabase.from('lab_draws').delete().eq('id', draw.id);
          set({ phase: 'manual', statusMessage: 'No valid lab values found. Please enter values manually.', isRunning: false });
          return;
        }
        extraction.values = extraction.values.map(v => ({ ...v, id: crypto.randomUUID() }));

        if (extraction.draw_date) {
          await supabase.from('lab_draws').update({ draw_date: extraction.draw_date, lab_name: extraction.lab_name, ordering_provider: extraction.ordering_provider }).eq('id', draw.id);
        }

        // Persist extracted values to lab_values IMMEDIATELY — this is what makes the
        // upload survive page refresh and navigation. If the user comes back later, the
        // values are in the DB and we hydrate state from there. (Old behavior: values
        // sat in client memory only, refresh wiped them.)
        try {
          const sex = useAuthStore.getState().profile?.sex ?? null;
          const ranges = getOptimalRanges(sex);
          const validOptimal = ['optimal', 'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated', 'unknown'];
          const validStandard = ['normal', 'low', 'high', 'critical_low', 'critical_high'];
          const persistRows = extraction.values.map(v => {
            const r = findOptimalRange(ranges, v.marker_name);
            const of_ = computeFlag(v.value, r, v.standard_low, v.standard_high, v.marker_name);
            return {
              draw_id: draw.id, user_id: userId, marker_name: v.marker_name,
              marker_category: v.category, value: v.value, unit: v.unit,
              standard_low: v.standard_low, standard_high: v.standard_high,
              optimal_low: r?.optimal_low ?? null, optimal_high: r?.optimal_high ?? null,
              standard_flag: validStandard.includes(v.standard_flag) ? v.standard_flag : null,
              optimal_flag: validOptimal.includes(of_) ? of_ : null,
              draw_date: extraction.draw_date,
            };
          });
          await supabase.from('lab_values').delete().eq('draw_id', draw.id);
          const { error: persistErr } = await supabase.from('lab_values').insert(persistRows);
          if (persistErr) console.warn('[LabUpload] Pre-review persist failed:', persistErr.message);
        } catch (e) { console.warn('[LabUpload] Pre-review persist exception:', e); }

        stopProgress();
        set({ extraction, phase: 'reviewing', statusMessage: `Found ${extraction.values.length} lab values${plural ? ` across ${fileCount} files` : ''}. Please review.`, progress: 90, isRunning: false });
      } catch (err) {
        stopProgress();
        const drawId = get().drawId;
        if (drawId) { try { await supabase.from('lab_draws').delete().eq('id', drawId); } catch {} }
        set({ phase: 'error', errorMessage: String(err), isRunning: false });
      }
    })();
  },

  confirmAndAnalyze: (values, overrides, userId) => {
    const drawId = get().drawId;
    const extraction = get().extraction;
    if (!drawId) { set({ phase: 'error', errorMessage: 'Missing context' }); return; }
    set({ phase: 'analyzing', statusMessage: 'Saving your edits and starting analysis...', progress: 75 });

    // Helper: wrap a promise with a timeout so nothing hangs forever
    const withTimeout = <T,>(p: PromiseLike<T>, ms: number, label: string): Promise<T | null> =>
      new Promise<T | null>((resolve) => {
        const timer = setTimeout(() => {
          console.warn(`[LabUpload] ${label} timed out after ${ms}ms — continuing`);
          resolve(null);
        }, ms);
        Promise.resolve(p).then((r) => { clearTimeout(timer); resolve(r as T); }).catch((e) => {
          clearTimeout(timer);
          console.warn(`[LabUpload] ${label} failed:`, e);
          resolve(null);
        });
      });

    // Fire-and-forget analysis trigger. Keepalive flag means this survives page
    // navigation and tab close. Server runs to completion regardless of client.
    const fireAnalysis = () => {
      try {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-labs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ drawId, userId }),
          keepalive: true,
        }).catch(console.warn);
      } catch (e) { console.warn('[LabUpload] analysis trigger threw:', e); }
    };

    (async () => {
      try {
        // Values are already persisted from the extraction step. Only do delete+reinsert
        // if user edited the table during review (we always do it for safety — handles
        // edits, additions, deletions cleanly). 8s timeout per op so nothing hangs.
        const sex = useAuthStore.getState().profile?.sex ?? null;
        const ranges = getOptimalRanges(sex);
        const validOptimal = ['optimal', 'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated', 'unknown'];
        const validStandard = ['normal', 'low', 'high', 'critical_low', 'critical_high'];

        const cleaned = values.map(v => {
          const r = findOptimalRange(ranges, v.marker_name);
          const of_ = computeFlag(v.value, r, v.standard_low, v.standard_high, v.marker_name);
          return {
            draw_id: drawId, user_id: userId, marker_name: v.marker_name,
            marker_category: v.category, value: v.value, unit: v.unit,
            standard_low: v.standard_low, standard_high: v.standard_high,
            optimal_low: r?.optimal_low ?? null, optimal_high: r?.optimal_high ?? null,
            standard_flag: validStandard.includes(v.standard_flag) ? v.standard_flag : null,
            optimal_flag: validOptimal.includes(of_) ? of_ : null,
            draw_date: overrides.drawDate ?? extraction?.draw_date,
          };
        });

        // Update metadata + replace values + fire analysis IN PARALLEL with timeouts
        await Promise.all([
          withTimeout(
            supabase.from('lab_draws').update({
              draw_date: overrides.drawDate ?? extraction?.draw_date ?? new Date().toISOString().split('T')[0],
              lab_name: overrides.labName ?? extraction?.lab_name,
            }).eq('id', drawId),
            8000, 'metadata update'
          ),
          (async () => {
            await withTimeout(supabase.from('lab_values').delete().eq('draw_id', drawId), 8000, 'values delete');
            await withTimeout(supabase.from('lab_values').insert(cleaned), 12000, 'values insert');
          })(),
        ]);

        // Compute + persist panel gaps in the background — never blocks UI
        const testedMarkers = new Set(values.map(v => v.marker_name.toLowerCase()));
        const panelGaps = computePanelGaps(testedMarkers);
        Promise.resolve(supabase.from('lab_draws').update({ notes: JSON.stringify({ panel_gaps: panelGaps }) }).eq('id', drawId)).catch(console.warn);

        // Mark complete BEFORE firing analysis — UX never sees a hang
        set({ phase: 'complete', completedDrawId: drawId, statusMessage: 'Saved. Analysis running.', progress: 100 });
        fireAnalysis();
      } catch (err) {
        // Even on error, fire the analysis — values may already be saved from extraction
        console.error('[LabUpload] confirmAndAnalyze error:', err);
        set({ phase: 'complete', completedDrawId: drawId, statusMessage: 'Saved. Analysis running.', progress: 100 });
        fireAnalysis();
      }
    })();
  },
}));

// ── Optimal ranges ──────────────────────────────────────────────────────────

function getOptimalRanges(sex?: string | null): Record<string, { optimal_low: number; optimal_high: number }> {
  // Sex-specific ranges — CBC, hormones, minerals
  const isFemale = sex === 'female';
  const testosterone = isFemale ? { optimal_low: 15, optimal_high: 70 } : { optimal_low: 600, optimal_high: 900 };
  const freeTestosterone = isFemale ? { optimal_low: 0.5, optimal_high: 5.0 } : { optimal_low: 10, optimal_high: 25 };
  const estradiol = isFemale ? { optimal_low: 50, optimal_high: 250 } : { optimal_low: 10, optimal_high: 40 };
  const hemoglobin = isFemale ? { optimal_low: 12.5, optimal_high: 14.5 } : { optimal_low: 14.0, optimal_high: 16.0 };
  const hematocrit = isFemale ? { optimal_low: 36, optimal_high: 44 } : { optimal_low: 40, optimal_high: 48 };
  const rbc = isFemale ? { optimal_low: 3.8, optimal_high: 4.8 } : { optimal_low: 4.5, optimal_high: 5.5 };
  const ferritin = isFemale ? { optimal_low: 30, optimal_high: 150 } : { optimal_low: 50, optimal_high: 150 };
  const dhea = isFemale ? { optimal_low: 100, optimal_high: 400 } : { optimal_low: 200, optimal_high: 500 };
  const prolactin = isFemale ? { optimal_low: 2, optimal_high: 25 } : { optimal_low: 2, optimal_high: 15 };

  return {
    glucose: { optimal_low: 75, optimal_high: 86 }, 'fasting glucose': { optimal_low: 75, optimal_high: 86 },
    hba1c: { optimal_low: 4.6, optimal_high: 5.3 }, insulin: { optimal_low: 2, optimal_high: 8 },
    'cholesterol, total': { optimal_low: 160, optimal_high: 200 }, 'total cholesterol': { optimal_low: 160, optimal_high: 200 },
    triglycerides: { optimal_low: 40, optimal_high: 100 },
    'hdl cholesterol': { optimal_low: 55, optimal_high: 100 }, hdl: { optimal_low: 55, optimal_high: 100 },
    'ldl cholesterol': { optimal_low: 0, optimal_high: 100 }, ldl: { optimal_low: 0, optimal_high: 100 },
    'vldl cholesterol': { optimal_low: 5, optimal_high: 20 }, vldl: { optimal_low: 5, optimal_high: 20 },
    cholesterol: { optimal_low: 160, optimal_high: 200 }, 'ldl/hdl ratio': { optimal_low: 0, optimal_high: 2.0 },
    alt: { optimal_low: 7, optimal_high: 20 }, 'sgpt': { optimal_low: 7, optimal_high: 20 },
    ast: { optimal_low: 10, optimal_high: 22 }, 'sgot': { optimal_low: 10, optimal_high: 22 },
    'alkaline phosphatase': { optimal_low: 35, optimal_high: 100 },
    bilirubin: { optimal_low: 0.1, optimal_high: 1.0 }, 'total bilirubin': { optimal_low: 0.1, optimal_high: 1.0 },
    albumin: { optimal_low: 4.0, optimal_high: 5.0 }, globulin: { optimal_low: 2.2, optimal_high: 2.8 },
    'a/g ratio': { optimal_low: 1.5, optimal_high: 2.2 },
    creatinine: { optimal_low: 0.8, optimal_high: 1.1 }, bun: { optimal_low: 10, optimal_high: 16 },
    egfr: { optimal_low: 90, optimal_high: 120 }, 'bun/creatinine ratio': { optimal_low: 10, optimal_high: 16 },
    tsh: { optimal_low: 0.5, optimal_high: 2.0 }, 'free t3': { optimal_low: 3.0, optimal_high: 4.0 },
    'free t4': { optimal_low: 1.0, optimal_high: 1.8 }, 't4, free': { optimal_low: 1.0, optimal_high: 1.8 }, 't4, free (direct)': { optimal_low: 1.0, optimal_high: 1.8 },
    'vitamin d': { optimal_low: 50, optimal_high: 80 }, '25-oh': { optimal_low: 50, optimal_high: 80 },
    '25-hydroxy': { optimal_low: 50, optimal_high: 80 },
    'vitamin b12': { optimal_low: 500, optimal_high: 1000 }, b12: { optimal_low: 500, optimal_high: 1000 },
    ferritin, iron: { optimal_low: 60, optimal_high: 170 },
    'iron saturation': { optimal_low: 25, optimal_high: 35 }, tibc: { optimal_low: 250, optimal_high: 370 },
    magnesium: { optimal_low: 2.0, optimal_high: 2.5 }, zinc: { optimal_low: 90, optimal_high: 120 },
    folate: { optimal_low: 10, optimal_high: 25 }, 'folic acid': { optimal_low: 10, optimal_high: 25 }, 'folate (folic acid), serum': { optimal_low: 10, optimal_high: 25 },
    'vitamin a': { optimal_low: 45, optimal_high: 65 },
    wbc: { optimal_low: 5.0, optimal_high: 8.0 }, rbc,
    hemoglobin, hematocrit,
    platelets: { optimal_low: 175, optimal_high: 300 }, mcv: { optimal_low: 82, optimal_high: 92 },
    mch: { optimal_low: 28, optimal_high: 32 }, mchc: { optimal_low: 32, optimal_high: 36 },
    rdw: { optimal_low: 11.5, optimal_high: 13.0 }, 'red cell distribution': { optimal_low: 11.5, optimal_high: 13.0 },
    mpv: { optimal_low: 7.5, optimal_high: 11.5 },
    // CBC differentials
    neutrophils: { optimal_low: 40, optimal_high: 60 }, 'neutrophils (absolute)': { optimal_low: 1.8, optimal_high: 5.0 },
    lymphs: { optimal_low: 20, optimal_high: 40 }, lymphocytes: { optimal_low: 20, optimal_high: 40 },
    'lymphs (absolute)': { optimal_low: 1.0, optimal_high: 3.5 }, 'lymphocytes (absolute)': { optimal_low: 1.0, optimal_high: 3.5 },
    monocytes: { optimal_low: 2, optimal_high: 8 }, 'monocytes (absolute)': { optimal_low: 0.2, optimal_high: 0.8 },
    eos: { optimal_low: 0, optimal_high: 3 }, eosinophils: { optimal_low: 0, optimal_high: 3 },
    'eos (absolute)': { optimal_low: 0, optimal_high: 0.3 }, 'eosinophils (absolute)': { optimal_low: 0, optimal_high: 0.3 },
    basophils: { optimal_low: 0, optimal_high: 1 }, basos: { optimal_low: 0, optimal_high: 1 },
    'basophils (absolute)': { optimal_low: 0, optimal_high: 0.1 }, 'baso (absolute)': { optimal_low: 0, optimal_high: 0.1 },
    // Thyroid expanded
    'thyroxine (t4)': { optimal_low: 6.0, optimal_high: 10.0 }, t4: { optimal_low: 6.0, optimal_high: 10.0 },
    'total t4': { optimal_low: 6.0, optimal_high: 10.0 }, 'total t3': { optimal_low: 80, optimal_high: 180 },
    'triiodothyronine (t3)': { optimal_low: 80, optimal_high: 180 }, 'triiodothyronine (t3), free': { optimal_low: 3.0, optimal_high: 4.0 },
    'hs-crp': { optimal_low: 0, optimal_high: 0.5 }, crp: { optimal_low: 0, optimal_high: 0.5 },
    'c-reactive protein': { optimal_low: 0, optimal_high: 0.5 }, 'c-reactive protein, cardiac': { optimal_low: 0, optimal_high: 0.5 },
    esr: { optimal_low: 0, optimal_high: 10 }, homocysteine: { optimal_low: 5, optimal_high: 8 },
    'uric acid': { optimal_low: 3.5, optimal_high: 5.5 },
    testosterone, 'free testosterone': freeTestosterone, 'free testosterone (direct)': freeTestosterone,
    estradiol, dhea, 'dhea-sulfate': dhea, 'dhea-s': dhea, prolactin,
    cortisol: { optimal_low: 6, optimal_high: 18 },
    sodium: { optimal_low: 138, optimal_high: 142 }, potassium: { optimal_low: 4.0, optimal_high: 4.5 },
    calcium: { optimal_low: 9.4, optimal_high: 10.0 }, chloride: { optimal_low: 100, optimal_high: 106 },
    'carbon dioxide': { optimal_low: 25, optimal_high: 30 }, phosphorus: { optimal_low: 3.0, optimal_high: 4.0 },
    'total protein': { optimal_low: 6.9, optimal_high: 7.4 }, 'protein, total': { optimal_low: 6.9, optimal_high: 7.4 },
    'ggt': { optimal_low: 10, optimal_high: 30 }, 'ld': { optimal_low: 120, optimal_high: 180 },
    'hemoglobin a1c': { optimal_low: 4.6, optimal_high: 5.3 },

    // ── ADVANCED LIPIDS ─────────────────────────────────────────
    'apolipoprotein b': { optimal_low: 40, optimal_high: 80 }, 'apob': { optimal_low: 40, optimal_high: 80 },
    'apolipoprotein a-1': { optimal_low: 120, optimal_high: 180 }, 'apoa': { optimal_low: 120, optimal_high: 180 }, 'apoa-1': { optimal_low: 120, optimal_high: 180 },
    'lipoprotein a': { optimal_low: 0, optimal_high: 30 }, 'lp(a)': { optimal_low: 0, optimal_high: 30 }, 'lipoprotein (a)': { optimal_low: 0, optimal_high: 30 },
    'non-hdl cholesterol': { optimal_low: 0, optimal_high: 130 },

    // ── LIVER EXPANDED ──────────────────────────────────────────
    'direct bilirubin': { optimal_low: 0, optimal_high: 0.2 },
    'indirect bilirubin': { optimal_low: 0.1, optimal_high: 0.8 },

    // ── HORMONES EXPANDED ───────────────────────────────────────
    'shbg': { optimal_low: 20, optimal_high: 55 }, 'sex hormone binding globulin': { optimal_low: 20, optimal_high: 55 },
    fsh: { optimal_low: 1, optimal_high: 20 }, 'follicle stimulating hormone': { optimal_low: 1, optimal_high: 20 },
    lh: { optimal_low: 1, optimal_high: 20 }, 'luteinizing hormone': { optimal_low: 1, optimal_high: 20 },
    progesterone: { optimal_low: 0.1, optimal_high: 25 },
    'igf-1': { optimal_low: 100, optimal_high: 250 }, 'insulin-like growth factor': { optimal_low: 100, optimal_high: 250 },
    'fasting insulin': { optimal_low: 2, optimal_high: 8 },
    amh: { optimal_low: 1.0, optimal_high: 5.0 }, 'anti-mullerian hormone': { optimal_low: 1.0, optimal_high: 5.0 },

    // ── THYROID EXPANDED ────────────────────────────────────────
    'tpo': { optimal_low: 0, optimal_high: 15 }, 'thyroid peroxidase': { optimal_low: 0, optimal_high: 15 },
    'thyroglobulin antibodies': { optimal_low: 0, optimal_high: 2 }, 'tgab': { optimal_low: 0, optimal_high: 2 },
    'reverse t3': { optimal_low: 10, optimal_high: 20 }, 'rt3': { optimal_low: 10, optimal_high: 20 },
    't3 uptake': { optimal_low: 27, optimal_high: 35 },
    'free t4 index': { optimal_low: 1.4, optimal_high: 3.8 }, 't7': { optimal_low: 1.4, optimal_high: 3.8 },

    // ── NUTRIENTS EXPANDED ──────────────────────────────────────
    'vitamin b6': { optimal_low: 5, optimal_high: 50 }, 'pyridoxine': { optimal_low: 5, optimal_high: 50 },
    'vitamin b1': { optimal_low: 70, optimal_high: 180 }, 'thiamine': { optimal_low: 70, optimal_high: 180 },
    'vitamin e': { optimal_low: 12, optimal_high: 20 }, 'alpha tocopherol': { optimal_low: 12, optimal_high: 20 },
    'vitamin k': { optimal_low: 0.2, optimal_high: 3.2 },
    selenium: { optimal_low: 110, optimal_high: 150 },
    copper: { optimal_low: 70, optimal_high: 120 }, 'ceruloplasmin': { optimal_low: 18, optimal_high: 36 },
    'coq10': { optimal_low: 0.5, optimal_high: 2.5 }, 'coenzyme q10': { optimal_low: 0.5, optimal_high: 2.5 },
    'methylmalonic acid': { optimal_low: 0, optimal_high: 270 }, 'mma': { optimal_low: 0, optimal_high: 270 },
    'rbc magnesium': { optimal_low: 5.0, optimal_high: 6.5 },

    // ── INFLAMMATION EXPANDED ───────────────────────────────────
    fibrinogen: { optimal_low: 200, optimal_high: 350 },
    'sed rate': { optimal_low: 0, optimal_high: 10 },
    'ana': { optimal_low: 0, optimal_high: 0 }, // any positive is abnormal
    'rheumatoid factor': { optimal_low: 0, optimal_high: 14 }, 'rf': { optimal_low: 0, optimal_high: 14 },
    'anti-ccp': { optimal_low: 0, optimal_high: 20 }, 'ccp antibody': { optimal_low: 0, optimal_high: 20 },

    // ── COAGULATION ─────────────────────────────────────────────
    'pt': { optimal_low: 11, optimal_high: 13.5 }, 'prothrombin time': { optimal_low: 11, optimal_high: 13.5 },
    'inr': { optimal_low: 0.9, optimal_high: 1.1 },
    'ptt': { optimal_low: 25, optimal_high: 35 }, 'aptt': { optimal_low: 25, optimal_high: 35 },

    // ── PROSTATE ────────────────────────────────────────────────
    'psa': { optimal_low: 0, optimal_high: 2.0 }, 'prostate specific antigen': { optimal_low: 0, optimal_high: 2.0 },
    'free psa': { optimal_low: 0, optimal_high: 2.0 },

    // ── METABOLIC EXPANDED ──────────────────────────────────────
    'leptin': { optimal_low: 2, optimal_high: 12 },
    'adiponectin': { optimal_low: 5, optimal_high: 30 },
    'fructosamine': { optimal_low: 200, optimal_high: 270 },

    // ── KIDNEY EXPANDED ─────────────────────────────────────────
    'cystatin c': { optimal_low: 0.5, optimal_high: 0.9 },
    'microalbumin': { optimal_low: 0, optimal_high: 20 },

    // ── CELIAC / AUTOIMMUNE ─────────────────────────────────────
    'ttg-iga': { optimal_low: 0, optimal_high: 4 }, 'tissue transglutaminase': { optimal_low: 0, optimal_high: 4 },
    'total iga': { optimal_low: 70, optimal_high: 400 },
  };
}

function findOptimalRange(ranges: Record<string, { optimal_low: number; optimal_high: number }>, name: string) {
  const n = name.toLowerCase();
  // Exact match first
  if (ranges[n]) return ranges[n];
  // Try longest key match — key must be a significant substring (>40% of marker name length)
  // This prevents "protein" (7 chars) matching "c-reactive protein, cardiac" (27 chars)
  const sorted = Object.keys(ranges).sort((a, b) => b.length - a.length);
  for (const k of sorted) {
    if (n.includes(k) && k.length >= n.length * 0.4) return ranges[k];
  }
  // Fallback: check if marker name is contained in a key (e.g., "crp" in "hs-crp")
  for (const k of sorted) {
    if (k.includes(n) && n.length >= k.length * 0.4) return ranges[k];
  }
  return null;
}

// Markers where HIGH values are GOOD or harmless (only low values matter
// clinically). Conservative list — only include markers where elevation is
// either protective or has no realistic toxicity at lab-reported levels.
// Match against lowercased marker name via includes().
const HIGHER_IS_BETTER = [
  // Kidney function — higher eGFR = better filtration
  'egfr', 'gfr',
  // Cardio-protective lipids — high is protective
  'hdl',
  'apolipoprotein a', 'apoa', 'apoa-1', 'apo a',
  // Water-soluble vitamins — excess excreted in urine, no clinical toxicity
  'vitamin b12', 'b12',
  'folate', 'folic acid',
  'vitamin b1', 'thiamine',
  'vitamin b6', 'pyridoxine',
  // Vitamin D — toxicity only at extreme levels (>150 ng/mL); 50-100 is target
  'vitamin d', '25-oh', '25-hydroxy',
  // Antioxidants / metabolic — no realistic high-side risk at lab levels
  'coq10', 'coenzyme q10',
  'adiponectin',
  // Fertility / reproductive
  'amh', 'anti-mullerian',
];

function computeFlag(
  value: number,
  range: { optimal_low: number; optimal_high: number } | null,
  stdLow?: number | null,
  stdHigh?: number | null,
  markerName?: string,
): string {
  if (!range) return 'unknown';
  const n = (markerName ?? '').toLowerCase();
  const higherIsBetter = HIGHER_IS_BETTER.some(k => n.includes(k));

  const lowThreshold = stdLow != null ? stdLow : range.optimal_low * 0.5;
  if (value < lowThreshold) return 'deficient';
  if (value < range.optimal_low) return 'suboptimal_low';

  // For higher-is-better markers, anything ≥ optimal_low is optimal — never flag high
  if (higherIsBetter) return 'optimal';

  const highThreshold = stdHigh != null ? stdHigh : range.optimal_high * 2;
  if (value > highThreshold) return 'elevated';
  if (value > range.optimal_high) return 'suboptimal_high';
  return 'optimal';
}

// ── Panel gap analysis — deterministic, no AI ───────────────────────────────

interface PanelGap {
  test_name: string;
  category: 'essential' | 'recommended' | 'advanced';
  why_needed: string;
  /** Exact words to say to the doctor to get the test ordered. */
  script: string;
  /** ICD-10 codes that justify the test for insurance billing. */
  icd10: { code: string; description: string }[];
}

export function computePanelGaps(testedMarkers: Set<string>): PanelGap[] {
  const has = (keywords: string[]) => keywords.some(k => [...testedMarkers].some(m => m.includes(k)));
  const gaps: PanelGap[] = [];

  // ── Essential — almost any PCP will order without resistance ────────────
  if (!has(['tsh'])) gaps.push({
    test_name: 'TSH',
    category: 'essential',
    why_needed: 'Thyroid screening — standard for all adults',
    script: '"I\'d like a thyroid screen as part of my annual labs. Can you add a TSH?"',
    icd10: [
      { code: 'Z13.29', description: 'Encounter for screening for other suspected endocrine disorder' },
      { code: 'E07.9', description: 'Disorder of thyroid, unspecified' },
    ],
  });
  if (!has(['vitamin d', '25-oh', '25-hydroxy'])) gaps.push({
    test_name: 'Vitamin D (25-OH)',
    category: 'essential',
    why_needed: 'Deficiency affects bone, immune, and mood — widespread',
    script: '"I want to check my vitamin D status. Can you order a 25-hydroxy vitamin D level?"',
    icd10: [
      { code: 'E55.9', description: 'Vitamin D deficiency, unspecified' },
      { code: 'Z13.21', description: 'Encounter for screening for nutritional disorder' },
    ],
  });
  if (!has(['cholesterol', 'hdl', 'ldl', 'triglyceride'])) gaps.push({
    test_name: 'Lipid Panel',
    category: 'essential',
    why_needed: 'Cardiovascular risk baseline',
    script: '"I\'d like a full lipid panel — total cholesterol, HDL, LDL, triglycerides."',
    icd10: [
      { code: 'Z13.220', description: 'Encounter for screening for lipid disorders' },
      { code: 'E78.5', description: 'Hyperlipidemia, unspecified' },
    ],
  });
  if (!has(['hba1c', 'hemoglobin a1c'])) gaps.push({
    test_name: 'HbA1c',
    category: 'essential',
    why_needed: '3-month blood sugar average — catches prediabetes early',
    script: '"Can you add a hemoglobin A1c to check my 3-month blood sugar average?"',
    icd10: [
      { code: 'Z13.1', description: 'Encounter for screening for diabetes mellitus' },
      { code: 'R73.03', description: 'Prediabetes' },
    ],
  });
  if (!has(['ferritin'])) gaps.push({
    test_name: 'Ferritin',
    category: 'essential',
    why_needed: 'Iron stores — low ferritin causes fatigue before anemia shows',
    script: '"I want to check my iron stores. Can you add a ferritin level? I\'ve been tired."',
    icd10: [
      { code: 'R53.83', description: 'Other fatigue' },
      { code: 'D50.9', description: 'Iron deficiency anemia, unspecified' },
    ],
  });

  // ── Recommended — typical PCP may push back; insist using the script ────
  if (!has(['iron', 'tibc', 'iron sat'])) gaps.push({
    test_name: 'Iron Panel (Serum Iron, TIBC, Iron Saturation)',
    category: 'recommended',
    why_needed: 'Full iron status — ferritin alone misses some patterns',
    script: '"Ferritin alone doesn\'t tell the whole iron story. Can you add a complete iron panel — serum iron, TIBC, and iron saturation? I want to rule out functional iron deficiency."',
    icd10: [
      { code: 'D50.9', description: 'Iron deficiency anemia, unspecified' },
      { code: 'E61.1', description: 'Iron deficiency' },
      { code: 'R53.83', description: 'Other fatigue' },
    ],
  });
  if (!has(['b12', 'vitamin b12'])) gaps.push({
    test_name: 'Vitamin B12',
    category: 'recommended',
    why_needed: 'Deficiency causes fatigue, brain fog, and nerve symptoms',
    script: '"Can you add a B12 level? I want to rule out deficiency — I\'ve had fatigue and brain fog."',
    icd10: [
      { code: 'D51.9', description: 'Vitamin B12 deficiency anemia, unspecified' },
      { code: 'E53.8', description: 'Deficiency of other specified B group vitamins' },
      { code: 'R53.83', description: 'Other fatigue' },
    ],
  });
  if (!has(['folate'])) gaps.push({
    test_name: 'Folate (Serum)',
    category: 'recommended',
    why_needed: 'Needed for DNA repair, often low alongside B12',
    script: '"Can you add a serum folate? I want to check it alongside my B12."',
    icd10: [
      { code: 'D52.9', description: 'Folate deficiency anemia, unspecified' },
      { code: 'E53.8', description: 'Deficiency of other specified B group vitamins' },
    ],
  });
  if (!has(['magnesium'])) gaps.push({
    test_name: 'Magnesium (Serum)',
    category: 'recommended',
    why_needed: 'Involved in 300+ enzyme reactions — commonly deficient',
    script: '"I\'d like a serum magnesium. I want to rule out a deficiency that could be affecting my sleep, muscle function, or mood."',
    icd10: [
      { code: 'E83.42', description: 'Hypomagnesemia' },
      { code: 'R53.83', description: 'Other fatigue' },
    ],
  });
  if (!has(['hs-crp', 'crp'])) gaps.push({
    test_name: 'hs-CRP (high-sensitivity)',
    category: 'recommended',
    why_needed: 'Inflammation marker — predicts cardiovascular risk',
    script: '"I\'d like a high-sensitivity CRP for cardiovascular inflammation risk — not the regular CRP, the hs-CRP."',
    icd10: [
      { code: 'Z13.220', description: 'Encounter for screening for lipid disorders' },
      { code: 'R79.89', description: 'Other specified abnormal findings of blood chemistry' },
      { code: 'I25.10', description: 'Atherosclerotic heart disease without angina pectoris' },
    ],
  });
  if (!has(['homocysteine'])) gaps.push({
    test_name: 'Homocysteine',
    category: 'recommended',
    why_needed: 'Cardiovascular and neurological risk marker',
    script: '"Can you add a homocysteine? It\'s a cardiovascular risk marker that\'s not on a standard lipid panel — I want a complete cardiovascular workup."',
    icd10: [
      { code: 'Z13.220', description: 'Encounter for screening for lipid disorders' },
      { code: 'E72.11', description: 'Disorders of sulfur-bearing amino-acid metabolism' },
      { code: 'Z82.49', description: 'Family history of ischemic heart disease' },
    ],
  });
  if (!has(['insulin', 'fasting insulin'])) gaps.push({
    test_name: 'Fasting Insulin (with HOMA-IR)',
    category: 'recommended',
    why_needed: 'Catches insulin resistance years before A1c rises',
    script: '"I want a fasting insulin so I can calculate my HOMA-IR insulin resistance score. A1c is normal but I want to catch insulin resistance early. ICD-10 R73.09 covers it."',
    icd10: [
      { code: 'R73.09', description: 'Other abnormal glucose' },
      { code: 'E88.81', description: 'Metabolic syndrome' },
      { code: 'R73.03', description: 'Prediabetes' },
    ],
  });
  if (has(['tsh']) && !has(['free t3'])) gaps.push({
    test_name: 'Free T3 + Free T4',
    category: 'recommended',
    why_needed: 'TSH alone misses early thyroid dysfunction',
    script: '"My TSH is borderline and I want a complete thyroid picture — Free T3 and Free T4. TSH alone misses early dysfunction. If you\'re hesitant, I\'m happy to see an endocrinologist."',
    icd10: [
      { code: 'E07.9', description: 'Disorder of thyroid, unspecified' },
      { code: 'E03.9', description: 'Hypothyroidism, unspecified' },
      { code: 'Z13.29', description: 'Encounter for screening for other suspected endocrine disorder' },
    ],
  });

  // ── Advanced — most doctors won't volunteer; you'll need to insist ──────
  if (!has(['apob', 'apolipoprotein b'])) gaps.push({
    test_name: 'ApoB (Apolipoprotein B)',
    category: 'advanced',
    why_needed: 'Better cardiovascular risk predictor than LDL alone',
    script: '"I\'d like an ApoB. It measures cholesterol particle count — current cardiology guidelines recommend it as a better risk predictor than LDL. Insurance covers it under E78.5."',
    icd10: [
      { code: 'E78.5', description: 'Hyperlipidemia, unspecified' },
      { code: 'Z13.220', description: 'Encounter for screening for lipid disorders' },
      { code: 'Z82.49', description: 'Family history of ischemic heart disease' },
    ],
  });
  if (!has(['lp(a)', 'lipoprotein a', 'lp a'])) gaps.push({
    test_name: 'Lp(a) (Lipoprotein little a)',
    category: 'advanced',
    why_needed: 'Genetic cardiovascular risk — test once in lifetime',
    script: '"I want a Lp(a) — lipoprotein little a. It\'s a genetic cardiovascular risk marker that only needs to be checked once in a lifetime. With family history, insurance covers it under Z82.49."',
    icd10: [
      { code: 'Z82.49', description: 'Family history of ischemic heart disease' },
      { code: 'E78.5', description: 'Hyperlipidemia, unspecified' },
      { code: 'Z13.220', description: 'Encounter for screening for lipid disorders' },
    ],
  });
  if (!has(['cortisol'])) gaps.push({
    test_name: 'AM Cortisol',
    category: 'advanced',
    why_needed: 'Stress hormone — affects energy, sleep, weight, immunity',
    script: '"I want an 8 AM serum cortisol. I\'ve had fatigue/sleep issues and want to rule out adrenal dysfunction."',
    icd10: [
      { code: 'R53.83', description: 'Other fatigue' },
      { code: 'E27.40', description: 'Unspecified adrenocortical insufficiency' },
      { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified' },
    ],
  });
  if (!has(['dhea'])) gaps.push({
    test_name: 'DHEA-S',
    category: 'advanced',
    why_needed: 'Adrenal function and hormone precursor — declines with age and stress',
    script: '"Can you add a DHEA-S? It tells me how my adrenals are aging and is a precursor to other hormones."',
    icd10: [
      { code: 'E27.49', description: 'Other adrenocortical insufficiency' },
      { code: 'R53.83', description: 'Other fatigue' },
      { code: 'E28.39', description: 'Other primary ovarian failure' },
    ],
  });
  if (!has(['testosterone']) && !has(['estradiol'])) gaps.push({
    test_name: 'Hormone Panel (Total Testosterone, Free Testosterone, Estradiol, SHBG)',
    category: 'advanced',
    why_needed: 'Sex hormones drive energy, mood, body composition',
    script: '"I\'d like a complete hormone panel — total and free testosterone, estradiol, and SHBG. I want a baseline for energy, mood, and body composition. If declined, I\'d like a referral to endocrinology."',
    icd10: [
      { code: 'E29.1', description: 'Testicular hypofunction' },
      { code: 'R53.83', description: 'Other fatigue' },
      { code: 'F52.0', description: 'Hypoactive sexual desire disorder' },
      { code: 'N95.1', description: 'Menopausal and female climacteric states' },
    ],
  });
  if (!has(['uric acid'])) gaps.push({
    test_name: 'Uric Acid',
    category: 'advanced',
    why_needed: 'Metabolic health marker — gout, kidney, cardiovascular risk',
    script: '"Can you add a uric acid? I want to check metabolic health and gout risk."',
    icd10: [
      { code: 'E79.0', description: 'Hyperuricemia without signs of inflammatory arthritis' },
      { code: 'M10.9', description: 'Gout, unspecified' },
    ],
  });
  if (!has(['ggt'])) gaps.push({
    test_name: 'GGT (Gamma-Glutamyl Transferase)',
    category: 'advanced',
    why_needed: 'Sensitive liver marker and oxidative stress indicator',
    script: '"I\'d like a GGT added — it\'s a more sensitive liver marker than ALT/AST and reflects oxidative stress."',
    icd10: [
      { code: 'R74.0', description: 'Nonspecific elevation of levels of transaminase and lactic acid dehydrogenase' },
      { code: 'K76.0', description: 'Fatty (change of) liver, not elsewhere classified' },
      { code: 'Z13.89', description: 'Encounter for screening for other disorder' },
    ],
  });

  return gaps;
}
