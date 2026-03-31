-- Create transcriptions table
CREATE TABLE transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('upload', 'youtube', 'instagram', 'drive')),
  original_text TEXT,
  translated_text TEXT,
  language TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  include_timestamps BOOLEAN DEFAULT TRUE,
  file_url TEXT,
  file_name TEXT
);

-- Enable Row Level Security
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own transcriptions"
  ON transcriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transcriptions"
  ON transcriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transcriptions"
  ON transcriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transcriptions"
  ON transcriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Create storage bucket for transcriptions (optional, but good practice)
-- Note: This usually needs to be done via Supabase dashboard or API, 
-- but we can include the SQL for it if the environment supports it.
-- INSERT INTO storage.buckets (id, name, public) VALUES ('transcriptions', 'transcriptions', true);

-- Storage Policies
-- Allow users to upload their own transcriptions
CREATE POLICY "Users can upload their own transcriptions"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'transcriptions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to view their own transcriptions
CREATE POLICY "Users can view their own transcriptions"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'transcriptions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to delete their own transcriptions
CREATE POLICY "Users can delete their own transcriptions"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'transcriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
