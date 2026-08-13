-- ============================================================
-- RoadSite Reports — Project-Scoped Access Control
-- Only super_admin sees all. Everyone else sees assigned projects only.
-- ============================================================

-- 1. Downgrade Marxwel to 'engineer' (only Collins remains super_admin)
UPDATE profiles
SET role = 'engineer'
WHERE email = 'maxkobaai@gmail.com' AND role = 'super_admin';

-- 2. Helper function: returns TRUE if user can access a given project
CREATE OR REPLACE FUNCTION can_access_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Super admins see everything
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_super_admin = true OR role = 'super_admin')
  ) THEN
    RETURN true;
  END IF;

  -- Everyone else must have an active project assignment
  RETURN EXISTS (
    SELECT 1 FROM project_role_assignments
    WHERE user_id = auth.uid()
    AND project_id = p_project_id
    AND is_active = true
  );
END;
$$;

-- 3. Helper function: returns all project IDs the current user can access
CREATE OR REPLACE FUNCTION my_project_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Super admins get all projects
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_super_admin = true OR role = 'super_admin')
  ) THEN
    RETURN QUERY SELECT id FROM projects;
  ELSE
    -- Others get only assigned projects
    RETURN QUERY
      SELECT project_id FROM project_role_assignments
      WHERE user_id = auth.uid() AND is_active = true;
  END IF;
END;
$$;

-- ============================================================
-- 4. Apply RLS to PROJECTS table
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;
-- Drop any old policies too
DROP POLICY IF EXISTS "Projects viewable" ON projects;
DROP POLICY IF EXISTS "Projects insertable" ON projects;
DROP POLICY IF EXISTS "Projects updatable" ON projects;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (can_access_project(id));

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (is_admin_or_engineer());

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (is_admin_or_engineer());

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_super_admin = true OR role = 'super_admin'))
  );

-- ============================================================
-- 5. Apply RLS to all project-linked data tables
-- Each table has a project_id column → filter by assignment
-- ============================================================

-- Helper macro: apply standard project-scoped policies
-- We do it table by table to handle existing policies

-- ── daily_reports ──
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_reports_select" ON daily_reports;
DROP POLICY IF EXISTS "daily_reports_insert" ON daily_reports;
DROP POLICY IF EXISTS "daily_reports_update" ON daily_reports;
DROP POLICY IF EXISTS "Reports viewable" ON daily_reports;
DROP POLICY IF EXISTS "Reports insertable" ON daily_reports;
DROP POLICY IF EXISTS "Reports updatable" ON daily_reports;

CREATE POLICY "daily_reports_select" ON daily_reports
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "daily_reports_insert" ON daily_reports
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "daily_reports_update" ON daily_reports
  FOR UPDATE USING (can_access_project(project_id));

-- ── works_activities ──
ALTER TABLE works_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_activities_select" ON works_activities;
DROP POLICY IF EXISTS "works_activities_insert" ON works_activities;
DROP POLICY IF EXISTS "works_activities_update" ON works_activities;
DROP POLICY IF EXISTS "Works viewable" ON works_activities;
DROP POLICY IF EXISTS "Works insertable" ON works_activities;
DROP POLICY IF EXISTS "Works updatable" ON works_activities;

CREATE POLICY "works_activities_select" ON works_activities
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "works_activities_insert" ON works_activities
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "works_activities_update" ON works_activities
  FOR UPDATE USING (can_access_project(project_id));

-- ── works_progress ──
ALTER TABLE works_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "works_progress_select" ON works_progress;
DROP POLICY IF EXISTS "works_progress_insert" ON works_progress;
DROP POLICY IF EXISTS "works_progress_update" ON works_progress;
DROP POLICY IF EXISTS "Progress viewable" ON works_progress;
DROP POLICY IF EXISTS "Progress insertable" ON works_progress;
DROP POLICY IF EXISTS "Progress updatable" ON works_progress;

CREATE POLICY "works_progress_select" ON works_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM works_activities wa WHERE wa.id = activity_id AND can_access_project(wa.project_id))
  );
CREATE POLICY "works_progress_insert" ON works_progress
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM works_activities wa WHERE wa.id = activity_id AND can_access_project(wa.project_id))
  );
CREATE POLICY "works_progress_update" ON works_progress
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM works_activities wa WHERE wa.id = activity_id AND can_access_project(wa.project_id))
  );

