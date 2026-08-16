-- ═══════════════════════════════════════════════════════════════
-- V15.8: CIT Assessment Workflow
-- Run Step 1 first, then Step 2
-- ═══════════════════════════════════════════════════════════════

-- CIT Assessments table
CREATE TABLE IF NOT EXISTS cit_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assessment_number TEXT,

  -- CIT Team
  cit_members JSONB DEFAULT '[]',
  assessment_date DATE DEFAULT CURRENT_DATE,

  -- Contractor's position
  contractor_eot_claimed INTEGER DEFAULT 0,
  contractor_cost_claimed NUMERIC DEFAULT 0,
  contractor_particulars TEXT,

  -- CIT event-by-event analysis
  event_analysis JSONB DEFAULT '[]',

  -- CIT findings and recommendation
  findings TEXT,
  recommendation TEXT,
  cit_eot_recommended INTEGER DEFAULT 0,
  cit_cost_recommended NUMERIC DEFAULT 0,
  recommendation_basis TEXT,

  -- Engineer's Determination (FIDIC Cl. 3.5)
  engineer_determination TEXT,
  determination_date DATE,
  determination_eot INTEGER DEFAULT 0,
  determination_cost NUMERIC DEFAULT 0,
  determination_status TEXT DEFAULT 'draft' CHECK (determination_status IN ('draft','cit_review','cit_complete','determination_issued')),

  -- Metadata
  prepared_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  determined_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cit_assessments_claim ON cit_assessments(claim_id);
CREATE INDEX IF NOT EXISTS idx_cit_assessments_project ON cit_assessments(project_id);

-- RLS
ALTER TABLE cit_assessments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Auth users can read CIT assessments" ON cit_assessments FOR SELECT USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth users can insert CIT assessments" ON cit_assessments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth users can update CIT assessments" ON cit_assessments FOR UPDATE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Auth users can delete CIT assessments" ON cit_assessments FOR DELETE USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add CIT fields to claims table
ALTER TABLE claims ADD COLUMN IF NOT EXISTS cit_status TEXT DEFAULT 'pending';
ALTER TABLE claims ADD COLUMN IF NOT EXISTS cit_assessment_id UUID REFERENCES cit_assessments(id);
ALTER TABLE claims ADD COLUMN IF NOT EXISTS determination_date DATE;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS eot_days_awarded INTEGER DEFAULT 0;
ALTER TABLE claims ADD COLUMN IF NOT EXISTS cost_awarded NUMERIC DEFAULT 0;

SELECT 'V15.8 CIT assessments table created with RLS and claims columns added' AS result;
