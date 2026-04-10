// src/store/labUploadStore.ts
// Zustand store for lab upload — persists across component mount/unmount
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
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
}

export const useLabUploadStore = create<LabUploadStore>((set, get) => ({
  phase: 'idle', progress: 0, statusMessage: '', drawId: null,
  extraction: null, errorMessage: null, completedDrawId: null, isRunning: false,

  reset: () => set({ phase: 'idle', progress: 0, statusMessage: '', drawId: null, extraction: null, errorMessage: null, completedDrawId: null, isRunning: false }),

  updateExtraction: (values) => set(s => ({ extraction: s.extraction ? { ...s.extraction, values } : null })),

  startUpload: (files, userId) => {
    if (get().isRunning) return;
    set({ isRunning: true });

    // Fire and forget — this promise runs independently of React
    (async () => {
      const fileCount = files.length;
      const plural = fileCount > 1;
      set({ phase: 'uploading', progress: 0, statusMessage: `Uploading ${fileCount} file${plural ? 's' : ''} to secure storage...`, errorMessage: null });

      try {
        // 1. Upload PDFs to storage
        const storagePaths: string[] = [];
        for (const file of files) {
          const fileName = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error } = await supabase.storage.from('lab-pdfs').upload(fileName, file, { cacheControl: '3600', upsert: false });
          if (error) throw new Error(`Upload failed for ${file.name}: ${error.message}`);
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

        // 3. Try client-side text extraction first
        set({ phase: 'extracting', statusMessage: `Reading ${plural ? `${fileCount} lab reports` : 'your lab report'}...`, progress: 35 });

        const allTexts: string[] = [];
        let anyLooksLikeLab = false;
        for (let i = 0; i < files.length; i++) {
          if (plural) set({ statusMessage: `Reading file ${i + 1} of ${fileCount}: ${files[i].name}`, progress: 35 + Math.round((i / fileCount) * 15) });
          try {
            const text = await extractPDFText(files[i]);
            if (text && text.length >= 50) { allTexts.push(text); if (looksLikeLabReport(text)) anyLooksLikeLab = true; }
          } catch (err) { console.warn(`[LabUpload] Could not read ${files[i].name}:`, err); }
        }

        const combinedText = allTexts.join('\n---NEW DOCUMENT---\n');
        const textExtractionFailed = !combinedText || combinedText.length < 100;

        // 4. Build request body — use text if available, otherwise send raw PDF to Claude
        set({ statusMessage: 'Identifying lab values...', progress: 55 });
        const { data: { session } } = await supabase.auth.getSession();

        let requestBody: Record<string, string>;
        if (textExtractionFailed) {
          // Client-side extraction failed — send first PDF as base64 for Claude to read directly
          set({ statusMessage: 'Sending PDF directly for analysis...', progress: 50 });
          const arrayBuffer = await files[0].arrayBuffer();
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          requestBody = { pdfBase64: base64 };
        } else if (!anyLooksLikeLab) {
          set({ phase: 'manual', statusMessage: `${plural ? "These files don't appear" : "This file doesn't appear"} to be standard lab reports. Please enter values manually.`, isRunning: false });
          return;
        } else {
          const maxChars = Math.min(fileCount * 6000, 18000);
          requestBody = { pdfText: combinedText.slice(0, maxChars) };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // 120s timeout (PDF reading takes longer)
        let res: Response;
        try {
          res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-labs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
        } catch (e: any) {
          clearTimeout(timeout);
          if (e?.name === 'AbortError') throw new Error('Extraction timed out. Try fewer files or use manual entry.');
          throw e;
        }
        clearTimeout(timeout);

        const data = await res.json();
        if (!res.ok) throw new Error(`Extraction failed: ${data?.error ?? JSON.stringify(data)}`);
        if (data?.error) throw new Error(data.error);

        const extraction = data as ExtractionResult;
        if (extraction.values) {
          extraction.values = extraction.values.filter(v => v.value !== 0 && v.value != null && v.marker_name?.trim());
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

        set({ extraction, phase: 'reviewing', statusMessage: `Found ${extraction.values.length} lab values${plural ? ` across ${fileCount} files` : ''}. Please review.`, progress: 70, isRunning: false });
      } catch (err) {
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
    set({ phase: 'analyzing', statusMessage: 'Saving your lab values...', progress: 75 });

    (async () => {
      try {
        await supabase.from('lab_draws').update({
          draw_date: overrides.drawDate ?? extraction?.draw_date ?? new Date().toISOString().split('T')[0],
          lab_name: overrides.labName ?? extraction?.lab_name,
        }).eq('id', drawId);

        const ranges = getOptimalRanges();
        const validOptimal = ['optimal', 'suboptimal_low', 'suboptimal_high', 'deficient', 'elevated', 'unknown'];
        const validStandard = ['normal', 'low', 'high', 'critical_low', 'critical_high'];

        const cleaned = values.map(v => {
          const r = findOptimalRange(ranges, v.marker_name);
          const of_ = computeFlag(v.value, r);
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

        // Refresh session before insert in case token expired during extraction
        await supabase.auth.getSession();
        const { error } = await supabase.from('lab_values').insert(cleaned);
        if (error) throw new Error(`Failed to save values: ${error.message}`);

        set({ phase: 'complete', completedDrawId: drawId, statusMessage: 'Analysis complete.', progress: 100 });

        // Background analysis
        supabase.functions.invoke('analyze-labs', { body: { drawId, userId } }).catch(console.warn);
      } catch (err) {
        set({ phase: 'error', errorMessage: String(err) });
      }
    })();
  },
}));

// ── Optimal ranges ──────────────────────────────────────────────────────────

function getOptimalRanges(): Record<string, { optimal_low: number; optimal_high: number }> {
  return {
    glucose: { optimal_low: 75, optimal_high: 86 }, 'fasting glucose': { optimal_low: 75, optimal_high: 86 },
    hba1c: { optimal_low: 4.6, optimal_high: 5.3 }, insulin: { optimal_low: 2, optimal_high: 5 },
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
    tsh: { optimal_low: 0.5, optimal_high: 2.0 }, 'free t3': { optimal_low: 3.0, optimal_high: 3.5 },
    'free t4': { optimal_low: 1.1, optimal_high: 1.5 },
    'vitamin d': { optimal_low: 50, optimal_high: 80 }, '25-oh': { optimal_low: 50, optimal_high: 80 },
    '25-hydroxy': { optimal_low: 50, optimal_high: 80 },
    'vitamin b12': { optimal_low: 500, optimal_high: 1000 }, b12: { optimal_low: 500, optimal_high: 1000 },
    ferritin: { optimal_low: 50, optimal_high: 150 }, iron: { optimal_low: 60, optimal_high: 170 },
    'iron saturation': { optimal_low: 25, optimal_high: 35 }, tibc: { optimal_low: 250, optimal_high: 370 },
    magnesium: { optimal_low: 2.0, optimal_high: 2.5 }, zinc: { optimal_low: 90, optimal_high: 120 },
    folate: { optimal_low: 10, optimal_high: 25 }, 'vitamin a': { optimal_low: 45, optimal_high: 65 },
    wbc: { optimal_low: 5.0, optimal_high: 8.0 }, rbc: { optimal_low: 4.2, optimal_high: 4.9 },
    hemoglobin: { optimal_low: 13.5, optimal_high: 15.5 }, hematocrit: { optimal_low: 40, optimal_high: 46 },
    platelets: { optimal_low: 175, optimal_high: 300 }, mcv: { optimal_low: 82, optimal_high: 92 },
    mch: { optimal_low: 28, optimal_high: 32 }, mchc: { optimal_low: 32, optimal_high: 36 },
    rdw: { optimal_low: 11.5, optimal_high: 13.0 }, 'red cell distribution': { optimal_low: 11.5, optimal_high: 13.0 },
    mpv: { optimal_low: 7.5, optimal_high: 11.5 },
    'hs-crp': { optimal_low: 0, optimal_high: 0.5 }, crp: { optimal_low: 0, optimal_high: 0.5 },
    esr: { optimal_low: 0, optimal_high: 10 }, homocysteine: { optimal_low: 5, optimal_high: 8 },
    'uric acid': { optimal_low: 3.5, optimal_high: 5.5 },
    testosterone: { optimal_low: 600, optimal_high: 900 }, 'free testosterone': { optimal_low: 10, optimal_high: 25 },
    estradiol: { optimal_low: 10, optimal_high: 40 }, dhea: { optimal_low: 200, optimal_high: 500 },
    cortisol: { optimal_low: 6, optimal_high: 18 },
    sodium: { optimal_low: 138, optimal_high: 142 }, potassium: { optimal_low: 4.0, optimal_high: 4.5 },
    calcium: { optimal_low: 9.4, optimal_high: 10.0 }, chloride: { optimal_low: 100, optimal_high: 106 },
    'carbon dioxide': { optimal_low: 25, optimal_high: 30 }, phosphorus: { optimal_low: 3.0, optimal_high: 4.0 },
    'total protein': { optimal_low: 6.9, optimal_high: 7.4 }, 'protein, total': { optimal_low: 6.9, optimal_high: 7.4 },
    'protein': { optimal_low: 6.9, optimal_high: 7.4 },
    'ggt': { optimal_low: 10, optimal_high: 30 }, 'ld': { optimal_low: 120, optimal_high: 180 },
    'hemoglobin a1c': { optimal_low: 4.6, optimal_high: 5.3 },
  };
}

function findOptimalRange(ranges: Record<string, { optimal_low: number; optimal_high: number }>, name: string) {
  const n = name.toLowerCase();
  if (ranges[n]) return ranges[n];
  const sorted = Object.keys(ranges).sort((a, b) => b.length - a.length);
  for (const k of sorted) { if (n.includes(k)) return ranges[k]; }
  return null;
}

function computeFlag(value: number, range: { optimal_low: number; optimal_high: number } | null): string {
  if (!range) return 'unknown';
  if (value < range.optimal_low * 0.5) return 'deficient';
  if (value < range.optimal_low) return 'suboptimal_low';
  if (value > range.optimal_high * 2) return 'elevated';
  if (value > range.optimal_high) return 'suboptimal_high';
  return 'optimal';
}
