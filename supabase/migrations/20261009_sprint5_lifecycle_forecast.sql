-- Sprint 5: Contract Milestone Timeline, Financial Forecast, Alert Engine
-- ═══════════════════════════════════════════════════════════════
-- 1. CONTRACT MILESTONES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS contract_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  milestone_type TEXT NOT NULL,                   -- Commencement, Programme Milestone, Sectional Completion,
                                                  -- Substantial Completion, DLP Start, DLP End, Final Completion,
                                                  -- Defect, Custom
  title TEXT NOT NULL,
  description TEXT,

  planned_date DATE,
  actual_date DATE,
  revised_date DATE,

  status TEXT DEFAULT 'Pending',                  -- Pending, Achieved, Delayed, At Risk
  fidic_clause TEXT,
  responsible_party TEXT,
  days_delay INTEGER DEFAULT 0,

  linked_eot_id UUID REFERENCES eot_applications(id),

  notes TEXT,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view milestones" ON contract_milestones FOR SELECT USING (true);
CREATE POLICY "Engineers can manage milestones" ON contract_milestones FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 2. VARIATION ORDERS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS variation_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  vo_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'KES',

  status TEXT DEFAULT 'Proposed',                 -- Proposed, Approved, Rejected, Pending
  approved_date DATE,
  fidic_clause TEXT,                              -- e.g. '13.1', '13.3'

  submitted_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(project_id, vo_no)
);

ALTER TABLE variation_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view VOs" ON variation_orders FOR SELECT USING (true);
CREATE POLICY "Engineers can manage VOs" ON variation_orders FOR ALL USING (true) WITH CHECK (true);

SELECT 'Sprint 5 migration complete — contract_milestones, variation_orders' AS result;
