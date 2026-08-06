-- ═══════════════════════════════════════════
-- V5: Works Activities + Equipment Register
-- ═══════════════════════════════════════════

-- ─── 1. WORKS ACTIVITIES (predefined per project category) ───
CREATE TABLE IF NOT EXISTS public.works_activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  activity_name text NOT NULL,
  activity_code text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'Survey','Earthworks','Drainage','Pavement','Surfacing','Road Furniture','Environmental','Other'
  )),
  sort_order int DEFAULT 0,
  unit text DEFAULT 'km',
  planned_quantity numeric(12,3) DEFAULT 0,
  completed_quantity numeric(12,3) DEFAULT 0,
  start_chainage numeric(10,3),
  end_chainage numeric(10,3),
  status text DEFAULT 'Not Started' CHECK (status IN (
    'Not Started','In Progress','Completed','Approved','On Hold'
  )),
  created_at timestamptz DEFAULT now()
);

-- ─── 2. DAILY WORKS PROGRESS (per activity per day per chainage) ───
CREATE TABLE IF NOT EXISTS public.works_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  activity_id uuid REFERENCES public.works_activities(id) ON DELETE CASCADE NOT NULL,
  work_date date NOT NULL DEFAULT CURRENT_DATE,
  start_chainage numeric(10,3) NOT NULL,
  end_chainage numeric(10,3) NOT NULL,
  side text DEFAULT 'Both' CHECK (side IN ('LHS','RHS','CL','Both')),
  quantity numeric(12,3) NOT NULL,
  equipment_used text,
  materials_used text,
  gang_size int DEFAULT 0,
  notes text,
  reported_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- ─── 3. EQUIPMENT REGISTER (contract requirements) ───
