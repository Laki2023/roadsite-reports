/**
 * Standard production rates for Kenya road construction.
 * Based on Kenya Road Design Manual, KeNHA project experience,
 * and typical contractor capacity for Class A/B roads.
 * 
 * Rates are conservative (achievable) — used to estimate
 * realistic durations from planned quantities.
 * 
 * Format: { unit, rate_per_day, min_rate, max_rate, notes }
 */

const PRODUCTION_RATES = {
  // ── PRELIMINARY & GENERAL ──
  'Site Clearance': { unit: 'm²', rate_per_day: 5000, min: 3000, max: 8000 },
  'Bush Clearing': { unit: 'm²', rate_per_day: 4000, min: 2000, max: 6000 },
  'Topsoil Stripping': { unit: 'm³', rate_per_day: 800, min: 500, max: 1200 },
  'Demolition': { unit: 'm³', rate_per_day: 200, min: 100, max: 400 },

  // ── EARTHWORKS ──
  'Excavation to Spoil': { unit: 'm³', rate_per_day: 1000, min: 600, max: 1500 },
  'Cut to Fill': { unit: 'm³', rate_per_day: 800, min: 500, max: 1200 },
  'Borrow to Fill': { unit: 'm³', rate_per_day: 600, min: 400, max: 1000 },
  'Fill and Compact': { unit: 'm³', rate_per_day: 600, min: 400, max: 900 },
  'Selected Fill': { unit: 'm³', rate_per_day: 500, min: 300, max: 800 },
  'Rock Fill': { unit: 'm³', rate_per_day: 400, min: 200, max: 600 },
  'Earthworks': { unit: 'm³', rate_per_day: 700, min: 400, max: 1200 },
  'Excavation': { unit: 'm³', rate_per_day: 800, min: 500, max: 1200 },

  // ── PAVEMENT LAYERS ──
  'Improved Subgrade': { unit: 'm³', rate_per_day: 400, min: 250, max: 600 },
  'Subbase': { unit: 'm³', rate_per_day: 350, min: 200, max: 500 },
  'Subbase Construction': { unit: 'm³', rate_per_day: 350, min: 200, max: 500 },
  'Base Course': { unit: 'm³', rate_per_day: 300, min: 180, max: 450 },
  'Cement Stabilised Base': { unit: 'm³', rate_per_day: 250, min: 150, max: 400 },
  'Gravel Wearing Course': { unit: 'm³', rate_per_day: 400, min: 250, max: 600 },
  'Prime Coat': { unit: 'm²', rate_per_day: 5000, min: 3000, max: 8000 },
  'Tack Coat': { unit: 'm²', rate_per_day: 6000, min: 4000, max: 10000 },
  'Surface Dressing': { unit: 'm²', rate_per_day: 4000, min: 2500, max: 6000 },
  'Double Surface Dressing': { unit: 'm²', rate_per_day: 3000, min: 2000, max: 5000 },
  'Asphalt Concrete': { unit: 'm²', rate_per_day: 2000, min: 1200, max: 3500 },
  'AC Wearing Course': { unit: 'm²', rate_per_day: 2000, min: 1200, max: 3500 },
  'AC Binder Course': { unit: 'm²', rate_per_day: 2200, min: 1500, max: 3500 },
  'Dense Bitumen Macadam': { unit: 'm²', rate_per_day: 1800, min: 1000, max: 3000 },
  'Bituminous': { unit: 'm²', rate_per_day: 2000, min: 1200, max: 3500 },

  // ── DRAINAGE ──
  'Side Drains': { unit: 'm', rate_per_day: 100, min: 60, max: 150 },
  'Lined Drains': { unit: 'm', rate_per_day: 60, min: 40, max: 100 },
  'Unlined Drains': { unit: 'm', rate_per_day: 150, min: 100, max: 250 },
  'Pipe Culverts': { unit: 'm', rate_per_day: 15, min: 8, max: 25 },
  'Box Culverts': { unit: 'No', rate_per_day: 0.1, min: 0.05, max: 0.2, notes: '~10 working days per culvert' },
  'Culvert Installation': { unit: 'm', rate_per_day: 12, min: 6, max: 20 },
  'Mitre Drains': { unit: 'm', rate_per_day: 80, min: 50, max: 120 },
  'Scour Checks': { unit: 'No', rate_per_day: 5, min: 3, max: 8 },
  'Catch Water Drains': { unit: 'm', rate_per_day: 100, min: 60, max: 150 },
  'Subsoil Drains': { unit: 'm', rate_per_day: 40, min: 25, max: 60 },
  'Drainage': { unit: 'm', rate_per_day: 80, min: 40, max: 150 },

  // ── STRUCTURES ──
  'Concrete Works': { unit: 'm³', rate_per_day: 30, min: 15, max: 50 },
  'Reinforcement': { unit: 'kg', rate_per_day: 3000, min: 2000, max: 5000 },
  'Formwork': { unit: 'm²', rate_per_day: 40, min: 25, max: 60 },
  'Bridge Construction': { unit: 'm', rate_per_day: 0.5, min: 0.3, max: 1.0, notes: '~2 months per 30m span' },
  'Gabion Walls': { unit: 'm³', rate_per_day: 20, min: 12, max: 35 },
  'Stone Masonry': { unit: 'm³', rate_per_day: 8, min: 5, max: 15 },
  'Retaining Walls': { unit: 'm³', rate_per_day: 15, min: 8, max: 25 },
  'Guard Rails': { unit: 'm', rate_per_day: 100, min: 60, max: 150 },

  // ── ROAD FURNITURE ──
  'Road Marking': { unit: 'm', rate_per_day: 2000, min: 1000, max: 4000 },
  'Road Signs': { unit: 'No', rate_per_day: 10, min: 5, max: 20 },
  'Guardrails': { unit: 'm', rate_per_day: 100, min: 60, max: 150 },
  'Kerbs': { unit: 'm', rate_per_day: 100, min: 60, max: 150 },
  'Sidewalks': { unit: 'm²', rate_per_day: 200, min: 120, max: 350 },
  'Bus Bays': { unit: 'No', rate_per_day: 0.15, min: 0.1, max: 0.25 },
  'Speed Bumps': { unit: 'No', rate_per_day: 2, min: 1, max: 4 },

  // ── ENVIRONMENTAL ──
  'Grass Planting': { unit: 'm²', rate_per_day: 2000, min: 1000, max: 4000 },
  'Tree Planting': { unit: 'No', rate_per_day: 50, min: 30, max: 100 },
  'Landscaping': { unit: 'm²', rate_per_day: 1000, min: 500, max: 2000 },
  'Environmental': { unit: 'm²', rate_per_day: 1500, min: 800, max: 3000 },
};

