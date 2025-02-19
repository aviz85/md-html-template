-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create transcription_jobs table
CREATE TABLE transcription_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL DEFAULT 'pending',
  original_filename TEXT NOT NULL,
  preferred_language TEXT,
  proofreading_context TEXT,
  storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  final_transcription TEXT,
  final_proofread TEXT,
  error TEXT,
  metadata JSONB,
  segments_count INTEGER,
  completed_segments INTEGER DEFAULT 0,
  completed_proofreads INTEGER DEFAULT 0
);

-- Create task_queue table
CREATE TABLE task_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES transcription_jobs(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error TEXT,
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  locked_until TIMESTAMPTZ,
  locked_by TEXT,
  parent_task_id UUID REFERENCES task_queue(id),
  sequence_order INTEGER
);

-- Create indexes
CREATE INDEX idx_task_queue_status ON task_queue(status);
CREATE INDEX idx_task_queue_priority ON task_queue(priority);
CREATE INDEX idx_task_queue_job_id ON task_queue(job_id);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status);
CREATE INDEX idx_task_queue_locked_until ON task_queue(locked_until);
CREATE INDEX idx_task_queue_parent ON task_queue(parent_task_id);

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_transcription_jobs_updated_at
  BEFORE UPDATE ON transcription_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_queue_updated_at
  BEFORE UPDATE ON task_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_queue ENABLE ROW LEVEL SECURITY;

-- Allow all access for service role
CREATE POLICY "Allow all access for service role" ON transcription_jobs
  FOR ALL USING (true);

CREATE POLICY "Allow all access for service role" ON task_queue
  FOR ALL USING (true);

-- Create storage bucket
INSERT INTO storage.buckets (id, name)
VALUES ('transcriptions', 'transcriptions')
ON CONFLICT (id) DO NOTHING;

-- Allow public access to transcriptions bucket
CREATE POLICY "Allow public access to transcriptions" ON storage.objects
  FOR ALL USING (bucket_id = 'transcriptions'); 