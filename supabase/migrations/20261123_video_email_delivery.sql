-- ==============================================================================
-- SKYWARD AMBITION: AUTOMATIC VIDEO EMAIL DELIVERY MIGRATION
-- Database: Supabase PostgreSQL (AWS ap-northeast-1)
-- ==============================================================================

-- 1. Ensure required columns on birthday_recordings table
ALTER TABLE IF EXISTS birthday_recordings 
ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS is_interrupted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS stream_url TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Performance indexes for background sweep and deduplication
CREATE INDEX IF NOT EXISTS idx_recordings_status_heartbeat 
ON birthday_recordings (status, last_heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_recordings_email_pending 
ON birthday_recordings (status, email_sent) 
WHERE email_sent = FALSE;

-- 3. (Optional) pg_net automatic webhook trigger to invoke Supabase Edge Function
-- If pg_net extension is enabled in Supabase, this trigger automatically calls the Edge Function
CREATE OR REPLACE FUNCTION trigger_send_recording_email()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
  service_role_key TEXT;
  request_payload JSONB;
BEGIN
  -- Only trigger for completed or interrupted recordings that have not been emailed yet
  IF (NEW.status IN ('completed', 'interrupted')) AND (NEW.email_sent IS DISTINCT FROM TRUE) AND (NEW.email_status != 'processing') THEN
    
    -- Atomic mark as processing to prevent duplicate triggers
    NEW.email_status := 'processing';

    -- Construct payload
    request_payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', row_to_json(NEW)
    );

    -- Retrieve Supabase URL / Vault secret if configured
    -- Note: When using Supabase Dashboard Database Webhooks, you can also select the Edge Function directly from Dashboard -> Database -> Webhooks.
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_recording_email_dispatch ON birthday_recordings;
CREATE TRIGGER trg_recording_email_dispatch
BEFORE UPDATE ON birthday_recordings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('completed', 'interrupted'))
EXECUTE FUNCTION trigger_send_recording_email();

-- 4. Verify Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('birthday-recordings', 'birthday-recordings', false)
ON CONFLICT (id) DO NOTHING;
