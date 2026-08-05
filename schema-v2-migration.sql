-- =============================================
-- ROADSITE REPORTS V2 — SCHEMA MIGRATION
-- Run in Supabase SQL Editor AFTER the original schema
-- Adds: hierarchical users, project categories,
--        pavement layers, quality testing matrix,
--        construction elements & progress tracking
-- =============================================

-- ─── 1. EXTEND PROFILES (hierarchical user management) ───
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS designation text DEFAULT 'Inspector'
    CHECK (designation IN ('Project Manager','Engineer','Resident Engineer','Inspector','Surveyor','Materials Technician','Environmental Officer','Accounts Officer')),
  ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS can_approve_reports boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone text;

-- Update role check to include new roles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('pending','inspector','re','engineer','pm','admin'));

-- ─── 2. EXPAND PROJECTS TABLE ───
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Construction'
    CHECK (category IN ('Construction','Rehabilitation','Maintenance')),
  ADD COLUMN IF NOT EXISTS contract_no text,
  ADD COLUMN IF NOT EXISTS contractor_name text,
  ADD COLUMN IF NOT EXISTS contract_sum numeric(15,2),
  ADD COLUMN IF NOT EXISTS fidic_edition text DEFAULT 'Red Book 1999'
    CHECK (fidic_edition IN ('Red Book 1987','Red Book 1999','Red Book 2017','Pink Book MDB 2010','Yellow Book 1999','Yellow Book 2017')),
  ADD COLUMN IF NOT EXISTS employer text DEFAULT 'KeNHA',
  ADD COLUMN IF NOT EXISTS start_chainage numeric(10,3),
  ADD COLUMN IF NOT EXISTS end_chainage numeric(10,3),
  ADD COLUMN IF NOT EXISTS road_class text,
  ADD COLUMN IF NOT EXISTS commencement_date date,
  ADD COLUMN IF NOT EXISTS original_completion_date date,
  ADD COLUMN IF NOT EXISTS revised_completion_date date,
  ADD COLUMN IF NOT EXISTS current_phase text DEFAULT 'Mobilization'
    CHECK (current_phase IN ('Procurement','Mobilization','Construction','Defects Liability','Completed','Suspended')),
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS county text;

-- ─── 3. STAFF ASSIGNMENTS (many-to-many projects ↔ staff) ───
CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  staff_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role_on_project text NOT NULL CHECK (role_on_project IN (
    'Project Manager','Resident Engineer','Inspector','Surveyor',
    'Materials Technician','Environmental Officer','Accounts Officer'
  )),
  assigned_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  UNIQUE(project_id, staff_id)
);

-- ─── 4. CONSTRUCTION ELEMENTS (weighted progress) ───
CREATE TABLE IF NOT EXISTS public.construction_elements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  element_name text NOT NULL,
  element_code text NOT NULL,
  weight_pct numeric(5,2) DEFAULT 0 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  unit text DEFAULT 'km',
  planned_quantity numeric(12,3) DEFAULT 0,
  completed_quantity numeric(12,3) DEFAULT 0,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Default elements template (inserted per project via app logic)
-- Earthworks (15%), Pavement Layers (30%), Drainage (15%), Structures (12%),
-- Road Furniture (5%), Bush Clearing (3%), etc.

