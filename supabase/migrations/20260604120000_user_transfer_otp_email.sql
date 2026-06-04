-- User-driven transfer OTP via email
--
-- Previously, an admin generated a transfer OTP and relayed it to the user
-- out-of-band. Now the user requests the OTP themselves when confirming a
-- transfer: the `send-transfer-otp` Edge Function generates a 6-digit code,
-- emails it to the user (Resend), and stores it through `store_transfer_otp`.
-- Codes expire after 5 minutes and remain single-use.

-- ── User-callable: store a freshly generated transfer OTP ────────────────────
-- Called by the send-transfer-otp Edge Function using the user's own token, so
-- auth.uid() is the requesting user. The function never returns the code — the
-- code only reaches the user by email — so it is safe even if called directly.
CREATE OR REPLACE FUNCTION public.store_transfer_otp(p_account_id uuid, p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  acct RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO acct FROM public.accounts WHERE id = p_account_id;
  IF NOT FOUND OR acct.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Invalid account');
  END IF;

  -- Invalidate any existing unused OTPs for this account
  UPDATE public.transfer_otps
  SET used = TRUE
  WHERE account_id = p_account_id AND used = FALSE;

  -- Single-use code, valid for 5 minutes
  INSERT INTO public.transfer_otps (user_id, account_id, code, expires_at, used)
  VALUES (auth.uid(), p_account_id, p_code, now() + interval '5 minutes', FALSE);

  RETURN json_build_object('ok', TRUE);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.store_transfer_otp(uuid, text) TO authenticated;

-- ── Remove the admin-generated OTP flow ──────────────────────────────────────
-- Users now self-serve via email, so the admin generator is no longer needed.
DROP FUNCTION IF EXISTS public.admin_generate_transfer_otp(uuid) CASCADE;

-- verify_transfer_otp already enforces `expires_at > now()` when set, so no
-- change is required there — the 5-minute window is honored automatically.

NOTIFY pgrst, 'reload schema';
