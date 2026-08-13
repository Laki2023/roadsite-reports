-- ============================================================
-- RoadSite Reports V12.4 — Site Instructions & Approval Escalation
-- FIDIC chain of command: RE → PE → Engineer → Super Admin
-- Platform Admin overrides everything
-- ============================================================

-- 1. Site Instructions table (RE issues these under FIDIC)
CREATE TABLE IF NOT EXISTS site_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instruction_no TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  instruction_type TEXT NOT NULL DEFAULT 'Site Instruction'
    CHECK (instruction_type IN (
      'Site Instruction', 'Variation Order', 'Day Work Order',
      'Suspension Order', 'Resumption Order', 'Defects Notice',
      'Taking Over Notice', 'Other'
    )),
  priority TEXT DEFAULT 'Normal' CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent')),
  fidic_clause TEXT,
  chainage_from TEXT,
  chainage_to TEXT,

  -- Approval chain
  issued_by UUID NOT NULL REFERENCES profiles(id),
  issued_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'Draft' CHECK (status IN (
    'Draft', 'Issued', 'Escalated', 'Approved', 'Rejected',
    'Acknowledged', 'Completed', 'Overridden'
  )),

  -- Escalation
  requires_approval_from user_role,
  escalated_to UUID REFERENCES profiles(id),
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,

  -- Approval
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,

  -- Override (Platform Admin)
  overridden_by UUID REFERENCES profiles(id),
  overridden_at TIMESTAMPTZ,
  override_notes TEXT,

  -- Contractor acknowledgement
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,

  -- Completion
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,

  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Approval escalation table — tracks the chain for any approvable item
CREATE TABLE IF NOT EXISTS approval_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- What is being escalated
  item_type TEXT NOT NULL CHECK (item_type IN (
    'site_instruction', 'ipc_certificate', 'variation_order',
    'eot_claim', 'cost_claim', 'material_approval',
    'pavement_approval', 'structure_approval', 'report_approval',
    'other'
  )),
  item_id UUID NOT NULL,
  item_description TEXT,

  -- Who initiated and current state
  initiated_by UUID NOT NULL REFERENCES profiles(id),
  initiated_at TIMESTAMPTZ DEFAULT now(),
  current_level user_role NOT NULL,
  status TEXT DEFAULT 'Pending' CHECK (status IN (
    'Pending', 'Approved', 'Rejected', 'Escalated', 'Overridden'
  )),

  -- Approval chain history stored as JSONB array
  -- Each entry: { role, user_id, user_name, action, notes, timestamp }
  chain JSONB DEFAULT '[]',

  -- Final resolution
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Approval thresholds — defines what each role can approve
CREATE TABLE IF NOT EXISTS approval_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  role user_role NOT NULL,
  max_value NUMERIC,
  can_approve BOOLEAN DEFAULT true,
  must_escalate_above NUMERIC,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, item_type, role)
);

-- Insert default thresholds
INSERT INTO approval_thresholds (project_id, item_type, role, can_approve, description) VALUES
  (NULL, 'report_approval', 'resident_engineer', true, 'RE approves daily reports'),
  (NULL, 'report_approval', 'project_engineer', true, 'PE approves daily reports'),
  (NULL, 'report_approval', 'engineer', true, 'Engineer approves daily reports'),
  (NULL, 'site_instruction', 'resident_engineer', true, 'RE issues routine site instructions'),
  (NULL, 'site_instruction', 'project_engineer', true, 'PE issues and approves site instructions'),
  (NULL, 'site_instruction', 'engineer', true, 'Engineer approves all site instructions'),
  (NULL, 'material_approval', 'resident_engineer', true, 'RE approves routine materials'),
  (NULL, 'material_approval', 'project_engineer', true, 'PE approves materials'),
  (NULL, 'pavement_approval', 'resident_engineer', true, 'RE approves pavement layers'),
  (NULL, 'pavement_approval', 'project_engineer', true, 'PE approves pavement layers'),
  (NULL, 'ipc_certificate', 'project_engineer', true, 'PE reviews IPC'),
  (NULL, 'ipc_certificate', 'engineer', true, 'Engineer approves IPC'),
  (NULL, 'variation_order', 'engineer', true, 'Only Engineer approves variations'),
  (NULL, 'eot_claim', 'engineer', true, 'Only Engineer approves EOT claims'),
  (NULL, 'cost_claim', 'engineer', true, 'Only Engineer approves cost claims')
