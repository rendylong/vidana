ALTER TABLE analyses
DROP CONSTRAINT IF EXISTS analyses_status_check;

ALTER TABLE analyses
ADD CONSTRAINT analyses_status_check
CHECK (status IN ('pending', 'analyzing', 'queued', 'processing', 'completed', 'failed', 'canceled'));

ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS queued_at timestamptz,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS locked_by text,
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS source_mode text;

CREATE INDEX IF NOT EXISTS idx_analyses_queue_status
ON analyses(status, next_retry_at, queued_at);

CREATE INDEX IF NOT EXISTS idx_analyses_user_active_queue
ON analyses(user_id, status)
WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION count_active_analysis_tasks(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT count(*)::integer
  FROM analyses
  WHERE user_id = p_user_id
    AND status IN ('queued', 'processing');
$$;

REVOKE EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) TO service_role;
