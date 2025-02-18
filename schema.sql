-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Templates table
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    css TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    color1 TEXT,
    color2 TEXT,
    color3 TEXT,
    color4 TEXT,
    color5 TEXT,
    header_content TEXT,
    footer_content TEXT,
    opening_page_content TEXT,
    closing_page_content TEXT,
    custom_fonts JSONB,
    element_styles JSONB,
    send_whatsapp BOOLEAN DEFAULT false,
    whatsapp_message TEXT DEFAULT E'היי!\n\nהאבחון האישי שלך מוכן! 🎯\n\nהוא כולל תובנות חשובות וכלים מעשיים שיעזרו לך לקבל בהירות ולמקד את הצעדים הבאים שלך.\n\nאפשר לצפות בו כאן:\nhttps://md-html-template.vercel.app/results?s={{id}}\n\nכדאי לקרוא את האבחון בתשומת לב ולהקדיש מחשבה לחלקים המרכזיים שבו.\n\nאם יש לך שאלות או צורך בהבהרה, אני כאן עבורך! 🤝'
);

-- Static MD content linked to templates
CREATE TABLE template_contents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    content_name VARCHAR(255) NOT NULL,
    md_content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_content_per_template UNIQUE (template_id, content_name)
);

-- Custom fonts table
CREATE TABLE custom_fonts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    font_family TEXT NOT NULL,
    format TEXT NOT NULL,
    weight_range INT[] NOT NULL DEFAULT '{400}',
    has_italic BOOLEAN DEFAULT false,
    font_display TEXT DEFAULT 'swap',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_font_per_template UNIQUE (template_id, name)
);

-- Create indexes
CREATE INDEX idx_template_contents_template_id ON template_contents(template_id);
CREATE INDEX idx_templates_name ON templates(name);
CREATE INDEX idx_custom_fonts_template_id ON custom_fonts(template_id);

-- Enable realtime (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Drop everything first
DROP TRIGGER IF EXISTS on_new_submission ON form_submissions;
DROP TRIGGER IF EXISTS update_form_submissions_updated_at ON form_submissions;
DROP FUNCTION IF EXISTS handle_new_submission();
DROP FUNCTION IF EXISTS process_form_submission();
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE IF EXISTS form_submissions;

-- Create the table
CREATE TABLE form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id TEXT NOT NULL,
    submission_id TEXT NOT NULL,
    content JSONB NOT NULL,
    claude_status TEXT NOT NULL DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    progress JSONB,
    logs JSONB[] DEFAULT array[]::jsonb[],
    email_status TEXT DEFAULT 'pending',
    email_error TEXT,
    email_sent_at TIMESTAMPTZ,
    recipient_email TEXT,
    whatsapp_status TEXT DEFAULT 'pending',
    whatsapp_error TEXT,
    whatsapp_sent_at TIMESTAMPTZ,
    recipient_phone TEXT,
    UNIQUE(form_id, submission_id)
);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE form_submissions;

-- Function to process submission
CREATE OR REPLACE FUNCTION process_form_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Process the submission
    UPDATE form_submissions fs
    SET 
        claude_status = 'completed',
        result = jsonb_build_object('processed_at', NOW(), 'mock_result', 'זוהי תוצאה לדוגמה'),
        updated_at = NOW()
    WHERE fs.id = NEW.id;
    
    RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_new_submission
    AFTER INSERT ON form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION process_form_submission();

-- Add RLS policies
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert" ON form_submissions
    FOR INSERT TO anon
    WITH CHECK (true);

CREATE POLICY "Allow viewing own submissions" ON form_submissions
    FOR SELECT TO anon
    USING (true);

CREATE POLICY "Allow anonymous update" ON form_submissions
    FOR UPDATE TO anon
    USING (true)
    WITH CHECK (true);

-- Raw submissions table for debugging
CREATE TABLE raw_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    headers JSONB,
    body TEXT,
    parsed_body JSONB,
    error TEXT,
    content_type TEXT
);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE raw_submissions;

-- Add RLS policies for raw_submissions
ALTER TABLE raw_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow viewing raw submissions" ON raw_submissions
    FOR SELECT TO anon
    USING (true);

