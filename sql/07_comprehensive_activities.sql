-- ============================================================
-- RoadSite Reports — Comprehensive Activity Seeding
-- Based on Kenya RDM, Standard Specification for Road & Bridge
-- Construction, and FIDIC contract administration requirements
-- ============================================================

-- Drop existing function and recreate with comprehensive activities
CREATE OR REPLACE FUNCTION seed_project_activities(p_project_id UUID, p_category TEXT DEFAULT 'Construction')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sort INT := 0;
BEGIN
  -- Don't re-seed if activities already exist
  IF EXISTS (SELECT 1 FROM works_activities WHERE project_id = p_project_id LIMIT 1) THEN
    RAISE NOTICE 'Activities already exist for this project';
    RETURN;
  END IF;

  IF p_category = 'Construction' THEN
    -- ══════════════════════════════════════════════════
    -- NEW ROAD CONSTRUCTION — 80+ critical activities
    -- ══════════════════════════════════════════════════

    -- 1. PRELIMINARY & GENERAL
    v_sort := 100;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Preliminary', 'Site Establishment & Mobilisation', 'PG-001', 'LS', 1, v_sort, true),
      (p_project_id, 'Preliminary', 'Setting Out & Survey Control', 'PG-002', 'KM', 0, v_sort+1, true),
      (p_project_id, 'Preliminary', 'Traffic Management & Diversions', 'PG-003', 'LS', 1, v_sort+2, true),
      (p_project_id, 'Preliminary', 'Environmental & Social Management Plan', 'PG-004', 'LS', 1, v_sort+3, true),
      (p_project_id, 'Preliminary', 'Land Acquisition & Wayleave Clearance', 'PG-005', 'LS', 1, v_sort+4, true),
      (p_project_id, 'Preliminary', 'Utility Relocations', 'PG-006', 'LS', 1, v_sort+5, false),
      (p_project_id, 'Preliminary', 'Site Clearance & Demolition', 'PG-007', 'Ha', 0, v_sort+6, true),
      (p_project_id, 'Preliminary', 'Establishment of Borrow Pits & Quarries', 'PG-008', 'No', 0, v_sort+7, true);

    -- 2. EARTHWORKS
    v_sort := 200;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Earthworks', 'Topsoil Stripping & Stockpiling', 'EW-001', 'M3', 0, v_sort, true),
      (p_project_id, 'Earthworks', 'Common Excavation (Cut)', 'EW-002', 'M3', 0, v_sort+1, true),
      (p_project_id, 'Earthworks', 'Rock Excavation', 'EW-003', 'M3', 0, v_sort+2, false),
      (p_project_id, 'Earthworks', 'Fill from Excavation', 'EW-004', 'M3', 0, v_sort+3, true),
      (p_project_id, 'Earthworks', 'Imported Fill (Borrow)', 'EW-005', 'M3', 0, v_sort+4, true),
      (p_project_id, 'Earthworks', 'Subgrade Preparation & Compaction', 'EW-006', 'M2', 0, v_sort+5, true),
      (p_project_id, 'Earthworks', 'Subgrade Improvement (Lime/Cement)', 'EW-007', 'M2', 0, v_sort+6, false),
      (p_project_id, 'Earthworks', 'Benching for Widening', 'EW-008', 'M2', 0, v_sort+7, false),
      (p_project_id, 'Earthworks', 'Slope Protection & Trimming', 'EW-009', 'M2', 0, v_sort+8, false),
      (p_project_id, 'Earthworks', 'Spoil Disposal', 'EW-010', 'M3', 0, v_sort+9, false);

    -- 3. DRAINAGE
    v_sort := 300;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Drainage', 'Side Drains (Lined/Unlined)', 'DR-001', 'LM', 0, v_sort, true),
      (p_project_id, 'Drainage', 'Mitre Drains', 'DR-002', 'LM', 0, v_sort+1, false),
      (p_project_id, 'Drainage', 'Catch Water Drains', 'DR-003', 'LM', 0, v_sort+2, false),
      (p_project_id, 'Drainage', 'Pipe Culverts (450mm–900mm)', 'DR-004', 'LM', 0, v_sort+3, true),
      (p_project_id, 'Drainage', 'Box Culverts', 'DR-005', 'No', 0, v_sort+4, true),
      (p_project_id, 'Drainage', 'Headwalls & Wingwalls', 'DR-006', 'No', 0, v_sort+5, true),
      (p_project_id, 'Drainage', 'Scour Protection & Aprons', 'DR-007', 'M2', 0, v_sort+6, false),
      (p_project_id, 'Drainage', 'Gabion Protection Works', 'DR-008', 'M3', 0, v_sort+7, false),
      (p_project_id, 'Drainage', 'Subsoil Drainage', 'DR-009', 'LM', 0, v_sort+8, false),
      (p_project_id, 'Drainage', 'Drifts / Causeways', 'DR-010', 'No', 0, v_sort+9, false);

    -- 4. PAVEMENT LAYERS
    v_sort := 400;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Pavement', 'Subbase (Natural Gravel — GCS)', 'PV-001', 'M3', 0, v_sort, true),
      (p_project_id, 'Pavement', 'Subbase (Cement Improved)', 'PV-002', 'M3', 0, v_sort+1, false),
      (p_project_id, 'Pavement', 'Base Course (Natural Gravel — GCB)', 'PV-003', 'M3', 0, v_sort+2, true),
      (p_project_id, 'Pavement', 'Base Course (Cement Stabilised)', 'PV-004', 'M3', 0, v_sort+3, false),
      (p_project_id, 'Pavement', 'Prime Coat (MC-30 / MC-70)', 'PV-005', 'M2', 0, v_sort+4, true),
      (p_project_id, 'Pavement', 'Tack Coat (K1-60)', 'PV-006', 'M2', 0, v_sort+5, true),
      (p_project_id, 'Pavement', 'Dense Bitumen Macadam (DBM)', 'PV-007', 'M3', 0, v_sort+6, true),
      (p_project_id, 'Pavement', 'Asphalt Concrete (AC) Wearing Course', 'PV-008', 'M3', 0, v_sort+7, true),
      (p_project_id, 'Pavement', 'Surface Dressing (Single/Double)', 'PV-009', 'M2', 0, v_sort+8, false),
      (p_project_id, 'Pavement', 'Shoulder Gravel', 'PV-010', 'M3', 0, v_sort+9, true),
      (p_project_id, 'Pavement', 'Cement Concrete Pavement (Rigid)', 'PV-011', 'M3', 0, v_sort+10, false);

    -- 5. STRUCTURES (BRIDGES)
    v_sort := 500;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Structures', 'Bridge Piling / Foundation', 'ST-001', 'No', 0, v_sort, true),
      (p_project_id, 'Structures', 'Bridge Substructure (Abutments & Piers)', 'ST-002', 'M3', 0, v_sort+1, true),
      (p_project_id, 'Structures', 'Bridge Superstructure (Deck & Beams)', 'ST-003', 'M3', 0, v_sort+2, true),
      (p_project_id, 'Structures', 'Bridge Bearings & Expansion Joints', 'ST-004', 'No', 0, v_sort+3, true),
      (p_project_id, 'Structures', 'Bridge Approach Slabs', 'ST-005', 'M3', 0, v_sort+4, false),
      (p_project_id, 'Structures', 'Retaining Walls (RC / Masonry)', 'ST-006', 'M3', 0, v_sort+5, false),
      (p_project_id, 'Structures', 'Pedestrian Underpass / Overpass', 'ST-007', 'No', 0, v_sort+6, false);

    -- 6. ROAD FURNITURE & SAFETY
    v_sort := 600;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Road Furniture', 'Road Markings (Thermoplastic)', 'RF-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Road Furniture', 'Road Signs (Warning/Regulatory/Guide)', 'RF-002', 'No', 0, v_sort+1, true),
      (p_project_id, 'Road Furniture', 'Guardrails / Safety Barriers', 'RF-003', 'LM', 0, v_sort+2, true),
      (p_project_id, 'Road Furniture', 'Kilometre Posts & Marker Posts', 'RF-004', 'No', 0, v_sort+3, false),
      (p_project_id, 'Road Furniture', 'Rumble Strips / Speed Humps', 'RF-005', 'No', 0, v_sort+4, false),
      (p_project_id, 'Road Furniture', 'Kerbs & Channels (Concrete)', 'RF-006', 'LM', 0, v_sort+5, true),
      (p_project_id, 'Road Furniture', 'Footpaths / Walkways', 'RF-007', 'M2', 0, v_sort+6, false),
      (p_project_id, 'Road Furniture', 'Bus Bays & Laybys', 'RF-008', 'No', 0, v_sort+7, false),
      (p_project_id, 'Road Furniture', 'Road Studs / Cat Eyes', 'RF-009', 'No', 0, v_sort+8, false),
      (p_project_id, 'Road Furniture', 'Street Lighting', 'RF-010', 'No', 0, v_sort+9, false);

    -- 7. ENVIRONMENTAL
    v_sort := 700;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Environmental', 'Grass Seeding / Turfing (Slopes)', 'EN-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Environmental', 'Tree Planting', 'EN-002', 'No', 0, v_sort+1, false),
      (p_project_id, 'Environmental', 'Reinstatement of Borrow Pits', 'EN-003', 'LS', 1, v_sort+2, true),
      (p_project_id, 'Environmental', 'Erosion Control Measures', 'EN-004', 'LS', 1, v_sort+3, false),
      (p_project_id, 'Environmental', 'Dust Suppression', 'EN-005', 'LS', 1, v_sort+4, false),
      (p_project_id, 'Environmental', 'Community Liaison & Sensitisation', 'EN-006', 'LS', 1, v_sort+5, false);

    -- 8. COMPLETION
    v_sort := 800;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Completion', 'Punch List / Snag List Clearance', 'CL-001', 'LS', 1, v_sort, true),
      (p_project_id, 'Completion', 'As-Built Drawings Submission', 'CL-002', 'Set', 1, v_sort+1, true),
      (p_project_id, 'Completion', 'Final Testing & Commissioning', 'CL-003', 'LS', 1, v_sort+2, true),
      (p_project_id, 'Completion', 'Demobilisation', 'CL-004', 'LS', 1, v_sort+3, true),
      (p_project_id, 'Completion', 'Taking Over (FIDIC Cl. 10.1)', 'CL-005', 'LS', 1, v_sort+4, true),
      (p_project_id, 'Completion', 'Defects Liability Period Monitoring', 'CL-006', 'Month', 12, v_sort+5, true),
      (p_project_id, 'Completion', 'Performance Certificate (FIDIC Cl. 11.9)', 'CL-007', 'LS', 1, v_sort+6, true);

  ELSIF p_category = 'Rehabilitation' THEN
    -- ══════════════════════════════════════════════════
    -- ROAD REHABILITATION — 60+ critical activities
    -- ══════════════════════════════════════════════════

    v_sort := 100;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Preliminary', 'Site Establishment & Mobilisation', 'PG-001', 'LS', 1, v_sort, true),
      (p_project_id, 'Preliminary', 'Condition Survey & Assessment', 'PG-002', 'KM', 0, v_sort+1, true),
      (p_project_id, 'Preliminary', 'Pavement Investigation (DCP/FWD)', 'PG-003', 'No', 0, v_sort+2, true),
      (p_project_id, 'Preliminary', 'Traffic Management & Diversions', 'PG-004', 'LS', 1, v_sort+3, true),
      (p_project_id, 'Preliminary', 'Environmental Management Plan', 'PG-005', 'LS', 1, v_sort+4, true),
      (p_project_id, 'Preliminary', 'Setting Out & Survey Control', 'PG-006', 'KM', 0, v_sort+5, true);

    v_sort := 200;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Rehabilitation Works', 'Milling of Existing Pavement', 'RH-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Rehabilitation Works', 'Patch Repairs (Deep / Shallow)', 'RH-002', 'M2', 0, v_sort+1, true),
      (p_project_id, 'Rehabilitation Works', 'Crack Sealing', 'RH-003', 'LM', 0, v_sort+2, true),
      (p_project_id, 'Rehabilitation Works', 'Subbase Replacement', 'RH-004', 'M3', 0, v_sort+3, true),
      (p_project_id, 'Rehabilitation Works', 'Base Repair / Stabilisation', 'RH-005', 'M3', 0, v_sort+4, true),
      (p_project_id, 'Rehabilitation Works', 'Shoulder Reconstruction', 'RH-006', 'M3', 0, v_sort+5, true),
      (p_project_id, 'Rehabilitation Works', 'Subgrade Improvement', 'RH-007', 'M2', 0, v_sort+6, false),
      (p_project_id, 'Rehabilitation Works', 'Profile Correction (Levelling Course)', 'RH-008', 'M3', 0, v_sort+7, true),
      (p_project_id, 'Rehabilitation Works', 'DBM Overlay', 'RH-009', 'M3', 0, v_sort+8, true),
      (p_project_id, 'Rehabilitation Works', 'AC Wearing Course Overlay', 'RH-010', 'M3', 0, v_sort+9, true),
      (p_project_id, 'Rehabilitation Works', 'Surface Dressing', 'RH-011', 'M2', 0, v_sort+10, false),
      (p_project_id, 'Rehabilitation Works', 'Fog Seal / Rejuvenation', 'RH-012', 'M2', 0, v_sort+11, false);

    v_sort := 300;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Drainage', 'Culvert Repair / Replacement', 'DR-001', 'No', 0, v_sort, true),
      (p_project_id, 'Drainage', 'Side Drain Cleaning & Reshaping', 'DR-002', 'LM', 0, v_sort+1, true),
      (p_project_id, 'Drainage', 'Drain Lining (Masonry/Concrete)', 'DR-003', 'LM', 0, v_sort+2, false),
      (p_project_id, 'Drainage', 'Headwall / Wingwall Repair', 'DR-004', 'No', 0, v_sort+3, false),
      (p_project_id, 'Drainage', 'Scour Repair & Protection', 'DR-005', 'M2', 0, v_sort+4, false);

    v_sort := 400;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Road Furniture', 'Road Marking Reinstatement', 'RF-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Road Furniture', 'Road Sign Replacement', 'RF-002', 'No', 0, v_sort+1, true),
      (p_project_id, 'Road Furniture', 'Guardrail Repair / Replacement', 'RF-003', 'LM', 0, v_sort+2, false),
      (p_project_id, 'Road Furniture', 'Kerb & Channel Repair', 'RF-004', 'LM', 0, v_sort+3, false);

    v_sort := 500;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Structures', 'Bridge Deck Repair', 'ST-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Structures', 'Bridge Joint Replacement', 'ST-002', 'LM', 0, v_sort+1, false),
      (p_project_id, 'Structures', 'Bridge Bearing Replacement', 'ST-003', 'No', 0, v_sort+2, false),
      (p_project_id, 'Structures', 'Concrete Repair & Spall Treatment', 'ST-004', 'M2', 0, v_sort+3, false),
      (p_project_id, 'Structures', 'Waterproofing Membrane', 'ST-005', 'M2', 0, v_sort+4, false);

    v_sort := 600;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Completion', 'Final Pavement Assessment (IRI/FWD)', 'CL-001', 'KM', 0, v_sort, true),
      (p_project_id, 'Completion', 'Before/After Comparison Report', 'CL-002', 'LS', 1, v_sort+1, true),
      (p_project_id, 'Completion', 'As-Built Drawings', 'CL-003', 'Set', 1, v_sort+2, true),
      (p_project_id, 'Completion', 'Taking Over & DLP', 'CL-004', 'LS', 1, v_sort+3, true);

  ELSIF p_category = 'Maintenance' THEN
    -- ══════════════════════════════════════════════════
    -- ROAD MAINTENANCE — Routine & Periodic
    -- ══════════════════════════════════════════════════

    v_sort := 100;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Routine Maintenance', 'Pothole Patching', 'RM-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Routine Maintenance', 'Edge Repair / Break Repair', 'RM-002', 'M2', 0, v_sort+1, true),
      (p_project_id, 'Routine Maintenance', 'Crack Sealing', 'RM-003', 'LM', 0, v_sort+2, true),
      (p_project_id, 'Routine Maintenance', 'Drain Cleaning / Desilting', 'RM-004', 'LM', 0, v_sort+3, true),
      (p_project_id, 'Routine Maintenance', 'Culvert Cleaning', 'RM-005', 'No', 0, v_sort+4, true),
      (p_project_id, 'Routine Maintenance', 'Bush Clearing (Road Reserve)', 'RM-006', 'KM', 0, v_sort+5, true),
      (p_project_id, 'Routine Maintenance', 'Grass Cutting', 'RM-007', 'M2', 0, v_sort+6, false),
      (p_project_id, 'Routine Maintenance', 'Shoulder Grading', 'RM-008', 'KM', 0, v_sort+7, true),
      (p_project_id, 'Routine Maintenance', 'Gravel Road Grading', 'RM-009', 'KM', 0, v_sort+8, true),
      (p_project_id, 'Routine Maintenance', 'Road Sign Cleaning & Repair', 'RM-010', 'No', 0, v_sort+9, false),
      (p_project_id, 'Routine Maintenance', 'Road Marking Touch-up', 'RM-011', 'M2', 0, v_sort+10, false),
      (p_project_id, 'Routine Maintenance', 'Guardrail Repair', 'RM-012', 'LM', 0, v_sort+11, false);

    v_sort := 200;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Periodic Maintenance', 'Resealing / Surface Dressing', 'PM-001', 'M2', 0, v_sort, true),
      (p_project_id, 'Periodic Maintenance', 'Fog Seal Application', 'PM-002', 'M2', 0, v_sort+1, false),
      (p_project_id, 'Periodic Maintenance', 'Overlay (Thin AC)', 'PM-003', 'M3', 0, v_sort+2, true),
      (p_project_id, 'Periodic Maintenance', 'Regravelling (Gravel Roads)', 'PM-004', 'M3', 0, v_sort+3, true),
      (p_project_id, 'Periodic Maintenance', 'Culvert Replacement', 'PM-005', 'No', 0, v_sort+4, false),
      (p_project_id, 'Periodic Maintenance', 'Bridge Maintenance', 'PM-006', 'LS', 0, v_sort+5, true),
      (p_project_id, 'Periodic Maintenance', 'Vegetation Control (Herbicide)', 'PM-007', 'KM', 0, v_sort+6, false);

    v_sort := 300;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Emergency Maintenance', 'Washout Repair', 'EM-001', 'No', 0, v_sort, true),
      (p_project_id, 'Emergency Maintenance', 'Landslide / Slip Clearance', 'EM-002', 'M3', 0, v_sort+1, true),
      (p_project_id, 'Emergency Maintenance', 'Flood Damage Repair', 'EM-003', 'LS', 0, v_sort+2, true),
      (p_project_id, 'Emergency Maintenance', 'Fallen Tree Removal', 'EM-004', 'No', 0, v_sort+3, false),
      (p_project_id, 'Emergency Maintenance', 'Temporary Road Closure Management', 'EM-005', 'No', 0, v_sort+4, true);

    v_sort := 400;
    INSERT INTO works_activities (project_id, category, activity_name, activity_code, unit, planned_quantity, sort_order, is_critical)
    VALUES
      (p_project_id, 'Inspections', 'Network Condition Survey', 'IN-001', 'KM', 0, v_sort, true),
      (p_project_id, 'Inspections', 'Bridge Inspection', 'IN-002', 'No', 0, v_sort+1, true),
      (p_project_id, 'Inspections', 'Drainage Inspection', 'IN-003', 'KM', 0, v_sort+2, true),
      (p_project_id, 'Inspections', 'Road Safety Audit', 'IN-004', 'LS', 0, v_sort+3, true),
      (p_project_id, 'Inspections', 'Monthly Maintenance Report', 'IN-005', 'No', 12, v_sort+4, true);

  END IF;

END;
$$;

-- Also add is_critical column if not exists
DO $$ BEGIN
  ALTER TABLE works_activities ADD COLUMN is_critical BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'is_critical column already exists';
END $$;

-- Add activity_code column if not exists
DO $$ BEGIN
  ALTER TABLE works_activities ADD COLUMN activity_code TEXT;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'activity_code column already exists';
END $$;

-- Add unit column if not exists
DO $$ BEGIN
  ALTER TABLE works_activities ADD COLUMN unit TEXT DEFAULT 'No';
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'unit column already exists';
END $$;
