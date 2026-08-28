-- ============================================================
-- Construction Guide Knowledge Base
-- V15.31 — Verified against Kenya Standard Specification for
-- Road and Bridge Construction, FIDIC 1999 Red/Yellow/Silver,
-- BS 1377, BS EN 12697, AASHTO test methods
-- ============================================================

-- 1. Construction Phases
CREATE TABLE IF NOT EXISTS construction_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_number integer NOT NULL,
  phase_name text NOT NULL,
  phase_category text NOT NULL DEFAULT 'new_construction'
    CHECK (phase_category IN ('new_construction', 'rehabilitation', 'maintenance')),
  description text,
  icon text DEFAULT '🔧',
  created_at timestamptz DEFAULT now()
);

-- 2. Phase Activities
CREATE TABLE IF NOT EXISTS phase_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES construction_phases(id) ON DELETE CASCADE,
  activity_number integer NOT NULL,
  activity_name text NOT NULL,
  description text,
  hold_point boolean DEFAULT false,
  fidic_red_book text,
  fidic_yellow_book text,
  fidic_silver_book text,
  kenya_standard_ref text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 3. Activity Tests
CREATE TABLE IF NOT EXISTS activity_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES phase_activities(id) ON DELETE CASCADE,
  test_name text NOT NULL,
  test_type text NOT NULL DEFAULT 'lab'
    CHECK (test_type IN ('field', 'lab', 'both')),
  standard_reference text,
  acceptance_criteria text,
  test_frequency text,
  equipment_required text,
  failure_action text,
  is_confirmatory boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phase_activities_phase ON phase_activities(phase_id);
CREATE INDEX IF NOT EXISTS idx_activity_tests_activity ON activity_tests(activity_id);
CREATE INDEX IF NOT EXISTS idx_construction_phases_category ON construction_phases(phase_category);

-- RLS
ALTER TABLE construction_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_tests ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users
CREATE POLICY "construction_phases_read" ON construction_phases FOR SELECT TO authenticated USING (true);
CREATE POLICY "phase_activities_read" ON phase_activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "activity_tests_read" ON activity_tests FOR SELECT TO authenticated USING (true);

-- Write access for platform admins only
CREATE POLICY "construction_phases_write" ON construction_phases FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));
CREATE POLICY "phase_activities_write" ON phase_activities FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));
CREATE POLICY "activity_tests_write" ON activity_tests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_platform_admin = true));

-- ============================================================
-- SEED DATA — 15 PHASES, NEW CONSTRUCTION
-- ============================================================

-- Phase 1: Site Establishment
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(1, 'Site Establishment & Preliminary Works', 'new_construction',
 'Mobilization, site office setup, survey control establishment, traffic management, environmental baseline. The foundation for all subsequent construction activities.',
 '🔨');

-- Phase 2: Setting Out & Survey
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(2, 'Setting Out & Survey Control', 'new_construction',
 'Establishment of horizontal and vertical control points, benchmarks, reference pegs, and alignment markers. Critical for geometric accuracy throughout construction.',
 '📐');

-- Phase 3: Site Clearance
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(3, 'Site Clearance & Grubbing', 'new_construction',
 'Removal of vegetation, trees, stumps, roots, topsoil stripping and stockpiling. Clearing width as per design cross-section plus working space.',
 '🌿');

-- Phase 4: Earthworks - Cut
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(4, 'Earthworks — Cut & Excavation', 'new_construction',
 'Excavation to design formation level, removal of unsuitable material, cut slope formation. Material classification determines disposal or reuse as fill.',
 '⚒️');

-- Phase 5: Earthworks - Fill
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(5, 'Earthworks — Fill & Embankment', 'new_construction',
 'Placement and compaction of approved fill material in layers not exceeding 200mm loose thickness. Embankment construction with moisture conditioning.',
 '🚛');

-- Phase 6: Subgrade
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(6, 'Subgrade Preparation', 'new_construction',
 'Final shaping and compaction of the formation level to receive pavement layers. The subgrade must achieve specified CBR and density before any pavement layer is placed.',
 '🔨');

-- Phase 7: Sub-base
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(7, 'Sub-base Construction', 'new_construction',
 'Placement of natural gravel or improved sub-base material. Layer acts as structural support and drainage layer between subgrade and base course.',
 '🪨');

-- Phase 8: Base Course
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(8, 'Base Course Construction', 'new_construction',
 'Construction of the main structural layer using crushed stone, cement-stabilized material, or other approved base material. Most critical pavement layer for load distribution.',
 '🧱');

-- Phase 9: Prime Coat
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(9, 'Prime Coat Application', 'new_construction',
 'Application of MC30 or MC70 cutback bitumen on prepared base course to seal the surface, provide bond with bituminous layers, and prevent moisture ingress.',
 '🛢️');