CREATE POLICY "Allow anonymous insert to raw" ON raw_submissions
    FOR INSERT TO anon
    WITH CHECK (true);

-- Function to generate CSS from element_styles
CREATE OR REPLACE FUNCTION generate_css_from_styles()
RETURNS TRIGGER AS $$
DECLARE
  css_output TEXT := '';
  element_key TEXT;
  style_obj JSONB;
  style_key TEXT;
  style_value TEXT;
BEGIN
  -- Loop through each element in element_styles
  FOR element_key, style_obj IN SELECT * FROM jsonb_each(NEW.element_styles)
  LOOP
    -- Convert element name to CSS selector
    css_output := css_output || 
      CASE element_key
        WHEN 'specialParagraph' THEN E'.special-paragraph {\n'
        WHEN 'header' THEN E'.header {\n'
        WHEN 'footer' THEN E'.footer {\n'
        WHEN 'main' THEN E'.main {\n'
        WHEN 'prose' THEN E'.prose {\n'
        ELSE element_key || E' {\n'
      END;
    
    -- Add each style property
    FOR style_key, style_value IN SELECT * FROM jsonb_each_text(style_obj)
    LOOP
      -- Skip certain properties that shouldn't be in CSS
      IF style_key NOT IN ('showLogo', 'showLogoOnAllPages') THEN
        -- Convert camelCase to kebab-case
        css_output := css_output || E'  ' || 
          regexp_replace(style_key, '([a-z0-9])([A-Z])', '\1-\2', 'g') || ': ' || 
          style_value || E';\n';
      END IF;
    END LOOP;
    
    css_output := css_output || E'}\n\n';
  END LOOP;

  -- Update the css column
  NEW.css := css_output;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update CSS when element_styles changes
DROP TRIGGER IF EXISTS update_css_on_styles_change ON templates;
CREATE TRIGGER update_css_on_styles_change
  BEFORE INSERT OR UPDATE OF element_styles
  ON templates
  FOR EACH ROW
  EXECUTE FUNCTION generate_css_from_styles();

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for task types
CREATE TYPE task_type AS ENUM (
    'SAVE_FILE',
    'CONVERT_AUDIO',
    'SPLIT_AUDIO',
    'TRANSCRIBE',
    'MERGE_TRANSCRIPTIONS',
    'SPLIT_TEXT',
    'PROOFREAD',
    'MERGE_PROOFREADS',
    'CLEANUP'
);

-- Enum for job status
CREATE TYPE job_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);

-- Enum for task status
CREATE TYPE task_status AS ENUM (
    'pending',
    'locked',
    'completed',
    'failed',
    'retry'
);

-- Main jobs table
CREATE TABLE transcription_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status job_status NOT NULL DEFAULT 'pending',
    original_filename TEXT NOT NULL,
    preferred_language TEXT,
    proofreading_context TEXT,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    final_transcription TEXT,
    final_proofread TEXT,
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    segments_count INTEGER,
    completed_segments INTEGER DEFAULT 0,
    completed_proofreads INTEGER DEFAULT 0,
    expected_completion_time TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ
);

-- Task queue table
CREATE TABLE task_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES transcription_jobs(id) ON DELETE CASCADE,
    task_type task_type NOT NULL,
    status task_status NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
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

-- Enable row level security
ALTER TABLE transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON transcription_jobs
    FOR SELECT
    USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON transcription_jobs
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_transcription_jobs_updated_at
    BEFORE UPDATE ON transcription_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to create initial task for new job
CREATE OR REPLACE FUNCTION create_initial_task()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO task_queue (
        job_id,
        task_type,
        priority,
        input_data
    ) VALUES (
        NEW.id,
        'SAVE_FILE',
        1,
        jsonb_build_object(
            'filename', NEW.original_filename,
            'storage_path', NEW.storage_path
        )
    );
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for initial task creation
CREATE TRIGGER create_initial_task_trigger
    AFTER INSERT ON transcription_jobs
    FOR EACH ROW
    EXECUTE FUNCTION create_initial_task();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE transcription_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE task_queue; 