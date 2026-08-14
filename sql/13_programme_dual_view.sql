-- ============================================================
-- RoadSite Reports V14.6 — Programme Dual View Support
-- Add source_type to distinguish Engineer vs Contractor programmes
-- ============================================================

ALTER TABLE programme_items 
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'engineer' 
  CHECK (source_type IN ('engineer', 'contractor'));

CREATE INDEX IF NOT EXISTS idx_prog_source ON programme_items(project_id, source_type);