-- Phase 10: Binder Course
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(10, 'Binder Course (Asphalt Concrete)', 'new_construction',
 'Placement of asphalt concrete binder course (AC 20 or AC 25) as the structural bituminous layer. Provides load distribution between wearing course and base.',
 '🏭');

-- Phase 11: Wearing Course
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(11, 'Wearing Course', 'new_construction',
 'Final riding surface — either asphalt concrete (AC 14), surface dressing (single or double), or other approved surfacing. Must provide skid resistance, impermeability, and ride quality.',
 '🛣️');

-- Phase 12: Drainage
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(12, 'Drainage Works', 'new_construction',
 'Construction of culverts, side drains, mitre drains, catch water drains, scour checks, and outfall structures. Adequate drainage is the single most important factor in road longevity.',
 '🌊');

-- Phase 13: Structures
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(13, 'Bridge & Structural Works', 'new_construction',
 'Construction of bridges, box culverts, retaining walls, gabions, and other structural elements. Includes foundations, substructure, superstructure, and finishing works.',
 '🌉');

-- Phase 14: Road Furniture
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(14, 'Road Furniture & Safety Features', 'new_construction',
 'Installation of road signs, guardrails, road markings, delineators, kilometre posts, and other safety features. Final element before the road is opened to traffic.',
 '🚧');

-- Phase 15: Completion
INSERT INTO construction_phases (phase_number, phase_name, phase_category, description, icon) VALUES
(15, 'Completion, Testing & Handover', 'new_construction',
 'Final inspections, as-built surveys, performance testing, snag list completion, and issuance of Taking Over Certificate. Defects Notification Period begins.',
 '🏁');


-- ============================================================
-- PHASE ACTIVITIES & TESTS
-- ============================================================

-- Helper: get phase IDs
DO $$
DECLARE
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid;
  p9 uuid; p10 uuid; p11 uuid; p12 uuid; p13 uuid; p14 uuid; p15 uuid;
  a_id uuid;
BEGIN

SELECT id INTO p1 FROM construction_phases WHERE phase_number = 1;
SELECT id INTO p2 FROM construction_phases WHERE phase_number = 2;
SELECT id INTO p3 FROM construction_phases WHERE phase_number = 3;
SELECT id INTO p4 FROM construction_phases WHERE phase_number = 4;
SELECT id INTO p5 FROM construction_phases WHERE phase_number = 5;
SELECT id INTO p6 FROM construction_phases WHERE phase_number = 6;
SELECT id INTO p7 FROM construction_phases WHERE phase_number = 7;
SELECT id INTO p8 FROM construction_phases WHERE phase_number = 8;
SELECT id INTO p9 FROM construction_phases WHERE phase_number = 9;
SELECT id INTO p10 FROM construction_phases WHERE phase_number = 10;
SELECT id INTO p11 FROM construction_phases WHERE phase_number = 11;
SELECT id INTO p12 FROM construction_phases WHERE phase_number = 12;
SELECT id INTO p13 FROM construction_phases WHERE phase_number = 13;
SELECT id INTO p14 FROM construction_phases WHERE phase_number = 14;
SELECT id INTO p15 FROM construction_phases WHERE phase_number = 15;

