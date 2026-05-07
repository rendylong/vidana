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

ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS credit_charged_at timestamptz;
