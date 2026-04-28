// src/store/symptomAnalysisStore.ts
// Tracks in-flight symptom analysis OUTSIDE the React tree so it survives
// page navigation. Pairs with a keepalive fetch so the request itself
// survives unmount, and DB polling so the page can detect completion when
// the user returns.
import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface SymptomAnalysisStore {
  isAnalyzing: boolean;
  startedAt: number | null;
  /** Kick off analysis. Idempotent — does nothing if already running. */
  startAnalysis: (userId: string) => Promise<void>;
  /** Mark complete (called when new analysis row appears). */
  markComplete: () => void;
  reset: () => void;
}

const TIMEOUT_MS = 90_000; // safety net — clear stuck flag after 90s

export const useSymptomAnalysisStore = create<SymptomAnalysisStore>((set, get) => ({
  isAnalyzing: false,
  startedAt: null,

  startAnalysis: async (userId: string) => {
    if (get().isAnalyzing) return;
    set({ isAnalyzing: true, startedAt: Date.now() });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      // Raw fetch with keepalive — survives navigation/tab close.
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-symptoms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
        keepalive: true,
      }).catch(console.warn);
    } catch (e) {
      console.warn('[SymptomAnalysis] trigger failed:', e);
      set({ isAnalyzing: false, startedAt: null });
      return;
    }

    // Safety timeout — never let the flag get permanently stuck
    setTimeout(() => {
      const s = get();
      if (s.isAnalyzing && s.startedAt && Date.now() - s.startedAt >= TIMEOUT_MS) {
        set({ isAnalyzing: false, startedAt: null });
      }
    }, TIMEOUT_MS + 1000);
  },

  markComplete: () => set({ isAnalyzing: false, startedAt: null }),
  reset: () => set({ isAnalyzing: false, startedAt: null }),
}));
