-- Rename account_type enum value from 'credit' to 'current'
-- This migration changes the account_type enum to use 'current' instead of 'credit'

-- Step 1: Drop functions that depend on the account_type enum
DROP FUNCTION IF EXISTS public.create_account(uuid, text, account_type, text) CASCADE;

-- Step 2: Create a new enum type with 'current' instead of 'credit'
CREATE TYPE public.account_type_new AS ENUM ('checking', 'savings', 'investment', 'current');

-- Step 3: Alter the accounts table to use the new type
-- This will cast 'credit' to 'current' during the conversion
ALTER TABLE public.accounts 
ALTER COLUMN type TYPE public.account_type_new 
USING 
  CASE type::text
    WHEN 'credit' THEN 'current'::public.account_type_new
    ELSE type::text::public.account_type_new
  END;

-- Step 4: Drop the old enum type
DROP TYPE public.account_type;

-- Step 5: Rename the new type to the original name
ALTER TYPE public.account_type_new RENAME TO account_type;

-- Step 6: Recreate the create_account function with the new enum type
CREATE OR REPLACE FUNCTION public.create_account(p_user_id uuid, p_name text, p_type account_type, p_candidate_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_account_number text;
  v_account_id uuid;
begin
  -- Check if user exists
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'User not found');
  end if;

  -- Generate account number if not provided
  if p_candidate_number is null or p_candidate_number = '' then
    v_account_number := lpad((floor(random() * 10000000000))::text, 10, '0');
  else
    v_account_number := p_candidate_number;
  end if;

  -- Check if account number already exists
  if exists (select 1 from public.accounts where account_number = v_account_number) then
    return jsonb_build_object('ok', false, 'error', 'Account number already exists');
  end if;

  -- Create the account
  insert into public.accounts (user_id, name, type, account_number, status, account_state)
  values (p_user_id, p_name, p_type, v_account_number, 'active', 'active')
  returning id into v_account_id;

  return jsonb_build_object('ok', true, 'account_id', v_account_id, 'account_number', v_account_number);
end;
$function$;