-- ── equipment_register ──
ALTER TABLE equipment_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_register_select" ON equipment_register;
DROP POLICY IF EXISTS "equipment_register_insert" ON equipment_register;
DROP POLICY IF EXISTS "equipment_register_update" ON equipment_register;
DROP POLICY IF EXISTS "Equipment viewable" ON equipment_register;
DROP POLICY IF EXISTS "Equipment insertable" ON equipment_register;
DROP POLICY IF EXISTS "Equipment updatable" ON equipment_register;

CREATE POLICY "equipment_register_select" ON equipment_register
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "equipment_register_insert" ON equipment_register
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "equipment_register_update" ON equipment_register
  FOR UPDATE USING (can_access_project(project_id));

-- ── equipment_daily_status ──
ALTER TABLE equipment_daily_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_daily_status_select" ON equipment_daily_status;
DROP POLICY IF EXISTS "equipment_daily_status_insert" ON equipment_daily_status;
DROP POLICY IF EXISTS "equipment_daily_status_update" ON equipment_daily_status;
DROP POLICY IF EXISTS "EquipStatus viewable" ON equipment_daily_status;
DROP POLICY IF EXISTS "EquipStatus insertable" ON equipment_daily_status;
DROP POLICY IF EXISTS "EquipStatus updatable" ON equipment_daily_status;

CREATE POLICY "equipment_daily_status_select" ON equipment_daily_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM equipment_register er WHERE er.id = equipment_id AND can_access_project(er.project_id))
  );
CREATE POLICY "equipment_daily_status_insert" ON equipment_daily_status
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM equipment_register er WHERE er.id = equipment_id AND can_access_project(er.project_id))
  );
CREATE POLICY "equipment_daily_status_update" ON equipment_daily_status
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM equipment_register er WHERE er.id = equipment_id AND can_access_project(er.project_id))
  );

-- ── structures ──
ALTER TABLE structures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "structures_select" ON structures;
DROP POLICY IF EXISTS "structures_insert" ON structures;
DROP POLICY IF EXISTS "structures_update" ON structures;
DROP POLICY IF EXISTS "Structures viewable" ON structures;
DROP POLICY IF EXISTS "Structures insertable" ON structures;
DROP POLICY IF EXISTS "Structures updatable" ON structures;

CREATE POLICY "structures_select" ON structures
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "structures_insert" ON structures
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "structures_update" ON structures
  FOR UPDATE USING (can_access_project(project_id));

-- ── structure_progress ──
ALTER TABLE structure_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "structure_progress_select" ON structure_progress;
DROP POLICY IF EXISTS "structure_progress_insert" ON structure_progress;
DROP POLICY IF EXISTS "structure_progress_update" ON structure_progress;
DROP POLICY IF EXISTS "StructProgress viewable" ON structure_progress;
DROP POLICY IF EXISTS "StructProgress insertable" ON structure_progress;
DROP POLICY IF EXISTS "StructProgress updatable" ON structure_progress;

CREATE POLICY "structure_progress_select" ON structure_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM structures s WHERE s.id = structure_id AND can_access_project(s.project_id))
  );
CREATE POLICY "structure_progress_insert" ON structure_progress
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM structures s WHERE s.id = structure_id AND can_access_project(s.project_id))
  );
CREATE POLICY "structure_progress_update" ON structure_progress
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM structures s WHERE s.id = structure_id AND can_access_project(s.project_id))
  );

-- ── boq_sections ──
ALTER TABLE boq_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boq_sections_select" ON boq_sections;
DROP POLICY IF EXISTS "boq_sections_insert" ON boq_sections;
DROP POLICY IF EXISTS "boq_sections_update" ON boq_sections;
DROP POLICY IF EXISTS "BoQ Sections viewable" ON boq_sections;
DROP POLICY IF EXISTS "BoQ Sections insertable" ON boq_sections;
DROP POLICY IF EXISTS "BoQ Sections updatable" ON boq_sections;

CREATE POLICY "boq_sections_select" ON boq_sections
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "boq_sections_insert" ON boq_sections
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "boq_sections_update" ON boq_sections
  FOR UPDATE USING (can_access_project(project_id));

