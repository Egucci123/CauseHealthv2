-- Chat message cap: 100 per lab dataset (per upload).
--
-- Mirrors lab_draws.analysis_count (2 cap on analyses) — same per-dataset
-- budget pattern. Each new upload starts a fresh 100; regenerating a
-- wellness plan / doctor prep / analysis on the same dataset shares the
-- budget because they're all the same conversation context.
--
-- Cap (100) is enforced in the health-chat edge function. When hit, the
-- function returns 429 + CHAT_LIMIT_REACHED so the frontend can render
-- a soft-paywall ("upload new labs to keep chatting").
--
-- Existing draws backfill at 0 (every user starts fresh on first chat
-- message after this migration). Production users who already chatted
-- heavily before this cap existed are NOT retroactively cut off — the
-- counter starts now.

ALTER TABLE public.lab_draws
  ADD COLUMN IF NOT EXISTS chat_message_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lab_draws.chat_message_count IS
  'Number of health-chat messages sent against this dataset. Capped at 100 per draw (per upload). Resets only by new upload (different lab values). Mirrors analysis_count for the analyze-labs cap.';
