-- V4: Site Emergency System
CREATE TABLE IF NOT EXISTS public.site_emergencies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  emergency_type text NOT NULL CHECK (emergency_type IN (
    'Accident/Injury','Equipment Failure','Structural Collapse','Fire',
    'Medical Emergency','Environmental Spill','Security Threat','Flooding','Landslide','Other'
  )),
  severity text NOT NULL DEFAULT 'Critical' CHECK (severity IN ('Critical','High')),
  status text NOT NULL DEFAULT 'Reported' CHECK (status IN ('Reported','Acknowledged','Response Underway','Resolved')),
  chainage text,
  people_involved int DEFAULT 0,
  description text NOT NULL,
  reported_by uuid REFERENCES public.profiles(id) NOT NULL,
  reported_at timestamptz DEFAULT now(),
  acknowledged_by uuid REFERENCES public.profiles(id),
  acknowledged_at timestamptz,
  response_by uuid REFERENCES public.profiles(id),
  response_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.site_emergencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Emergencies viewable by all authenticated" ON public.site_emergencies FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Emergencies insertable by all authenticated" ON public.site_emergencies FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Emergencies updatable by re+" ON public.site_emergencies FOR UPDATE USING (
  public.get_my_role() IN ('admin','pm','engineer','re') OR reported_by = auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_emergencies_project ON public.site_emergencies(project_id);
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON public.site_emergencies(status);
