-- ============================================================
-- RoadSite Reports — Platform Admin (Invisible Oversight)
-- Platform Admin sits ABOVE Super Admin, invisible to everyone.
-- ============================================================

-- 1. Add platform admin flag to profiles
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN is_platform_admin BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'is_platform_admin already exists';
END $$;

-- 2. Set Collins as the only Platform Admin
UPDATE profiles
SET is_platform_admin = true
WHERE email = 'collinslaki@gmail.com';

-- 3. Downgrade Collins from super_admin to a neutral role in the visible hierarchy
--    (He doesn't need super_admin since is_platform_admin overrides everything)
--    Actually keep super_admin so the app still works, but he'll be hidden from others

-- 4. Update the can_access_project function to include platform admin
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

-- 5. Update is_admin_or_engineer to include platform admin
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
      OR role IN ('super_admin', 'engineer')
    )
  );
$$;

-- 6. KEY CHANGE: Update profiles SELECT policy
--    Platform admin can see everyone.
--    Everyone else CANNOT see platform admins.
DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    CASE
      -- Platform admin sees everyone
      WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
        THEN true
      -- Everyone else: cannot see platform admins
      ELSE is_platform_admin IS NOT true
    END
  );

-- 7. Update audit log so platform admin actions are visible but actor is hidden
--    (optional: platform admin can see all logs, others cannot see logs where changer is platform admin)
DROP POLICY IF EXISTS "audit_select" ON role_audit_log;

CREATE POLICY "audit_select" ON role_audit_log
  FOR SELECT USING (
    CASE
      WHEN EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true)
        THEN true
      ELSE
        -- Non-platform users can see logs but not ones created by platform admin
        NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = changed_by AND p.is_platform_admin = true)
        AND (target_user_id = auth.uid() OR is_admin_or_engineer())
    END
  );

-- 8. Update invitations policy so platform admin can manage all
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
-- RESULT:
--   Collins (Platform Admin):
--     - Sees ALL users, ALL projects, ALL data
--     - Is INVISIBLE to every other user
--     - Does not appear in user lists, staff pages, or dropdowns
--     - Can suspend, delete, revoke anyone
--
--   Super Admin (e.g. an agency DG):
--     - Sees all users in their scope
--     - CANNOT see Collins
--     - Thinks they are the highest authority
--
--   Everyone below follows the normal hierarchy
-- ============================================================
