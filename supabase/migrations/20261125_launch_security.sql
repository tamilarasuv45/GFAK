-- ============================================================================
-- SUPABASE MIGRATION: 20261125_launch_security.sql
-- Scheduled Launch: 26 November 2026, 12:00:00 AM IST (UTC: 2026-11-25 18:30:00+00)
-- Strict Row-Level Security (RLS) & Server-Authoritative Launch Lock
-- ============================================================================

-- 1. Helper function to test whether current database time has reached launch
CREATE OR REPLACE FUNCTION is_website_launched()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CURRENT_TIMESTAMP >= '2026-11-25 18:30:00+00'::TIMESTAMPTZ;
$$;

-- 2. Secure PHOTOS Table
ALTER TABLE IF EXISTS photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photos pre-launch select lock" ON photos;
CREATE POLICY "Photos pre-launch select lock" ON photos
  FOR SELECT
  USING (is_website_launched());

DROP POLICY IF EXISTS "Photos pre-launch insert lock" ON photos;
CREATE POLICY "Photos pre-launch insert lock" ON photos
  FOR INSERT
  WITH CHECK (is_website_launched());

DROP POLICY IF EXISTS "Photos pre-launch update lock" ON photos;
CREATE POLICY "Photos pre-launch update lock" ON photos
  FOR UPDATE
  USING (is_website_launched());

DROP POLICY IF EXISTS "Photos pre-launch delete lock" ON photos;
CREATE POLICY "Photos pre-launch delete lock" ON photos
  FOR DELETE
  USING (is_website_launched());

-- 3. Secure BIRTHDAY_RECORDINGS Table
ALTER TABLE IF EXISTS birthday_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recordings pre-launch select lock" ON birthday_recordings;
CREATE POLICY "Recordings pre-launch select lock" ON birthday_recordings
  FOR SELECT
  USING (is_website_launched());

DROP POLICY IF EXISTS "Recordings pre-launch insert lock" ON birthday_recordings;
CREATE POLICY "Recordings pre-launch insert lock" ON birthday_recordings
  FOR INSERT
  WITH CHECK (is_website_launched());

DROP POLICY IF EXISTS "Recordings pre-launch update lock" ON birthday_recordings;
CREATE POLICY "Recordings pre-launch update lock" ON birthday_recordings
  FOR UPDATE
  USING (is_website_launched());

DROP POLICY IF EXISTS "Recordings pre-launch delete lock" ON birthday_recordings;
CREATE POLICY "Recordings pre-launch delete lock" ON birthday_recordings
  FOR DELETE
  USING (is_website_launched());

-- 4. Secure BIRTHDAY_RECORDING_CHUNKS Table
ALTER TABLE IF EXISTS birthday_recording_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Chunks pre-launch select lock" ON birthday_recording_chunks;
CREATE POLICY "Chunks pre-launch select lock" ON birthday_recording_chunks
  FOR SELECT
  USING (is_website_launched());

DROP POLICY IF EXISTS "Chunks pre-launch insert lock" ON birthday_recording_chunks;
CREATE POLICY "Chunks pre-launch insert lock" ON birthday_recording_chunks
  FOR INSERT
  WITH CHECK (is_website_launched());

-- 5. Secure WISHES Table
ALTER TABLE IF EXISTS wishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Wishes pre-launch select lock" ON wishes;
CREATE POLICY "Wishes pre-launch select lock" ON wishes
  FOR SELECT
  USING (is_website_launched());

DROP POLICY IF EXISTS "Wishes pre-launch insert lock" ON wishes;
CREATE POLICY "Wishes pre-launch insert lock" ON wishes
  FOR INSERT
  WITH CHECK (is_website_launched());

-- 6. Storage Bucket Policy: Ensure birthday-recordings bucket is private
UPDATE storage.buckets
SET public = false
WHERE id = 'birthday-recordings';

-- Service role bypasses RLS for maintenance/edge functions
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
