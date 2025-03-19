#!/bin/bash

# SQL to add the new column to templates table
SQL_MIGRATION="
-- Add new column to templates table to restrict emails to one submission per form
ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS allow_single_email_submission BOOLEAN DEFAULT FALSE;

-- Add comment explaining the feature
COMMENT ON COLUMN templates.allow_single_email_submission IS 'When enabled, each email address can only submit the form once';

-- Index to help with efficient queries when checking for duplicate submissions
CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id_recipient_email 
ON form_submissions (form_id, recipient_email) 
WHERE recipient_email IS NOT NULL;
"

# Apply the migration using the Supabase service role key
echo "Applying migration to add allow_single_email_submission column..."
PGPASSWORD=$SUPABASE_SERVICE_ROLE_KEY psql -h $SUPABASE_DB_HOST -U postgres -d postgres -c "$SQL_MIGRATION"

if [ $? -eq 0 ]; then
  echo "Migration applied successfully!"
else
  echo "Error applying migration."
  exit 1
fi 