CREATE TABLE IF NOT EXISTS public.equipment_register (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  equipment_name text NOT NULL,
  equipment_type text NOT NULL CHECK (equipment_type IN (
    'Excavator','Bulldozer','Motor Grader','Wheel Loader','Dump Truck','Water Bowser',
    'Vibratory Roller','Pneumatic Roller','Steel Drum Roller','Asphalt Paver',
    'Bitumen Distributor','Concrete Mixer','Batching Plant','Crushing Plant',
    'Tipper Truck','Low Loader','Compressor','Generator','Survey Equipment',
    'Concrete Vibrator','Plate Compactor','Pickup/Site Vehicle','Ambulance','Other'
  )),
  specification text,
  required_quantity int DEFAULT 1,
  actual_on_site int DEFAULT 0,
  contractor_ref text,
  is_key_equipment boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── 4. DAILY EQUIPMENT STATUS ───
CREATE TABLE IF NOT EXISTS public.equipment_daily_status (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id uuid REFERENCES public.equipment_register(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  status_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL CHECK (status IN (
    'Operational','Idle','Breakdown','Under Repair','Demobilized','Standby'
  )),
  hours_worked numeric(4,1) DEFAULT 0,
  location_chainage text,
  operator text,
  fuel_litres numeric(8,1),
  notes text,
  reported_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(equipment_id, status_date)
);

-- ─── 5. APPROVALS MATRIX ───
CREATE TABLE IF NOT EXISTS public.project_approvals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  activity_id uuid REFERENCES public.works_activities(id) ON DELETE SET NULL,
  approval_type text NOT NULL CHECK (approval_type IN (
    'Material Source','Material Test Results','Mix Design','Trial Section',
    'Method Statement','Programme of Works','Surveyor Setting Out','Level Check',
    'Compaction Approval','Layer Approval','Environmental Clearance',
    'Traffic Management Plan','Safety Plan','Quality Assurance Plan',
    'Design Drawing','Shop Drawing','Variation Approval','Payment Certificate',
    'Taking Over','Defects Liability','Other'
  )),
  title text NOT NULL,
  description text,
  chainage_from numeric(10,3),
  chainage_to numeric(10,3),
  status text DEFAULT 'Pending' CHECK (status IN (
    'Not Required','Pending','Submitted','Under Review','Approved','Rejected','Resubmit'
  )),
  submitted_by uuid REFERENCES public.profiles(id),
  submitted_date date,
  reviewer uuid REFERENCES public.profiles(id),
  review_date date,
  reference_no text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── 6. KEY PERSONNEL REQUIREMENTS ───
CREATE TABLE IF NOT EXISTS public.key_personnel (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  position_title text NOT NULL,
  min_qualification text,
  min_experience_years int DEFAULT 0,
  is_required boolean DEFAULT true,
  assigned_person uuid REFERENCES public.profiles(id),
  assigned_name text,
  actual_qualification text,
  actual_experience_years int,
  cv_submitted boolean DEFAULT false,
  cv_approved boolean DEFAULT false,
  cv_approved_by uuid REFERENCES public.profiles(id),
  cv_approved_date date,
  site_presence text DEFAULT 'Not Deployed' CHECK (site_presence IN (
    'Not Deployed','On Site','Absent','Replaced','Demobilized'
  )),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── 7. RLS ───
ALTER TABLE public.works_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_daily_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "works_activities_select" ON public.works_activities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "works_activities_all" ON public.works_activities FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "works_progress_select" ON public.works_progress FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "works_progress_insert" ON public.works_progress FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','pm','engineer','re','inspector'));
CREATE POLICY "works_progress_update" ON public.works_progress FOR UPDATE USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "equipment_register_select" ON public.equipment_register FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_register_all" ON public.equipment_register FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "equipment_daily_select" ON public.equipment_daily_status FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "equipment_daily_all" ON public.equipment_daily_status FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re','inspector'));
CREATE POLICY "approvals_select" ON public.project_approvals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "approvals_all" ON public.project_approvals FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "key_personnel_select" ON public.key_personnel FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "key_personnel_all" ON public.key_personnel FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer'));

-- ─── 8. SEED FUNCTION: default activities per project category ───
CREATE OR REPLACE FUNCTION public.seed_project_activities(p_project_id uuid, p_category text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_category = 'Construction' THEN
    INSERT INTO public.works_activities (project_id, activity_name, activity_code, category, unit, sort_order) VALUES
      (p_project_id, 'Setting Out & Survey', 'SV-01', 'Survey', 'km', 1),
      (p_project_id, 'As-Built Survey', 'SV-02', 'Survey', 'km', 2),
      (p_project_id, 'Bush Clearing', 'EW-01', 'Earthworks', 'ha', 3),
      (p_project_id, 'Topsoil Stripping', 'EW-02', 'Earthworks', 'm³', 4),
      (p_project_id, 'Cut to Spoil/Fill', 'EW-03', 'Earthworks', 'm³', 5),
      (p_project_id, 'Borrow to Fill', 'EW-04', 'Earthworks', 'm³', 6),
      (p_project_id, 'Earthworks Compaction', 'EW-05', 'Earthworks', 'm³', 7),
      (p_project_id, 'Culvert Installation', 'DR-01', 'Drainage', 'No.', 8),
      (p_project_id, 'Side Drains', 'DR-02', 'Drainage', 'm', 9),
      (p_project_id, 'Mitre Drains', 'DR-03', 'Drainage', 'No.', 10),
      (p_project_id, 'Scour Checks', 'DR-04', 'Drainage', 'No.', 11),
      (p_project_id, 'Subgrade Preparation', 'PV-01', 'Pavement', 'km', 12),
      (p_project_id, 'Improved Subgrade', 'PV-02', 'Pavement', 'km', 13),
      (p_project_id, 'Sub-base Construction', 'PV-03', 'Pavement', 'km', 14),
      (p_project_id, 'Base Construction', 'PV-04', 'Pavement', 'km', 15),
      (p_project_id, 'Prime Coat', 'SF-01', 'Surfacing', 'km', 16),
      (p_project_id, 'Tack Coat', 'SF-02', 'Surfacing', 'km', 17),
      (p_project_id, 'Binder Course (AC)', 'SF-03', 'Surfacing', 'km', 18),
      (p_project_id, 'Wearing Course (AC)', 'SF-04', 'Surfacing', 'km', 19),
      (p_project_id, 'Shoulder Works', 'SF-05', 'Surfacing', 'km', 20),
      (p_project_id, 'Road Signs', 'RF-01', 'Road Furniture', 'No.', 21),
      (p_project_id, 'Guardrails', 'RF-02', 'Road Furniture', 'm', 22),
      (p_project_id, 'Road Markings', 'RF-03', 'Road Furniture', 'km', 23),
      (p_project_id, 'Delineators & Markers', 'RF-04', 'Road Furniture', 'No.', 24),
      (p_project_id, 'Environmental Restoration', 'EN-01', 'Environmental', 'LS', 25);
  ELSIF p_category = 'Rehabilitation' THEN
    INSERT INTO public.works_activities (project_id, activity_name, activity_code, category, unit, sort_order) VALUES
      (p_project_id, 'Condition Survey', 'SV-01', 'Survey', 'km', 1),
      (p_project_id, 'Failed Section Identification', 'SV-02', 'Survey', 'No.', 2),
      (p_project_id, 'Pavement Cutting', 'PV-01', 'Pavement', 'm²', 3),
      (p_project_id, 'Excavation of Failed Areas', 'PV-02', 'Pavement', 'm³', 4),
      (p_project_id, 'Patch Repair', 'PV-03', 'Pavement', 'm²', 5),
      (p_project_id, 'Overlay - Binder Course', 'SF-01', 'Surfacing', 'km', 6),
      (p_project_id, 'Overlay - Wearing Course', 'SF-02', 'Surfacing', 'km', 7),
      (p_project_id, 'Shoulder Reinstatement', 'SF-03', 'Surfacing', 'km', 8),
      (p_project_id, 'Drainage Rehabilitation', 'DR-01', 'Drainage', 'No.', 9),
      (p_project_id, 'Drain Cleaning/Desilting', 'DR-02', 'Drainage', 'm', 10),
      (p_project_id, 'Road Marking', 'RF-01', 'Road Furniture', 'km', 11),
      (p_project_id, 'Sign Replacement', 'RF-02', 'Road Furniture', 'No.', 12),
      (p_project_id, 'Guardrail Repair', 'RF-03', 'Road Furniture', 'm', 13);
  ELSIF p_category = 'Maintenance' THEN
    INSERT INTO public.works_activities (project_id, activity_name, activity_code, category, unit, sort_order) VALUES
      (p_project_id, 'Pothole Identification', 'SV-01', 'Survey', 'No.', 1),
      (p_project_id, 'Pothole Patching', 'PV-01', 'Pavement', 'm²', 2),
      (p_project_id, 'Crack Sealing', 'PV-02', 'Pavement', 'm', 3),
      (p_project_id, 'Grading (Gravel Roads)', 'EW-01', 'Earthworks', 'km', 4),
      (p_project_id, 'Spot Gravelling', 'EW-02', 'Earthworks', 'm³', 5),
      (p_project_id, 'Drain Clearing', 'DR-01', 'Drainage', 'No.', 6),
      (p_project_id, 'Drain Desilting', 'DR-02', 'Drainage', 'm', 7),
      (p_project_id, 'Bush Clearing (Shoulders)', 'EN-01', 'Environmental', 'km', 8),
      (p_project_id, 'Road Marking Renewal', 'RF-01', 'Road Furniture', 'km', 9),
      (p_project_id, 'Sign Repair/Replacement', 'RF-02', 'Road Furniture', 'No.', 10),
      (p_project_id, 'Guardrail Repair', 'RF-03', 'Road Furniture', 'm', 11);
  END IF;
END;
$$;

-- ─── 9. INDEXES ───
CREATE INDEX IF NOT EXISTS idx_works_activities_project ON public.works_activities(project_id);
CREATE INDEX IF NOT EXISTS idx_works_progress_project ON public.works_progress(project_id);
CREATE INDEX IF NOT EXISTS idx_works_progress_activity ON public.works_progress(activity_id);
CREATE INDEX IF NOT EXISTS idx_works_progress_date ON public.works_progress(work_date);
CREATE INDEX IF NOT EXISTS idx_equipment_register_project ON public.equipment_register(project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_daily_equipment ON public.equipment_daily_status(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equipment_daily_date ON public.equipment_daily_status(status_date);
CREATE INDEX IF NOT EXISTS idx_approvals_project ON public.project_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON public.project_approvals(status);
CREATE INDEX IF NOT EXISTS idx_key_personnel_project ON public.key_personnel(project_id);
