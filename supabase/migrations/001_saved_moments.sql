-- Migration: Create saved_moments table
-- Run this in the Supabase SQL editor at https://app.supabase.com > SQL Editor

CREATE TABLE IF NOT EXISTS saved_moments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL DEFAULT '',
  map           TEXT,
  date_from     TEXT,
  date_to       TEXT,
  match_id      TEXT,
  player_id     TEXT,
  scrubber_time BIGINT DEFAULT 0,
  saved_at      BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security: allow anonymous users to read, write, and delete
-- (suitable for a shared team tool without user accounts)
ALTER TABLE saved_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select" ON saved_moments
  FOR SELECT USING (true);

CREATE POLICY "anon_insert" ON saved_moments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_delete" ON saved_moments
  FOR DELETE USING (true);