-- ── boq_items ──
ALTER TABLE boq_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "boq_items_select" ON boq_items;
DROP POLICY IF EXISTS "boq_items_insert" ON boq_items;
DROP POLICY IF EXISTS "boq_items_update" ON boq_items;
DROP POLICY IF EXISTS "BoQ viewable" ON boq_items;
DROP POLICY IF EXISTS "BoQ insertable" ON boq_items;
DROP POLICY IF EXISTS "BoQ updatable" ON boq_items;

CREATE POLICY "boq_items_select" ON boq_items
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "boq_items_insert" ON boq_items
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "boq_items_update" ON boq_items
  FOR UPDATE USING (can_access_project(project_id));

-- ── ipc_certificates ──
ALTER TABLE ipc_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ipc_certificates_select" ON ipc_certificates;
DROP POLICY IF EXISTS "ipc_certificates_insert" ON ipc_certificates;
DROP POLICY IF EXISTS "ipc_certificates_update" ON ipc_certificates;
DROP POLICY IF EXISTS "IPC viewable" ON ipc_certificates;
DROP POLICY IF EXISTS "IPC insertable" ON ipc_certificates;
DROP POLICY IF EXISTS "IPC updatable" ON ipc_certificates;

CREATE POLICY "ipc_certificates_select" ON ipc_certificates
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "ipc_certificates_insert" ON ipc_certificates
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "ipc_certificates_update" ON ipc_certificates
  FOR UPDATE USING (can_access_project(project_id));

-- ── pavement_layers ──
ALTER TABLE pavement_layers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pavement_layers_select" ON pavement_layers;
DROP POLICY IF EXISTS "pavement_layers_insert" ON pavement_layers;
DROP POLICY IF EXISTS "pavement_layers_update" ON pavement_layers;
DROP POLICY IF EXISTS "Pavement viewable" ON pavement_layers;
DROP POLICY IF EXISTS "Pavement insertable" ON pavement_layers;
DROP POLICY IF EXISTS "Pavement updatable" ON pavement_layers;

CREATE POLICY "pavement_layers_select" ON pavement_layers
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "pavement_layers_insert" ON pavement_layers
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "pavement_layers_update" ON pavement_layers
  FOR UPDATE USING (can_access_project(project_id));

-- ── quality_tests ──
ALTER TABLE quality_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quality_tests_select" ON quality_tests;
DROP POLICY IF EXISTS "quality_tests_insert" ON quality_tests;
DROP POLICY IF EXISTS "quality_tests_update" ON quality_tests;
DROP POLICY IF EXISTS "Tests viewable" ON quality_tests;
DROP POLICY IF EXISTS "Tests insertable" ON quality_tests;
DROP POLICY IF EXISTS "Tests updatable" ON quality_tests;

CREATE POLICY "quality_tests_select" ON quality_tests
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "quality_tests_insert" ON quality_tests
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "quality_tests_update" ON quality_tests
  FOR UPDATE USING (can_access_project(project_id));

-- ── site_issues ──
ALTER TABLE site_issues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_issues_select" ON site_issues;
DROP POLICY IF EXISTS "site_issues_insert" ON site_issues;
DROP POLICY IF EXISTS "site_issues_update" ON site_issues;
DROP POLICY IF EXISTS "Issues viewable" ON site_issues;
DROP POLICY IF EXISTS "Issues insertable" ON site_issues;
DROP POLICY IF EXISTS "Issues updatable" ON site_issues;

CREATE POLICY "site_issues_select" ON site_issues
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "site_issues_insert" ON site_issues
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "site_issues_update" ON site_issues
  FOR UPDATE USING (can_access_project(project_id));

-- ── project_materials ──
ALTER TABLE project_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_materials_select" ON project_materials;
DROP POLICY IF EXISTS "project_materials_insert" ON project_materials;
DROP POLICY IF EXISTS "project_materials_update" ON project_materials;
DROP POLICY IF EXISTS "Materials viewable" ON project_materials;
DROP POLICY IF EXISTS "Materials insertable" ON project_materials;
DROP POLICY IF EXISTS "Materials updatable" ON project_materials;

CREATE POLICY "project_materials_select" ON project_materials
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "project_materials_insert" ON project_materials
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "project_materials_update" ON project_materials
  FOR UPDATE USING (can_access_project(project_id));

