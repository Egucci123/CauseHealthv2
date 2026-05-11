-- 20260511_pregnancy_status.sql
--
-- Captures pregnancy status as a user-supplied attestation at onboarding
-- (Step 1) rather than inferring it from supplements or hormonal patterns.
-- Marisa Sirkin (27F on a prenatal vitamin) revealed the cost of leaving
-- this implicit: the AI missed the suspected pregnancy entirely, never
-- recommended β-hCG, and emitted a "Male hormonal axis — critical"
-- pattern card. Universal coverage starts here.
--
-- Adds:
--   • profiles.pregnancy_status text — explicit user answer:
--       'pregnant'           — actively pregnant
--       'trying'             — actively trying to conceive
--       'breastfeeding'      — postpartum nursing
--       'not_pregnant'       — definitively no
--       'prefer_not_to_say'  — declined to answer
--       'not_applicable'     — biological male (auto-set, no UI prompt)
--       NULL                  — legacy users; pre-launch population
--
-- Back-compat: profiles.is_pregnant (boolean) already exists and is read
-- by the rule engine. We mirror pregnancy_status into is_pregnant via a
-- trigger so every safety rule that already checks is_pregnant fires
-- whenever pregnancy_status is one of the "could-be-pregnant-now" values:
--   pregnant / trying / breastfeeding / prefer_not_to_say(female only).
--
-- prefer_not_to_say erring toward isPregnant=true for biological-female
-- users is intentional: if a user declines to answer, defaulting to
-- pregnancy-safe is the conservative choice. Cost is a couple of
-- supplement recommendations being skipped; benefit is avoiding a
-- teratogenic recommendation we can never take back.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pregnancy_status text;

-- Add CHECK to keep values bounded.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pregnancy_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pregnancy_status_check
      CHECK (pregnancy_status IS NULL OR pregnancy_status IN (
        'pregnant',
        'trying',
        'breastfeeding',
        'not_pregnant',
        'prefer_not_to_say',
        'not_applicable'
      ));
  END IF;
END $$;

-- is_pregnant column may or may not exist depending on prior migration
-- history. Add it idempotently so the trigger below has a target.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pregnant boolean NOT NULL DEFAULT false;

-- Trigger: derive is_pregnant from pregnancy_status on every write so the
-- rule engine (which checks is_pregnant) automatically respects the
-- onboarding answer. We treat "could-be-pregnant-now" as TRUE:
--   pregnant / trying / breastfeeding / prefer_not_to_say (for females)
-- not_pregnant / not_applicable / NULL → FALSE.
CREATE OR REPLACE FUNCTION public.sync_is_pregnant_from_status()
RETURNS trigger AS $$
BEGIN
  NEW.is_pregnant := CASE
    WHEN NEW.pregnancy_status IN ('pregnant','trying','breastfeeding') THEN true
    WHEN NEW.pregnancy_status = 'prefer_not_to_say'
         AND NEW.sex IN ('female','f','F') THEN true
    ELSE false
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_sync_is_pregnant ON public.profiles;
CREATE TRIGGER profiles_sync_is_pregnant
  BEFORE INSERT OR UPDATE OF pregnancy_status, sex ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_is_pregnant_from_status();

COMMENT ON COLUMN public.profiles.pregnancy_status IS
  'User-supplied at Step 1 onboarding. Explicit answer beats inference from supplements/hormones. NULL = legacy pre-2026-05-11 user. Drives is_pregnant via trigger; rule engine reads is_pregnant.';

COMMENT ON COLUMN public.profiles.is_pregnant IS
  'DERIVED from pregnancy_status via trigger. Do not write directly. TRUE when status is pregnant/trying/breastfeeding/prefer_not_to_say(female). FALSE otherwise.';

-- Index for any future cohort queries on pregnant users.
CREATE INDEX IF NOT EXISTS profiles_pregnancy_status_idx
  ON public.profiles (pregnancy_status)
  WHERE pregnancy_status IS NOT NULL;
