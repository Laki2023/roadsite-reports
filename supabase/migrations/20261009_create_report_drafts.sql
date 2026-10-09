-- Report Drafts table for autosave (Sprint 1)
-- Stores one active draft per user. Upserted on save, deleted on successful submit.

CREATE TABLE IF NOT EXISTS report_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  current_step smallint DEFAULT 1,
  draft_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT report_drafts_user_unique UNIQUE (user_id)
);

-- RLS: users can only see/modify their own drafts
ALTER TABLE report_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own drafts"
  ON report_drafts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_report_drafts_user ON report_drafts(user_id);

COMMENT ON TABLE report_drafts IS 'Autosave drafts for the Submit Report wizard. One draft per user, upserted on periodic save, deleted on successful submit.';
