-- Sprint 4: MPR Reconciliation, Document Register, Quality Test Matrix
-- ═══════════════════════════════════════════════════════════════
-- 1. MONTHLY PROGRESS REPORTS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS monthly_progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  report_month DATE NOT NULL,                    -- First of month
  report_period_start DATE,
  report_period_end DATE,

  contractor_ref TEXT,
  engineer_ref TEXT,

  -- Progress metrics
  physical_progress_pct NUMERIC DEFAULT 0,
  financial_progress_pct NUMERIC DEFAULT 0,
  time_elapsed_pct NUMERIC DEFAULT 0,
  planned_progress_pct NUMERIC DEFAULT 0,

  -- Status workflow
  status TEXT DEFAULT 'Draft',                   -- Draft, Submitted, Under Review, Approved, Rejected
  submitted_date DATE,
  approved_by UUID REFERENCES profiles(id),
  approved_date DATE,

  notes TEXT,
  file_url TEXT,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(project_id, report_month)
);

ALTER TABLE monthly_progress_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view MPRs" ON monthly_progress_reports FOR SELECT USING (true);
CREATE POLICY "Engineers can manage MPRs" ON monthly_progress_reports FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 2. MPR LINE ITEMS (BOQ breakdown per MPR)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mpr_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpr_id UUID NOT NULL REFERENCES monthly_progress_reports(id) ON DELETE CASCADE,

  boq_item_no TEXT NOT NULL,
  description TEXT,
  unit TEXT,

  contract_qty NUMERIC DEFAULT 0,
  previous_qty NUMERIC DEFAULT 0,
  this_period_qty NUMERIC DEFAULT 0,
  cumulative_qty NUMERIC DEFAULT 0,

  contract_rate NUMERIC DEFAULT 0,
  this_period_amount NUMERIC DEFAULT 0,
  cumulative_amount NUMERIC DEFAULT 0,
  physical_pct NUMERIC DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mpr_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view MPR items" ON mpr_line_items FOR SELECT USING (true);
CREATE POLICY "Engineers can manage MPR items" ON mpr_line_items FOR ALL USING (true) WITH CHECK (true);

-- Auto-calculate computed fields
CREATE OR REPLACE FUNCTION calc_mpr_line_item()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cumulative_qty := COALESCE(NEW.previous_qty, 0) + COALESCE(NEW.this_period_qty, 0);
  NEW.this_period_amount := COALESCE(NEW.this_period_qty, 0) * COALESCE(NEW.contract_rate, 0);
  NEW.cumulative_amount := NEW.cumulative_qty * COALESCE(NEW.contract_rate, 0);
  IF COALESCE(NEW.contract_qty, 0) > 0 THEN
    NEW.physical_pct := ROUND((NEW.cumulative_qty / NEW.contract_qty) * 100, 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mpr_line_calc ON mpr_line_items;
CREATE TRIGGER trg_mpr_line_calc
  BEFORE INSERT OR UPDATE ON mpr_line_items
  FOR EACH ROW EXECUTE FUNCTION calc_mpr_line_item();

-- ═══════════════════════════════════════════════════════════════
-- 3. MPR RECONCILIATION (MPR vs Daily Reports comparison)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS mpr_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpr_id UUID NOT NULL REFERENCES monthly_progress_reports(id) ON DELETE CASCADE,

  boq_item_no TEXT NOT NULL,
  mpr_qty NUMERIC DEFAULT 0,
  daily_report_qty NUMERIC DEFAULT 0,
  variance NUMERIC DEFAULT 0,
  variance_pct NUMERIC DEFAULT 0,

  status TEXT DEFAULT 'Unreconciled',            -- Matched, Minor Variance, Major Variance, Unreconciled, Accepted, Flagged
  reviewed_by UUID REFERENCES profiles(id),
  review_notes TEXT,
  reconciled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(mpr_id, boq_item_no)
);

ALTER TABLE mpr_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view reconciliation" ON mpr_reconciliation FOR SELECT USING (true);
CREATE POLICY "Engineers can manage reconciliation" ON mpr_reconciliation FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. CORRESPONDENCE / DOCUMENT REGISTER
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS correspondence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  doc_type TEXT NOT NULL,                         -- Letter, Memo, Site Instruction, Variation Order, Notice, RFI, NCR, Claim, Other
  direction TEXT DEFAULT 'Outgoing',              -- Incoming, Outgoing
  reference_no TEXT,
  subject TEXT NOT NULL,

  from_party TEXT,
  to_party TEXT,
  date_sent DATE,
  date_received DATE,

  -- Response tracking
  response_required BOOLEAN DEFAULT false,
  response_due_date DATE,
  response_received_date DATE,
  ball_in_court TEXT DEFAULT 'Engineer',          -- Engineer, Contractor, Employer, Subcontractor

  status TEXT DEFAULT 'Open',                     -- Open, Responded, Closed, Overdue
  priority TEXT DEFAULT 'Normal',                 -- Normal, Urgent, Critical

  fidic_clause TEXT,
  linked_ipc_no INTEGER,
  linked_eot_no INTEGER,

  summary TEXT,
  notes TEXT,
  file_url TEXT,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE correspondence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view correspondence" ON correspondence FOR SELECT USING (true);
CREATE POLICY "Engineers can manage correspondence" ON correspondence FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. QUALITY TEST MATRIX
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quality_test_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  chainage_from NUMERIC NOT NULL,
  chainage_to NUMERIC NOT NULL,
  pavement_layer TEXT NOT NULL,                   -- Subgrade, Improved Subgrade, Subbase, Base, Binder Course, Wearing Course, Prime Coat, Tack Coat

  test_type TEXT NOT NULL,
  test_ref TEXT,                                  -- RDM/SSRBC reference
  specification_min NUMERIC,
  specification_max NUMERIC,
  specification_unit TEXT,

  test_result NUMERIC,
  test_date DATE,
  tested_by TEXT,
  lab_ref TEXT,
  sample_location TEXT,

  compliance_status TEXT DEFAULT 'Pending',       -- Pass, Fail, Marginal, Pending
  remarks TEXT,
  linked_daily_report_id UUID,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quality_test_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view quality tests" ON quality_test_matrix FOR SELECT USING (true);
