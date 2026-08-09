-- V11: Chainage Matrix, Materials, Risks, Milestones

-- Materials tracking
CREATE TABLE IF NOT EXISTS public.project_materials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  material_name text NOT NULL,
  material_type text CHECK (material_type IN ('Cement','Aggregate','Bitumen','Steel','Gravel','Sand','Gabion Wire','Geotextile','Pipe','Paint','Fuel','Other')),
  unit text DEFAULT 'tonnes',
  required_quantity numeric(14,2) DEFAULT 0,
  available_quantity numeric(14,2) DEFAULT 0,
  delivered_quantity numeric(14,2) DEFAULT 0,
  source text,
  approval_status text DEFAULT 'Pending' CHECK (approval_status IN ('Pending','Approved','Rejected','Testing')),
  test_results text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Risk register
CREATE TABLE IF NOT EXISTS public.risk_register (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  risk_description text NOT NULL,
  category text CHECK (category IN ('Technical','Financial','Schedule','Environmental','Social','Safety','Design','Contractual','Political','Other')),
  probability text CHECK (probability IN ('Low','Medium','High','Very High')),
  impact text CHECK (impact IN ('Low','Medium','High','Very High')),
  risk_level text GENERATED ALWAYS AS (
    CASE 
      WHEN probability IN ('High','Very High') AND impact IN ('High','Very High') THEN 'Critical'
      WHEN probability IN ('High','Very High') OR impact IN ('High','Very High') THEN 'High'
      WHEN probability = 'Medium' OR impact = 'Medium' THEN 'Medium'
      ELSE 'Low'
    END
  ) STORED,
  mitigation text,
  owner text,
  due_date date,
  status text DEFAULT 'Open' CHECK (status IN ('Open','Mitigating','Closed','Occurred')),
  raised_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Milestones
CREATE TABLE IF NOT EXISTS public.project_milestones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  milestone_name text NOT NULL,
  planned_date date,
  actual_date date,
  status text DEFAULT 'Upcoming' CHECK (status IN ('Upcoming','On Track','At Risk','Delayed','Achieved','Cancelled')),
  sort_order int DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Management decisions tracker
CREATE TABLE IF NOT EXISTS public.management_decisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  issue text NOT NULL,
  impact text,
  required_decision text NOT NULL,
  responsible text,
  deadline date,
  status text DEFAULT 'Pending' CHECK (status IN ('Pending','Decided','Implemented','Escalated','Cancelled')),
  decision_notes text,
  raised_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.project_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_select" ON public.project_materials FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "materials_all" ON public.project_materials FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "risks_select" ON public.risk_register FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "risks_all" ON public.risk_register FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re','inspector'));
CREATE POLICY "milestones_select" ON public.project_milestones FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "milestones_all" ON public.project_milestones FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "decisions_select" ON public.management_decisions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "decisions_all" ON public.management_decisions FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer'));

CREATE INDEX IF NOT EXISTS idx_materials_project ON public.project_materials(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project ON public.risk_register(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON public.project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_decisions_project ON public.management_decisions(project_id);
