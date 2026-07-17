ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hold_reason text;

CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_user_id uuid, p_status text, p_hold_reason text DEFAULT NULL)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'Admin access required');
  END IF;

  IF p_status NOT IN ('pending', 'approved', 'suspended', 'frozen', 'on_hold') THEN
    RETURN json_build_object('ok', false, 'error', 'Invalid status value');
  END IF;

  UPDATE public.profiles
  SET approval_status = p_status,
      hold_reason = CASE
        WHEN p_status = 'on_hold' THEN p_hold_reason
        ELSE NULL
      END,
      profile_data = CASE
        WHEN p_status = 'on_hold' AND p_hold_reason IS NOT NULL THEN
          jsonb_strip_nulls(COALESCE(profile_data, '{}'::jsonb) || jsonb_build_object('hold_reason', p_hold_reason))
        WHEN p_status <> 'on_hold' THEN
          COALESCE(profile_data, '{}'::jsonb) - 'hold_reason'
        ELSE
          COALESCE(profile_data, '{}'::jsonb)
      END,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'User not found');
  END IF;

  RETURN json_build_object('ok', true);
END;
$function$;