-- ─── 5. ELEMENT PROGRESS (by chainage) ───
CREATE TABLE IF NOT EXISTS public.element_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  element_id uuid REFERENCES public.construction_elements(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  start_chainage numeric(10,3) NOT NULL,
  end_chainage numeric(10,3) NOT NULL,
  side text DEFAULT 'CL' CHECK (side IN ('LHS','RHS','CL','Both')),
  quantity numeric(12,3) NOT NULL,
  date_completed date NOT NULL,
  reported_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── 6. PAVEMENT LAYERS (core road construction tracking) ───
CREATE TABLE IF NOT EXISTS public.pavement_layers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  layer_type text NOT NULL CHECK (layer_type IN (
    'Subgrade','Improved Subgrade','Sub-base','Base','Prime Coat',
    'Tack Coat','Binder Course','Wearing Course','Surface Dressing','Seal Coat'
  )),
  material_type text, -- e.g. 'Natural Gravel', 'Crusite Base', 'AC 20', 'AC 14'
  design_thickness_mm numeric(6,1),
  start_chainage numeric(10,3) NOT NULL,
  end_chainage numeric(10,3) NOT NULL,
  side text DEFAULT 'Both' CHECK (side IN ('LHS','RHS','CL','Both')),
  width_m numeric(6,2),
  layer_status text DEFAULT 'Not Started' CHECK (layer_status IN (
    'Not Started','Material Approved','Laying In Progress','Laid','Tested','Approved','Rejected','Rework'
  )),
  date_laid date,
  date_tested date,
  date_approved date,
  approved_by uuid REFERENCES public.profiles(id),
  compaction_passes int,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── 7. QUALITY TESTS (the testing matrix) ───
CREATE TABLE IF NOT EXISTS public.quality_tests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  layer_id uuid REFERENCES public.pavement_layers(id) ON DELETE SET NULL,
  test_type text NOT NULL CHECK (test_type IN (
    'MDD','CBR','DCP','FWD','Marshall Stability','Gradation','Atterberg Limits',
    'Moisture Content','Sand Equivalent','Flakiness Index','ACV','AIV','LAA',
    'Specific Gravity','Bitumen Content','Penetration','Softening Point',
    'Compaction (Field)','Plate Bearing','Benkelman Beam','Core Extraction',
    'Slump Test','Cube Crushing','Other'
  )),
  test_standard text, -- e.g. 'BS 1377:Part 4', 'ASTM D1557', 'KS 02-26'
  sample_location_chainage numeric(10,3),
  sample_location_side text CHECK (sample_location_side IN ('LHS','RHS','CL')),
  sample_location_offset_m numeric(6,2),
  date_sampled date NOT NULL,
  date_tested date,
  lab_ref text,
  -- Results (flexible key-value via JSONB + specific fields)
  result_value numeric(12,4),
  result_unit text,
  spec_min numeric(12,4),
  spec_max numeric(12,4),
  spec_reference text, -- e.g. 'Kenya RDM Part III, Table 5.1'
  result_status text DEFAULT 'Pending' CHECK (result_status IN (
    'Pending','Pass','Fail','Marginal','Retest Required'
  )),
  result_details jsonb DEFAULT '{}'::jsonb, -- for multi-value results (gradation curve, etc.)
  tested_by uuid REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── 8. SITE ISSUES TRACKER ───
CREATE TABLE IF NOT EXISTS public.site_issues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  category text DEFAULT 'General' CHECK (category IN (
    'Safety','Quality','Programme','Environmental','Design','Contractual',
    'Community','Materials','Equipment','Weather','General'
  )),
  severity text DEFAULT 'Medium' CHECK (severity IN ('Low','Medium','High','Critical')),
  status text DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Closed','Escalated')),
  chainage_from numeric(10,3),
  chainage_to numeric(10,3),
  raised_by uuid REFERENCES public.profiles(id),
  assigned_to uuid REFERENCES public.profiles(id),
  date_raised date DEFAULT CURRENT_DATE,
  date_resolved date,
  resolution_notes text,
  photos text[], -- array of storage URLs
  created_at timestamptz DEFAULT now()
);

-- ─── 9. UPDATE daily_reports TO LINK richer data ───
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS max_temp_c numeric(4,1),
  ADD COLUMN IF NOT EXISTS min_temp_c numeric(4,1),
  ADD COLUMN IF NOT EXISTS rainfall_mm numeric(5,1),
  ADD COLUMN IF NOT EXISTS working_hours numeric(4,1),
  ADD COLUMN IF NOT EXISTS non_working_reason text,
  ADD COLUMN IF NOT EXISTS contractor_labour_skilled int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contractor_labour_unskilled int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subcontractor_labour int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipment_on_site jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visitors jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS instructions_issued text;

-- ─── 10. RLS POLICIES FOR NEW TABLES ───

ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.element_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pavement_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_issues ENABLE ROW LEVEL SECURITY;

-- Staff assignments: viewable by assigned staff, editable by engineer+
CREATE POLICY "Staff assignments viewable by project members"
  ON public.staff_assignments FOR SELECT USING (
    public.get_my_role() IN ('admin','pm','engineer')
    OR staff_id = auth.uid()
  );
CREATE POLICY "Staff assignments managed by engineer+"
  ON public.staff_assignments FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer')
  );

-- Construction elements: viewable by all authenticated, editable by engineer+
CREATE POLICY "Elements viewable by authenticated"
  ON public.construction_elements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Elements managed by engineer+"
  ON public.construction_elements FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer')
  );

-- Element progress: viewable by all, insertable by re+
CREATE POLICY "Progress viewable by authenticated"
  ON public.element_progress FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Progress insertable by re+"
  ON public.element_progress FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin','pm','engineer','re')
  );
CREATE POLICY "Progress updatable by engineer+"
  ON public.element_progress FOR UPDATE USING (
    public.get_my_role() IN ('admin','pm','engineer')
  );

-- Pavement layers: viewable by all, managed by re+
CREATE POLICY "Layers viewable by authenticated"
  ON public.pavement_layers FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Layers managed by re+"
  ON public.pavement_layers FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer','re')
  );

-- Quality tests: viewable by all, insertable by technician/re+
CREATE POLICY "Tests viewable by authenticated"
  ON public.quality_tests FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Tests managed by re+"
  ON public.quality_tests FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer','re','inspector')
  );