-- ── staff_assignments ──
ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_assignments_select" ON staff_assignments;
DROP POLICY IF EXISTS "staff_assignments_insert" ON staff_assignments;
DROP POLICY IF EXISTS "staff_assignments_update" ON staff_assignments;
DROP POLICY IF EXISTS "Staff viewable" ON staff_assignments;
DROP POLICY IF EXISTS "Staff insertable" ON staff_assignments;
DROP POLICY IF EXISTS "Staff updatable" ON staff_assignments;

CREATE POLICY "staff_assignments_select" ON staff_assignments
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "staff_assignments_insert" ON staff_assignments
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "staff_assignments_update" ON staff_assignments
  FOR UPDATE USING (can_access_project(project_id));

-- ── construction_elements ──
ALTER TABLE construction_elements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "construction_elements_select" ON construction_elements;
DROP POLICY IF EXISTS "construction_elements_insert" ON construction_elements;
DROP POLICY IF EXISTS "construction_elements_update" ON construction_elements;
DROP POLICY IF EXISTS "Elements viewable" ON construction_elements;
DROP POLICY IF EXISTS "Elements insertable" ON construction_elements;
DROP POLICY IF EXISTS "Elements updatable" ON construction_elements;

CREATE POLICY "construction_elements_select" ON construction_elements
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "construction_elements_insert" ON construction_elements
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "construction_elements_update" ON construction_elements
  FOR UPDATE USING (can_access_project(project_id));

-- ── project_documents ──
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_documents_select" ON project_documents;
DROP POLICY IF EXISTS "project_documents_insert" ON project_documents;
DROP POLICY IF EXISTS "project_documents_update" ON project_documents;
DROP POLICY IF EXISTS "Docs viewable" ON project_documents;
DROP POLICY IF EXISTS "Docs insertable" ON project_documents;
DROP POLICY IF EXISTS "Docs updatable" ON project_documents;

CREATE POLICY "project_documents_select" ON project_documents
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "project_documents_insert" ON project_documents
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "project_documents_update" ON project_documents
  FOR UPDATE USING (can_access_project(project_id));

-- ── project_duties ──
ALTER TABLE project_duties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_duties_select" ON project_duties;
DROP POLICY IF EXISTS "project_duties_insert" ON project_duties;
DROP POLICY IF EXISTS "project_duties_update" ON project_duties;
DROP POLICY IF EXISTS "Duties viewable" ON project_duties;
DROP POLICY IF EXISTS "Duties insertable" ON project_duties;
DROP POLICY IF EXISTS "Duties updatable" ON project_duties;

CREATE POLICY "project_duties_select" ON project_duties
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "project_duties_insert" ON project_duties
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "project_duties_update" ON project_duties
  FOR UPDATE USING (can_access_project(project_id));

-- ── project_approvals ──
ALTER TABLE project_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_approvals_select" ON project_approvals;
DROP POLICY IF EXISTS "project_approvals_insert" ON project_approvals;
DROP POLICY IF EXISTS "project_approvals_update" ON project_approvals;
DROP POLICY IF EXISTS "Approvals viewable" ON project_approvals;
DROP POLICY IF EXISTS "Approvals insertable" ON project_approvals;
DROP POLICY IF EXISTS "Approvals updatable" ON project_approvals;

CREATE POLICY "project_approvals_select" ON project_approvals
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "project_approvals_insert" ON project_approvals
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "project_approvals_update" ON project_approvals
  FOR UPDATE USING (can_access_project(project_id));

-- ── key_personnel ──
ALTER TABLE key_personnel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "key_personnel_select" ON key_personnel;
DROP POLICY IF EXISTS "key_personnel_insert" ON key_personnel;
DROP POLICY IF EXISTS "key_personnel_update" ON key_personnel;
DROP POLICY IF EXISTS "Personnel viewable" ON key_personnel;
DROP POLICY IF EXISTS "Personnel insertable" ON key_personnel;
DROP POLICY IF EXISTS "Personnel updatable" ON key_personnel;

CREATE POLICY "key_personnel_select" ON key_personnel
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "key_personnel_insert" ON key_personnel
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "key_personnel_update" ON key_personnel
  FOR UPDATE USING (can_access_project(project_id));

-- ── risk_register ──
ALTER TABLE risk_register ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "risk_register_select" ON risk_register;
DROP POLICY IF EXISTS "risk_register_insert" ON risk_register;
DROP POLICY IF EXISTS "risk_register_update" ON risk_register;
DROP POLICY IF EXISTS "Risks viewable" ON risk_register;
DROP POLICY IF EXISTS "Risks insertable" ON risk_register;
DROP POLICY IF EXISTS "Risks updatable" ON risk_register;

