-- =============================================
-- ROADSITE REPORTS V3 — SCHEMA MIGRATION
-- Run AFTER v2 migration
-- Adds: super_admin, project leads, contract documents
-- =============================================

-- ─── 1. SUPER ADMIN FLAG ───
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;

-- Set Collins as the super admin
UPDATE public.profiles SET is_super_admin = true WHERE email = 'collinslaki@gmail.com';

-- ─── 2. PROJECT LEAD ───
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_lead_id uuid REFERENCES public.profiles(id);

-- ─── 3. CONTRACT DOCUMENTS REGISTER ───
CREATE TABLE IF NOT EXISTS public.project_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN (
    'FIDIC General Conditions',
    'Particular Conditions',
    'Particular Conditions Part A',
    'Particular Conditions Part B',
    'Specification',
    'Bill of Quantities',
    'Drawings',
    'Tender Documents',
    'Letter of Acceptance',
    'Contract Agreement',
    'Performance Security',
    'Advance Payment Guarantee',
    'Insurance',
    'Programme of Works',
    'Method Statement',
    'Quality Assurance Plan',
    'Environmental Management Plan',
    'Health & Safety Plan',
    'Variation Order',
    'Addendum',
    'Site Instruction',
    'Engineer''s Letter',
    'Contractor''s Letter',
    'Meeting Minutes',
    'Progress Report',
    'IPC Certificate',
    'Taking Over Certificate',
    'Defects Liability Certificate',
    'Other'
  )),
  title text NOT NULL,
  reference_no text,
  description text,
  doc_date date,
  issued_by text,
  received_date date,
  file_url text,
  status text DEFAULT 'Active' CHECK (status IN ('Draft','Active','Superseded','Withdrawn','Closed')),
  added_by uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── 4. PROJECT DUTIES / TASK ASSIGNMENTS ───
CREATE TABLE IF NOT EXISTS public.project_duties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id) NOT NULL,
  assigned_by uuid REFERENCES public.profiles(id) NOT NULL,
  title text NOT NULL,
  description text,
  priority text DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Urgent')),
  status text DEFAULT 'Assigned' CHECK (status IN ('Assigned','In Progress','Completed','Cancelled')),
  due_date date,
  completed_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ─── 5. RLS POLICIES ───
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_duties ENABLE ROW LEVEL SECURITY;

-- Documents: viewable by all authenticated, managed by admin/pm/project lead
CREATE POLICY "Documents viewable by authenticated"
  ON public.project_documents FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Documents managed by admin/pm"
  ON public.project_documents FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer')
  );

-- Duties: viewable by project members, managed by admin/pm/project lead
CREATE POLICY "Duties viewable by authenticated"
  ON public.project_duties FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Duties managed by lead/admin"
  ON public.project_duties FOR ALL USING (
    public.get_my_role() IN ('admin','pm','engineer','re')
  );

-- ─── 6. INDEXES ───
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON public.project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type ON public.project_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_project_duties_project ON public.project_duties(project_id);
CREATE INDEX IF NOT EXISTS idx_project_duties_assigned ON public.project_duties(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_duties_status ON public.project_duties(status);

-- Done!
