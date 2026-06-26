-- Update get_transaction_for_notification to include account last 4 digits
CREATE OR REPLACE FUNCTION public.get_transaction_for_notification(p_transaction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
  v_account_number TEXT;
BEGIN
  -- Get transaction with user email and account details
  SELECT 
    t.*,
    p.email as user_email,
    p.full_name as user_name,
    a.account_number
  INTO v_transaction
  FROM public.transactions t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  LEFT JOIN public.accounts a ON a.id = t.account_id
  WHERE t.id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Transaction not found');
  END IF;
  
  -- Get last 4 digits of account number
  v_account_number := v_transaction.account_number;
  IF v_account_number IS NOT NULL AND length(v_account_number) >= 4 THEN
    v_account_number := right(v_account_number, 4);
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_transaction.user_id,
    'user_email', v_transaction.user_email,
    'user_name', v_transaction.user_name,
    'account_last4', v_account_number,
    'transaction', row_to_json(v_transaction)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transaction_for_notification(UUID) TO authenticated;
