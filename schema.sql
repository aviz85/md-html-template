-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Templates table
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    css TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    color1 VARCHAR(7),  -- hex color format: #RRGGBB
    color2 VARCHAR(7),
    color3 VARCHAR(7),
    color4 VARCHAR(7),
    logo_url TEXT,
    CONSTRAINT template_name_unique UNIQUE (name)
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

-- Create indexes
CREATE INDEX idx_template_contents_template_id ON template_contents(template_id);
CREATE INDEX idx_templates_name ON templates(name); 