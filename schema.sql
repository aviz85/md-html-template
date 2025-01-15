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