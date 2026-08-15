-- ============================================================
-- RoadSite Reports V14.8 — Revised Contract Details
-- Track original vs revised completion dates and contract sum
-- ============================================================

-- Add revised contract fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_contract_sum NUMERIC(15,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revised_contract_sum NUMERIC(15,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_completion_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revised_completion_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS original_contract_period INTEGER; -- days
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revised_contract_period INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_eot_awarded INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_variations_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS commencement_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS defects_liability_period INTEGER DEFAULT 365; -- days
ALTER TABLE projects ADD COLUMN IF NOT EXISTS fidic_edition TEXT DEFAULT '1999 Red Book';

-- Contract amendments log
CREATE TABLE IF NOT EXISTS contract_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amendment_number INTEGER NOT NULL,
  amendment_type TEXT NOT NULL CHECK (amendment_type IN (
    'eot_award', 'variation_order', 'price_adjustment',
    'addendum', 'supplementary_agreement', 'other'
  )),
  title TEXT NOT NULL,
  description TEXT,
  fidic_clause TEXT,
  
  -- Changes
  eot_days INTEGER DEFAULT 0,
  cost_increase NUMERIC(15,2) DEFAULT 0,
  cost_decrease NUMERIC(15,2) DEFAULT 0,
  previous_completion_date DATE,
  new_completion_date DATE,
  previous_contract_sum NUMERIC(15,2),
  new_contract_sum NUMERIC(15,2),
  
  effective_date DATE DEFAULT CURRENT_DATE,
  approved_by UUID REFERENCES profiles(id),
  
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE contract_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_amendments" ON contract_amendments
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));
CREATE POLICY "org_view_amendments" ON contract_amendments
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "project_manage_amendments" ON contract_amendments
  FOR ALL USING (project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION set_amendment_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_amendment_org BEFORE INSERT ON contract_amendments
  FOR EACH ROW EXECUTE FUNCTION set_amendment_org();

-- Auto-update project revised fields when amendment is added
CREATE OR REPLACE FUNCTION update_project_from_amendment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Update revised completion date
  IF NEW.new_completion_date IS NOT NULL THEN
    UPDATE projects SET revised_completion_date = NEW.new_completion_date WHERE id = NEW.project_id;
  END IF;
  
  -- Update revised contract sum
  IF NEW.new_contract_sum IS NOT NULL THEN
    UPDATE projects SET revised_contract_sum = NEW.new_contract_sum WHERE id = NEW.project_id;
  END IF;
  
  -- Update total EOT awarded
  IF NEW.eot_days > 0 THEN
    UPDATE projects SET total_eot_awarded = COALESCE(total_eot_awarded, 0) + NEW.eot_days WHERE id = NEW.project_id;
  END IF;
  
  -- Update total variations amount
  IF NEW.cost_increase > 0 OR NEW.cost_decrease > 0 THEN
    UPDATE projects SET total_variations_amount = COALESCE(total_variations_amount, 0) + COALESCE(NEW.cost_increase, 0) - COALESCE(NEW.cost_decrease, 0) WHERE id = NEW.project_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_project_amendment
  AFTER INSERT ON contract_amendments
  FOR EACH ROW EXECUTE FUNCTION update_project_from_amendment();
