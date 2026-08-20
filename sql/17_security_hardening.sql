-- ============================================================
-- RoadSite Reports — Security Hardening (V15.14)
-- Close RLS gaps on tables that were missing policies.
-- ============================================================

-- ── daily_labour ──
-- Used by SubmitReport to store granular labour counts per report.
-- Must be project-scoped so users only see labour data for their assigned projects.
CREATE TABLE IF NOT EXISTS daily_labour (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  daily_report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,
  party TEXT NOT NULL DEFAULT 'contractor',
  role TEXT NOT NULL,
  male_count INTEGER DEFAULT 0,
  female_count INTEGER DEFAULT 0,
  reported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE daily_labour ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_labour_select" ON daily_labour;
DROP POLICY IF EXISTS "daily_labour_insert" ON daily_labour;
DROP POLICY IF EXISTS "daily_labour_update" ON daily_labour;
DROP POLICY IF EXISTS "daily_labour_delete" ON daily_labour;

CREATE POLICY "daily_labour_select" ON daily_labour
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "daily_labour_insert" ON daily_labour
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "daily_labour_update" ON daily_labour
  FOR UPDATE USING (can_access_project(project_id));
CREATE POLICY "daily_labour_delete" ON daily_labour
  FOR DELETE USING (can_access_project(project_id));

-- ── fidic_claim_clauses ──
-- Reference table for FIDIC clause lookups. Read-only for all authenticated users.
ALTER TABLE fidic_claim_clauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fidic_claim_clauses_select" ON fidic_claim_clauses;
DROP POLICY IF EXISTS "fidic_claim_clauses_insert" ON fidic_claim_clauses;

CREATE POLICY "fidic_claim_clauses_select" ON fidic_claim_clauses
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fidic_claim_clauses_insert" ON fidic_claim_clauses
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role = 'super_admin'))
  );

-- ── project_role_assignments ──
-- CRITICAL: This table controls who can access which projects.
-- Without RLS, any authenticated user could insert themselves into any project.
ALTER TABLE project_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pra_select" ON project_role_assignments;
DROP POLICY IF EXISTS "pra_insert" ON project_role_assignments;
DROP POLICY IF EXISTS "pra_update" ON project_role_assignments;
DROP POLICY IF EXISTS "pra_delete" ON project_role_assignments;

-- Users can see their own assignments; admins/engineers see all
CREATE POLICY "pra_select" ON project_role_assignments
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_super_admin = true OR role IN ('super_admin', 'engineer', 'project_engineer'))
    )
  );

-- Only admins and engineers can assign roles
CREATE POLICY "pra_insert" ON project_role_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_super_admin = true OR role IN ('super_admin', 'engineer', 'project_engineer'))
    )
  );

CREATE POLICY "pra_update" ON project_role_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_super_admin = true OR role IN ('super_admin', 'engineer', 'project_engineer'))
    )
  );

CREATE POLICY "pra_delete" ON project_role_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_super_admin = true OR role IN ('super_admin', 'engineer'))
    )
  );
