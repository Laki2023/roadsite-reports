-- ============================================================
-- RoadSite Reports V14.5 — Programme of Works (Gantt)
-- Baseline vs Actual schedule tracking
-- ============================================================

-- 1. Programme items (each row = one bar on the Gantt)
CREATE TABLE IF NOT EXISTS programme_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Link to works_activities if applicable
  activity_id UUID REFERENCES works_activities(id) ON DELETE SET NULL,
  
  -- Item details
  item_name TEXT NOT NULL,
  item_code TEXT,
  category TEXT DEFAULT 'construction' CHECK (category IN (
    'preliminary','mobilisation','earthworks','pavement','drainage',
    'structures','road_furniture','environmental','demobilisation',
    'construction','rehabilitation','maintenance','other'
  )),
  
  -- Hierarchy: parent_id for WBS structure
  parent_id UUID REFERENCES programme_items(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  indent_level INTEGER DEFAULT 0,
  is_milestone BOOLEAN DEFAULT false,
  is_summary BOOLEAN DEFAULT false,
  
  -- Baseline schedule (original approved programme)
  baseline_start DATE,
  baseline_end DATE,
  baseline_duration INTEGER,  -- working days
  
  -- Planned schedule (current approved revision)
  planned_start DATE,
  planned_end DATE,
  planned_duration INTEGER,
  
  -- Actual progress
  actual_start DATE,
  actual_end DATE,
  progress_pct NUMERIC(5,2) DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  
  -- Dependencies (simple finish-to-start)
  depends_on UUID[] DEFAULT '{}',
  
  -- Weight for overall progress calculation
  weight NUMERIC(8,4) DEFAULT 1.0,
  
  -- Status
  status TEXT DEFAULT 'not_started' CHECK (status IN (
    'not_started','in_progress','completed','on_hold','cancelled'
  )),
  
  -- Chainage range (road projects)
  chainage_from TEXT,
  chainage_to TEXT,
  
  -- Notes
  notes TEXT,
  
  -- Audit
  organisation_id UUID REFERENCES organisations(id),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prog_project ON programme_items(project_id);
CREATE INDEX IF NOT EXISTS idx_prog_parent ON programme_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_prog_activity ON programme_items(activity_id);
CREATE INDEX IF NOT EXISTS idx_prog_sort ON programme_items(project_id, sort_order);

ALTER TABLE programme_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_programme" ON programme_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

CREATE POLICY "org_users_view_programme" ON programme_items
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "project_users_manage_programme" ON programme_items
  FOR ALL USING (
    project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid())
  );

-- Auto-set org
CREATE OR REPLACE FUNCTION set_programme_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  
  -- Auto-calculate duration from dates
  IF NEW.baseline_start IS NOT NULL AND NEW.baseline_end IS NOT NULL AND NEW.baseline_duration IS NULL THEN
    NEW.baseline_duration = NEW.baseline_end - NEW.baseline_start;
  END IF;
  IF NEW.planned_start IS NOT NULL AND NEW.planned_end IS NOT NULL AND NEW.planned_duration IS NULL THEN
    NEW.planned_duration = NEW.planned_end - NEW.planned_start;
  END IF;
  
  -- Auto-set status
  IF NEW.progress_pct >= 100 AND NEW.status != 'completed' THEN
    NEW.status = 'completed';
    IF NEW.actual_end IS NULL THEN NEW.actual_end = CURRENT_DATE; END IF;
  ELSIF NEW.progress_pct > 0 AND NEW.status = 'not_started' THEN
    NEW.status = 'in_progress';
    IF NEW.actual_start IS NULL THEN NEW.actual_start = CURRENT_DATE; END IF;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_programme_org
  BEFORE INSERT OR UPDATE ON programme_items
  FOR EACH ROW EXECUTE FUNCTION set_programme_org();

-- 2. Programme revisions (track submitted/approved versions)
CREATE TABLE IF NOT EXISTS programme_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'Baseline Programme',
  submitted_date DATE,
  approved_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','rejected')),
  fidic_clause TEXT DEFAULT 'Cl. 8.3',
  notes TEXT,
  submitted_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, revision_number)
);

ALTER TABLE programme_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_prog_rev" ON programme_revisions
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "org_view_prog_rev" ON programme_revisions
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "project_manage_prog_rev" ON programme_revisions
  FOR ALL USING (project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION set_prog_rev_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prog_rev_org BEFORE INSERT ON programme_revisions
  FOR EACH ROW EXECUTE FUNCTION set_prog_rev_org();