-- Site issues: viewable by all, insertable by inspector+
CREATE POLICY "Issues viewable by authenticated"
  ON public.site_issues FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Issues managed by inspector+"
  ON public.site_issues FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer','re','inspector')
  );

-- ─── 11. UPDATE get_my_role() FOR NEW ROLE HIERARCHY ───
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = auth.uid()),
    'pending'
  );
$$;

-- ─── 12. HELPER: seed default construction elements for a project ───
CREATE OR REPLACE FUNCTION public.seed_project_elements(p_project_id uuid, p_category text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_category = 'Construction' THEN
    INSERT INTO public.construction_elements (project_id, element_name, element_code, weight_pct, unit, sort_order) VALUES
      (p_project_id, 'Bush Clearing & Site Preparation', 'BC', 3, 'ha', 1),
      (p_project_id, 'Earthworks', 'EW', 15, 'm³', 2),
      (p_project_id, 'Pavement Layers - Subgrade', 'PL-SG', 5, 'km', 3),
      (p_project_id, 'Pavement Layers - Sub-base', 'PL-SB', 7, 'km', 4),
      (p_project_id, 'Pavement Layers - Base', 'PL-BA', 8, 'km', 5),
      (p_project_id, 'Pavement Layers - Bituminous', 'PL-BIT', 10, 'km', 6),
      (p_project_id, 'Drainage Works', 'DW', 15, 'No.', 7),
      (p_project_id, 'Structures (Bridges/Culverts)', 'ST', 12, 'No.', 8),
      (p_project_id, 'Road Furniture & Markings', 'RF', 5, 'km', 9),
      (p_project_id, 'Environmental & Social', 'ES', 5, '%', 10),
      (p_project_id, 'Ancillary Works', 'AW', 8, 'LS', 11),
      (p_project_id, 'Dayworks & Provisional Sums', 'DPS', 7, 'LS', 12);
  ELSIF p_category = 'Rehabilitation' THEN
    INSERT INTO public.construction_elements (project_id, element_name, element_code, weight_pct, unit, sort_order) VALUES
      (p_project_id, 'Pavement Repair / Patching', 'PR', 20, 'm²', 1),
      (p_project_id, 'Overlay - Binder Course', 'OV-BC', 15, 'km', 2),
      (p_project_id, 'Overlay - Wearing Course', 'OV-WC', 15, 'km', 3),
      (p_project_id, 'Drainage Rehabilitation', 'DR', 15, 'No.', 4),
      (p_project_id, 'Shoulder Works', 'SW', 10, 'km', 5),
      (p_project_id, 'Road Furniture Replacement', 'RFR', 8, 'km', 6),
      (p_project_id, 'Structures Rehabilitation', 'SR', 10, 'No.', 7),
      (p_project_id, 'Ancillary & Environmental', 'AE', 7, 'LS', 8);
  ELSIF p_category = 'Maintenance' THEN
    INSERT INTO public.construction_elements (project_id, element_name, element_code, weight_pct, unit, sort_order) VALUES
      (p_project_id, 'Pothole Patching', 'PP', 25, 'm²', 1),
      (p_project_id, 'Crack Sealing', 'CS', 15, 'm', 2),
      (p_project_id, 'Drainage Clearing', 'DC', 20, 'No.', 3),
      (p_project_id, 'Bush Clearing (Shoulders)', 'BCS', 15, 'km', 4),
      (p_project_id, 'Road Marking Renewal', 'RM', 10, 'km', 5),
      (p_project_id, 'Sign Replacement', 'SGN', 10, 'No.', 6),
      (p_project_id, 'Miscellaneous', 'MISC', 5, 'LS', 7);
  END IF;
END;
$$;

-- ─── 13. INDEXES FOR PERFORMANCE ───
CREATE INDEX IF NOT EXISTS idx_pavement_layers_project ON public.pavement_layers(project_id);
CREATE INDEX IF NOT EXISTS idx_pavement_layers_type ON public.pavement_layers(layer_type);
CREATE INDEX IF NOT EXISTS idx_quality_tests_project ON public.quality_tests(project_id);
CREATE INDEX IF NOT EXISTS idx_quality_tests_type ON public.quality_tests(test_type);
CREATE INDEX IF NOT EXISTS idx_quality_tests_status ON public.quality_tests(result_status);
CREATE INDEX IF NOT EXISTS idx_element_progress_element ON public.element_progress(element_id);
CREATE INDEX IF NOT EXISTS idx_site_issues_project ON public.site_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_site_issues_status ON public.site_issues(status);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_project ON public.staff_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff ON public.staff_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_project ON public.daily_reports(project_id);

-- Done! Run the app and seed elements when creating projects.