ON CONFLICT DO NOTHING;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_si_project ON site_instructions(project_id);
CREATE INDEX IF NOT EXISTS idx_si_status ON site_instructions(status);
CREATE INDEX IF NOT EXISTS idx_si_issued_by ON site_instructions(issued_by);
CREATE INDEX IF NOT EXISTS idx_esc_project ON approval_escalations(project_id);
CREATE INDEX IF NOT EXISTS idx_esc_item ON approval_escalations(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_esc_status ON approval_escalations(status);

-- 5. RLS on new tables
ALTER TABLE site_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_thresholds ENABLE ROW LEVEL SECURITY;

-- Site instructions: project-scoped
CREATE POLICY "si_select" ON site_instructions
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "si_insert" ON site_instructions
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "si_update" ON site_instructions
  FOR UPDATE USING (can_access_project(project_id));

-- Escalations: project-scoped
CREATE POLICY "esc_select" ON approval_escalations
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "esc_insert" ON approval_escalations
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "esc_update" ON approval_escalations
  FOR UPDATE USING (can_access_project(project_id));

-- Thresholds: readable by all, writable by admin/engineer
CREATE POLICY "thresh_select" ON approval_thresholds
  FOR SELECT USING (true);
CREATE POLICY "thresh_insert" ON approval_thresholds
  FOR INSERT WITH CHECK (is_admin_or_engineer());
CREATE POLICY "thresh_update" ON approval_thresholds
  FOR UPDATE USING (is_admin_or_engineer());

-- 6. Escalation helper function
CREATE OR REPLACE FUNCTION get_next_escalation_role(p_current_role user_role)
RETURNS user_role
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_current_role
    WHEN 'inspector' THEN RETURN 'resident_engineer';
    WHEN 'resident_engineer' THEN RETURN 'project_engineer';
    WHEN 'project_engineer' THEN RETURN 'engineer';
    WHEN 'engineer' THEN RETURN 'super_admin';
    ELSE RETURN 'super_admin';
  END CASE;
END;
$$;

-- 7. Check if a role can approve a specific item type
CREATE OR REPLACE FUNCTION can_role_approve(p_role user_role, p_item_type TEXT, p_project_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Platform admin and super admin can approve anything
  IF p_role IN ('super_admin') THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true) THEN RETURN true; END IF;

  -- Check project-specific threshold first, then global
  RETURN EXISTS (
    SELECT 1 FROM approval_thresholds
    WHERE item_type = p_item_type
    AND role = p_role
    AND can_approve = true
    AND (project_id = p_project_id OR project_id IS NULL)
    ORDER BY project_id NULLS LAST
    LIMIT 1
  );
END;
$$;

-- ============================================================
-- ESCALATION FLOW:
--
--   Inspector submits report
--       ↓
--   RE approves (routine) OR escalates to PE (if beyond authority)
--       ↓
--   PE approves OR escalates to Engineer
--       ↓
--   Engineer approves OR escalates to Super Admin
--       ↓
--   Super Admin approves
--
--   Platform Admin: can OVERRIDE at any level, action shows as "System"
--
-- SITE INSTRUCTIONS:
--   RE issues routine instructions (site instruction, defects notice)
--   PE issues/approves (variation orders, day work orders)
--   Engineer approves (suspensions, major variations)
--   Platform Admin overrides anything
-- ============================================================
