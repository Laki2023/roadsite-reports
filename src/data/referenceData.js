// RoadSite Reports — Comprehensive Reference Data for Kenya Road Construction
// Aligned with Kenya Road Design Manual (RDM), FIDIC Red Book, and KeNHA/KURA standards

// ─────────────────────────────────────────────
// WEATHER OPTIONS
// ─────────────────────────────────────────────
export const WEATHER_OPTIONS = [
  'Sunny / Clear',
  'Partly Cloudy',
  'Overcast',
  'Light Rain / Drizzle',
  'Moderate Rain',
  'Heavy Rain',
  'Thunderstorm',
  'Foggy / Misty',
  'Windy',
  'Hot & Humid',
  'Cold',
  'Hailstorm',
];

// ─────────────────────────────────────────────
// EQUIPMENT — 60+ types grouped by category
// Each has: name, category
// ─────────────────────────────────────────────
export const EQUIPMENT_CATEGORIES = [
  'Earthworks & Excavation',
  'Compaction',
  'Haulage & Transport',
  'Paving & Surfacing',
  'Concrete & Batching',
  'Lifting & Crane',
  'Drilling & Piling',
  'Surveying & Testing',
  'Water & Drainage',
  'General / Support',
];

export const EQUIPMENT_LIST = [
  // Earthworks & Excavation
  { name: 'Bulldozer (D6)', category: 'Earthworks & Excavation' },
  { name: 'Bulldozer (D7)', category: 'Earthworks & Excavation' },
  { name: 'Bulldozer (D8)', category: 'Earthworks & Excavation' },
  { name: 'Excavator (20-ton)', category: 'Earthworks & Excavation' },
  { name: 'Excavator (30-ton)', category: 'Earthworks & Excavation' },
  { name: 'Excavator (45-ton)', category: 'Earthworks & Excavation' },
  { name: 'Backhoe Loader', category: 'Earthworks & Excavation' },
  { name: 'Front-End Loader', category: 'Earthworks & Excavation' },
  { name: 'Wheel Loader', category: 'Earthworks & Excavation' },
  { name: 'Motor Grader (Cat 140)', category: 'Earthworks & Excavation' },
  { name: 'Motor Grader (Cat 120)', category: 'Earthworks & Excavation' },
  { name: 'Skid Steer Loader', category: 'Earthworks & Excavation' },
  { name: 'Scraper', category: 'Earthworks & Excavation' },

  // Compaction
  { name: 'Smooth Drum Roller (Single)', category: 'Compaction' },
  { name: 'Smooth Drum Roller (Double/Tandem)', category: 'Compaction' },
  { name: 'Padfoot / Sheepsfoot Roller', category: 'Compaction' },
  { name: 'Pneumatic Tyre Roller (PTR)', category: 'Compaction' },
  { name: 'Vibrating Plate Compactor', category: 'Compaction' },
  { name: 'Vibrating Rammer / Jumping Jack', category: 'Compaction' },
  { name: 'Combination Roller', category: 'Compaction' },
  { name: 'Steel Wheel Roller (Static)', category: 'Compaction' },

  // Haulage & Transport
  { name: 'Tipper Truck (10-ton)', category: 'Haulage & Transport' },
  { name: 'Tipper Truck (15-ton)', category: 'Haulage & Transport' },
  { name: 'Tipper Truck (20-ton)', category: 'Haulage & Transport' },
  { name: 'Tipper Truck (25-30 ton)', category: 'Haulage & Transport' },
  { name: 'Flatbed Truck', category: 'Haulage & Transport' },
  { name: 'Low Loader / Low-Bed Trailer', category: 'Haulage & Transport' },
  { name: 'Water Bowser / Tanker', category: 'Haulage & Transport' },
  { name: 'Bitumen Distributor / Sprayer', category: 'Haulage & Transport' },
  { name: 'Fuel Bowser', category: 'Haulage & Transport' },
  { name: 'Concrete Transit Mixer', category: 'Haulage & Transport' },
  { name: 'Prime Mover / Tractor Head', category: 'Haulage & Transport' },
  { name: 'Pickup Truck (Site)', category: 'Haulage & Transport' },
  { name: 'Personnel Bus / Site Vehicle', category: 'Haulage & Transport' },

  // Paving & Surfacing
  { name: 'Asphalt Paver / Finisher', category: 'Paving & Surfacing' },
  { name: 'Chip Spreader', category: 'Paving & Surfacing' },
  { name: 'Cold Milling Machine / Planer', category: 'Paving & Surfacing' },
  { name: 'Asphalt Recycler', category: 'Paving & Surfacing' },
  { name: 'Slurry Seal Machine', category: 'Paving & Surfacing' },
  { name: 'Tack Coat Sprayer', category: 'Paving & Surfacing' },
  { name: 'Concrete Paver (Slip-Form)', category: 'Paving & Surfacing' },
  { name: 'Kerb Laying Machine', category: 'Paving & Surfacing' },
  { name: 'Line Marking Machine', category: 'Paving & Surfacing' },
  { name: 'Asphalt Mixing Plant (Batch)', category: 'Paving & Surfacing' },
  { name: 'Asphalt Mixing Plant (Drum)', category: 'Paving & Surfacing' },
  { name: 'Bitumen Heating Tank', category: 'Paving & Surfacing' },

  // Concrete & Batching
  { name: 'Concrete Batching Plant', category: 'Concrete & Batching' },
  { name: 'Concrete Mixer (Portable)', category: 'Concrete & Batching' },
  { name: 'Concrete Pump', category: 'Concrete & Batching' },
  { name: 'Concrete Vibrator (Poker)', category: 'Concrete & Batching' },
  { name: 'Concrete Vibrator (Screed/Beam)', category: 'Concrete & Batching' },
  { name: 'Bar Bending Machine', category: 'Concrete & Batching' },
  { name: 'Bar Cutting Machine', category: 'Concrete & Batching' },

  // Lifting & Crane
  { name: 'Mobile Crane (25-ton)', category: 'Lifting & Crane' },
  { name: 'Mobile Crane (50-ton)', category: 'Lifting & Crane' },
  { name: 'Tower Crane', category: 'Lifting & Crane' },
  { name: 'Telescopic Handler / Telehandler', category: 'Lifting & Crane' },
  { name: 'Forklift', category: 'Lifting & Crane' },

  // Drilling & Piling
  { name: 'Bored Piling Rig', category: 'Drilling & Piling' },
  { name: 'Pile Driving Hammer', category: 'Drilling & Piling' },
  { name: 'Rock Drill / Pneumatic Drill', category: 'Drilling & Piling' },
  { name: 'Rock Breaker (Hydraulic)', category: 'Drilling & Piling' },
  { name: 'Jack Hammer', category: 'Drilling & Piling' },

  // Surveying & Testing
  { name: 'Total Station', category: 'Surveying & Testing' },
  { name: 'GPS/GNSS Rover', category: 'Surveying & Testing' },
  { name: 'Automatic Level', category: 'Surveying & Testing' },
  { name: 'DCP (Dynamic Cone Penetrometer)', category: 'Surveying & Testing' },
  { name: 'Nuclear Density Gauge', category: 'Surveying & Testing' },
  { name: 'Sand Replacement Apparatus', category: 'Surveying & Testing' },
  { name: 'Falling Weight Deflectometer (FWD)', category: 'Surveying & Testing' },
  { name: 'Benkelman Beam', category: 'Surveying & Testing' },
  { name: 'Core Cutting Machine', category: 'Surveying & Testing' },

  // Water & Drainage
  { name: 'Dewatering Pump', category: 'Water & Drainage' },
  { name: 'Water Pump (Centrifugal)', category: 'Water & Drainage' },
  { name: 'Pipe Laying Machine', category: 'Water & Drainage' },

  // General / Support
  { name: 'Generator Set', category: 'General / Support' },
  { name: 'Welding Machine', category: 'General / Support' },
  { name: 'Air Compressor', category: 'General / Support' },
  { name: 'Concrete Cutter / Road Saw', category: 'General / Support' },
  { name: 'Chainsaw', category: 'General / Support' },
  { name: 'Pressure Washer', category: 'General / Support' },
  { name: 'Lighting Tower / Floodlight', category: 'General / Support' },
  { name: 'Traffic Management Signs / Cones', category: 'General / Support' },
  { name: 'Crusher (Mobile)', category: 'General / Support' },
  { name: 'Screening Plant', category: 'General / Support' },
].sort((a, b) => a.name.localeCompare(b.name));

