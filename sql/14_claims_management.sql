-- ============================================================
-- RoadSite Reports V14.7 — Claims Management
-- Auto-detection of claim triggers, FIDIC-aligned workflow,
-- notification chain RE → PE → Engineer → SA
-- ============================================================

-- 1. Claims register
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Identification
  claim_number TEXT NOT NULL,  -- auto-generated: CLM-001, CLM-002
  title TEXT NOT NULL,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'eot',              -- Extension of Time
    'cost',             -- Additional Cost
    'eot_and_cost',     -- Both EOT and Cost
    'interest',         -- Interest on Late Payment
    'variation',        -- Variation Order claim
    'force_majeure'     -- Force Majeure
  )),
  
  -- FIDIC clause basis
  fidic_clause TEXT NOT NULL,     -- e.g. 'Cl. 8.4', 'Cl. 14.8'
  fidic_sub_clause TEXT,          -- e.g. '(c) exceptionally adverse climatic conditions'
  copa_clause TEXT,               -- Conditions of Particular Application reference
  
  -- Claim details
  description TEXT,
  justification TEXT,             -- Contractual basis narrative
  impact_description TEXT,        -- How it affected the works
  
  -- EOT details
  eot_days_claimed INTEGER DEFAULT 0,
  eot_days_awarded INTEGER,
  original_completion_date DATE,
  revised_completion_date DATE,
  
  -- Cost details
  cost_claimed NUMERIC(15,2) DEFAULT 0,
  cost_awarded NUMERIC(15,2),
  currency TEXT DEFAULT 'KES',
  
  -- Event period
  event_start_date DATE,
  event_end_date DATE,
  
  -- FIDIC Cl. 20.1 compliance
  notice_date DATE,              -- Date of 28-day notice
  notice_deadline DATE,          -- 28 days from event (auto-calculated)
  detailed_claim_date DATE,      -- Date detailed claim submitted
  detailed_claim_deadline DATE,  -- 42 days from notice
  is_time_barred BOOLEAN DEFAULT false,
  
  -- Workflow
  status TEXT DEFAULT 'detected' CHECK (status IN (
    'detected',         -- Auto-detected by system
    'notified',         -- RE has issued 28-day notice
    'under_preparation', -- Claim being prepared
    'submitted',        -- Submitted to Engineer
    'under_review',     -- Engineer reviewing
    'additional_info',  -- Engineer requests more info
    'partially_approved',
    'approved',
    'rejected',
    'withdrawn',
    'time_barred'       -- Missed 28-day notice deadline
  )),
  
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  
  -- Auto-detection
  auto_detected BOOLEAN DEFAULT false,
  detection_rule TEXT,            -- which rule triggered it
  trigger_data JSONB,             -- supporting data from daily reports
  
  -- Assignment
  prepared_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  
  -- Audit
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claims_project ON claims(project_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(claim_type);
CREATE INDEX IF NOT EXISTS idx_claims_org ON claims(organisation_id);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_claims" ON claims
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "org_users_view_claims" ON claims
  FOR SELECT USING (organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "project_users_manage_claims" ON claims
  FOR ALL USING (project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()));

-- Auto-set org + deadlines
CREATE OR REPLACE FUNCTION process_claim()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Set organisation
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  
  -- Calculate FIDIC Cl. 20.1 deadlines
  IF NEW.event_start_date IS NOT NULL THEN
    NEW.notice_deadline = NEW.event_start_date + INTERVAL '28 days';
    IF NEW.notice_date IS NOT NULL THEN
      NEW.detailed_claim_deadline = NEW.notice_date + INTERVAL '42 days';
    END IF;
  END IF;
  
  -- Check if time-barred
  IF NEW.notice_deadline IS NOT NULL AND NEW.notice_date IS NULL AND NEW.notice_deadline < CURRENT_DATE THEN
    NEW.is_time_barred = true;
    NEW.status = 'time_barred';
  END IF;
  
  -- Auto-generate claim number
  IF NEW.claim_number IS NULL OR NEW.claim_number = '' THEN
    SELECT 'CLM-' || LPAD((COALESCE(MAX(SUBSTRING(claim_number FROM 5)::integer), 0) + 1)::text, 3, '0')
    INTO NEW.claim_number
    FROM claims WHERE project_id = NEW.project_id;
  END IF;
  
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_process_claim
  BEFORE INSERT OR UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION process_claim();

-- 2. Claim supporting events (evidence from daily reports)
CREATE TABLE IF NOT EXISTS claim_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN (
    'rain_day', 'equipment_idle', 'instruction_delay', 'access_delay',
    'late_payment', 'ground_conditions', 'force_majeure', 'variation_issued',
    'suspension', 'design_change', 'utility_relocation', 'third_party_delay',
    'material_shortage', 'labour_disruption', 'other'
  )),
  
  event_date DATE NOT NULL,
  description TEXT,
  
  -- Link to source records
  report_id UUID REFERENCES daily_reports(id),
  issue_id UUID REFERENCES site_issues(id),
  instruction_id UUID REFERENCES site_instructions(id),
  ipc_id UUID REFERENCES interim_payment_certificates(id),
  
  -- Impact
  days_lost NUMERIC(4,1) DEFAULT 0,
  cost_impact NUMERIC(15,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_events_claim ON claim_events(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_events_date ON claim_events(event_date);

ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_claim_events" ON claim_events
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "project_users_claim_events" ON claim_events
  FOR ALL USING (project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()));

-- 3. Claim notifications (alert chain)
CREATE TABLE IF NOT EXISTS claim_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  recipient_id UUID NOT NULL REFERENCES profiles(id),
  recipient_role TEXT,
  
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'claim_detected',      -- New auto-detected claim
    'notice_due',          -- 28-day notice deadline approaching
    'notice_overdue',      -- Missed 28-day deadline
    'claim_submitted',     -- Claim submitted for review
    'review_required',     -- Engineer needs to review
    'additional_info',     -- More info requested
    'claim_decided',       -- Decision made
    'escalated'            -- Escalated up the chain
  )),
  
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  is_urgent BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_notif_recipient ON claim_notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_claim_notif_claim ON claim_notifications(claim_id);

