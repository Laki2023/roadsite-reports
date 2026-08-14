-- ============================================================
-- RoadSite Reports V14.3 — Photo Attachments
-- Site photos on daily reports with Supabase Storage
-- ============================================================

-- 1. Create report_photos table
CREATE TABLE IF NOT EXISTS report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_id UUID REFERENCES daily_reports(id) ON DELETE SET NULL,
  
  -- Photo metadata
  file_path TEXT NOT NULL,          -- Supabase Storage path
  file_name TEXT NOT NULL,          -- Original filename
  file_size INTEGER,                -- Bytes
  mime_type TEXT DEFAULT 'image/jpeg',
  
  -- Context: which wizard step / category
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'general',           -- Step 8: general site photos
    'works_progress',    -- Step 3: works activities
    'equipment',         -- Step 4: equipment status
    'quality_test',      -- Step 5: quality tests / materials
    'structure',         -- Step 6: structures
    'issue',             -- Step 7: site issues
    'instruction',       -- Step 7: site instructions
    'safety',            -- Safety incidents
    'weather',           -- Step 1: weather conditions
    'before_after'       -- Before/after comparison
  )),
  
  -- Location context
  chainage TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  
  -- Description
  caption TEXT,
  tags TEXT[],                      -- e.g. {'pothole','subbase','failure'}
  
  -- Audit
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  photo_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Organisation scope
  organisation_id UUID REFERENCES organisations(id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_photos_project ON report_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_photos_report ON report_photos(report_id);
CREATE INDEX IF NOT EXISTS idx_photos_category ON report_photos(category);
CREATE INDEX IF NOT EXISTS idx_photos_date ON report_photos(photo_date);
CREATE INDEX IF NOT EXISTS idx_photos_org ON report_photos(organisation_id);

-- 3. RLS
ALTER TABLE report_photos ENABLE ROW LEVEL SECURITY;

-- Platform admin sees all
CREATE POLICY "platform_admin_photos_all" ON report_photos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
  );

-- Org-scoped read: users see photos in their org
CREATE POLICY "org_users_view_photos" ON report_photos
  FOR SELECT USING (
    organisation_id IN (
      SELECT organisation_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Project-scoped read: users assigned to project can view
CREATE POLICY "project_users_view_photos" ON report_photos
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()
    )
  );

-- Insert: inspector and above on assigned projects
CREATE POLICY "field_staff_upload_photos" ON report_photos
  FOR INSERT WITH CHECK (
    auth.uid() = uploaded_by
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true)
      OR project_id IN (
        SELECT project_id FROM project_role_assignments WHERE user_id = auth.uid()
      )
    )
  );

-- Delete: RE and above, or own photos
CREATE POLICY "delete_own_or_re_photos" ON report_photos
  FOR DELETE USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND (is_platform_admin = true OR role IN ('resident_engineer','project_engineer','engineer','super_admin','director_general'))
    )
  );

-- 4. Auto-set organisation_id from project
CREATE OR REPLACE FUNCTION set_photo_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_photo_org
  BEFORE INSERT ON report_photos
  FOR EACH ROW EXECUTE FUNCTION set_photo_org();

-- 5. Storage bucket setup (run in Supabase Dashboard > Storage)
-- Create bucket: 'site-photos' (public: false)
-- 
-- Then run these storage policies in SQL Editor:
--
-- INSERT INTO storage.buckets (id, name, public) 
-- VALUES ('site-photos', 'site-photos', false)
-- ON CONFLICT (id) DO NOTHING;
--
-- CREATE POLICY "Authenticated users can upload photos"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'site-photos');
--
-- CREATE POLICY "Users can view photos in their org"
-- ON storage.objects FOR SELECT TO authenticated
-- USING (bucket_id = 'site-photos');
--
-- CREATE POLICY "Users can delete own photos"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (bucket_id = 'site-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 6. Helper: count photos per report
CREATE OR REPLACE FUNCTION get_report_photo_count(report_uuid UUID)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::integer FROM report_photos WHERE report_id = report_uuid;
$$;