export const EQUIPMENT_STATUS_OPTIONS = [
  'Working',
  'Idle',
  'Breakdown',
  'Standby',
  'Under Maintenance',
  'Mobilising',
  'Demobilised',
];

// ─────────────────────────────────────────────
// STRUCTURES — 35+ types grouped by category
// Kenya RDM-aligned drainage, bridge, and road furniture
// ─────────────────────────────────────────────
export const STRUCTURE_CATEGORIES = [
  'Culverts',
  'Bridges & Major Crossings',
  'Drainage Structures',
  'Retaining & Protection',
  'Road Furniture & Safety',
  'Pedestrian & NMT Facilities',
  'Utilities & Services',
];

export const STRUCTURES_LIST = [
  // Culverts
  { name: 'Pipe Culvert (600mm)', category: 'Culverts' },
  { name: 'Pipe Culvert (900mm)', category: 'Culverts' },
  { name: 'Pipe Culvert (1200mm)', category: 'Culverts' },
  { name: 'Box Culvert (Single Cell)', category: 'Culverts' },
  { name: 'Box Culvert (Multi-Cell)', category: 'Culverts' },
  { name: 'Slab Culvert', category: 'Culverts' },
  { name: 'Arch Culvert', category: 'Culverts' },

  // Bridges & Major Crossings
  { name: 'Bridge (RC Deck)', category: 'Bridges & Major Crossings' },
  { name: 'Bridge (Steel Composite)', category: 'Bridges & Major Crossings' },
  { name: 'Bridge (Pre-stressed Concrete)', category: 'Bridges & Major Crossings' },
  { name: 'Pedestrian Bridge / Footbridge', category: 'Bridges & Major Crossings' },
  { name: 'Bailey Bridge (Temporary)', category: 'Bridges & Major Crossings' },
  { name: 'Vented Ford / Drift', category: 'Bridges & Major Crossings' },
  { name: 'Low-Level Crossing', category: 'Bridges & Major Crossings' },

  // Drainage Structures
  { name: 'Headwall / Wingwall', category: 'Drainage Structures' },
  { name: 'Inlet / Catch Pit', category: 'Drainage Structures' },
  { name: 'Outlet Structure / Apron', category: 'Drainage Structures' },
  { name: 'Lined Side Drain (Concrete)', category: 'Drainage Structures' },
  { name: 'Unlined Side Drain (Earth)', category: 'Drainage Structures' },
  { name: 'Mitre Drain / Turnout', category: 'Drainage Structures' },
  { name: 'Cascade / Chute Drain', category: 'Drainage Structures' },
  { name: 'Scour Check / Check Dam', category: 'Drainage Structures' },
  { name: 'Subsoil Drain / French Drain', category: 'Drainage Structures' },
  { name: 'Gabion Drain Lining', category: 'Drainage Structures' },
  { name: 'Manhole / Inspection Chamber', category: 'Drainage Structures' },
  { name: 'Stormwater Pipe (HDPE/Concrete)', category: 'Drainage Structures' },

  // Retaining & Protection
  { name: 'Gabion Wall', category: 'Retaining & Protection' },
  { name: 'Retaining Wall (RC)', category: 'Retaining & Protection' },
  { name: 'Retaining Wall (Masonry)', category: 'Retaining & Protection' },
  { name: 'Rip-Rap / Rock Pitching', category: 'Retaining & Protection' },
  { name: 'Erosion Control Blanket / Geotextile', category: 'Retaining & Protection' },
  { name: 'Slope Protection (Turfing/Sodding)', category: 'Retaining & Protection' },
  { name: 'Reinforced Earth Wall', category: 'Retaining & Protection' },

  // Road Furniture & Safety
  { name: 'Guardrail (W-beam)', category: 'Road Furniture & Safety' },
  { name: 'Guardrail (Concrete Barrier)', category: 'Road Furniture & Safety' },
  { name: 'Road Signs (Regulatory)', category: 'Road Furniture & Safety' },
  { name: 'Road Signs (Warning)', category: 'Road Furniture & Safety' },
  { name: 'Road Signs (Information)', category: 'Road Furniture & Safety' },
  { name: 'Kilometre Post / Marker', category: 'Road Furniture & Safety' },
  { name: 'Delineator Post', category: 'Road Furniture & Safety' },
  { name: 'Road Marking (Thermoplastic)', category: 'Road Furniture & Safety' },
  { name: 'Road Marking (Cold Paint)', category: 'Road Furniture & Safety' },
  { name: 'Speed Bump / Rumble Strip', category: 'Road Furniture & Safety' },
  { name: 'Raised Pedestrian Crossing', category: 'Road Furniture & Safety' },
  { name: 'Cat Eyes / Road Studs', category: 'Road Furniture & Safety' },
  { name: 'Street Lighting / Solar Lights', category: 'Road Furniture & Safety' },

  // Pedestrian & NMT Facilities
  { name: 'Sidewalk / Footpath', category: 'Pedestrian & NMT Facilities' },
  { name: 'Kerb & Channel (Concrete)', category: 'Pedestrian & NMT Facilities' },
  { name: 'Kerb & Channel (Precast)', category: 'Pedestrian & NMT Facilities' },
  { name: 'Bicycle Lane', category: 'Pedestrian & NMT Facilities' },
  { name: 'Bus Bay / Bus Stop Shelter', category: 'Pedestrian & NMT Facilities' },
  { name: 'Paved Shoulder', category: 'Pedestrian & NMT Facilities' },

  // Utilities & Services
  { name: 'Utility Duct / Service Crossing', category: 'Utilities & Services' },
  { name: 'Relocation of Power Line', category: 'Utilities & Services' },
  { name: 'Relocation of Water Main', category: 'Utilities & Services' },
  { name: 'Relocation of Telecom Cable', category: 'Utilities & Services' },
  { name: 'Toll Plaza Structure', category: 'Utilities & Services' },
  { name: 'Weighbridge', category: 'Utilities & Services' },
].sort((a, b) => a.name.localeCompare(b.name));