/**
 * Find the best matching production rate for an activity name.
 * Uses fuzzy matching to handle variations in naming.
 */
export function findProductionRate(activityName) {
  if (!activityName) return null;
  const name = activityName.toLowerCase();

  // Direct match first
  for (const [key, rate] of Object.entries(PRODUCTION_RATES)) {
    if (name === key.toLowerCase()) return { ...rate, matched: key };
  }

  // Partial match
  for (const [key, rate] of Object.entries(PRODUCTION_RATES)) {
    if (name.includes(key.toLowerCase()) || key.toLowerCase().includes(name)) {
      return { ...rate, matched: key };
    }
  }

  // Keyword match
  const keywords = {
    earthwork: 'Earthworks', excavat: 'Excavation', cut: 'Cut to Fill', fill: 'Fill and Compact',
    subbase: 'Subbase', 'sub-base': 'Subbase', 'sub base': 'Subbase',
    'base course': 'Base Course', basecourse: 'Base Course',
    asphalt: 'Asphalt Concrete', bitum: 'Bituminous', 'ac ': 'Asphalt Concrete',
    surface: 'Surface Dressing', prime: 'Prime Coat', tack: 'Tack Coat',
    drain: 'Drainage', culvert: 'Pipe Culverts', pipe: 'Pipe Culverts',
    concrete: 'Concrete Works', rebar: 'Reinforcement', reinforc: 'Reinforcement',
    gabion: 'Gabion Walls', masonry: 'Stone Masonry', retain: 'Retaining Walls',
    marking: 'Road Marking', sign: 'Road Signs', kerb: 'Kerbs', curb: 'Kerbs',
    guard: 'Guard Rails', sidewalk: 'Sidewalks', footpath: 'Sidewalks',
    grass: 'Grass Planting', tree: 'Tree Planting', landscape: 'Landscaping',
    clear: 'Site Clearance', bush: 'Bush Clearing', topsoil: 'Topsoil Stripping',
    gravel: 'Gravel Wearing Course',
  };

  for (const [keyword, rateKey] of Object.entries(keywords)) {
    if (name.includes(keyword)) {
      const rate = PRODUCTION_RATES[rateKey];
      if (rate) return { ...rate, matched: rateKey };
    }
  }

  return null;
}

