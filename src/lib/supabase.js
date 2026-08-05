import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://gyqmlynozcnzihbsfyfx.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_leUaxFyWfgWEpwAGyVIaJQ_SjXXLu1p';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* Role hierarchy (highest to lowest):
   admin > pm > engineer > re > inspector > pending
   Each level can do everything below it. */
const ROLE_LEVELS = { admin: 6, pm: 5, engineer: 4, re: 3, inspector: 2, pending: 0 };

export function hasRole(userRole, requiredRole) {
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[requiredRole] || 0);
}

export const ROLE_LABELS = {
  admin: 'Administrator',
  pm: 'Project Manager',
  engineer: 'Engineer',
  re: 'Resident Engineer',
  inspector: 'Inspector',
  pending: 'Pending Approval',
};

export const PROJECT_CATEGORIES = ['Construction', 'Rehabilitation', 'Maintenance'];

export const FIDIC_EDITIONS = [
  'Red Book 1987', 'Red Book 1999', 'Red Book 2017',
  'Pink Book MDB 2010', 'Yellow Book 1999', 'Yellow Book 2017'
];

export const PROJECT_PHASES = [
  'Procurement', 'Mobilization', 'Construction',
  'Defects Liability', 'Completed', 'Suspended'
];

export const LAYER_TYPES = [
  'Subgrade', 'Improved Subgrade', 'Sub-base', 'Base', 'Prime Coat',
  'Tack Coat', 'Binder Course', 'Wearing Course', 'Surface Dressing', 'Seal Coat'
];

export const LAYER_STATUSES = [
  'Not Started', 'Material Approved', 'Laying In Progress',
  'Laid', 'Tested', 'Approved', 'Rejected', 'Rework'
];

export const TEST_TYPES = [
  'MDD', 'CBR', 'DCP', 'FWD', 'Marshall Stability', 'Gradation', 'Atterberg Limits',
  'Moisture Content', 'Sand Equivalent', 'Flakiness Index', 'ACV', 'AIV', 'LAA',
  'Specific Gravity', 'Bitumen Content', 'Penetration', 'Softening Point',
  'Compaction (Field)', 'Plate Bearing', 'Benkelman Beam', 'Core Extraction',
  'Slump Test', 'Cube Crushing', 'Other'
];

export const ISSUE_CATEGORIES = [
  'Safety', 'Quality', 'Programme', 'Environmental', 'Design',
  'Contractual', 'Community', 'Materials', 'Equipment', 'Weather', 'General'
];

/* Kenya RDM spec limits for common tests */
export const SPEC_LIMITS = {
  'Subgrade': {
    CBR: { min: 5, unit: '%', ref: 'Kenya RDM Part III, Table 5.1' },
    MDD: { unit: 'kg/m³', ref: 'BS 1377:Part 4 / KS 02-26' },
    'Compaction (Field)': { min: 95, unit: '% MDD', ref: 'Kenya RDM Part III, Cl. 5.2' },
  },
  'Sub-base': {
    CBR: { min: 30, unit: '%', ref: 'Kenya RDM Part III, Table 5.2' },
    'Compaction (Field)': { min: 97, unit: '% MDD', ref: 'Kenya RDM Part III, Cl. 5.3' },
    'Atterberg Limits': { max: 25, unit: 'PI', ref: 'Kenya RDM Part III, Table 5.2' },
    Gradation: { ref: 'Kenya RDM Part III, Table 5.2 Envelope' },
  },
  'Base': {
    CBR: { min: 80, unit: '%', ref: 'Kenya RDM Part III, Table 5.3' },
    'Compaction (Field)': { min: 98, unit: '% MDD', ref: 'Kenya RDM Part III, Cl. 5.4' },
    'Atterberg Limits': { max: 6, unit: 'PI', ref: 'Kenya RDM Part III, Table 5.3' },
    LAA: { max: 45, unit: '%', ref: 'Kenya RDM Part III, Table 5.3' },
  },
  'Binder Course': {
    'Marshall Stability': { min: 9, unit: 'kN', ref: 'Kenya RDM Part III, Table 8.1' },
    'Compaction (Field)': { min: 95, unit: '% Marshall', ref: 'Kenya RDM Part III, Cl. 8.4' },
    'Bitumen Content': { min: 4.0, max: 7.0, unit: '%', ref: 'Kenya RDM Part III' },
  },
  'Wearing Course': {
    'Marshall Stability': { min: 9, unit: 'kN', ref: 'Kenya RDM Part III, Table 8.1' },
    'Compaction (Field)': { min: 96, unit: '% Marshall', ref: 'Kenya RDM Part III, Cl. 8.4' },
    'Bitumen Content': { min: 4.5, max: 7.5, unit: '%', ref: 'Kenya RDM Part III' },
  },
};
