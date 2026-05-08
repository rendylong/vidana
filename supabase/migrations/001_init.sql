-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feishu_id text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- 分析记录表
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  video_duration numeric,
  target_audience text,
  platform text,
  context text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
  score integer,
  raw_result jsonb,
  report jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- 索引
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的分析记录
CREATE POLICY "Users can read own analyses"
  ON analyses FOR SELECT
  USING (user_id::text = (current_setting('request.jwt.claims')::json->>'sub'));

CREATE POLICY "Users can delete own analyses"
  ON analyses FOR DELETE
  USING (user_id::text = (current_setting('request.jwt.claims')::json->>'sub'));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);

-- Storage RLS: 用户只能操作自己文件夹下的视频
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