export const STRUCTURE_STATUS_OPTIONS = [
  'Not Started',
  'Foundation / Excavation',
  'Substructure',
  'Superstructure',
  'Backfilling',
  'Finishing',
  'Completed',
  'Defective / Remedial',
];

// ─────────────────────────────────────────────
// WORK ACTIVITIES — Kenya RDM road construction
// Grouped by bill/trade to avoid duplicates
// ─────────────────────────────────────────────
export const ACTIVITY_CATEGORIES = [
  'Preliminary & General',
  'Setting Out & Survey',
  'Clearing & Grubbing',
  'Earthworks',
  'Gravel & Pavement Layers',
  'Bituminous Works',
  'Concrete Works',
  'Drainage',
  'Structures (Bridges/Culverts)',
  'Road Furniture & Safety',
  'Environmental & Landscaping',
  'Day Works & Variations',
];

export const ACTIVITIES_LIST = [
  // Preliminary & General
  { name: 'Site establishment / camp setup', category: 'Preliminary & General' },
  { name: 'Mobilisation of equipment', category: 'Preliminary & General' },
  { name: 'Traffic management & diversions', category: 'Preliminary & General' },
  { name: 'Environmental management', category: 'Preliminary & General' },
  { name: 'Health & safety management', category: 'Preliminary & General' },
  { name: 'Quality control / laboratory testing', category: 'Preliminary & General' },
  { name: 'Material sourcing / quarry operations', category: 'Preliminary & General' },

  // Setting Out & Survey
  { name: 'Setting out centreline', category: 'Setting Out & Survey' },
  { name: 'Setting out formation level', category: 'Setting Out & Survey' },
  { name: 'Setting out structures', category: 'Setting Out & Survey' },
  { name: 'As-built survey', category: 'Setting Out & Survey' },
  { name: 'Topographic survey', category: 'Setting Out & Survey' },
  { name: 'Cross-section survey', category: 'Setting Out & Survey' },
  { name: 'Level monitoring', category: 'Setting Out & Survey' },

  // Clearing & Grubbing
  { name: 'Bush clearing', category: 'Clearing & Grubbing' },
  { name: 'Tree removal / felling', category: 'Clearing & Grubbing' },
  { name: 'Topsoil stripping', category: 'Clearing & Grubbing' },
  { name: 'Demolition of existing structures', category: 'Clearing & Grubbing' },
  { name: 'Removal of existing pavement', category: 'Clearing & Grubbing' },
  { name: 'Removal of obstructions', category: 'Clearing & Grubbing' },

  // Earthworks
  { name: 'Excavation to spoil', category: 'Earthworks' },
  { name: 'Cut to fill', category: 'Earthworks' },
  { name: 'Embankment construction', category: 'Earthworks' },
  { name: 'Filling & compaction (general)', category: 'Earthworks' },
  { name: 'Rock excavation / blasting', category: 'Earthworks' },
  { name: 'Benching of existing ground', category: 'Earthworks' },
  { name: 'Subgrade preparation', category: 'Earthworks' },
  { name: 'Subgrade improvement', category: 'Earthworks' },
  { name: 'Slope trimming & shaping', category: 'Earthworks' },
  { name: 'Borrow pit operations', category: 'Earthworks' },
  { name: 'Spoil disposal', category: 'Earthworks' },

  // Gravel & Pavement Layers
  { name: 'Improved subgrade layer', category: 'Gravel & Pavement Layers' },
  { name: 'Subbase construction (GCS)', category: 'Gravel & Pavement Layers' },
  { name: 'Base course construction (GCB/GCA)', category: 'Gravel & Pavement Layers' },
  { name: 'Gravel wearing course', category: 'Gravel & Pavement Layers' },
  { name: 'Cement stabilisation', category: 'Gravel & Pavement Layers' },
  { name: 'Lime stabilisation', category: 'Gravel & Pavement Layers' },
  { name: 'Crushing & screening', category: 'Gravel & Pavement Layers' },
  { name: 'Gravel hauling', category: 'Gravel & Pavement Layers' },
  { name: 'Watering & compaction (pavement)', category: 'Gravel & Pavement Layers' },
  { name: 'Shoulder construction', category: 'Gravel & Pavement Layers' },

  // Bituminous Works
  { name: 'Prime coat application', category: 'Bituminous Works' },
  { name: 'Tack coat application', category: 'Bituminous Works' },
  { name: 'Asphalt Concrete (AC) laying — binder course', category: 'Bituminous Works' },
  { name: 'Asphalt Concrete (AC) laying — wearing course', category: 'Bituminous Works' },
  { name: 'Surface dressing (single/double)', category: 'Bituminous Works' },
  { name: 'Slurry seal application', category: 'Bituminous Works' },
  { name: 'Cold mix patching', category: 'Bituminous Works' },
  { name: 'Milling / scarification of existing pavement', category: 'Bituminous Works' },
  { name: 'Asphalt mixing plant operations', category: 'Bituminous Works' },
  { name: 'Joint sealing', category: 'Bituminous Works' },

  // Concrete Works
  { name: 'Formwork erection', category: 'Concrete Works' },
  { name: 'Reinforcement fixing', category: 'Concrete Works' },
  { name: 'Concrete pouring', category: 'Concrete Works' },
  { name: 'Concrete curing', category: 'Concrete Works' },
  { name: 'Formwork stripping', category: 'Concrete Works' },
  { name: 'Precast element installation', category: 'Concrete Works' },

  // Drainage
  { name: 'Side drain excavation', category: 'Drainage' },
  { name: 'Lined drain construction', category: 'Drainage' },
  { name: 'Mitre drain construction', category: 'Drainage' },
  { name: 'Pipe culvert installation', category: 'Drainage' },
  { name: 'Box culvert construction', category: 'Drainage' },
  { name: 'Headwall / wingwall construction', category: 'Drainage' },
  { name: 'Inlet / catch pit construction', category: 'Drainage' },
  { name: 'Outlet apron construction', category: 'Drainage' },
  { name: 'Subsoil drain installation', category: 'Drainage' },
  { name: 'Scour check construction', category: 'Drainage' },
  { name: 'Dewatering', category: 'Drainage' },

  // Structures (Bridges/Culverts)
  { name: 'Foundation excavation (structures)', category: 'Structures (Bridges/Culverts)' },
  { name: 'Pile driving / boring', category: 'Structures (Bridges/Culverts)' },
  { name: 'Abutment construction', category: 'Structures (Bridges/Culverts)' },
  { name: 'Pier construction', category: 'Structures (Bridges/Culverts)' },
  { name: 'Deck slab construction', category: 'Structures (Bridges/Culverts)' },
  { name: 'Bearing installation', category: 'Structures (Bridges/Culverts)' },
  { name: 'Expansion joint installation', category: 'Structures (Bridges/Culverts)' },
  { name: 'Backfilling behind structures', category: 'Structures (Bridges/Culverts)' },
  { name: 'Gabion wall construction', category: 'Structures (Bridges/Culverts)' },
  { name: 'Retaining wall construction', category: 'Structures (Bridges/Culverts)' },
  { name: 'Rip-rap / rock pitching', category: 'Structures (Bridges/Culverts)' },

  // Road Furniture & Safety
  { name: 'Guardrail installation', category: 'Road Furniture & Safety' },
  { name: 'Road sign installation', category: 'Road Furniture & Safety' },
  { name: 'Road marking (line marking)', category: 'Road Furniture & Safety' },
  { name: 'Kerb & channel installation', category: 'Road Furniture & Safety' },
  { name: 'Kilometre post installation', category: 'Road Furniture & Safety' },
  { name: 'Delineator post installation', category: 'Road Furniture & Safety' },
  { name: 'Speed bump / rumble strip installation', category: 'Road Furniture & Safety' },
  { name: 'Street lighting installation', category: 'Road Furniture & Safety' },
  { name: 'Pedestrian crossing construction', category: 'Road Furniture & Safety' },

  // Environmental & Landscaping
  { name: 'Topsoil reinstatement', category: 'Environmental & Landscaping' },
  { name: 'Grass seeding / turfing', category: 'Environmental & Landscaping' },
  { name: 'Tree planting', category: 'Environmental & Landscaping' },
  { name: 'Erosion control measures', category: 'Environmental & Landscaping' },
  { name: 'Borrow pit / quarry reinstatement', category: 'Environmental & Landscaping' },
  { name: 'Dust suppression', category: 'Environmental & Landscaping' },

  // Day Works & Variations
  { name: 'Day works — labour', category: 'Day Works & Variations' },
  { name: 'Day works — equipment', category: 'Day Works & Variations' },
  { name: 'Day works — materials', category: 'Day Works & Variations' },
  { name: 'Variation works', category: 'Day Works & Variations' },
  { name: 'Emergency / remedial works', category: 'Day Works & Variations' },
].sort((a, b) => a.name.localeCompare(b.name));