-- ═══════════════════════════════════════════════
-- PHASE 1: Site Establishment
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p1, 1, 'Mobilization & Site Office Setup',
  'Establish site office, laboratory, storage facilities, and accommodation. Provide communication facilities and safety equipment.',
  false, 'Cl. 8.1 Commencement of Works', 'Cl. 8.1', 'Cl. 8.1',
  'Std Spec Section 1: General')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p1, 2, 'Traffic Management Plan',
  'Prepare and submit traffic management plan showing detours, signage, flagmen positions, and safety measures for construction zone.',
  true, 'Cl. 4.1 Contractor General Obligations', 'Cl. 4.1', 'Cl. 4.1',
  'Std Spec Section 15: Road Safety')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p1, 3, 'Environmental Management Plan',
  'Submit ESMP including erosion control, dust suppression, waste management, water source protection, and NEMA compliance measures.',
  true, 'Cl. 4.18 Protection of Environment', 'Cl. 4.18', 'Cl. 4.18',
  'EMCA 1999, NEMA Regulations')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p1, 4, 'Site Laboratory Establishment',
  'Set up field laboratory with required equipment for soil, aggregate, and bitumen testing. Laboratory must be approved by the Engineer.',
  true, 'Cl. 4.1 Contractor General Obligations', 'Cl. 4.1', 'Cl. 4.1',
  'Materials Testing Manual Ch. 1')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Laboratory Equipment Calibration', 'lab', 'BS 1377: Part 1',
  'All equipment calibrated and certified within 12 months',
  'Before first use, then annually',
  'Calibration certificates for all equipment',
  'Equipment must not be used until recalibrated and certified',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 2: Setting Out & Survey
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p2, 1, 'Establish Primary Control Points',
  'Set up primary horizontal control (GPS/Total Station) and vertical benchmarks (precise levelling). Minimum 2 benchmarks per km.',
  true, 'Cl. 4.7 Setting Out', 'Cl. 4.7', 'Cl. 4.7',
  'Road Design Manual Part I, Std Spec Section 1')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Survey Control Accuracy Check', 'field', 'Survey Act (Cap 299)',
  'Horizontal: ±25mm, Vertical: ±10mm from design coordinates',
  'Initial setup, then monthly verification',
  'Total Station (2" accuracy), GPS RTK, Precise Level',
  'Resurvey from nearest verified control point. Do not proceed with setting out until control is verified.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p2, 2, 'Road Alignment Setting Out',
  'Set out centreline, edge of carriageway, drain lines, and slope stakes at 20m intervals on straights, 10m on curves. Mark chainage pegs.',
  true, 'Cl. 4.7 Setting Out', 'Cl. 4.7', 'Cl. 4.7',
  'Road Design Manual Part I')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Alignment Verification', 'field', 'Road Design Manual Part I',
  'Centreline: ±25mm horizontal, Profile: ±15mm vertical',
  'Every 20m (straights), 10m (curves)',
  'Total Station, Levelling Instrument',
  'Reset pegs to correct coordinates. Check adjacent pegs for systematic error.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 3: Site Clearance
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p3, 1, 'Bush Clearing',
  'Clear all vegetation, trees, and scrub within the road reserve width. Preserve trees marked for retention. Stack timber separately.',
  false, 'Cl. 4.1 Contractor General Obligations', 'Cl. 4.1', 'Cl. 4.1',
  'Std Spec Section 2: Site Clearance')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p3, 2, 'Grubbing & Stump Removal',
  'Remove all stumps, roots to minimum 300mm depth, boulders, and debris from the road prism. Backfill holes with approved material.',
  false, 'Cl. 4.1', 'Cl. 4.1', 'Cl. 4.1',
  'Std Spec Section 2: Site Clearance')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p3, 3, 'Topsoil Stripping & Stockpiling',
  'Strip topsoil (typically 150-300mm) and stockpile for later use in landscaping and slope protection. Keep organic material out of structural fill.',
  false, 'Cl. 4.1', 'Cl. 4.1', 'Cl. 4.1',
  'Std Spec Section 2')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Topsoil Depth Verification', 'field', 'Std Spec Section 2',
  'All organic material removed to required depth. No organic matter in formation.',
  'Visual inspection every 100m',
  'Measuring tape, trial pits',
  'Continue stripping until all organic material is removed. Engineer to approve before proceeding.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 4: Earthworks - Cut
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p4, 1, 'Material Classification & Testing',
  'Classify excavated material as suitable or unsuitable for reuse. Unsuitable: organic, high plasticity (PI > 20 for fill), expansive clays.',
  true, 'Cl. 7.3 Inspection', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 3: Earthworks, Table 3-1')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Atterberg Limits (LL, PL, PI)', 'lab', 'BS 1377: Part 2, Test 4 & 5',
  'For fill material: LL ≤ 50, PI ≤ 20. For selected fill: PI ≤ 12.',
  '1 per 1000m³ or change in material source',
  'Casagrande apparatus, glass plate, oven',
  'Reject material for structural fill. May be used in non-structural areas if Engineer approves.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'California Bearing Ratio (CBR)', 'lab', 'BS 1377: Part 4, AASHTO T193',
  'Minimum CBR depends on intended use: Fill ≥ 5%, Selected subgrade ≥ 15%, Improved subgrade ≥ 30%',
  '1 per 2000m³ or change in material',
  'CBR mould, loading machine, soaking tank',
  'Material does not meet specification for intended layer. Reclassify or reject.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Moisture-Density Relationship (Proctor)', 'lab', 'BS 1377: Part 4, Test 3.3 (Mod)',
  'Establish MDD and OMC for compaction control. Use Modified Proctor (4.5kg rammer).',
  '1 per 2000m³ or change in material',
  'Proctor mould, 4.5kg rammer, oven, balance',
  'Retest if results inconsistent. New test required for each distinct material source.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p4, 2, 'Excavation to Formation Level',
  'Cut to design formation level with specified side slopes (typically 1V:1.5H in soil, 1V:0.5H in rock). Maintain drainage during excavation.',
  false, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 3: Earthworks')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Level Survey (Cut Formation)', 'field', 'Std Spec Section 3',
  'Formation level: ±30mm of design. Cross-fall: ±0.5% of design gradient.',
  'Every 25m along centreline and edges',
  'Levelling instrument, staff, profile boards',
  'Trim high spots, fill low spots with approved material and compact.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 5: Earthworks - Fill
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p5, 1, 'Foundation Preparation for Embankment',
  'Prepare foundation by removing soft material, scarify top 150mm, moisture condition and compact. Step foundation on slopes steeper than 1V:5H.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 3: Earthworks')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p5, 2, 'Fill Placement & Compaction',
  'Place approved fill in uniform layers not exceeding 200mm compacted thickness. Moisture condition to within ±2% of OMC before compaction.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 3, Table 3-2')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Field Density Test (Sand Replacement)', 'field', 'BS 1377: Part 4, Test 6.3',
  'Minimum 93% MDD (Modified Proctor) for general fill. 95% MDD for top 300mm.',
  '1 per 500m² per layer, minimum 3 per layer',
  'Sand replacement apparatus, calibrated sand, balance, oven',
  'Recompact layer. If still failing, remove and replace with compliant material at correct moisture.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Nuclear Density Gauge (NDG)', 'field', 'ASTM D6938 / BS 1377: Part 4',
  'Minimum 93% MDD general fill, 95% MDD top 300mm. Correlate with sand replacement results.',
  '3 per 500m² per layer (faster than sand replacement)',
  'Nuclear Density Gauge (calibrated), radiation licence',
  'Recompact and retest. NDG must be correlated with sand replacement tests monthly.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Moisture Content Check', 'field', 'BS 1377: Part 2, Test 3',
  'Within ±2% of Optimum Moisture Content (OMC) at time of compaction',
  'Every layer, minimum 2 per 500m²',
  'Speedy moisture tester (field), or oven-dry method (lab)',
  'Add water if dry, aerate if wet. Do not compact until moisture is within range.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Layer Thickness Measurement', 'field', 'Std Spec Section 3',
  'Compacted layer ≤ 200mm. Total fill height per design ±30mm.',
  'Every 25m, both edges and centreline',
  'Levelling instrument, measuring tape, level pegs',
  'If over 200mm, scarify and re-lay in correct thickness. Thick layers do not compact properly.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 6: Subgrade Preparation
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p6, 1, 'Subgrade Shaping & Compaction',
  'Shape formation to design cross-section with specified camber/crossfall. Scarify top 150mm, moisture condition, compact to specification.',
  true, 'Cl. 7.3 Inspection', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 4: Subgrade')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'CBR Test (Subgrade)', 'lab', 'BS 1377: Part 4 / AASHTO T193',
  'Trunk roads: min 15% (soaked, 4-day). Rural roads: min 8% (soaked). Design CBR per contract.',
  '1 per 500m or change in material',
  'CBR mould, loading machine, soaking tank, oven',
  'Subgrade improvement required: stabilization (lime/cement), removal and replacement, or geotextile.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Field Density (Subgrade)', 'field', 'BS 1377: Part 4',
  'Minimum 95% MDD (Modified Proctor) for top 150mm of subgrade',
  '1 per 250m², minimum 4 per section',
  'Sand replacement or Nuclear Density Gauge',
  'Scarify, re-moisture condition, and recompact. If still failing, investigate material suitability.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Subgrade Level & Crossfall', 'field', 'Std Spec Section 4',
  'Level: ±15mm of design. Crossfall: ±0.5% of specified gradient.',
  'Every 10m (centreline + edges)',
  'Levelling instrument, straight edge (3m)',
  'Trim or add material and recompact to achieve tolerances.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'DCP Test (Subgrade Verification)', 'field', 'ASTM D6951 / TRL Road Note 31',
  'Penetration rate consistent with required CBR. DCP-CBR correlation: log CBR = 2.48 - 1.057 log(DN)',
  '1 per 200m or suspected weak spots',
  'Dynamic Cone Penetrometer (8kg hammer, 60° cone)',
  'Identify weak zones for treatment. DCP is screening — confirm with lab CBR for critical areas.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p6, 2, 'Subgrade Approval (Hold Point)',
  'Engineer inspects and approves subgrade before any pavement layer is placed. Mandatory hold point — contractor must not proceed without written approval.',
  true, 'Cl. 7.3 Inspection, Cl. 7.5 Rejection', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 4')
