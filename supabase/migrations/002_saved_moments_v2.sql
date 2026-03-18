-- Migration 002: Add description and tags to saved_moments
-- Run this in the Supabase SQL editor at https://app.supabase.com > SQL Editor

ALTER TABLE saved_moments
  ADD COLUMN IF NOT EXISTS description TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags        TEXT[]  NOT NULL DEFAULT '{}';

-- Allow anonymous users to update (for editing description/tags)
CREATE POLICY IF NOT EXISTS "anon_update" ON saved_moments
  FOR UPDATE USING (true) WITH CHECK (true);
