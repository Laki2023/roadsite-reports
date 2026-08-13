-- ============================================================
-- RoadSite Reports V14 — Multi-Organisation Architecture
-- Foundation for multi-agency SaaS platform
-- ============================================================

-- 1. Create organisations table
CREATE TABLE IF NOT EXISTS organisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  short_name TEXT,
  org_type TEXT DEFAULT 'agency' CHECK (org_type IN ('agency','consultant','contractor','other')),
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  registration_no TEXT,
  country TEXT DEFAULT 'Kenya',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add director_general to role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'director_general' BEFORE 'super_admin';

-- 3. Seed default organisations
INSERT INTO organisations (name, short_name, org_type) VALUES
  ('Kenya National Highways Authority', 'KeNHA', 'agency'),
  ('Firm A', 'Firm A', 'consultant'),
  ('Firm B', 'Firm B', 'consultant'),
  ('Firm C', 'Firm C', 'contractor'),
  ('Firm D', 'Firm D', 'contractor'),
  ('Firm E', 'Firm E', 'other')
ON CONFLICT DO NOTHING;

-- 4. Add organisation_id to profiles
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN organisation_id UUID REFERENCES organisations(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Add organisation_id to projects
DO $$ BEGIN
  ALTER TABLE projects ADD COLUMN organisation_id UUID REFERENCES organisations(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 6. Link existing users and projects to KeNHA
UPDATE profiles SET organisation_id = (SELECT id FROM organisations WHERE short_name = 'KeNHA' LIMIT 1)
WHERE organisation_id IS NULL;

UPDATE projects SET organisation_id = (SELECT id FROM organisations WHERE short_name = 'KeNHA' LIMIT 1)
WHERE organisation_id IS NULL;

-- 7. Index
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(organisation_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organisation_id);
CREATE INDEX IF NOT EXISTS idx_orgs_active ON organisations(is_active);

-- 8. RLS for organisations
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orgs_select" ON organisations;
DROP POLICY IF EXISTS "orgs_insert" ON organisations;
DROP POLICY IF EXISTS "orgs_update" ON organisations;
DROP POLICY IF EXISTS "orgs_delete" ON organisations;

-- Platform admin sees all orgs. DG sees own org. Others see their own org.
CREATE POLICY "orgs_select" ON organisations FOR SELECT USING (
  CASE
    WHEN is_platform_admin() THEN true
    ELSE id = (SELECT organisation_id FROM profiles WHERE id = auth.uid())
  END
);

-- Only platform admin can create/edit/delete orgs
CREATE POLICY "orgs_insert" ON organisations FOR INSERT WITH CHECK (is_platform_admin());
CREATE POLICY "orgs_update" ON organisations FOR UPDATE USING (is_platform_admin());
CREATE POLICY "orgs_delete" ON organisations FOR DELETE USING (is_platform_admin());

-- 9. Update can_access_project to include org-scoped DG access
CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_org UUID;
  v_project_org UUID;
  v_user_role user_role;
BEGIN
  -- Platform admins see everything
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true) THEN
    RETURN true;
  END IF;

  -- Get user info
  SELECT role, organisation_id INTO v_user_role, v_user_org FROM profiles WHERE id = auth.uid();

  -- Director General sees all projects in their organisation
  IF v_user_role = 'director_general' THEN
    SELECT organisation_id INTO v_project_org FROM projects WHERE id = p_project_id;
    RETURN v_user_org = v_project_org;
  END IF;

  -- Super admins see all projects in their organisation
  IF v_user_role = 'super_admin' OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    SELECT organisation_id INTO v_project_org FROM projects WHERE id = p_project_id;
    RETURN v_user_org = v_project_org;
  END IF;

  -- Everyone else needs project assignment
  RETURN EXISTS (
    SELECT 1 FROM project_role_assignments
    WHERE user_id = auth.uid()
    AND project_id = p_project_id
    AND is_active = true
  );
END;
$$;

-- 10. Update is_admin_or_engineer to include DG
CREATE OR REPLACE FUNCTION is_admin_or_engineer()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (
      is_platform_admin = true
      OR is_super_admin = true
      OR role IN ('director_general', 'super_admin', 'engineer', 'project_engineer')
    )
  );
$$;

-- 11. Update profiles select to hide platform admin but show org members
DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (
  CASE
    -- Platform admin sees everyone
    WHEN is_platform_admin() THEN true
    -- DG sees all users in their organisation
    WHEN (SELECT role FROM profiles WHERE id = auth.uid()) = 'director_general' THEN
      organisation_id = (SELECT organisation_id FROM profiles WHERE id = auth.uid())
      AND is_platform_admin IS NOT true
    -- Super admin sees users in their org
    WHEN (SELECT role FROM profiles WHERE id = auth.uid()) IN ('super_admin') THEN
      organisation_id = (SELECT organisation_id FROM profiles WHERE id = auth.uid())
      AND is_platform_admin IS NOT true
    -- Others see all non-platform profiles (for dropdowns etc)
    ELSE is_platform_admin IS NOT true
  END
);

-- 12. Helper: get user's organisation
CREATE OR REPLACE FUNCTION my_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organisation_id FROM profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- DONE. Architecture:
--   Platform Admin → sees all orgs, all projects, invisible
--   Director General → sees all within their organisation
--   Super Admin → sees assigned portfolio within org
--   Engineer/PE/RE/Inspector → sees assigned projects only
-- ============================================================