RETURNING id INTO a_id;

-- ═══════════════════════════════════════════════
-- PHASE 7: Sub-base Construction
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p7, 1, 'Material Approval & Source Inspection',
  'Submit material source (borrow pit/quarry) for approval. Provide test results proving material meets sub-base specification.',
  true, 'Cl. 7.1 Manner of Execution, Cl. 7.2 Samples', 'Cl. 7.1', 'Cl. 7.1',
  'Std Spec Section 5: Sub-base, Table 5-1')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Grading Analysis (Sub-base)', 'lab', 'BS 1377: Part 2, Test 7 / AASHTO T27',
  'Material must fall within grading envelope per Std Spec Table 5-1. Max size 63mm for GCS, 50mm for GN.',
  '1 per 1000m³ or change in source',
  'Set of BS sieves (63mm to 0.075mm), balance, oven, sample splitter',
  'Blend materials from different sources or crush oversize. Reject if fundamentally outside envelope.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Atterberg Limits (Sub-base)', 'lab', 'BS 1377: Part 2',
  'GCS: PI ≤ 6. GN: PI ≤ 12. GM: PI per contract. All: LL ≤ 35.',
  '1 per 1000m³ or change in source',
  'Casagrande apparatus, glass plate, oven',
  'Reject material or stabilize with lime to reduce PI if Engineer approves.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'CBR Test (Sub-base)', 'lab', 'BS 1377: Part 4',
  'Minimum 30% CBR at 95% MDD (soaked, 4-day) for standard sub-base. Higher for heavy traffic roads.',
  '1 per 2000m³ or change in source',
  'CBR mould, loading machine, soaking tank',
  'Material does not meet sub-base specification. Find alternative source or stabilize.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p7, 2, 'Sub-base Layer Placement & Compaction',
  'Spread sub-base material in layers not exceeding 200mm compacted thickness. Moisture condition and compact with appropriate roller.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 5')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Field Density (Sub-base)', 'field', 'BS 1377: Part 4',
  'Minimum 95% MDD (Modified Proctor)',
  '1 per 250m² per layer',
  'Sand replacement apparatus or Nuclear Density Gauge',
  'Additional roller passes. If still failing, scarify, re-moisture condition, recompact.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Level & Thickness Check (Sub-base)', 'field', 'Std Spec Section 5',
  'Level: ±15mm. Layer thickness: -0/+15mm of design. Width: not less than design.',
  'Every 10m (centreline + edges)',
  'Levelling instrument, measuring tape',
  'Trim high spots, add material to low spots. Do not reduce thickness below design.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 8: Base Course Construction
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p8, 1, 'Base Material Approval',
  'Submit crushed stone or cement-stabilized material source for approval. Material must meet full specification before delivery to site.',
  true, 'Cl. 7.1, Cl. 7.2 Samples', 'Cl. 7.1', 'Cl. 7.1',
  'Std Spec Section 5: Base Course, Table 5-2')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Grading Analysis (Base)', 'lab', 'BS 1377: Part 2 / AASHTO T27',
  'Must fall within grading envelope per Table 5-2. Typically 0/37.5mm or 0/50mm for GCS base.',
  '1 per 500m³ or daily production',
  'BS sieves, balance, oven',
  'Adjust crusher settings or blend to achieve envelope. Reject non-compliant batches.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Atterberg Limits (Base)', 'lab', 'BS 1377: Part 2',
  'PI ≤ 6 for crushed stone base. Non-plastic preferred. LL �j$ 25.',
  '1 per 500m³ or change in source',
  'Casagrande apparatus',
  'Material too plastic — not suitable for base course. Find alternative source.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'CBR Test (Base)', 'lab', 'BS 1377: Part 4',
  'Minimum 80% CBR at 98% MDD (soaked). For heavy traffic roads, min 100%.',
  '1 per 1000m³ or change in source',
  'CBR mould, loading machine, soaking tank',
  'Material inadequate for base. Consider cement stabilization or alternative source.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Los Angeles Abrasion (LAA)', 'lab', 'ASTM C131 / BS EN 1097-2',
  'Maximum 30% loss for base course aggregate (35% for sub-base)',
  '1 per source, repeated if source changes',
  'LA Abrasion machine, steel balls, sieves',
  'Aggregate too soft for base course. Find harder rock source.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Aggregate Crushing Value (ACV)', 'lab', 'BS 812: Part 110',
  'Maximum 25% ACV for base course (30% for sub-base)',
  '1 per source',
  'ACV apparatus, BS sieves, compression machine',
  'Aggregate fails crushing — structurally unsuitable for base layer.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Flakiness Index', 'lab', 'BS 812: Part 105',
  'Maximum 30% flaky particles',
  '1 per source',
  'Flakiness gauge, BS sieves, balance',
  'Adjust crusher to reduce flaky particles. Flaky particles break under load and reduce density.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p8, 2, 'Base Course Placement & Compaction',
  'Spread base material in layers not exceeding 150mm compacted. Compact with vibratory roller (min 10T) at OMC ±2%.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 5')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Field Density (Base)', 'field', 'BS 1377: Part 4',
  'Minimum 98% MDD (Modified Proctor) for crushed stone base. 100% for cement-stabilized.',
  '1 per 200m² per layer — minimum 5 per section',
  'Sand replacement apparatus (primary), NDG (supplementary)',
  'Additional compaction passes. If persistent failure, investigate moisture, material quality, or layer thickness.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Level, Thickness & Crossfall (Base)', 'field', 'Std Spec Section 5',
  'Level: ±10mm of design. Thickness: -0/+10mm. Crossfall: ±0.3% of design.',
  'Every 10m, centreline + edges',
  'Levelling instrument, straight edge (3m)',
  'Correct surface with approved method. Never add thin layer (< 75mm) on top — bond failure risk.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Surface Regularity (Base)', 'field', 'Std Spec Section 5',
  '3m straight edge: max 10mm deviation for base receiving bituminous surfacing',
  'Every 25m, random positions',
  '3-metre straight edge, feeler gauge',
  'Correct irregularities by trimming or filling with same material and recompacting.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 9: Prime Coat
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p9, 1, 'Base Surface Preparation for Prime',
  'Sweep base course clean of loose material. Surface must be tight, dry, and free of dust. Slightly damp is acceptable.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 6: Bituminous Works')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p9, 2, 'Prime Coat Application',
  'Apply MC30 or MC70 cutback bitumen at specified rate (typically 0.8-1.2 l/m²). Allow minimum 24hr curing before traffic or next layer.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 6')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Spray Rate Check', 'field', 'Std Spec Section 6',
  'Spray rate within ±10% of specified rate. Uniform coverage, no streaking or ponding.',
  'Tray test at start and every 500m',
  'Metal trays (known area), balance, thermometer',
  'Adjust distributor nozzles, pressure, or speed. Reapply to areas with insufficient coverage.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Binder Temperature Check', 'field', 'Std Spec Section 6',
  'MC30: 30-60°C. MC70: 50-80°C at point of application.',
  'Continuous monitoring during spraying',
  'Calibrated thermometer or infrared gun',
  'Heat binder to correct temperature before spraying. Do not apply cold binder.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Penetration Check (Curing)', 'field', 'Std Spec Section 6',
  'Prime must penetrate minimum 5mm into base surface. Curing complete when no pick-up on foot.',
  '24hr after application',
  'Visual inspection, foot test',
  'If prime sits on surface, base may be too tight. Consider lighter cutback or dilute with kerosene.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 10: Binder Course
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p10, 1, 'Asphalt Mix Design Approval',
  'Submit Marshall Mix Design for binder course (AC 20 or AC 25). Must meet all volumetric and strength requirements.',
  true, 'Cl. 7.1, Cl. 7.2', 'Cl. 7.1', 'Cl. 7.1',
  'Std Spec Section 6: Bituminous Works, Table 6-1')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Marshall Stability & Flow', 'lab', 'ASTM D1559 / BS EN 12697-34',
  'Stability: min 9kN (binder), min 8kN (wearing). Flow: 2-4mm. VMA, VFB per Table 6-1.',
  'Mix design approval, then 1 per 500T production',
  'Marshall hammer (75 blows/face), breaking head, flow meter, balance',
  'Redesign mix — adjust binder content, aggregate grading, or filler proportion.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Binder Content (Extraction)', 'lab', 'ASTM D2172 / BS EN 12697-1',
  'Within ±0.3% of design binder content',
  '1 per 500T or daily production',
  'Centrifuge extractor or reflux extractor, solvent, balance',
  'Adjust plant binder dosage. Too much binder = bleeding; too little = stripping/durability failure.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p10, 2, 'Tack Coat Application',
  'Apply cationic emulsion (K1-60 or CSS-1) tack coat at 0.3-0.5 l/m² before binder course. Surface must be clean and dry.',
  false, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 6')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p10, 3, 'Binder Course Laying & Compaction',
  'Lay AC with paver at specified temperature. Compact with steel roller then pneumatic. Achieve target density within temperature window.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 6')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Laying Temperature', 'field', 'Std Spec Section 6',
  'AC at paver screed: min 135°C. Do not compact below 80°C. Ambient: min 10°C, no rain.',
  'Continuous monitoring',
  'Infrared thermometer, probe thermometer',
  'Reject cold loads. Do not lay in rain. Stop operations if temperature drops below minimum.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Core Density (Binder Course)', 'lab', 'BS EN 12697-6',
  'Minimum 93% of Marshall density (or 97% of refusal density). Air voids: 3-7%.',
  '1 core per 200m per lane',
  'Core cutter (100mm or 150mm), balance, wax coating',
  'Additional rolling (if still warm). If cold, mark for investigation. Remove and replace if < 90%.',
  true);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Layer Thickness (Cores)', 'lab', 'Std Spec Section 6',
  'Average not less than design. No individual core < design minus 10mm.',
  'Measured on density cores',
  'Caliper, ruler',
  'If thin, additional layer or overlay required. Contractor bears cost of deficient thickness.',
  true);

