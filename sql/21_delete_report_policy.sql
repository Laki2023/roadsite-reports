-- ============================================================
-- RoadSite Reports — Allow admins/engineers to delete reports
-- Adds DELETE policy to daily_reports, works_progress, daily_labour
-- ============================================================

-- daily_reports: allow project members to delete their own or admin to delete any
CREATE POLICY "daily_reports_delete" ON daily_reports
  FOR DELETE USING (can_access_project(project_id));

-- works_progress: allow delete for project members
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'works_progress' AND policyname = 'works_progress_delete'
  ) THEN
    CREATE POLICY "works_progress_delete" ON works_progress
      FOR DELETE USING (can_access_project(project_id));
  END IF;
END $$;

-- daily_labour: allow delete for project members
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_labour' AND policyname = 'daily_labour_delete_v2'
  ) THEN
    CREATE POLICY "daily_labour_delete_v2" ON daily_labour
      FOR DELETE USING (can_access_project(project_id));
  END IF;
END $$;
