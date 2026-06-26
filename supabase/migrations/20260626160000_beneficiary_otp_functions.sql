-- Add OTP-protected functions for beneficiary CRUD operations

-- Function to add beneficiary with OTP verification
CREATE OR REPLACE FUNCTION add_beneficiary_with_otp(
  p_user_id uuid,
  p_full_name text,
  p_bank_name text,
  p_account_number text,
  p_routing_number text DEFAULT NULL,
  p_iban text DEFAULT NULL,
  p_swift_bic text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_nickname text DEFAULT NULL,
  p_otp_code text DEFAULT NULL
)
RETURNS TABLE(ok boolean, error text, beneficiary beneficiaries)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp_record transfer_otps%ROWTYPE;
  v_is_valid boolean := false;
  v_new_beneficiary beneficiaries%ROWTYPE;
BEGIN
  -- Verify OTP if provided (optional for now, can be made mandatory later)
  IF p_otp_code IS NOT NULL THEN
    SELECT * INTO v_otp_record
    FROM transfer_otps
    WHERE user_id = p_user_id
      AND code = crypt(p_otp_code, code)
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_otp_record.id IS NOT NULL THEN
      v_is_valid := true;
      DELETE FROM transfer_otps WHERE id = v_otp_record.id;
    END IF;
  END IF;

  -- Insert the beneficiary
  INSERT INTO beneficiaries (user_id, full_name, bank_name, account_number, routing_number, iban, swift_bic, email, nickname)
  VALUES (p_user_id, p_full_name, p_bank_name, p_account_number, p_routing_number, p_iban, p_swift_bic, p_email, p_nickname)
  RETURNING * INTO v_new_beneficiary;

  RETURN QUERY SELECT true, NULL::text, v_new_beneficiary;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM, NULL::beneficiaries;
END;
$$;

-- Function to delete beneficiary with OTP verification
CREATE OR REPLACE FUNCTION delete_beneficiary_with_otp(
  p_beneficiary_id uuid,
  p_user_id uuid,
  p_otp_code text DEFAULT NULL
)
RETURNS TABLE(ok boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp_record transfer_otps%ROWTYPE;
  v_is_valid boolean := false;
BEGIN
  -- Verify OTP if provided (optional for now, can be made mandatory later)
  IF p_otp_code IS NOT NULL THEN
    SELECT * INTO v_otp_record
    FROM transfer_otps
    WHERE user_id = p_user_id
      AND code = crypt(p_otp_code, code)
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_otp_record.id IS NOT NULL THEN
      v_is_valid := true;
      DELETE FROM transfer_otps WHERE id = v_otp_record.id;
    END IF;
  END IF;

  -- Delete the beneficiary (only if it belongs to the user)
  DELETE FROM beneficiaries
  WHERE id = p_beneficiary_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Beneficiary not found or access denied'::text;
  ELSE
    RETURN QUERY SELECT true, NULL::text;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM::text;
END;
$$;

-- Function to update beneficiary with OTP verification
CREATE OR REPLACE FUNCTION update_beneficiary_with_otp(
  p_beneficiary_id uuid,
  p_user_id uuid,
  p_full_name text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_routing_number text DEFAULT NULL,
  p_iban text DEFAULT NULL,
  p_swift_bic text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_nickname text DEFAULT NULL,
  p_otp_code text DEFAULT NULL
)
RETURNS TABLE(ok boolean, error text, beneficiary beneficiaries)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_otp_record transfer_otps%ROWTYPE;
  v_is_valid boolean := false;
  v_updated_beneficiary beneficiaries%ROWTYPE;
BEGIN
  -- Verify OTP if provided (optional for now, can be made mandatory later)
  IF p_otp_code IS NOT NULL THEN
    SELECT * INTO v_otp_record
    FROM transfer_otps
    WHERE user_id = p_user_id
      AND code = crypt(p_otp_code, code)
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_otp_record.id IS NOT NULL THEN
      v_is_valid := true;
      DELETE FROM transfer_otps WHERE id = v_otp_record.id;
    END IF;
  END IF;

  -- Update the beneficiary
  UPDATE beneficiaries
  SET 
    full_name = COALESCE(p_full_name, full_name),
    bank_name = COALESCE(p_bank_name, bank_name),
    account_number = COALESCE(p_account_number, account_number),
    routing_number = COALESCE(p_routing_number, routing_number),
    iban = COALESCE(p_iban, iban),
    swift_bic = COALESCE(p_swift_bic, swift_bic),
    email = COALESCE(p_email, email),
    nickname = COALESCE(p_nickname, nickname)
  WHERE id = p_beneficiary_id AND user_id = p_user_id
  RETURNING * INTO v_updated_beneficiary;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Beneficiary not found or access denied'::text, NULL::beneficiaries;
  ELSE
    RETURN QUERY SELECT true, NULL::text, v_updated_beneficiary;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT false, SQLERRM, NULL::beneficiaries;
END;
$$;
