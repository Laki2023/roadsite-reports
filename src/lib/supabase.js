import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://gyqmlynozcnzihbsfyfx.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_leUaxFyWfgWEpwAGyVIaJQ_SjXXLu1p';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* Role hierarchy (matches user_role enum in database):
   super_admin > engineer > resident_engineer > inspector > viewer > pending
   Each level can do everything below it. */
const ROLE_LEVELS = {
  super_admin: 5,
  engineer: 4,
  resident_engineer: 3,
  inspector: 2,
  viewer: 1,
  pending: 0,
};

export { ROLE_LEVELS };

export function hasRole(userRole, requiredRole) {
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[requiredRole] || 0);
}

/** Roles a given user role is allowed to assign (strictly below own level) */
export function assignableRoles(userRole) {
  const level = ROLE_LEVELS[userRole] || 0;
  return ALL_ROLES.filter(r => ROLE_LEVELS[r] < level && r !== 'pending');
}

export const ALL_ROLES = ['super_admin', 'engineer', 'resident_engineer', 'inspector', 'viewer', 'pending'];

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  engineer: 'Engineer',
  resident_engineer: 'Resident Engineer',
  inspector: 'Inspector',
  viewer: 'Viewer',
  pending: 'Pending Approval',
};

export const ROLE_COLORS = {
  super_admin: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  engineer:    { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  resident_engineer: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  inspector:   { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },
  viewer:      { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  pending:     { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
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
