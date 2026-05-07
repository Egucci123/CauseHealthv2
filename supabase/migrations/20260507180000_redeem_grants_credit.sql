-- Comp-code redemption now grants +1 upload credit, same as $19 unlock.
--
-- Previously: redeem_comp_code only set subscription_tier='comp' — comp
-- users were exempted from the credit gate in labUploadStore via a
-- bypass. That gave them unlimited free uploads, which isn't the model:
-- a redeemed code should give the same 1-upload entitlement as paying
-- the $19 unlock — first upload free, $5 per additional.
--
-- This migration replaces the function so it ALSO bumps upload_credits.
-- Existing redeemed users keep their tier; if they need a credit they
-- can be hand-granted one (rare path).

CREATE OR REPLACE FUNCTION public.redeem_comp_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_code public.comp_codes%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in');
  END IF;
  SELECT * INTO v_code FROM public.comp_codes WHERE code = upper(trim(p_code));
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid code');
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code has expired');
  END IF;
  IF v_code.uses_count >= v_code.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This code is fully redeemed');
  END IF;
  UPDATE public.comp_codes SET uses_count = uses_count + 1 WHERE id = v_code.id;
  UPDATE public.profiles
    SET subscription_tier      = v_code.granted_tier,
        subscription_status    = 'active',
        subscription_expires_at = v_code.grants_until,
        comp_code_used         = v_code.code,
        -- +1 upload credit, parity with the $19 unlock. Subsequent uploads
        -- still cost $5 (handled by the credit gate in labUploadStore).
        upload_credits         = upload_credits + 1
    WHERE id = v_user_id;
  RETURN jsonb_build_object('ok', true, 'tier', v_code.granted_tier, 'expires_at', v_code.grants_until);
END;
$function$;

COMMENT ON FUNCTION public.redeem_comp_code IS
  'Redeem a comp code: sets tier=comp + status=active + grants +1 upload_credit (parity with $19 unlock). Subsequent uploads still go through the $5 credit gate.';
