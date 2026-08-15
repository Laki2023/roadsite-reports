-- ============================================================
-- RoadSite Reports V14.9 — Personnel & Approvals Matrix
-- ============================================================

-- 1. Enhanced key_personnel table (if not exists, add columns)
-- Covers Contractor's Key Personnel (FIDIC Cl. 6.9) + Engineer's Team

-- Check if table exists and add missing columns
DO $$ BEGIN
  -- Add columns if they don't exist
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS party TEXT DEFAULT 'contractor' CHECK (party IN ('contractor','engineer','employer','subcontractor'));
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS position_title TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS qualifications TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS years_experience INTEGER;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS nationality TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS id_number TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS date_mobilised DATE;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS date_demobilised DATE;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS is_on_site BOOLEAN DEFAULT true;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS replacement_for UUID REFERENCES key_personnel(id);
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS replacement_consent_status TEXT DEFAULT 'n/a' CHECK (replacement_consent_status IN ('n/a','pending','consented','rejected'));
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS replacement_consent_date DATE;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS consent_ref TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS fidic_clause TEXT DEFAULT 'Cl. 6.9';
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS cv_file_path TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS photo_path TEXT;
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id);
  ALTER TABLE key_personnel ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active','replaced','demobilised','absent'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Personnel attendance (daily presence tracking)
CREATE TABLE IF NOT EXISTS personnel_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  personnel_id UUID NOT NULL REFERENCES key_personnel(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_present BOOLEAN DEFAULT true,
  arrival_time TIME,
  departure_time TIME,
  absence_reason TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(personnel_id, attendance_date)
);

ALTER TABLE personnel_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_attendance" ON personnel_attendance
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));
CREATE POLICY "project_users_attendance" ON personnel_attendance
  FOR ALL USING (project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()));

-- 3. Approvals matrix
CREATE TABLE IF NOT EXISTS approvals_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  approval_item TEXT NOT NULL,         -- e.g. 'IPC Certification', 'Material Approval'
  category TEXT DEFAULT 'general' CHECK (category IN (
    'financial','technical','contractual','quality','safety','environmental','general'
  )),
  
  -- Role thresholds
  inspector_limit NUMERIC(15,2),       -- max value Inspector can approve
  re_limit NUMERIC(15,2),              -- max value RE can approve
  pe_limit NUMERIC(15,2),              -- max value PE can approve
  engineer_limit NUMERIC(15,2),        -- max value Engineer can approve
  
  -- Who can initiate, review, approve
  initiated_by TEXT[],                 -- roles that can initiate
  reviewed_by TEXT[],                  -- roles that review
  approved_by TEXT[],                  -- roles that give final approval
  
  -- FIDIC reference
  fidic_clause TEXT,
  
  -- Response time
  response_days INTEGER DEFAULT 14,    -- days to respond
  
  notes TEXT,
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE approvals_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_approvals_matrix" ON approvals_matrix
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));
CREATE POLICY "org_view_approvals_matrix" ON approvals_matrix
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "project_manage_approvals_matrix" ON approvals_matrix
  FOR ALL USING (project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()));

-- Auto-set org for approvals_matrix
CREATE OR REPLACE FUNCTION set_approvals_matrix_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_approvals_matrix_org BEFORE INSERT ON approvals_matrix
  FOR EACH ROW EXECUTE FUNCTION set_approvals_matrix_org();

-- 4. Seed standard approvals matrix items
-- (Will be inserted per-project when user seeds)