ALTER TABLE claim_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_notifications" ON claim_notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "platform_admin_notifications" ON claim_notifications
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

CREATE POLICY "project_users_insert_notif" ON claim_notifications
  FOR INSERT WITH CHECK (
    project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid())
  );

-- 4. FIDIC clause reference table (pre-populated)
CREATE TABLE IF NOT EXISTS fidic_claim_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_ref TEXT NOT NULL UNIQUE,
  clause_title TEXT NOT NULL,
  claim_type TEXT,
  description TEXT,
  notice_required BOOLEAN DEFAULT true,
  notice_period_days INTEGER DEFAULT 28,
  typical_trigger TEXT,
  fidic_edition TEXT DEFAULT '1999 Red Book'
);

INSERT INTO fidic_claim_clauses (clause_ref, clause_title, claim_type, description, typical_trigger) VALUES
  ('Cl. 1.9', 'Delayed Drawings or Instructions', 'eot_and_cost', 'Engineer fails to issue drawings/instructions in time', 'Instruction not received when needed'),
  ('Cl. 2.1', 'Right of Access to the Site', 'eot_and_cost', 'Employer fails to give right of access or possession', 'Access delay to site/sections'),
  ('Cl. 4.7', 'Setting Out', 'cost', 'Errors in reference points/levels provided by Employer', 'Survey errors from Employer data'),
  ('Cl. 4.12', 'Unforeseeable Physical Conditions', 'eot_and_cost', 'Physical conditions not reasonably foreseeable', 'Unexpected ground/rock/water'),
  ('Cl. 4.24', 'Fossils', 'eot_and_cost', 'Discovery of fossils, antiquities etc.', 'Archaeological finds on site'),
  ('Cl. 7.4', 'Testing', 'eot_and_cost', 'Additional testing beyond contract requirements', 'Engineer orders extra tests'),
  ('Cl. 8.4', 'Extension of Time for Completion', 'eot', 'Entitlement to EOT for listed causes', 'Variations, weather, Employer delays'),
  ('Cl. 8.4(a)', 'Variation or Substantial Change in Quantities', 'eot', 'Clause 13 variation affecting completion', 'Major variation order issued'),
  ('Cl. 8.4(b)', 'Cause of Delay giving Entitlement to EOT', 'eot', 'A cause of delay under a Sub-Clause of Conditions', 'Any entitled delay event'),
  ('Cl. 8.4(c)', 'Exceptionally Adverse Climatic Conditions', 'eot', 'Weather worse than reasonably foreseeable', 'Excessive rain/flood events'),
  ('Cl. 8.4(d)', 'Unforeseeable Shortages', 'eot', 'Unforeseeable shortage of personnel or Goods', 'Supply chain disruption'),
  ('Cl. 8.4(e)', 'Delay/Disruption by Employer', 'eot', 'Delay, impediment or prevention by Employer', 'Employer-caused disruption'),
  ('Cl. 8.9', 'Consequences of Suspension', 'eot_and_cost', 'Suspension ordered by Engineer', 'Works suspended by instruction'),
  ('Cl. 10.3', 'Interference with Tests on Completion', 'eot_and_cost', 'Tests delayed by Employer actions', 'Testing interference'),
  ('Cl. 12.2', 'Unforeseeable Sub-Surface Conditions', 'eot_and_cost', 'Sub-surface conditions differ from available data', 'Rock, water table, contamination'),
  ('Cl. 13.1', 'Right to Vary', 'eot_and_cost', 'Engineer issues variation instruction', 'Variation order issued'),
  ('Cl. 13.7', 'Adjustments for Changes in Legislation', 'cost', 'Changes in law after Base Date', 'New tax, regulation, or law'),
  ('Cl. 14.8', 'Delayed Payment', 'interest', 'Payment not made within 56 days of IPC', 'Late IPC payment'),
  ('Cl. 16.1', 'Contractor''s Entitlement to Suspend Work', 'eot_and_cost', 'Non-payment for 42+ days', 'Prolonged non-payment'),
  ('Cl. 17.3', 'Employer''s Risks', 'eot_and_cost', 'Loss/damage from Employer risk events', 'War, riot, contamination, design error'),
  ('Cl. 19.4', 'Consequences of Force Majeure', 'eot_and_cost', 'Force Majeure event occurs', 'Earthquake, epidemic, government action'),
  ('Cl. 20.1', 'Contractor''s Claims', 'eot_and_cost', 'General claims procedure — 28-day notice requirement', 'Any contractual claim event')
ON CONFLICT (clause_ref) DO NOTHING;
