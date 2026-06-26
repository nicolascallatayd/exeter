-- Fix typo in transfer_funds function: debit-id should be debit_id
CREATE OR REPLACE FUNCTION public.transfer_funds(p_user_id uuid, p_from_id uuid, p_to_id uuid, p_amount numeric, p_note text DEFAULT NULL::text, p_otp_code text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  from_account RECORD;
  to_account   RECORD;
  error_message TEXT;
  ref_code TEXT;
  debit_id UUID;
  credit_id UUID;
BEGIN
  IF auth.uid() IS NULL OR auth.uid()::UUID IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO from_account FROM public.accounts WHERE id = p_from_id;
  SELECT * INTO to_account   FROM public.accounts WHERE id = p_to_id;

  IF NOT FOUND OR from_account.user_id IS DISTINCT FROM p_user_id THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Invalid source account');
  END IF;

  IF from_account.account_state IS NULL THEN
    from_account.account_state := from_account.status;
  END IF;
  IF to_account.account_state IS NULL THEN
    to_account.account_state := to_account.status;
  END IF;

  IF from_account.account_state <> 'active' THEN
    IF from_account.account_state = 'inactive' THEN
      error_message := COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_account_inactive'),
        'Transfers are not allowed from inactive accounts.'
      );
    ELSIF from_account.account_state = 'on_hold' THEN
      error_message := COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_account_on_hold'),
        'Transfers are not allowed from accounts on hold.'
      );
    ELSIF from_account.account_state = 'suspended' THEN
      error_message := COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_account_suspended'),
        'Transfers are not allowed from suspended accounts.'
      );
    ELSE
      error_message := 'Transfers are not allowed from this account.';
    END IF;
    RETURN json_build_object('ok', FALSE, 'error', error_message);
  END IF;

  IF to_account.account_state <> 'active' THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Destination account is not available for transfers.');
  END IF;

  IF from_account.transaction_limit IS NOT NULL AND p_amount > from_account.transaction_limit THEN
    RETURN json_build_object('ok', FALSE, 'error', 'This transfer exceeds the account transaction limit.');
  END IF;

  -- OTP is always required for every transfer
  IF p_otp_code IS NULL OR p_otp_code = '' THEN
    RETURN json_build_object(
      'ok', FALSE,
      'error', COALESCE(
        (SELECT value FROM public.admin_settings WHERE key = 'error_transfer_otp_required'),
        'A transfer OTP is required. Please contact your account manager to obtain one.'
      )
    );
  END IF;

  IF NOT public.verify_transfer_otp(p_from_id, p_otp_code) THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Invalid or already-used OTP code.');
  END IF;

  IF p_amount <= 0 THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Transfer amount must be greater than zero.');
  END IF;

  IF from_account.balance < p_amount THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Insufficient balance.');
  END IF;

  -- Execute transfer immediately for between accounts
  ref_code := 'TXN-' || upper(substr(gen_random_uuid()::text, 1, 8));

  UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_from_id;
  UPDATE public.accounts SET balance = balance + p_amount WHERE id = p_to_id;

  INSERT INTO public.transactions (user_id, account_id, name, category, amount, type, note, created_at)
  VALUES (p_user_id, p_from_id, 'Transfer', 'Transfer', p_amount, 'debit', p_note, now())
  RETURNING id INTO debit_id;

  INSERT INTO public.transactions (user_id, account_id, name, category, amount, type, note, created_at)
  VALUES (p_user_id, p_to_id, 'Transfer', 'Transfer', p_amount, 'credit', p_note, now())
  RETURNING id INTO credit_id;

  RETURN json_build_object(
    'ok',        TRUE,
    'pending',   FALSE,
    'reference', ref_code,
    'from_name', from_account.name,
    'to_name',   to_account.name,
    'amount',    p_amount,
    'debit_id',  debit_id,
    'credit_id', credit_id
  );
END;
$function$;
