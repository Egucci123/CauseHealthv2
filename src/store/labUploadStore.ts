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
          const fileName = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          const { error } = await supabase.storage.from('lab-pdfs').upload(fileName, file, { cacheControl: '3600', upsert: false });
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

        if (!textExtractionFailed && !anyLooksLikeLab) {
          set({ phase: 'manual', statusMessage: `${plural ? "These files don't appear" : "This file doesn't appear"} to be standard lab reports. Please enter values manually.`, isRunning: false });
          return;
        }

        let allValues: any[] = [];
        let extractedDrawDate: string | null = null;
        let extractedLabName: string | null = null;
        let extractedProvider: string | null = null;

        // Animated progress during AI calls — ticks up smoothly while waiting
        let progressInterval: ReturnType<typeof setInterval> | null = null;
        const startProgress = (from: number, to: number, durationMs: number) => {
          if (progressInterval) clearInterval(progressInterval);
          let current = from;
          const step = (to - from) / (durationMs / 500);
          progressInterval = setInterval(() => {
            current = Math.min(current + step, to);
            set({ progress: Math.round(current) });
          }, 500);
        };
        const stopProgress = () => { if (progressInterval) { clearInterval(progressInterval); progressInterval = null; } };

        if (textExtractionFailed) {
          // Client-side extraction failed — send each PDF to Claude individually
          let lastError = '';
          for (let i = 0; i < files.length; i++) {
            set({ statusMessage: `Sending PDF ${i + 1} of ${fileCount} to AI...`, progress: 50 });
            startProgress(50, 85, 60000); // Animate 50→85% over ~60s
            for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const arrayBuffer = await files[i].arrayBuffer();
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
        } else {
          // Text extraction worked — send combined text in one call
          set({ statusMessage: 'Analyzing lab values...', progress: 55 });
          startProgress(55, 85, 30000); // Animate 55→85% over ~30s (text path is faster)
          const maxChars = Math.min(fileCount * 6000, 18000);

          const { data: textData, error: textErr } = await supabase.functions.invoke('extract-labs', {
            body: { pdfText: combinedText.slice(0, maxChars) },
          });
          stopProgress();
          if (textErr) {
            let detail = textErr.message;
            try { const ctx = (textErr as any).context; if (ctx instanceof Response) { const t = await ctx.json(); detail = t?.error || t?.detail || JSON.stringify(t); } } catch {}
            throw new Error(`Extraction failed: ${detail}`);
          }
          allValues = textData?.values || [];
          extractedDrawDate = textData?.draw_date;
          extractedLabName = textData?.lab_name;
          extractedProvider = textData?.ordering_provider;
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

        // Background analysis — raw fetch with keepalive survives page navigation
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-labs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ drawId, userId }),
          keepalive: true,
        }).catch(console.warn);
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
    tsh: { optimal_low: 0.5, optimal_high: 2.0 }, 'free t3': { optimal_low: 3.0, optimal_high: 4.0 },
    'free t4': { optimal_low: 1.0, optimal_high: 1.8 },
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
    // CBC differentials
    neutrophils: { optimal_low: 40, optimal_high: 60 }, 'neutrophils (absolute)': { optimal_low: 1.8, optimal_high: 5.0 },
    lymphs: { optimal_low: 20, optimal_high: 40 }, lymphocytes: { optimal_low: 20, optimal_high: 40 },
    'lymphs (absolute)': { optimal_low: 1.0, optimal_high: 3.5 }, 'lymphocytes (absolute)': { optimal_low: 1.0, optimal_high: 3.5 },
    monocytes: { optimal_low: 2, optimal_high: 8 }, 'monocytes (absolute)': { optimal_low: 0.2, optimal_high: 0.8 },
    eos: { optimal_low: 0, optimal_high: 3 }, eosinophils: { optimal_low: 0, optimal_high: 3 },
    'eos (absolute)': { optimal_low: 0, optimal_high: 0.3 }, 'eosinophils (absolute)': { optimal_low: 0, optimal_high: 0.3 },
    basophils: { optimal_low: 0, optimal_high: 1 }, 'basophils (absolute)': { optimal_low: 0, optimal_high: 0.1 },
    // Thyroid expanded
    'thyroxine (t4)': { optimal_low: 6.0, optimal_high: 10.0 }, t4: { optimal_low: 6.0, optimal_high: 10.0 },
    'total t4': { optimal_low: 6.0, optimal_high: 10.0 }, 'total t3': { optimal_low: 80, optimal_high: 180 },
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

    // ── ADVANCED LIPIDS ─────────────────────────────────────────
    'apolipoprotein b': { optimal_low: 40, optimal_high: 80 }, 'apob': { optimal_low: 40, optimal_high: 80 },
    'lipoprotein a': { optimal_low: 0, optimal_high: 30 }, 'lp(a)': { optimal_low: 0, optimal_high: 30 },
    'non-hdl cholesterol': { optimal_low: 0, optimal_high: 130 },

    // ── LIVER EXPANDED ──────────────────────────────────────────
    'direct bilirubin': { optimal_low: 0, optimal_high: 0.2 },
    'indirect bilirubin': { optimal_low: 0.1, optimal_high: 0.8 },

    // ── HORMONES EXPANDED ───────────────────────────────────────
    'shbg': { optimal_low: 20, optimal_high: 55 }, 'sex hormone binding globulin': { optimal_low: 20, optimal_high: 55 },
    fsh: { optimal_low: 3, optimal_high: 10 }, 'follicle stimulating hormone': { optimal_low: 3, optimal_high: 10 },
    lh: { optimal_low: 2, optimal_high: 12 }, 'luteinizing hormone': { optimal_low: 2, optimal_high: 12 },
    prolactin: { optimal_low: 2, optimal_high: 18 },
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