-- ═══════════════════════════════════════════════
-- PHASE 11: Wearing Course
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p11, 1, 'Wearing Course Mix Design (AC)',
  'Submit Marshall Mix Design for wearing course (AC 14). Must provide durability, skid resistance, and impermeability.',
  true, 'Cl. 7.1, Cl. 7.2', 'Cl. 7.1', 'Cl. 7.1',
  'Std Spec Section 6, Table 6-1')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p11, 2, 'Wearing Course Laying',
  'Apply tack coat, lay AC 14 with paver at min 140°C. Compact to specification. Longitudinal joints offset from binder course joints by min 150mm.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 6')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Core Density (Wearing Course)', 'lab', 'BS EN 12697-6',
  'Minimum 93% Marshall density. Air voids: 3-5%. Lower voids = better impermeability.',
  '1 core per 200m per lane',
  'Core cutter, balance, wax',
  'If low density, investigate compaction procedure. Remove and replace if below 90%.',
  true);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Surface Regularity (Wearing Course)', 'field', 'Std Spec Section 6',
  '3m straight edge: max 5mm deviation on wearing course (stricter than base)',
  'Every 25m, random positions',
  '3-metre straight edge, wedge gauge',
  'Correct with additional overlay or planing. Irregularities cause vehicle damage and water ponding.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Surface Texture Depth (Skid Resistance)', 'field', 'BS EN 13036-1 (Sand Patch)',
  'Minimum 0.45mm texture depth for AC wearing course. Higher for high-speed roads.',
  '1 per 100m per lane',
  'Known volume of sand, ruler, flat plate',
  'If texture too low, surface may need grooving or retexturing. Report to Engineer.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'International Roughness Index (IRI)', 'field', 'ASTM E1926',
  'IRI ≤ 2.0 m/km for new trunk road wearing course. ≤ 3.0 for rural roads.',
  'Full length, both wheel paths',
  'Roughness measuring device (bump integrator or profilometer)',
  'If IRI exceeds limit, investigate — may need overlay or planing to correct ride quality.',
  true);

