-- Fix ambiguous column reference 'id' in admin_create_account function
-- Use table-qualified column names in RETURNING clause

CREATE OR REPLACE FUNCTION public.admin_create_account(
  p_user_id uuid,
  p_name text,
  p_type text,
  p_balance numeric DEFAULT 0,
  p_account_number text DEFAULT NULL::text,
  p_status text DEFAULT 'active'::text,
  p_transaction_limit numeric DEFAULT NULL::numeric,
  p_requires_transfer_otp boolean DEFAULT false,
  p_hold_reason text DEFAULT NULL::text
)
 RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  type text,
  balance numeric,
  account_number text,
  status text,
  account_state text,
  transaction_limit numeric,
  requires_transfer_otp boolean,
  hold_reason text,
  created_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  INSERT INTO public.accounts (
    user_id, name, type, balance, account_number, status,
    account_state, transaction_limit, requires_transfer_otp, hold_reason
  ) VALUES (
    p_user_id,
    p_name,
    p_type::account_type,
    COALESCE(p_balance, 0),
    COALESCE(p_account_number, lpad((floor(random() * 10000000000))::text, 10, '0')),
    p_status::account_status,
    p_status::account_status,
    p_transaction_limit,
    p_requires_transfer_otp,
    p_hold_reason
  )
  RETURNING
    accounts.id, accounts.user_id, accounts.name, accounts.type::text, accounts.balance, 
    accounts.account_number, accounts.status::text, accounts.account_state::text, 
    accounts.transaction_limit, accounts.requires_transfer_otp, accounts.hold_reason, 
    accounts.created_at;
END;
$function$;
