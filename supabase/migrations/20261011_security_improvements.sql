-- ══════════════════════════════════════════════════════════════
--  SECURITY IMPROVEMENTS MIGRATION
--  Task #23: Role change audit log
--  Task #25: Server-side delete protection for projects
--  Task #26: Last-login tracking
-- ══════════════════════════════════════════════════════════════

-- ── 1. ROLE CHANGE AUDIT LOG ──────────────────────────────────
CREATE TABLE IF NOT EXISTS role_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  old_role TEXT,
  new_role TEXT,
  old_allowed_pages JSONB,
  new_allowed_pages JSONB,
  change_type TEXT NOT NULL CHECK (change_type IN ('role_change', 'pages_change', 'admin_toggle', 'account_status')),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_role_audit_target ON role_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_role_audit_changed_by ON role_audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_role_audit_created ON role_audit_log(created_at DESC);

-- RLS: only project_engineer+ can view audit logs
ALTER TABLE role_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_audit_select" ON role_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_platform_admin = true
        OR p.role IN ('director_general', 'super_admin', 'engineer', 'project_engineer')
      )
    )
  );

CREATE POLICY "role_audit_insert" ON role_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND (
        p.is_platform_admin = true
        OR p.role IN ('director_general', 'super_admin', 'engineer', 'project_engineer', 'resident_engineer')
      )
    )
  );

-- ── 2. SERVER-SIDE DELETE PROTECTION FOR PROJECTS ─────────────
-- Drop existing overly-permissive delete policy if any
DO $$
BEGIN
  -- Try to drop any policy that allows unrestricted deletes on projects
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND cmd = 'DELETE'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "projects_delete" ON projects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow delete for authenticated users" ON projects';
  END IF;
END $$;

-- Only platform admins can delete projects
CREATE POLICY "projects_delete_admin_only" ON projects
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.is_platform_admin = true
    )
  );

-- ── 3. LAST-LOGIN TRACKING ────────────────────────────────────
-- Add last_login column to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_login_at'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_login_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'login_count'
  ) THEN
    ALTER TABLE profiles ADD COLUMN login_count INTEGER DEFAULT 0;
  END IF;
END $$;
