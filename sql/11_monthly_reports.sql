-- ============================================================
-- RoadSite Reports V14.4 — Monthly Report Support Tables
-- Narratives, Variation Orders, H&S structured tracking
-- ============================================================

-- 1. Monthly report narratives (RE fills in text sections)
CREATE TABLE IF NOT EXISTS monthly_narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_month DATE NOT NULL,  -- first day of month e.g. 2026-08-01
  
  executive_summary TEXT,
  physical_progress_narrative TEXT,
  financial_progress_narrative TEXT,
  quality_narrative TEXT,
  hse_narrative TEXT,
  environmental_narrative TEXT,
  community_narrative TEXT,
  upcoming_month_plan TEXT,
  critical_issues TEXT,
  recommendations TEXT,
  
  prepared_by UUID REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(project_id, report_month)
);

CREATE INDEX IF NOT EXISTS idx_narratives_project ON monthly_narratives(project_id);
CREATE INDEX IF NOT EXISTS idx_narratives_month ON monthly_narratives(report_month);

ALTER TABLE monthly_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_narratives" ON monthly_narratives
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

CREATE POLICY "org_users_view_narratives" ON monthly_narratives
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "re_manage_narratives" ON monthly_narratives
  FOR ALL USING (
    project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid())
  );

-- Auto-set organisation_id
CREATE OR REPLACE FUNCTION set_narrative_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_narrative_org
  BEFORE INSERT OR UPDATE ON monthly_narratives
  FOR EACH ROW EXECUTE FUNCTION set_narrative_org();

-- 2. Variation orders (separate from site instructions)
CREATE TABLE IF NOT EXISTS variation_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vo_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  fidic_clause TEXT DEFAULT 'Cl. 13.1',
  vo_type TEXT DEFAULT 'addition' CHECK (vo_type IN ('addition','omission','substitution','other')),
  status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed','under_review','approved','rejected','implemented')),
  
  estimated_amount NUMERIC(15,2) DEFAULT 0,
  approved_amount NUMERIC(15,2),
  currency TEXT DEFAULT 'KES',
  
  time_impact_days INTEGER DEFAULT 0,
  
  initiated_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  initiated_date DATE DEFAULT CURRENT_DATE,
  approved_date DATE,
  
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vo_project ON variation_orders(project_id);

ALTER TABLE variation_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_vo" ON variation_orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

CREATE POLICY "org_users_view_vo" ON variation_orders
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "pe_manage_vo" ON variation_orders
  FOR ALL USING (
    project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid())
  );

-- Auto-set org
CREATE OR REPLACE FUNCTION set_vo_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vo_org
  BEFORE INSERT ON variation_orders
  FOR EACH ROW EXECUTE FUNCTION set_vo_org();

-- 3. Structured H&S incident tracking
CREATE TABLE IF NOT EXISTS safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'near_miss','first_aid','medical_treatment','lost_time_injury',
    'fatality','property_damage','environmental','fire','other'
  )),
  severity TEXT DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL,
  location TEXT,
  chainage TEXT,
  persons_involved INTEGER DEFAULT 0,
  days_lost INTEGER DEFAULT 0,
  is_lti BOOLEAN DEFAULT false,
  corrective_action TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','closed')),
  reported_by UUID REFERENCES profiles(id),
  organisation_id UUID REFERENCES organisations(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_project ON safety_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_safety_date ON safety_incidents(incident_date);

ALTER TABLE safety_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admin_safety" ON safety_incidents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

CREATE POLICY "org_users_view_safety" ON safety_incidents
  FOR SELECT USING (
    organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "field_staff_safety" ON safety_incidents
  FOR ALL USING (
    project_id IN (SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION set_safety_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_org
  BEFORE INSERT ON safety_incidents
  FOR EACH ROW EXECUTE FUNCTION set_safety_org();