-- ═══════════════════════════════════════════════
-- PHASE 12: Drainage Works
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p12, 1, 'Culvert Construction',
  'Install pipe or box culverts per design. Includes excavation, bedding, pipe laying, jointing, backfill, and headwall/wingwall construction.',
  true, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 7: Drainage')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Pipe Crushing Strength Test', 'lab', 'BS 5911 / KS 02-95',
  'Concrete pipes must meet Class S, M, or H crushing load per design. No cracks at proof load.',
  '1 per batch/delivery',
  'Pipe crushing machine, load cell',
  'Reject non-compliant pipes. Do not install substandard drainage elements.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Bedding & Backfill Compaction', 'field', 'Std Spec Section 7',
  'Bedding: granular, 150mm below pipe. Backfill: 95% MDD, placed in 150mm layers to 300mm above pipe.',
  '1 density test per culvert',
  'Sand replacement apparatus, tamping equipment',
  'Recompact backfill. Poor backfill around culverts causes settlement and road failure above.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p12, 2, 'Side Drain & Mitre Drain Construction',
  'Construct trapezoidal or V-shaped side drains per design. Mitre drains at 50-100m intervals to discharge water away from road.',
  false, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 7')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Drain Gradient & Dimensions', 'field', 'Std Spec Section 7',
  'Gradient: min 0.5% (1:200). Dimensions per design cross-section ±50mm.',
  'Every 50m along drain',
  'Levelling instrument, measuring tape, template',
  'Regrade to achieve positive drainage. Standing water in drains indicates insufficient gradient.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 13: Structural Works
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p13, 1, 'Concrete Works (Structural)',
  'Concrete for bridges, retaining walls, and box culverts. Mix design approval, batching, placing, vibrating, and curing per specification.',
  true, 'Cl. 7.1, Cl. 7.2, Cl. 7.3', 'Cl. 7.1', 'Cl. 7.1',
  'Std Spec Section 8: Concrete Works, Bridge Design Manual')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Concrete Cube Crushing Test (28-day)', 'lab', 'BS EN 12390-3 / BS 1881: Part 116',
  'Min characteristic strength: C25/30 (general), C30/37 (structural), C40/50 (bridge deck). No cube < fck - 4 MPa.',
  '1 set (3 cubes) per 50m³ or per day production. Test at 7 & 28 days.',
  'Cube moulds (150mm), vibrating table, curing tank, compression machine',
  '7-day < 70% of 28-day target: investigate. 28-day failure: core test existing concrete. May require demolition.',
  true);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Slump Test (Concrete Workability)', 'field', 'BS EN 12350-2 / BS 1881: Part 102',
  'Slump within ±25mm of target (typically 50-100mm for structural, 25-75mm for foundations)',
  'Every truck/batch delivered',
  'Slump cone, tamping rod, base plate, ruler',
  'Reject load if outside tolerance. Do not add water on site to increase slump.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Reinforcement Inspection', 'field', 'BS 4449 / KS 02-18',
  'Correct bar sizes, spacing, cover, laps (min 40Ø), and chairs per drawings. Cover: 40mm (exposed), 25mm (protected).',
  'Before every concrete pour — hold point',
  'Cover meter, tape measure, bar identifier',
  'Correct reinforcement position before any concrete is placed. No concrete without Engineer approval.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p13, 2, 'Gabion & Stone Pitching Works',
  'Construction of gabion walls, mattresses, and stone pitching for erosion protection and slope stabilization.',
  false, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 9: Stone Pitching and Gabions')