/**
 * Estimate duration in working days from quantity and production rate.
 * Adds buffer for mobilisation, weather, etc.
 */
export function estimateDuration(quantity, rate, bufferFactor = 1.2) {
  if (!quantity || !rate?.rate_per_day) return 30; // default 30 days
  const rawDays = Math.ceil(quantity / rate.rate_per_day);
  return Math.max(5, Math.ceil(rawDays * bufferFactor)); // minimum 5 days
}

/**
 * Define the typical construction sequence for road projects.
 * Activities should follow this order for logical scheduling.
 */
export const CONSTRUCTION_SEQUENCE = [
  { phase: 'Preliminary', categories: ['preliminary', 'mobilisation'], order: 1 },
  { phase: 'Earthworks', categories: ['earthworks'], order: 2 },
  { phase: 'Drainage', categories: ['drainage'], order: 3 },
  { phase: 'Pavement Layers', categories: ['pavement'], order: 4 },
  { phase: 'Structures', categories: ['structures'], order: 5 },
  { phase: 'Road Furniture', categories: ['road_furniture'], order: 6 },
  { phase: 'Environmental', categories: ['environmental'], order: 7 },
  { phase: 'Demobilisation', categories: ['demobilisation'], order: 8 },
];

/**
 * Classify an activity into a construction phase based on its name and category.
 */
export function classifyActivity(activity) {
  const name = (activity.activity_name || '').toLowerCase();
  const cat = (activity.category || '').toLowerCase();

  if (cat.includes('prelim') || name.includes('mobilisation') || name.includes('site establish')) return 'preliminary';
  if (name.includes('clear') || name.includes('bush') || name.includes('topsoil') || name.includes('demolit')) return 'preliminary';
  if (name.includes('earthwork') || name.includes('excavat') || name.includes('fill') || name.includes('cut ') || name.includes('borrow')) return 'earthworks';
  if (name.includes('drain') || name.includes('culvert') || name.includes('pipe') || name.includes('mitre') || name.includes('scour') || name.includes('catch water')) return 'drainage';
  if (name.includes('subbase') || name.includes('sub-base') || name.includes('base course') || name.includes('subgrade') || name.includes('asphalt') || name.includes('bitum') || name.includes('prime') || name.includes('tack') || name.includes('surface dress') || name.includes('gravel') || name.includes('wearing')) return 'pavement';
  if (name.includes('bridge') || name.includes('concrete') || name.includes('rebar') || name.includes('reinforc') || name.includes('formwork') || name.includes('gabion') || name.includes('masonry') || name.includes('retain')) return 'structures';
  if (name.includes('marking') || name.includes('sign') || name.includes('guard') || name.includes('kerb') || name.includes('curb') || name.includes('sidewalk') || name.includes('bus bay') || name.includes('speed bump') || name.includes('footpath')) return 'road_furniture';
  if (name.includes('grass') || name.includes('tree') || name.includes('landscape') || name.includes('environ') || name.includes('reinstat')) return 'environmental';
  if (name.includes('demob') || name.includes('defect') || name.includes('handover') || name.includes('snag')) return 'demobilisation';

  // Fallback to original category
  if (cat === 'construction' || cat === 'rehabilitation') return 'pavement';
  if (cat === 'maintenance') return 'pavement';
  return 'construction';
}

export default PRODUCTION_RATES;