CREATE POLICY "risk_register_select" ON risk_register
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "risk_register_insert" ON risk_register
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "risk_register_update" ON risk_register
  FOR UPDATE USING (can_access_project(project_id));

-- ── project_milestones ──
ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_milestones_select" ON project_milestones;
DROP POLICY IF EXISTS "project_milestones_insert" ON project_milestones;
DROP POLICY IF EXISTS "project_milestones_update" ON project_milestones;
DROP POLICY IF EXISTS "Milestones viewable" ON project_milestones;
DROP POLICY IF EXISTS "Milestones insertable" ON project_milestones;
DROP POLICY IF EXISTS "Milestones updatable" ON project_milestones;

CREATE POLICY "project_milestones_select" ON project_milestones
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "project_milestones_insert" ON project_milestones
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "project_milestones_update" ON project_milestones
  FOR UPDATE USING (can_access_project(project_id));

-- ── management_decisions ──
ALTER TABLE management_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "management_decisions_select" ON management_decisions;
DROP POLICY IF EXISTS "management_decisions_insert" ON management_decisions;
DROP POLICY IF EXISTS "management_decisions_update" ON management_decisions;
DROP POLICY IF EXISTS "Decisions viewable" ON management_decisions;
DROP POLICY IF EXISTS "Decisions insertable" ON management_decisions;
DROP POLICY IF EXISTS "Decisions updatable" ON management_decisions;

CREATE POLICY "management_decisions_select" ON management_decisions
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "management_decisions_insert" ON management_decisions
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "management_decisions_update" ON management_decisions
  FOR UPDATE USING (can_access_project(project_id));

-- ── site_emergencies ──
ALTER TABLE site_emergencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_emergencies_select" ON site_emergencies;
DROP POLICY IF EXISTS "site_emergencies_insert" ON site_emergencies;
DROP POLICY IF EXISTS "site_emergencies_update" ON site_emergencies;
DROP POLICY IF EXISTS "Emergencies viewable" ON site_emergencies;
DROP POLICY IF EXISTS "Emergencies insertable" ON site_emergencies;
DROP POLICY IF EXISTS "Emergencies updatable" ON site_emergencies;

CREATE POLICY "site_emergencies_select" ON site_emergencies
  FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "site_emergencies_insert" ON site_emergencies
  FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "site_emergencies_update" ON site_emergencies
  FOR UPDATE USING (can_access_project(project_id));

-- ── element_progress ──
ALTER TABLE element_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "element_progress_select" ON element_progress;
DROP POLICY IF EXISTS "element_progress_insert" ON element_progress;
DROP POLICY IF EXISTS "element_progress_update" ON element_progress;
DROP POLICY IF EXISTS "ElemProgress viewable" ON element_progress;
DROP POLICY IF EXISTS "ElemProgress insertable" ON element_progress;
DROP POLICY IF EXISTS "ElemProgress updatable" ON element_progress;

CREATE POLICY "element_progress_select" ON element_progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM construction_elements ce WHERE ce.id = element_id AND can_access_project(ce.project_id))
  );
CREATE POLICY "element_progress_insert" ON element_progress
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM construction_elements ce WHERE ce.id = element_id AND can_access_project(ce.project_id))
  );
CREATE POLICY "element_progress_update" ON element_progress
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM construction_elements ce WHERE ce.id = element_id AND can_access_project(ce.project_id))
  );

-- ============================================================
-- 6. Profiles: everyone can see all profiles (for dropdowns etc)
--    but only admins/engineers can update others
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "Profiles viewable" ON profiles;
DROP POLICY IF EXISTS "Profiles insertable" ON profiles;
DROP POLICY IF EXISTS "Profiles updatable" ON profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Everyone can read profiles (needed for name lookups, dropdowns)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Admins/engineers can update any profile
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (is_admin_or_engineer());

-- Anyone can insert their own profile (signup)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ============================================================
-- DONE. Access control summary:
--   Super Admin (Collins): sees ALL projects and ALL data
--   Everyone else: sees ONLY projects they're assigned to
--   Use User Management → Projects button to assign users
-- ============================================================