RETURNING id INTO a_id;

-- ═══════════════════════════════════════════════
-- PHASE 14: Road Furniture
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p14, 1, 'Road Marking Application',
  'Apply thermoplastic or cold-applied road markings — centreline, edge lines, lane markings, and special markings per design.',
  false, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 15: Road Furniture, Kenya Traffic Signs Manual')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Road Marking Retroreflectivity', 'field', 'BS EN 1436',
  'White lines: min 100 mcd/m²/lux (new). Yellow lines: min 80 mcd/m²/lux.',
  'After application, every 500m',
  'Retroreflectometer',
  'Reapply markings with fresh glass beads. Insufficient beads reduce night visibility.',
  false);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Marking Thickness', 'field', 'BS EN 1436',
  'Thermoplastic: min 1.5mm wet film. Cold plastic: per manufacturer specification.',
  'Random checks during application',
  'Wet film gauge',
  'Adjust applicator settings. Thin markings wear off quickly and fail retroreflectivity.',
  false);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p14, 2, 'Road Signs & Guardrails',
  'Install regulatory, warning, and information signs per Kenya Traffic Signs Manual. Install guardrails at hazardous locations.',
  false, 'Cl. 7.3', 'Cl. 7.3', 'Cl. 7.3',
  'Std Spec Section 15, Kenya Traffic Signs Manual')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Sign Retroreflectivity & Placement', 'field', 'Kenya Traffic Signs Manual',
  'Signs at correct height (1.5m min clearance), correct offset (0.6m from edge), visible from 150m. Reflective sheeting: Type I min.',
  'Every sign installed',
  'Tape measure, retroreflectometer (optional)',
  'Reposition or replace non-compliant signs. Incorrect signs are a road safety hazard.',
  false);

