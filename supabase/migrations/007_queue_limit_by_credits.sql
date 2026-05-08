CREATE OR REPLACE FUNCTION create_queued_analysis_job(
  p_user_id uuid,
  p_video_url text,
  p_target_audience text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_context text DEFAULT NULL,
  p_analysis_type text DEFAULT 'analysis',
  p_active_limit integer DEFAULT 3
) RETURNS analyses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count integer;
  v_available_credits integer;
  v_effective_limit integer;
  v_analysis analyses%ROWTYPE;
BEGIN
  SELECT analysis_credits
  INTO v_available_credits
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT count(*)::integer INTO v_active_count
  FROM analyses
  WHERE user_id = p_user_id
    AND status IN ('queued', 'processing');

  v_effective_limit := LEAST(p_active_limit, GREATEST(v_available_credits, 0));

  IF v_active_count >= v_effective_limit THEN
    RAISE EXCEPTION 'ACTIVE_ANALYSIS_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO analyses (
    user_id,
    video_url,
    target_audience,
    platform,
    context,
    analysis_type,
    status,
    queued_at,
    attempt_count,
    max_attempts,
    next_retry_at,
    locked_by,
    locked_at,
    started_at,
    error_message
  ) VALUES (
    p_user_id,
    p_video_url,
    NULLIF(p_target_audience, ''),
    NULLIF(p_platform, ''),
    NULLIF(p_context, ''),
    p_analysis_type,
    'queued',
    now(),
    0,
    3,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ) RETURNING * INTO v_analysis;

  RETURN v_analysis;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_queued_analysis_job(uuid, text, text, text, text, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_queued_analysis_job(uuid, text, text, text, text, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION create_queued_analysis_job(uuid, text, text, text, text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_queued_analysis_job(uuid, text, text, text, text, text, integer) TO service_role;
