-- ============================================================
-- RoadSite Reports V12.2 — Platform Admin + Project Engineer
-- Run in Supabase SQL Editor (single query)
-- ============================================================

-- ── PART 1: Add Project Engineer to the role enum ──
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_engineer' AFTER 'engineer';

-- ── PART 2: Platform Admin flag ──
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN is_platform_admin BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'is_platform_admin already exists';
END $$;

-- Set Collins as the only Platform Admin
UPDATE profiles
SET is_platform_admin = true
WHERE email = 'collinslaki@gmail.com';

-- ── PART 3: Update helper functions ──

-- can_access_project: platform admin sees all
CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Platform admins see everything
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_platform_admin = true
  ) THEN
    RETURN true;
  END IF;

  -- Super admins see everything
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_super_admin = true OR role = 'super_admin')
  ) THEN
    RETURN true;
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

-- is_admin_or_engineer: includes platform admin and project_engineer
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
      OR role IN ('super_admin', 'engineer', 'project_engineer')
    )
  );
$$;

-- get_user_project_role: updated for project_engineer
CREATE OR REPLACE FUNCTION get_user_project_role(p_user_id UUID, p_project_id UUID)
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_global_role user_role;
  v_project_role user_role;
  v_is_platform BOOLEAN;
BEGIN
  SELECT role, is_platform_admin INTO v_global_role, v_is_platform
  FROM profiles WHERE id = p_user_id;

  -- Platform admin and super admin have global access
  IF v_is_platform = true OR v_global_role IN ('super_admin', 'engineer') THEN
    RETURN v_global_role;
  END IF;

  -- Check project-specific assignment
  SELECT role INTO v_project_role
  FROM project_role_assignments
  WHERE user_id = p_user_id AND project_id = p_project_id AND is_active = true;

  RETURN COALESCE(v_project_role, v_global_role);
END;
$$;

-- can_approve_reports: project_engineer can approve
CREATE OR REPLACE FUNCTION can_approve_reports(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := get_user_project_role(p_user_id, p_project_id);
  RETURN v_role IN ('super_admin', 'engineer', 'project_engineer', 'resident_engineer');
END;
$$;

-- can_submit_reports: inspector and above
CREATE OR REPLACE FUNCTION can_submit_reports(p_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role user_role;
BEGIN
  v_role := get_user_project_role(p_user_id, p_project_id);
  RETURN v_role IN ('super_admin', 'engineer', 'project_engineer', 'resident_engineer', 'inspector');
END;
$$;

-- ── PART 4: Platform Admin visibility ──
-- Platform admin sees everyone. Everyone else CANNOT see platform admins.

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- Everyone can read profiles EXCEPT platform admins are hidden from non-platform users
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    CASE
      WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
        THEN true
      ELSE is_platform_admin IS NOT true
    END
  );

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Admins/engineers can update any profile
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (is_admin_or_engineer());

-- Anyone can insert their own profile (signup)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ── PART 5: Audit log — hide platform admin actions from others ──
DROP POLICY IF EXISTS "audit_select" ON role_audit_log;
DROP POLICY IF EXISTS "audit_insert" ON role_audit_log;

CREATE POLICY "audit_select" ON role_audit_log
  FOR SELECT USING (
    CASE
      WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
        THEN true
      ELSE
        NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = changed_by AND p.is_platform_admin = true)
        AND (target_user_id = auth.uid() OR is_admin_or_engineer())
    END
  );

CREATE POLICY "audit_insert" ON role_audit_log
  FOR INSERT WITH CHECK (is_admin_or_engineer());

-- ── PART 6: Update invitation policies ──
DROP POLICY IF EXISTS "inv_select" ON user_invitations;
DROP POLICY IF EXISTS "inv_insert" ON user_invitations;
DROP POLICY IF EXISTS "inv_update" ON user_invitations;

CREATE POLICY "inv_select" ON user_invitations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
    OR is_admin_or_engineer()
  );

CREATE POLICY "inv_insert" ON user_invitations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
    OR is_admin_or_engineer()
  );

CREATE POLICY "inv_update" ON user_invitations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
    OR is_admin_or_engineer()
  );

-- ============================================================
-- HIERARCHY SUMMARY:
--
--   Platform Admin (Collins) — INVISIBLE, sees & controls everything
--       ↓
--   Super Admin (Agency DG) — highest visible role, agency-wide access
--       ↓
--   Engineer (The Engineer) — contract-level authority
--       ↓
--   Project Engineer (Engineer's Rep) — day-to-day contract admin
--       ↓
--   Resident Engineer (RE) — site supervision, report approval
--       ↓
--   Inspector (Inspector of Works) — field data, daily reports
--       ↓
--   Viewer — read-only
--       ↓
--   Pending — awaiting approval
-- ============================================================
