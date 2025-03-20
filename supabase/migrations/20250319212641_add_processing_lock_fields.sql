ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS last_process_attempt TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS process_attempts INTEGER DEFAULT 0;

-- Add index for faster locking queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_locked_at ON form_submissions(locked_at);
CREATE INDEX IF NOT EXISTS idx_form_submissions_last_process_attempt ON form_submissions(last_process_attempt);

-- Add function to automatically release locks after 5 minutes
CREATE OR REPLACE FUNCTION release_stale_locks() RETURNS trigger AS $$
BEGIN
  IF NEW.locked_at IS NOT NULL AND 
     (OLD.locked_at IS NULL OR OLD.locked_at != NEW.locked_at) THEN
    -- Schedule lock release after 5 minutes
    NEW.locked_at = LEAST(NEW.locked_at, NOW() + interval '5 minutes');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically release locks
DROP TRIGGER IF EXISTS release_stale_locks_trigger ON form_submissions;
CREATE TRIGGER release_stale_locks_trigger
  BEFORE UPDATE ON form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION release_stale_locks();
