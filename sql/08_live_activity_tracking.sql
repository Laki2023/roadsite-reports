-- ============================================================
-- RoadSite Reports — Auto-sync progress & live tracking
-- ============================================================

-- 1. Add tracking columns to works_activities
DO $$ BEGIN
  ALTER TABLE works_activities ADD COLUMN last_progress_date DATE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE works_activities ADD COLUMN last_progress_by UUID REFERENCES profiles(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE works_activities ADD COLUMN progress_count INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Trigger: when progress is logged, auto-update the parent activity
CREATE OR REPLACE FUNCTION sync_activity_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total NUMERIC;
  v_planned NUMERIC;
BEGIN
  -- Sum all progress entries for this activity
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
  FROM works_progress WHERE activity_id = NEW.activity_id;

  -- Get planned quantity
  SELECT planned_quantity INTO v_planned
  FROM works_activities WHERE id = NEW.activity_id;

  -- Update the activity
  UPDATE works_activities SET
    completed_quantity = v_total,
    last_progress_date = NEW.work_date,
    last_progress_by = NEW.reported_by,
    progress_count = (SELECT COUNT(*) FROM works_progress WHERE activity_id = NEW.activity_id),
    status = CASE
      WHEN v_planned > 0 AND v_total >= v_planned THEN 'Completed'
      WHEN v_total > 0 THEN 'In Progress'
      ELSE status
    END
  WHERE id = NEW.activity_id;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_sync_activity_progress ON works_progress;

-- Create trigger
CREATE TRIGGER trg_sync_activity_progress
  AFTER INSERT ON works_progress
  FOR EACH ROW
  EXECUTE FUNCTION sync_activity_progress();

-- 3. Backfill last_progress_date from existing progress entries
UPDATE works_activities wa SET
  last_progress_date = sub.max_date,
  progress_count = sub.cnt
FROM (
  SELECT activity_id, MAX(work_date) as max_date, COUNT(*) as cnt
  FROM works_progress
  GROUP BY activity_id
) sub
WHERE wa.id = sub.activity_id;
