-- ══════════════════════════════════════════════════════════════
--  ROLE REFACTOR MIGRATION
--  Consolidate 10 roles into 6 clean FIDIC-aligned roles:
--    client, engineer, project_engineer, deputy_project_engineer,
--    resident_engineer, measurement_engineer, pending
--
--  Old → New mapping:
--    director_general  → client
--    super_admin       → client
--    engineer          → engineer (unchanged)
--    project_engineer  → project_engineer (unchanged)
--    project_officer   → deputy_project_engineer
--    resident_engineer → resident_engineer (unchanged)
--    inspector         → resident_engineer
--    contractor_qs     → measurement_engineer
--    viewer            → measurement_engineer
--    pending           → pending (unchanged)
-- ══════════════════════════════════════════════════════════════

-- ── Step 1: Add new enum values ──
-- (Postgres enums can be extended with ADD VALUE; existing values stay)
DO $$
BEGIN
  -- Add new role values if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'client' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
    ALTER TYPE user_role ADD VALUE 'client';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'deputy_project_engineer' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
    ALTER TYPE user_role ADD VALUE 'deputy_project_engineer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'measurement_engineer' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
    ALTER TYPE user_role ADD VALUE 'measurement_engineer';
  END IF;
EXCEPTION
  WHEN others THEN
    -- If user_role type doesn't exist (role stored as TEXT), skip
    RAISE NOTICE 'user_role enum may not exist or values already present: %', SQLERRM;
END $$;

-- ── Step 2: Migrate existing users to new roles ──
-- Log the migration in role_audit_log first (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'role_audit_log') THEN
    INSERT INTO role_audit_log (target_user_id, changed_by, old_role, new_role, change_type, details)
    SELECT id, id, role,
      CASE role
        WHEN 'director_general' THEN 'client'
        WHEN 'super_admin' THEN 'client'
        WHEN 'project_officer' THEN 'deputy_project_engineer'
        WHEN 'inspector' THEN 'resident_engineer'
        WHEN 'contractor_qs' THEN 'measurement_engineer'
        WHEN 'viewer' THEN 'measurement_engineer'
        ELSE role
      END,
      'role_change',
      'Automated migration: role refactor from 10 roles to 6 FIDIC-aligned roles'
    FROM profiles
    WHERE role IN ('director_general', 'super_admin', 'project_officer', 'inspector', 'contractor_qs', 'viewer');
  END IF;
END $$;

-- Now update the profiles
UPDATE profiles SET role = 'client' WHERE role IN ('director_general', 'super_admin');
UPDATE profiles SET role = 'deputy_project_engineer' WHERE role = 'project_officer';
UPDATE profiles SET role = 'resident_engineer' WHERE role = 'inspector';
UPDATE profiles SET role = 'measurement_engineer' WHERE role IN ('contractor_qs', 'viewer');

-- ── Step 3: Update project_role_assignments if they reference old roles ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_role_assignments') THEN
    UPDATE project_role_assignments SET role = 'client' WHERE role IN ('director_general', 'super_admin');
    UPDATE project_role_assignments SET role = 'deputy_project_engineer' WHERE role = 'project_officer';
    UPDATE project_role_assignments SET role = 'resident_engineer' WHERE role = 'inspector';
    UPDATE project_role_assignments SET role = 'measurement_engineer' WHERE role IN ('contractor_qs', 'viewer');
  END IF;
END $$;

-- ── Step 4: Update user_invitations if they reference old roles ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_invitations') THEN
    UPDATE user_invitations SET role = 'client' WHERE role IN ('director_general', 'super_admin');
    UPDATE user_invitations SET role = 'deputy_project_engineer' WHERE role = 'project_officer';
    UPDATE user_invitations SET role = 'resident_engineer' WHERE role = 'inspector';
    UPDATE user_invitations SET role = 'measurement_engineer' WHERE role IN ('contractor_qs', 'viewer');
  END IF;
END $$;

-- ── Step 5: Update RLS policies that reference old role names ──
-- Update the security improvements policies
DROP POLICY IF EXISTS "role_audit_select" ON role_audit_log;
CREATE POLICY "role_audit_select" ON role_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_platform_admin = true
        OR p.role IN ('client', 'engineer', 'project_engineer')
      )
    )
  );

DROP POLICY IF EXISTS "role_audit_insert" ON role_audit_log;
CREATE POLICY "role_audit_insert" ON role_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_platform_admin = true
        OR p.role IN ('client', 'engineer', 'project_engineer', 'deputy_project_engineer', 'resident_engineer')
      )
    )
  );