// ─────────────────────────────────────────────
// QUALITY TESTS — Kenya RDM + lab standards
// ─────────────────────────────────────────────
export const QUALITY_TEST_CATEGORIES = [
  'In-Situ Density & Compaction',
  'Soil Classification',
  'Strength & Bearing',
  'Aggregate Tests',
  'Bituminous Tests',
  'Concrete Tests',
  'Survey / Geometric',
];

export const QUALITY_TESTS_LIST = [
  // In-Situ Density & Compaction
  { name: 'MDD / OMC (Proctor Test)', category: 'In-Situ Density & Compaction' },
  { name: 'Field Density Test (FDT) — Sand Replacement', category: 'In-Situ Density & Compaction' },
  { name: 'Field Density Test (FDT) — Nuclear Gauge', category: 'In-Situ Density & Compaction' },
  { name: 'Relative Compaction (%MDD)', category: 'In-Situ Density & Compaction' },

  // Soil Classification
  { name: 'Atterberg Limits (LL, PL, PI)', category: 'Soil Classification' },
  { name: 'Grading / Sieve Analysis', category: 'Soil Classification' },
  { name: 'Linear Shrinkage', category: 'Soil Classification' },
  { name: 'Moisture Content', category: 'Soil Classification' },
  { name: 'Specific Gravity', category: 'Soil Classification' },

  // Strength & Bearing
  { name: 'CBR (California Bearing Ratio)', category: 'Strength & Bearing' },
  { name: 'DCP (Dynamic Cone Penetrometer)', category: 'Strength & Bearing' },
  { name: 'UCS (Unconfined Compressive Strength)', category: 'Strength & Bearing' },
  { name: 'Plate Bearing Test', category: 'Strength & Bearing' },
  { name: 'Benkelman Beam Deflection', category: 'Strength & Bearing' },
  { name: 'FWD (Falling Weight Deflectometer)', category: 'Strength & Bearing' },

  // Aggregate Tests
  { name: 'ACV (Aggregate Crushing Value)', category: 'Aggregate Tests' },
  { name: 'AIV (Aggregate Impact Value)', category: 'Aggregate Tests' },
  { name: 'LAA (Los Angeles Abrasion)', category: 'Aggregate Tests' },
  { name: 'Flakiness Index', category: 'Aggregate Tests' },
  { name: 'Elongation Index', category: 'Aggregate Tests' },
  { name: 'Aggregate Grading', category: 'Aggregate Tests' },
  { name: 'Soundness Test (MgSO4 / Na2SO4)', category: 'Aggregate Tests' },
  { name: 'Water Absorption', category: 'Aggregate Tests' },

  // Bituminous Tests
  { name: 'Marshall Stability & Flow', category: 'Bituminous Tests' },
  { name: 'Bitumen Penetration', category: 'Bituminous Tests' },
  { name: 'Softening Point (Ring & Ball)', category: 'Bituminous Tests' },
  { name: 'Bitumen Content (Extraction)', category: 'Bituminous Tests' },
  { name: 'Core Density & Void Analysis', category: 'Bituminous Tests' },
  { name: 'Asphalt Temperature Check', category: 'Bituminous Tests' },
  { name: 'Film Thickness', category: 'Bituminous Tests' },
  { name: 'Surface Texture Depth (Sand Patch)', category: 'Bituminous Tests' },

  // Concrete Tests
  { name: 'Cube Crushing Strength (7-day)', category: 'Concrete Tests' },
  { name: 'Cube Crushing Strength (28-day)', category: 'Concrete Tests' },
  { name: 'Slump Test', category: 'Concrete Tests' },
  { name: 'Concrete Temperature Check', category: 'Concrete Tests' },
  { name: 'Concrete Cover Survey', category: 'Concrete Tests' },

  // Survey / Geometric
  { name: 'Level Survey (Formation)', category: 'Survey / Geometric' },
  { name: 'Level Survey (Subbase)', category: 'Survey / Geometric' },
  { name: 'Level Survey (Base)', category: 'Survey / Geometric' },
  { name: 'Level Survey (Final Surface)', category: 'Survey / Geometric' },
  { name: 'Cross-Fall / Camber Check', category: 'Survey / Geometric' },
  { name: 'Straightedge / Surface Regularity', category: 'Survey / Geometric' },
  { name: 'Roughness (IRI / BI)', category: 'Survey / Geometric' },
].sort((a, b) => a.name.localeCompare(b.name));

