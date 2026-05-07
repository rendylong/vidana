ALTER TABLE users
ADD COLUMN IF NOT EXISTS analysis_credits integer NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  source text NOT NULL CHECK (source IN ('initial_grant', 'admin_adjustment', 'analysis_success')),
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
  ON credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_analysis_id
  ON credit_transactions(analysis_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_analysis_success_once
  ON credit_transactions(analysis_id)
  WHERE source = 'analysis_success' AND analysis_id IS NOT NULL;

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS credit_charged_at timestamptz;

CREATE OR REPLACE FUNCTION charge_analysis_credit(p_analysis_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_analysis analyses%ROWTYPE;
  v_credits integer;
BEGIN
  SELECT *
  INTO v_analysis
  FROM analyses
  WHERE id = p_analysis_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Analysis not found: %', p_analysis_id;
  END IF;

  IF v_analysis.credit_charged_at IS NOT NULL THEN
    RETURN false;
  END IF;

  SELECT analysis_credits
  INTO v_credits
  FROM users
  WHERE id = v_analysis.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found for analysis: %', p_analysis_id;
  END IF;

  IF v_credits <= 0 THEN
    RAISE EXCEPTION '可用分析次数不足，请联系管理员增加额度。';
  END IF;

  UPDATE users
  SET analysis_credits = analysis_credits - 1
  WHERE id = v_analysis.user_id;

  INSERT INTO credit_transactions (user_id, delta, source, analysis_id, reason)
  VALUES (v_analysis.user_id, -1, 'analysis_success', p_analysis_id, '分析成功扣减');

  UPDATE analyses
  SET credit_charged_at = now()
  WHERE id = p_analysis_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_user_credits(
  p_user_id uuid,
  p_delta integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_credits integer;
  v_next_credits integer;
  v_transaction credit_transactions%ROWTYPE;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'p_delta must be a nonzero integer';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'p_reason is required';
  END IF;

  SELECT analysis_credits
  INTO v_current_credits
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_next_credits := v_current_credits + p_delta;

  IF v_next_credits < 0 THEN
    RAISE EXCEPTION 'User credits cannot be negative';
  END IF;

  UPDATE users
  SET analysis_credits = v_next_credits
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, delta, source, reason)
  VALUES (p_user_id, p_delta, 'admin_adjustment', trim(p_reason))
  RETURNING * INTO v_transaction;

  RETURN jsonb_build_object(
    'analysis_credits', v_next_credits,
    'transaction', to_jsonb(v_transaction)
  );
END;
$$;