CREATE POLICY "Engineers can manage quality tests" ON quality_test_matrix FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 6. QUALITY STANDARDS REFERENCE (Kenya RDM / SSRBC)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS quality_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pavement_layer TEXT NOT NULL,
  test_type TEXT NOT NULL,
  test_name TEXT NOT NULL,
  rdm_reference TEXT,
  ssrbc_reference TEXT,
  specification_min NUMERIC,
  specification_max NUMERIC,
  unit TEXT,
  frequency_requirement TEXT,
  is_active BOOLEAN DEFAULT true,

  UNIQUE(pavement_layer, test_type)
);

ALTER TABLE quality_standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view standards" ON quality_standards FOR SELECT USING (true);
CREATE POLICY "Engineers can manage standards" ON quality_standards FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- 7. SEED KENYA RDM QUALITY STANDARDS
-- ═══════════════════════════════════════════════════════════════
INSERT INTO quality_standards (pavement_layer, test_type, test_name, rdm_reference, ssrbc_reference, specification_min, specification_max, unit, frequency_requirement) VALUES
  -- Subgrade
  ('Subgrade', 'CBR', 'California Bearing Ratio', 'RDM Part III', 'SSRBC Cl. 5', 15, NULL, '%', '1 per 500m or change of material'),
  ('Subgrade', 'MDD', 'Maximum Dry Density', 'RDM Part III', 'SSRBC Cl. 5', NULL, NULL, 'kg/m³', '1 per 500m'),
  ('Subgrade', 'OMC', 'Optimum Moisture Content', 'RDM Part III', 'SSRBC Cl. 5', NULL, NULL, '%', '1 per 500m'),
  ('Subgrade', 'PI', 'Plasticity Index', 'RDM Part III', 'SSRBC Cl. 5', NULL, 25, '%', '1 per 500m'),
  ('Subgrade', 'Swell', 'Swell', 'RDM Part III', 'SSRBC Cl. 5', NULL, 1, '%', '1 per material change'),

  -- Improved Subgrade
  ('Improved Subgrade', 'CBR', 'California Bearing Ratio', 'RDM Part III', 'SSRBC Cl. 5', 30, NULL, '%', '1 per 500m'),
  ('Improved Subgrade', 'PI', 'Plasticity Index', 'RDM Part III', 'SSRBC Cl. 5', NULL, 15, '%', '1 per 500m'),
  ('Improved Subgrade', 'Swell', 'Swell', 'RDM Part III', 'SSRBC Cl. 5', NULL, 0.5, '%', '1 per material change'),

  -- Subbase
  ('Subbase', 'CBR', 'California Bearing Ratio', 'RDM Part III', 'SSRBC Cl. 10', 30, NULL, '%', '1 per 500m'),
  ('Subbase', 'PI', 'Plasticity Index', 'RDM Part III', 'SSRBC Cl. 10', NULL, 12, '%', '1 per 500m'),
  ('Subbase', 'GM', 'Grading Modulus', 'RDM Part III', 'SSRBC Cl. 10', 1.5, 2.5, '', '1 per source'),

  -- Base (GCS)
  ('Base', 'CBR', 'California Bearing Ratio', 'RDM Part III', 'SSRBC Cl. 11', 80, NULL, '%', '1 per 500m'),
  ('Base', 'ACV', 'Aggregate Crushing Value', 'RDM Part III', 'SSRBC Cl. 11', NULL, 29, '%', '1 per source'),
  ('Base', 'LAA', 'Los Angeles Abrasion', 'RDM Part III', 'SSRBC Cl. 11', NULL, 45, '%', '1 per source'),
  ('Base', 'PI', 'Plasticity Index', 'RDM Part III', 'SSRBC Cl. 11', NULL, 6, '%', '1 per 500m'),
  ('Base', 'FI', 'Flakiness Index', 'RDM Part III', 'SSRBC Cl. 11', NULL, 30, '%', '1 per source'),

  -- Wearing Course (AC)
  ('Wearing Course', 'Marshall Stability', 'Marshall Stability', 'RDM Part III', 'SSRBC Cl. 16', 9, NULL, 'kN', '1 per 500 tonnes'),
  ('Wearing Course', 'Marshall Flow', 'Marshall Flow', 'RDM Part III', 'SSRBC Cl. 16', 2, 4, 'mm', '1 per 500 tonnes'),
  ('Wearing Course', 'Air Voids', 'Air Voids', 'RDM Part III', 'SSRBC Cl. 16', 3, 5, '%', '1 per 500 tonnes'),
  ('Wearing Course', 'VMA', 'Voids in Mineral Aggregate', 'RDM Part III', 'SSRBC Cl. 16', 14, NULL, '%', '1 per 500 tonnes'),
  ('Wearing Course', 'Bitumen Content', 'Bitumen Content', 'RDM Part III', 'SSRBC Cl. 16', 5, 7, '%', '1 per 500 tonnes'),
  ('Wearing Course', 'Core Density', 'Core Density', 'RDM Part III', 'SSRBC Cl. 16', 95, NULL, '% Marshall', '1 per 250m per lane')
ON CONFLICT (pavement_layer, test_type) DO NOTHING;

SELECT 'Sprint 4 migration complete — MPR, correspondence, quality_test_matrix, quality_standards' AS result;
