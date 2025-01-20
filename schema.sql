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
    custom_fonts JSONB
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
    status TEXT NOT NULL DEFAULT 'pending',
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
        status = 'completed',
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