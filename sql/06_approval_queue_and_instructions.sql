-- ============================================================
-- RoadSite Reports — Approval Queue & Site Instructions
-- Enables cascading approval workflow with escalation
-- ============================================================

-- 1. Approval queue — items that need approval flow up the chain
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'daily_report','quality_test','site_instruction','ipc','variation_order','eot_claim','cost_claim' etc
  item_id UUID, -- reference to the specific record
  title TEXT NOT NULL,
  description TEXT,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  current_approver_role user_role NOT NULL, -- which role level it's currently at
  assigned_to UUID REFERENCES profiles(id), -- specific person assigned (optional)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','escalated','overridden')),
  decision_by UUID REFERENCES profiles(id),
  decision_at TIMESTAMPTZ,
  decision_notes TEXT,
  escalated_from user_role, -- role that escalated it
  escalation_reason TEXT,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Approval history — track every action on an approval item
CREATE TABLE IF NOT EXISTS approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES approval_queue(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('submitted','approved','rejected','escalated','overridden','returned','commented')),
  action_by UUID NOT NULL REFERENCES profiles(id),
  action_role user_role NOT NULL,
  notes TEXT,
  escalated_to user_role,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Site instructions table
CREATE TABLE IF NOT EXISTS site_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  instruction_no TEXT NOT NULL,
  instruction_type TEXT NOT NULL DEFAULT 'site_instruction',
  subject TEXT NOT NULL,
  description TEXT,
  chainage_from TEXT,
  chainage_to TEXT,
  fidic_clause TEXT,
  issued_by UUID NOT NULL REFERENCES profiles(id),
  issued_by_role user_role NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now(),
  response_required BOOLEAN DEFAULT false,
  response_due_date DATE,
  contractor_response TEXT,
  contractor_responded_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','acknowledged','complied','closed','withdrawn')),
  compliance_verified_by UUID REFERENCES profiles(id),
  compliance_verified_at TIMESTAMPTZ,
  approval_queue_id UUID REFERENCES approval_queue(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_aq_project ON approval_queue(project_id);
CREATE INDEX IF NOT EXISTS idx_aq_status ON approval_queue(status);
CREATE INDEX IF NOT EXISTS idx_aq_approver_role ON approval_queue(current_approver_role);
CREATE INDEX IF NOT EXISTS idx_aq_assigned ON approval_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ah_queue ON approval_history(queue_id);
CREATE INDEX IF NOT EXISTS idx_si_project ON site_instructions(project_id);
CREATE INDEX IF NOT EXISTS idx_si_status ON site_instructions(status);

-- 5. RLS
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_instructions ENABLE ROW LEVEL SECURITY;

-- approval_queue: project-scoped
CREATE POLICY "aq_select" ON approval_queue FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "aq_insert" ON approval_queue FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "aq_update" ON approval_queue FOR UPDATE USING (can_access_project(project_id));

-- approval_history: linked to queue
CREATE POLICY "ah_select" ON approval_history FOR SELECT USING (
  EXISTS (SELECT 1 FROM approval_queue aq WHERE aq.id = queue_id AND can_access_project(aq.project_id))
);
CREATE POLICY "ah_insert" ON approval_history FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM approval_queue aq WHERE aq.id = queue_id AND can_access_project(aq.project_id))
);

-- site_instructions: project-scoped
CREATE POLICY "si_select" ON site_instructions FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "si_insert" ON site_instructions FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "si_update" ON site_instructions FOR UPDATE USING (can_access_project(project_id));

-- ============================================================
-- DONE. Tables: approval_queue, approval_history, site_instructions
-- ============================================================
