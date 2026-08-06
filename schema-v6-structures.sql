-- V6: Structures Module (Culverts, Bridges, Gabions, etc.)

CREATE TABLE IF NOT EXISTS public.structures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  structure_type text NOT NULL CHECK (structure_type IN (
    'Box Culvert','Pipe Culvert','Slab Culvert','Bridge','Footbridge',
    'Gabion Wall','Gabion Mattress','Retaining Wall (Masonry)','Retaining Wall (RC)',
    'Drift/Causeway','Headwall','Wingwall','Apron','Scour Protection',
    'River Training','Guard Rail at Structure','Other'
  )),
  structure_ref text NOT NULL,
  chainage numeric(10,3) NOT NULL,
  side text DEFAULT 'CL' CHECK (side IN ('LHS','RHS','CL','Both')),
  dimensions text,
  span_m numeric(8,2),
  height_m numeric(8,2),
  width_m numeric(8,2),
  length_m numeric(8,2),
  skew_angle numeric(5,1),
  no_of_cells int DEFAULT 1,
  drawing_ref text,
  design_ref text,
  concrete_grade text,
  steel_grade text,
  foundation_type text,
  overall_status text DEFAULT 'Not Started' CHECK (overall_status IN (
    'Not Started','Excavation','Foundation','Substructure','Superstructure',
    'Finishing','Completed','Approved','Defective'
  )),
  percent_complete numeric(5,1) DEFAULT 0,
  start_date date,
  completion_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.structure_progress (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  structure_id uuid REFERENCES public.structures(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  stage text NOT NULL CHECK (stage IN (
    'Setting Out','Excavation','Blinding','Foundation/Base Slab',
    'Base Reinforcement','Base Concrete','Wall Formwork','Wall Reinforcement',
    'Wall Concrete','Top Slab Formwork','Top Slab Reinforcement','Top Slab Concrete',
    'Headwall','Wingwall','Apron','Backfilling','Scour Protection','Waterproofing',
    'Pile Driving/Boring','Pile Cap','Abutment Foundation','Abutment Construction',
    'Pier Foundation','Pier Construction','Bearing Installation','Deck Beams/Girders',
    'Deck Slab','Parapet/Railing','Approach Slab','Expansion Joints','Surfacing',
    'Gabion Basket Placement','Wire Mesh Installation','Stone Filling','Lacing/Tying',
    'Masonry Work','Plastering','Curing','Inspection','Other'
  )),
  status text DEFAULT 'Not Started' CHECK (status IN (
    'Not Started','In Progress','Completed','Approved','Failed','Rework'
  )),
  work_date date DEFAULT CURRENT_DATE,
  quantity numeric(12,3),
  unit text,
  materials_used text,
  concrete_volume_m3 numeric(8,2),
  rebar_kg numeric(10,2),
  gang_size int DEFAULT 0,
  equipment_used text,
  notes text,
  reported_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structure_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "structures_select" ON public.structures FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "structures_all" ON public.structures FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "structure_progress_select" ON public.structure_progress FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "structure_progress_all" ON public.structure_progress FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re','inspector'));

CREATE INDEX IF NOT EXISTS idx_structures_project ON public.structures(project_id);
CREATE INDEX IF NOT EXISTS idx_structures_chainage ON public.structures(chainage);
CREATE INDEX IF NOT EXISTS idx_structures_type ON public.structures(structure_type);
CREATE INDEX IF NOT EXISTS idx_structure_progress_structure ON public.structure_progress(structure_id);
