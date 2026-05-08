ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS analysis_type text NOT NULL DEFAULT 'analysis'
CHECK (analysis_type IN ('analysis', 'benchmark'));

CREATE INDEX IF NOT EXISTS idx_analyses_analysis_type ON analyses(analysis_type);
