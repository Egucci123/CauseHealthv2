-- ============================================================================
-- CauseHealth. — Complete Database Migration
-- Run this ONCE in Supabase SQL Editor (supabase.com → SQL Editor → New Query)
-- ============================================================================

-- ── 1. PROFILES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id                              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at                      TIMESTAMPTZ DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ DEFAULT NOW(),
  first_name                      TEXT,
  last_name                       TEXT,
  date_of_birth                   DATE,
  sex                             TEXT CHECK (sex IN ('male', 'female', 'other')),
  height_cm                       NUMERIC,
  weight_kg                       NUMERIC,
  subscription_tier               TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'core', 'premium', 'family')),
  onboarding_completed            BOOLEAN DEFAULT FALSE,
  primary_goals                   TEXT[],
  notification_prefs              JSONB DEFAULT '{}',
  notification_lab_results        BOOLEAN DEFAULT TRUE,
  notification_check_in_reminder  BOOLEAN DEFAULT TRUE,
  notification_wellness_updates   BOOLEAN DEFAULT TRUE,
  notification_supplement_reminder BOOLEAN DEFAULT FALSE,
  stripe_customer_id              TEXT,
  stripe_subscription_id          TEXT,
  subscription_status             TEXT DEFAULT 'free'
    CHECK (subscription_status IN ('free', 'active', 'past_due', 'canceled', 'trialing')),
  subscription_period_end         TIMESTAMPTZ
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ── 2. MEDICATIONS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.medications (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  name                  TEXT NOT NULL,
  brand_name            TEXT,
  dose                  TEXT,
  frequency             TEXT,
  duration_category     TEXT,
  prescribing_condition TEXT,
  is_active             BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own medications"
  ON public.medications FOR ALL USING (auth.uid() = user_id);


-- ── 3. SYMPTOMS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.symptoms (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  symptom    TEXT NOT NULL,
  severity   INTEGER CHECK (severity BETWEEN 1 AND 10),
  duration   TEXT,
  timing     TEXT,
  category   TEXT
);

ALTER TABLE public.symptoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own symptoms"
  ON public.symptoms FOR ALL USING (auth.uid() = user_id);


-- ── 4. LAB DRAWS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lab_draws (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  draw_date          DATE NOT NULL,
  lab_name           TEXT,
  ordering_provider  TEXT,
  raw_pdf_url        TEXT,
  processing_status  TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','failed')),
  notes              TEXT,
  analysis_result    JSONB
);

ALTER TABLE public.lab_draws ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own lab draws"
  ON public.lab_draws FOR ALL USING (auth.uid() = user_id);


-- ── 5. LAB VALUES ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lab_values (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  draw_id         UUID REFERENCES public.lab_draws(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  marker_name     TEXT NOT NULL,
  marker_category TEXT,
  value           NUMERIC NOT NULL,
  unit            TEXT,
  standard_low    NUMERIC,
  standard_high   NUMERIC,
  optimal_low     NUMERIC,
  optimal_high    NUMERIC,
  standard_flag   TEXT CHECK (standard_flag IN ('normal','low','high','critical_low','critical_high')),
  optimal_flag    TEXT CHECK (optimal_flag IN ('optimal','suboptimal_low','suboptimal_high','deficient','elevated','unknown')),
  draw_date       DATE
);

ALTER TABLE public.lab_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own lab values"
  ON public.lab_values FOR ALL USING (auth.uid() = user_id);


-- ── 6. WELLNESS PLANS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wellness_plans (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  draw_id           UUID REFERENCES public.lab_draws(id),
  plan_data         JSONB NOT NULL,
  generation_status TEXT DEFAULT 'pending'
    CHECK (generation_status IN ('pending', 'generating', 'complete', 'failed')),
  title             TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  version           INTEGER DEFAULT 1
);

ALTER TABLE public.wellness_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own wellness plans"
  ON public.wellness_plans FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS wellness_plans_user_id_idx
  ON public.wellness_plans (user_id, created_at DESC);


-- ── 7. PROGRESS ENTRIES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.progress_entries (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  logged_at       DATE DEFAULT CURRENT_DATE,
  energy          INTEGER CHECK (energy BETWEEN 1 AND 10),
  sleep_quality   INTEGER CHECK (sleep_quality BETWEEN 1 AND 10),
  pain_level      INTEGER CHECK (pain_level BETWEEN 1 AND 10),
  mental_clarity  INTEGER CHECK (mental_clarity BETWEEN 1 AND 10),
  mood            INTEGER CHECK (mood BETWEEN 1 AND 10),
  note            TEXT,
  weight_kg       NUMERIC,
  energy_level    INTEGER CHECK (energy_level BETWEEN 1 AND 10),
  overall_score   NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE WHEN energy IS NOT NULL AND sleep_quality IS NOT NULL AND pain_level IS NOT NULL
         AND mental_clarity IS NOT NULL AND mood IS NOT NULL
    THEN (energy + sleep_quality + (11 - pain_level) + mental_clarity + mood)::NUMERIC / 5
    ELSE NULL END
  ) STORED,
  UNIQUE (user_id, logged_at)
);

ALTER TABLE public.progress_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own progress"
  ON public.progress_entries FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_progress_entries_user_date
  ON public.progress_entries (user_id, logged_at DESC);


-- ── 8. SUPPLEMENT COMPLIANCE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplement_compliance (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  taken_date      DATE DEFAULT CURRENT_DATE,
  supplement_name TEXT NOT NULL,
  taken           BOOLEAN DEFAULT FALSE,
  UNIQUE (user_id, taken_date, supplement_name)
);

ALTER TABLE public.supplement_compliance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own compliance"
  ON public.supplement_compliance FOR ALL USING (auth.uid() = user_id);


-- ── 9. PRIORITY ALERTS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.priority_alerts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT CHECK (status IN ('urgent','monitor','optimal')),
  title           TEXT NOT NULL,
  description     TEXT,
  source          TEXT,
  action_label    TEXT,
  action_path     TEXT,
  dismissed       BOOLEAN DEFAULT FALSE,
  draw_id         UUID REFERENCES public.lab_draws(id) ON DELETE CASCADE
);

ALTER TABLE public.priority_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own alerts"
  ON public.priority_alerts FOR ALL USING (auth.uid() = user_id);


-- ── 10. SYMPTOM ANALYSES ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.symptom_analyses (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  analysis_data     JSONB NOT NULL,
  generation_status TEXT DEFAULT 'complete'
);

ALTER TABLE public.symptom_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own symptom analyses"
  ON public.symptom_analyses FOR ALL USING (auth.uid() = user_id);


-- ── 11. DOCTOR PREP DOCUMENTS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.doctor_prep_documents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  document_data JSONB NOT NULL
);

ALTER TABLE public.doctor_prep_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own doctor prep documents"
  ON public.doctor_prep_documents FOR ALL USING (auth.uid() = user_id);


-- ── 12. STRIPE EVENTS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  data         JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.stripe_events
  USING (auth.role() = 'service_role');


-- ── 13. STORAGE POLICIES (for lab-pdfs bucket) ─────────────────────────────
-- NOTE: Create the bucket manually first in Supabase Dashboard → Storage
-- Name: lab-pdfs | Public: OFF | Size limit: 20MB | MIME: application/pdf

CREATE POLICY "Users can upload own lab PDFs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lab-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read own lab PDFs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lab-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own lab PDFs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lab-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ============================================================================
-- DONE. All 11 tables + storage policies created.
-- Next: Create the lab-pdfs bucket in Dashboard → Storage → New Bucket
-- ============================================================================
