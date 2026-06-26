-- Transaction Email Alert Function
-- This function sends an email notification to the user for a given transaction
-- It can be called from other RPC functions after creating a transaction

CREATE OR REPLACE FUNCTION public.notify_transaction_email(
  p_user_id UUID,
  p_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_result JSONB;
BEGIN
  -- Get the transaction details
  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE id = p_transaction_id AND user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Transaction not found');
  END IF;
  
  -- Return success - the actual email sending will be handled by the Edge Function
  -- called from the application layer after the RPC completes
  RETURN jsonb_build_object('ok', true, 'transaction_id', p_transaction_id);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.notify_transaction_email(UUID, UUID) TO authenticated;

-- Helper function to be called from application layer
-- This wraps the Edge Function call for transaction alerts
CREATE OR REPLACE FUNCTION public.get_transaction_for_notification(p_transaction_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Get transaction with user email
  SELECT 
    t.*,
    p.email as user_email,
    p.full_name as user_name
  INTO v_transaction
  FROM public.transactions t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE t.id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Transaction not found');
  END IF;
  
  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_transaction.user_id,
    'user_email', v_transaction.user_email,
    'user_name', v_transaction.user_name,
    'transaction', row_to_json(v_transaction)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_transaction_for_notification(UUID) TO authenticated;