-- ═══════════════════════════════════════════════
-- PHASE 15: Completion & Handover
-- ═══════════════════════════════════════════════

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p15, 1, 'As-Built Survey & Documentation',
  'Complete as-built drawings showing actual constructed dimensions, levels, and positions. Compile all test records and certificates.',
  true, 'Cl. 4.1, Cl. 10.1 Taking Over', 'Cl. 4.1, Cl. 10.1', 'Cl. 4.1, Cl. 10.1',
  'Std Spec Section 1')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p15, 2, 'Final Inspection & Snag List',
  'Joint inspection by Engineer and Contractor. Compile list of defects (snags) for rectification before Taking Over Certificate.',
  true, 'Cl. 10.1 Taking Over of the Works', 'Cl. 10.1', 'Cl. 10.1',
  'Std Spec Section 1')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p15, 3, 'Performance Testing',
  'Full-length performance testing before handover — roughness (IRI), deflection (Benkelman Beam), surface condition survey.',
  true, 'Cl. 10.1, Cl. 11.1 Completion of Outstanding Work', 'Cl. 10.1', 'Cl. 10.1',
  'Pavement Rehabilitation Manual')
RETURNING id INTO a_id;

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Benkelman Beam Deflection Test', 'field', 'AASHTO T256 / TRL Road Note 31',
  'Maximum deflection per pavement design. Typically < 1.0mm for trunk roads, < 1.5mm for secondary.',
  'Every 50m, both wheel paths',
  'Benkelman Beam, loaded truck (8.2T axle), dial gauge',
  'High deflection indicates structural weakness. Investigate — may need strengthening overlay or reconstruction.',
  true);

INSERT INTO activity_tests (activity_id, test_name, test_type, standard_reference, acceptance_criteria,
  test_frequency, equipment_required, failure_action, is_confirmatory)
VALUES (a_id, 'Final IRI Measurement', 'field', 'ASTM E1926',
  'IRI ≤ 2.0 m/km for trunk roads. ≤ 3.0 for secondary. Full length both wheel paths.',
  'Complete road length',
  'Roughness measuring device (bump integrator or profilometer)',
  'Sections exceeding IRI limit must be corrected — overlay, planing, or other approved method.',
  true);

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p15, 4, 'Taking Over Certificate',
  'Engineer issues Taking Over Certificate when works are substantially complete and snags rectified. Defects Notification Period begins (typically 365 days).',
  true, 'Cl. 10.1 Taking Over Certificate', 'Cl. 10.1', 'Cl. 10.1',
  'FIDIC General Conditions')
RETURNING id INTO a_id;

INSERT INTO phase_activities (phase_id, activity_number, activity_name, description, hold_point,
  fidic_red_book, fidic_yellow_book, fidic_silver_book, kenya_standard_ref)
VALUES (p15, 5, 'Defects Notification Period',
  'Contractor responsible for rectifying any defects that appear during the DNP. Engineer conducts periodic inspections. Performance Certificate issued at end.',
  false, 'Cl. 11.1-11.4 Defects Liability', 'Cl. 11.1-11.4', 'Cl. 11.1-11.4',
  'FIDIC General Conditions')
RETURNING id INTO a_id;

END $$;
