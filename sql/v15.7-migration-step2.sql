-- ═══════════════════════════════════════════════════════════════
-- V15.7 Migration Step 2: Position Templates table
-- Run AFTER Step 1 (enum addition needs its own transaction)
-- ═══════════════════════════════════════════════════════════════

-- Position Templates table
CREATE TABLE IF NOT EXISTS position_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  system_role user_role NOT NULL DEFAULT 'project_officer',
  allowed_pages TEXT[] DEFAULT '{}',
  org_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_position_templates_org ON position_templates(org_id);

-- RLS
ALTER TABLE position_templates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read templates from their org
CREATE POLICY "Users can read org templates" ON position_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Allow RE+ to manage templates
CREATE POLICY "Managers can insert templates" ON position_templates
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can update templates" ON position_templates
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can delete templates" ON position_templates
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Seed some common Kenya road sector position templates
INSERT INTO position_templates (display_name, description, system_role, allowed_pages) VALUES
  ('HQ Quantity Surveyor', 'Reviews BoQ, measurements and IPC submissions at HQ level', 'project_officer',
   ARRAY['boq', 'taking-off', 'ipc', 'claims', 'monthly-report']),
  ('Contracts Officer', 'Handles claims, EOT assessments and contract amendments', 'project_officer',
   ARRAY['claims', 'approvals', 'monthly-report', 'key-personnel', 'approvals-matrix']),
  ('Environmental Officer', 'Monitors environmental safeguards and compliance', 'project_officer',
   ARRAY['quality', 'issues', 'reports', 'monthly-report']),
  ('Safeguards Specialist', 'Oversees social and environmental safeguards', 'project_officer',
   ARRAY['issues', 'reports', 'quality', 'key-personnel', 'monthly-report']),
  ('Assistant Resident Engineer', 'Supports RE with expanded site-level access', 'inspector',
   ARRAY['submit-report', 'reports', 'works', 'issues', 'emergency', 'pavement', 'quality', 'equipment', 'structures', 'programme', 'boq', 'taking-off', 'key-personnel']),
  ('Materials Technician', 'Quality testing and materials approval', 'inspector',
   ARRAY['submit-report', 'quality', 'pavement', 'reports']),
  ('Site Surveyor', 'Measurements, taking-off and works quantities', 'inspector',
   ARRAY['submit-report', 'taking-off', 'works', 'structures', 'reports']),
  ('Office Engineer', 'Programme tracking, reporting and documentation', 'project_officer',
   ARRAY['programme', 'monthly-report', 'reports', 'key-personnel', 'approvals'])
ON CONFLICT DO NOTHING;

-- Done!
SELECT 'V15.7 Step 2 migration complete — position_templates table created with 8 seed templates' AS result;
