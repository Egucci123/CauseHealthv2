-- One-time pricing migration.
--
-- Pricing model:
--   $19 one-time = "unlock" — grants pro tier + 1 lab-draw upload credit
--   $5 one-time  = "upload pack" — grants +1 lab-draw upload credit
--
-- Append-to-existing-draw is FREE (a missed file, follow-up CRP-only,
-- etc. — see useAppendToDraw). Only brand-new lab_draws rows consume a
-- credit.
--
-- This replaces the prior "30-day rolling 1-free-upload" cap. Existing
-- pro / comp subscribers are honored — they're treated as having
-- unlimited credits for the lifetime of their subscription_status.

-- Per-user upload credit balance. Granted by Stripe webhook on successful
-- one-time payment; decremented by the upload flow when a new lab_draws
-- row is created.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS upload_credits INTEGER NOT NULL DEFAULT 0;

-- Timestamp of the one-time $19 unlock purchase. NULL = never purchased
-- (free user, pre-unlock). Useful for audit and for distinguishing
-- "paid one-time pro" vs "comp" vs "legacy subscription pro".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unlock_purchased_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.upload_credits IS
  'Remaining lab-draw upload credits. +1 from $19 unlock, +1 from each $5 upload pack. Decremented when a new lab_draws row is created. Append-to-existing-draw does NOT consume.';

COMMENT ON COLUMN public.profiles.unlock_purchased_at IS
  'When the user paid the one-time $19 unlock. NULL = never paid (free or comp). Set by stripe-webhook on checkout.session.completed for the unlock price.';

-- Atomic credit decrement RPC. Called by the frontend immediately after a
-- successful lab_draws insert. Returns the new balance, or -1 if the user
-- already had zero (in which case the caller should refund / invalidate).
-- We do this server-side so two concurrent uploads can't both pass a
-- client-side balance check and end up at -1.
CREATE OR REPLACE FUNCTION public.consume_upload_credit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE public.profiles
     SET upload_credits = upload_credits - 1
   WHERE id = p_user_id
     AND upload_credits > 0
   RETURNING upload_credits INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RETURN -1;
  END IF;
  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_upload_credit(UUID) TO authenticated;

COMMENT ON FUNCTION public.consume_upload_credit IS
  'Atomically decrements upload_credits by 1. Returns new balance, or -1 if balance was already zero (caller should redirect to $5 checkout).';

-- Webhook-side grant: $19 unlock atomically sets pro + bumps credits + stamps
-- unlock_purchased_at. Service-role only (called from stripe-webhook).
CREATE OR REPLACE FUNCTION public.grant_unlock(p_user_id UUID, p_customer_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET subscription_tier      = 'pro',
         subscription_status    = 'active',
         stripe_customer_id     = COALESCE(p_customer_id, stripe_customer_id),
         comp_code_used         = NULL,
         upload_credits         = upload_credits + 1,
         unlock_purchased_at    = COALESCE(unlock_purchased_at, NOW())
   WHERE id = p_user_id;
END;
$$;

-- Webhook-side grant: $5 upload pack atomically bumps credits.
CREATE OR REPLACE FUNCTION public.grant_upload_credit(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET upload_credits = upload_credits + 1
   WHERE id = p_user_id;
END;
$$;

-- Both grants are SECURITY DEFINER and intentionally NOT granted to
-- 'authenticated' — only the service-role key (stripe-webhook) should
-- call them. This prevents a malicious client from self-granting credits.
REVOKE EXECUTE ON FUNCTION public.grant_unlock(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_upload_credit(UUID) FROM PUBLIC;
