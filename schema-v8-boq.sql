-- V8: Bill of Quantities & Financial Valuation

-- BoQ Sections (organize items by series/chapter)
CREATE TABLE IF NOT EXISTS public.boq_sections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  section_no text NOT NULL,
  section_title text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- BoQ Items (the heart of the financial system)
CREATE TABLE IF NOT EXISTS public.boq_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  section_id uuid REFERENCES public.boq_sections(id) ON DELETE SET NULL,
  item_no text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL,
  boq_quantity numeric(14,3) NOT NULL DEFAULT 0,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  boq_amount numeric(16,2) GENERATED ALWAYS AS (boq_quantity * rate) STORED,
  completed_quantity numeric(14,3) DEFAULT 0,
  previous_quantity numeric(14,3) DEFAULT 0,
  value_to_date numeric(16,2) GENERATED ALWAYS AS (completed_quantity * rate) STORED,
  payment_type text DEFAULT 'Re-measurement' CHECK (payment_type IN (
    'Re-measurement','Lump Sum','Provisional Sum','Prime Cost','Daywork','Percentage','Time-based'
  )),
  linked_activity_id uuid REFERENCES public.works_activities(id) ON DELETE SET NULL,
  variation_flag boolean DEFAULT false,
  notes text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- IPC (Interim Payment Certificates)
CREATE TABLE IF NOT EXISTS public.ipc_certificates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  ipc_no int NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  gross_value numeric(16,2) DEFAULT 0,
  retention_pct numeric(5,2) DEFAULT 10,
  retention_amount numeric(16,2) DEFAULT 0,
  advance_recovery numeric(16,2) DEFAULT 0,
  other_deductions numeric(16,2) DEFAULT 0,
  net_amount numeric(16,2) DEFAULT 0,
  status text DEFAULT 'Draft' CHECK (status IN ('Draft','Submitted','Certified','Paid','Disputed')),
  prepared_by uuid REFERENCES public.profiles(id),
  certified_by uuid REFERENCES public.profiles(id),
  certified_date date,
  paid_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.boq_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipc_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boq_sections_select" ON public.boq_sections FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "boq_sections_all" ON public.boq_sections FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "boq_items_select" ON public.boq_items FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "boq_items_all" ON public.boq_items FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer','re'));
CREATE POLICY "ipc_select" ON public.ipc_certificates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ipc_all" ON public.ipc_certificates FOR ALL USING (public.get_my_role() IN ('admin','pm','engineer'));

CREATE INDEX IF NOT EXISTS idx_boq_sections_project ON public.boq_sections(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_project ON public.boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_boq_items_section ON public.boq_items(section_id);
CREATE INDEX IF NOT EXISTS idx_ipc_project ON public.ipc_certificates(project_id);
