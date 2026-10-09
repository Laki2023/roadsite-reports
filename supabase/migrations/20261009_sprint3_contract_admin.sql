-- Sprint 3: Contract Administration Enhancement
-- IPC Lifecycle Deadlines, Guarantee Register, Extension of Time Tracker

-- ═══════════════════════════════════════════════════════════════
-- 1. IPC CERTIFICATES — Add FIDIC deadline columns
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS certification_due_date DATE;
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS financing_charges NUMERIC DEFAULT 0;
ALTER TABLE ipc_certificates ADD COLUMN IF NOT EXISTS financing_charges_rate NUMERIC DEFAULT 3;  -- % above CBK base rate per FIDIC 14.8

-- Auto-calculate due dates trigger
CREATE OR REPLACE FUNCTION calc_ipc_due_dates()
RETURNS TRIGGER AS $$
BEGIN
  -- FIDIC Cl. 14.6: Engineer shall certify within 28 days of receiving contractor's statement
  IF NEW.contractor_submitted_date IS NOT NULL AND NEW.certification_due_date IS NULL THEN
    NEW.certification_due_date := NEW.contractor_submitted_date + INTERVAL '28 days';
  END IF;
  -- FIDIC Cl. 14.7: Employer shall pay within 56 days of contractor's statement
  IF NEW.contractor_submitted_date IS NOT NULL AND NEW.payment_due_date IS NULL THEN
    NEW.payment_due_date := NEW.contractor_submitted_date + INTERVAL '56 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ipc_due_dates ON ipc_certificates;
CREATE TRIGGER trg_ipc_due_dates
  BEFORE INSERT OR UPDATE ON ipc_certificates
  FOR EACH ROW
  EXECUTE FUNCTION calc_ipc_due_dates();

-- Backfill existing IPCs
UPDATE ipc_certificates
SET certification_due_date = contractor_submitted_date + INTERVAL '28 days',
    payment_due_date = contractor_submitted_date + INTERVAL '56 days'
WHERE contractor_submitted_date IS NOT NULL
  AND certification_due_date IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. GUARANTEE & SECURITY REGISTER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS guarantee_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Type: performance_bond, advance_payment_guarantee, retention_guarantee,
  --       bid_bond, parent_company_guarantee, insurance_policy, other
  guarantee_type TEXT NOT NULL,

  -- Details
  reference_no TEXT,
  description TEXT NOT NULL,
  issuing_institution TEXT NOT NULL,     -- Bank / Insurance Co
  beneficiary TEXT DEFAULT 'Employer',

  -- Amounts
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'KES',

  -- Dates
  issue_date DATE NOT NULL,
  effective_date DATE,
  expiry_date DATE NOT NULL,
  extended_to DATE,                      -- If extended

  -- FIDIC clause reference
  fidic_clause TEXT,                      -- e.g. '4.2' for Performance Security

  -- Status tracking
  status TEXT DEFAULT 'Active',           -- Active, Expired, Released, Renewed, Called
  released_date DATE,
  released_by UUID REFERENCES profiles(id),

  -- Alert settings
  alert_days_before INTEGER DEFAULT 60,   -- Days before expiry to start alerting

  -- Attachments / notes
  notes TEXT,

  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE guarantee_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view guarantees for their projects"
  ON guarantee_register FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects
      WHERE id = guarantee_register.project_id
    )
  );

CREATE POLICY "Engineers can manage guarantees"
  ON guarantee_register FOR ALL
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 3. EXTENSION OF TIME (EoT) TRACKER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS eot_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- EoT details
  eot_no INTEGER NOT NULL,
  title TEXT NOT NULL,                    -- Brief description

  -- FIDIC Cl. 8.4 grounds
  grounds TEXT NOT NULL,                  -- cause_of_delay / entitlement basis
  fidic_clause TEXT,                      -- e.g. '8.4(a)', '8.4(b)', '8.4(c)', '8.4(d)', '8.4(e)'

  -- Dates
  event_date DATE,                        -- When the delay event occurred
  notice_date DATE,                       -- Date contractor gave notice (FIDIC 20.1 — 28-day notice)
  notice_due_date DATE,                   -- event_date + 28 days
  application_date DATE,                  -- Full claim submitted

  -- Duration
  days_claimed INTEGER NOT NULL,          -- Days of extension claimed
  days_granted INTEGER,                   -- Days actually granted by Engineer

  -- Determination
  engineer_determination_date DATE,
  engineer_determination_ref TEXT,
  determination_notes TEXT,

  -- Impact on programme
  original_completion_date DATE,
  revised_completion_date DATE,           -- After this EoT

  -- Cost (FIDIC Cl. 8.4 — some grounds entitle cost too)
  cost_claimed NUMERIC DEFAULT 0,
  cost_awarded NUMERIC DEFAULT 0,

  -- Status: Draft, Notice Given, Applied, Under Review, Granted, Partially Granted, Rejected, Withdrawn
  status TEXT DEFAULT 'Draft',

  -- Supporting documents / notes
  supporting_details TEXT,
  notes TEXT,

  -- Audit
  submitted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(project_id, eot_no)
);

ALTER TABLE eot_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view EoT for their projects"
  ON eot_applications FOR SELECT
  USING (true);

CREATE POLICY "Engineers can manage EoT"
  ON eot_applications FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-calculate notice due date
CREATE OR REPLACE FUNCTION calc_eot_notice_due()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_date IS NOT NULL AND NEW.notice_due_date IS NULL THEN
    NEW.notice_due_date := NEW.event_date + INTERVAL '28 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eot_notice_due ON eot_applications;
CREATE TRIGGER trg_eot_notice_due
  BEFORE INSERT OR UPDATE ON eot_applications
  FOR EACH ROW
  EXECUTE FUNCTION calc_eot_notice_due();

SELECT 'Sprint 3 migration complete — IPC deadlines, guarantee_register, eot_applications' AS result;