// ─────────────────────────────────────────────
// ISSUE CATEGORIES
// ─────────────────────────────────────────────
export const ISSUE_CATEGORIES = [
  'Safety Incident',
  'Quality Non-Conformance',
  'Environmental Issue',
  'Design Discrepancy',
  'Right of Way / Land Issue',
  'Utility Conflict',
  'Community / Stakeholder Complaint',
  'Weather Delay',
  'Equipment Breakdown (Critical)',
  'Material Supply Delay',
  'Contractual Issue (FIDIC)',
  'Workforce Issue',
  'Survey / Alignment Error',
  'Other',
];

// ─────────────────────────────────────────────
// MATERIAL TYPES — common Kenya road materials
// ─────────────────────────────────────────────
export const MATERIALS_LIST = [
  'Natural Gravel (GCS/GCB)',
  'Crushed Stone Aggregate',
  'Hand-Packed Stone',
  'Murram',
  'Sand (Building)',
  'Sand (River)',
  'Cement (OPC 42.5)',
  'Cement (PPC)',
  'Lime',
  'Bitumen MC-30 (Cutback)',
  'Bitumen MC-70 (Cutback)',
  'Bitumen 60/70 (Pen Grade)',
  'Bitumen 80/100 (Pen Grade)',
  'Bitumen Emulsion (K1-60)',
  'Asphalt Concrete (AC)',
  'Steel Reinforcement (Y-bars)',
  'Steel Reinforcement (R-bars)',
  'BRC Mesh',
  'Gabion Baskets',
  'Geotextile Fabric',
  'Concrete Pipes (Various Dia.)',
  'HDPE Pipes',
  'Precast Concrete Kerbs',
  'Precast Concrete Drain Channels',
  'Road Signs (Reflective)',
  'Guardrail (W-beam)',
  'Road Studs / Cat Eyes',
  'Thermoplastic Paint',
  'Cold Paint',
  'Timber (Formwork)',
  'Water (Construction)',
  'Admixtures (Concrete)',
  'Expansion Joint Filler',
  'PVC Waterstop',
  'Gabion Wire / Stone',
].sort((a, b) => a.localeCompare(b));

// ─────────────────────────────────────────────
// HELPER: Search/filter any list
// ─────────────────────────────────────────────
export function searchItems(items, query, key = 'name') {
  if (!query || !query.trim()) return items;
  const q = query.toLowerCase().trim();
  return items.filter(item => {
    const val = typeof item === 'string' ? item : item[key];
    return val.toLowerCase().includes(q);
  });
}

export function getByCategory(items, category) {
  if (!category || category === 'All') return items;
  return items.filter(item => item.category === category);
}

export function groupByCategory(items) {
  const groups = {};
  items.forEach(item => {
    const cat = item.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  return groups;
}
