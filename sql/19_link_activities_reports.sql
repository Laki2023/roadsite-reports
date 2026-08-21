-- ============================================================
-- RoadSite Reports — Link Work Activities to Daily Reports (V15.19)
-- Adds daily_report_id to works_progress so entries from daily
-- reports are traceable, enabling the two-way view:
--   Daily Report → shows which activities were worked on
--   Work Activities → shows daily report contributions
-- ============================================================

-- Add daily_report_id column to works_progress if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works_progress' AND column_name = 'daily_report_id'
  ) THEN
    ALTER TABLE works_progress
      ADD COLUMN daily_report_id UUID REFERENCES daily_reports(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for efficient lookups: "show me all activities from this daily report"
CREATE INDEX IF NOT EXISTS idx_works_progress_daily_report
  ON works_progress(daily_report_id)
  WHERE daily_report_id IS NOT NULL;

-- Index for efficient lookups: "show me all daily report entries for this activity"
CREATE INDEX IF NOT EXISTS idx_works_progress_activity_date
  ON works_progress(activity_id, work_date);
