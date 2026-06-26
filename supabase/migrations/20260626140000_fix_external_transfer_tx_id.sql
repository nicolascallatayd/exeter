-- Fix send_external_transfer to return tx_id for email notification
CREATE OR REPLACE FUNCTION public.send_external_transfer(p_user_id uuid, p_account_id uuid, p_beneficiary_id uuid DEFAULT NULL::uuid, p_beneficiary_name text DEFAULT NULL::text, p_bank_name text DEFAULT NULL::text, p_account_number text DEFAULT NULL::text, p_amount numeric DEFAULT 0, p_note text DEFAULT NULL::text, p_save_beneficiary boolean DEFAULT false, p_swift_bic text DEFAULT NULL::text, p_iban text DEFAULT NULL::text, p_otp_code text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  src_account  RECORD;
  bene_id      UUID;
  ref_code     TEXT;
  debit_id     UUID;
  error_message TEXT;
BEGIN
  IF auth.uid() IS NULL OR auth.uid()::UUID IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO src_account FROM public.accounts WHERE id = p_account_id;

  IF NOT FOUND OR src_account.user_id IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Invalid source account');
  END IF;

  IF src_account.account_state IS NULL THEN
    src_account.account_state := src_account.status;
  END IF;

  IF src_account.account_state <> 'active' THEN
    IF src_account.account_state = 'inactive' THEN
      error_message := COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_account_inactive'),
        'Transfers are not allowed from inactive accounts.'
      );
    ELSIF src_account.account_state = 'on_hold' THEN
      error_message := COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_account_on_hold'),
        'Transfers are not allowed from accounts on hold.'
      );
    ELSIF src_account.account_state = 'suspended' THEN
      error_message := COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_account_suspended'),
        'Transfers are not allowed from suspended accounts.'
      );
    ELSE
      error_message := 'Transfers are not allowed from this account.';
    END IF;
    RETURN json_build_object('ok', FALSE, 'error', error_message);
  END IF;

  IF src_account.transaction_limit IS NOT NULL AND p_amount > src_account.transaction_limit THEN
    RETURN json_build_object('ok', FALSE, 'error', 'This transfer exceeds the account transaction limit.');
  END IF;

  -- OTP always required
  IF p_otp_code IS NULL OR p_otp_code = '' THEN
    RETURN json_build_object(
      'ok', FALSE,
      'error', COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_transfer_otp_required'),
        'A transfer OTP is required. Please contact your account manager to obtain one.'
      )
    );
  END IF;

  IF NOT public.verify_transfer_otp(p_account_id, p_otp_code) THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Invalid or already-used OTP code.');
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Transfer amount must be greater than zero.');
  END IF;

  IF src_account.balance < p_amount THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Insufficient balance.');
  END IF;

  -- Optionally save beneficiary now so it is reusable regardless of review outcome
  IF p_save_beneficiary AND p_beneficiary_id IS NULL THEN
    INSERT INTO public.beneficiaries (user_id, full_name, bank_name, account_number, swift_bic, iban)
    VALUES (p_user_id, p_beneficiary_name, p_bank_name, p_account_number, p_swift_bic, p_iban)
    RETURNING id INTO bene_id;
  ELSE
    bene_id := p_beneficiary_id;
  END IF;

  -- Debit immediately, but queue for admin review before external release
  ref_code := 'EXT-' || upper(substr(gen_random_uuid()::text, 1, 8));

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;

  INSERT INTO public.transactions (user_id, account_id, name, category, amount, type, note, created_at)
  VALUES (p_user_id, p_account_id, COALESCE(p_beneficiary_name, 'External Transfer'), 'Transfer', p_amount, 'debit', p_note, now())
  RETURNING id INTO debit_id;

  INSERT INTO public.pending_transfers (
    user_id, from_account_id, transfer_type, amount, note, reference,
    beneficiary_id, beneficiary_name, bank_name, account_number, swift_bic, iban, status
  ) VALUES (
    p_user_id, p_account_id, 'external', p_amount, p_note, ref_code,
    bene_id, p_beneficiary_name, p_bank_name, p_account_number, p_swift_bic, p_iban, 'pending'
  );

  RETURN json_build_object(
    'ok',             TRUE,
    'pending',        TRUE,
    'reference',      ref_code,
    'beneficiary_id', bene_id,
    'amount',         p_amount,
    'tx_id',          debit_id,
    'message',        src_account.transfer_pending_message
  );
END;
$function$;
