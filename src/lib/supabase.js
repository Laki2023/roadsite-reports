import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://gyqmlynozcnzihbsfyfx.supabase.co';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_leUaxFyWfgWEpwAGyVIaJQ_SjXXLu1p';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* Role hierarchy (matches user_role enum in database):
   director_general > super_admin > engineer > project_engineer > resident_engineer > inspector > viewer > pending
   Each level can do everything below it. */
const ROLE_LEVELS = {
  director_general: 7,
  super_admin: 6,
  engineer: 5,
  project_engineer: 4,
  resident_engineer: 3,
  inspector: 2,
  contractor_qs: 1.5,
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

export const ALL_ROLES = ['director_general', 'super_admin', 'engineer', 'project_engineer', 'resident_engineer', 'inspector', 'contractor_qs', 'viewer', 'pending'];

export const ROLE_LABELS = {
  director_general: 'Director General',
  super_admin: 'Super Admin',
  engineer: 'Engineer',
  project_engineer: 'Project Engineer',
  resident_engineer: 'Resident Engineer',
  inspector: 'Inspector',
  contractor_qs: "Contractor Staff",
  viewer: 'Viewer',
  pending: 'Pending Approval',
};

export const ROLE_COLORS = {
  director_general: { bg: '#fdf2f8', text: '#9d174d', border: '#ec4899' },
  super_admin: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  engineer:    { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  project_engineer: { bg: '#cffafe', text: '#155e75', border: '#06b6d4' },
  resident_engineer: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  inspector:   { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },
  contractor_qs: { bg: '#fed7aa', text: '#9a3412', border: '#f97316' },
  viewer:      { bg: '#f3f4f6', text: '#374151', border: '#9ca3af' },
  pending:     { bg: '#fef2f2', text: '#991b1b', border: '#fca5a5' },
};

/* ══════════════════════════════════════════════════════════════
   APPROVAL AUTHORITY & ESCALATION SYSTEM
   Based on FIDIC chain of command for Kenyan road projects.
   ══════════════════════════════════════════════════════════════ */

/**
 * What each role can approve / action without escalation.
 * Anything above their authority must be escalated up.
 */
export const APPROVAL_AUTHORITY = {
  inspector: {
    label: 'Inspector of Works',
    canApprove: [],
    canSubmit: ['daily_report', 'quality_test', 'site_issue', 'emergency'],
    canIssue: [],
    escalateTo: 'resident_engineer',
  },
  resident_engineer: {
    label: 'Resident Engineer',
    canApprove: ['daily_report', 'quality_test', 'material_approval', 'pavement_layer', 'minor_works_change'],
    canSubmit: ['daily_report', 'quality_test', 'site_issue', 'emergency', 'site_instruction'],
    canIssue: ['site_instruction', 'noncompliance_notice', 'defect_notice'],
    escalateTo: 'project_engineer',
  },
  project_engineer: {
    label: "Engineer's Representative",
    canApprove: ['daily_report', 'quality_test', 'material_approval', 'pavement_layer', 'minor_works_change',
                 'site_instruction', 'interim_payment', 'programme_update', 'design_change_minor'],
    canSubmit: ['daily_report', 'quality_test', 'site_issue', 'emergency', 'site_instruction', 'ipc'],
    canIssue: ['site_instruction', 'noncompliance_notice', 'defect_notice', 'variation_order_minor', 'engineer_instruction'],
    escalateTo: 'engineer',
  },
  engineer: {
    label: 'The Engineer',
    canApprove: ['daily_report', 'quality_test', 'material_approval', 'pavement_layer', 'minor_works_change',
                 'site_instruction', 'interim_payment', 'programme_update', 'design_change_minor',
                 'variation_order', 'eot_claim', 'cost_claim', 'design_change_major', 'taking_over'],
    canSubmit: ['daily_report', 'quality_test', 'site_issue', 'emergency', 'site_instruction', 'ipc', 'eot_determination', 'final_payment'],
    canIssue: ['site_instruction', 'noncompliance_notice', 'defect_notice', 'variation_order_minor',
               'engineer_instruction', 'variation_order', 'taking_over_certificate', 'payment_certificate'],
    escalateTo: 'super_admin',
  },
  super_admin: {
    label: 'Employer (DG)',
    canApprove: ['*'], // everything
    canSubmit: ['*'],
    canIssue: ['*'],
    escalateTo: null, // top of chain
  },
};

/**
 * Check if a user role can approve a specific item type.
 * @param {string} userRole - current user's role
 * @param {string} itemType - type of item to approve (e.g. 'site_instruction', 'variation_order')
 * @param {boolean} isPlatformAdmin - platform admin override
 * @returns {{ allowed: boolean, escalateTo: string|null }}
 */
export function canApproveItem(userRole, itemType, isPlatformAdmin = false) {
  // Platform admin can approve everything
  if (isPlatformAdmin) return { allowed: true, escalateTo: null };

  const authority = APPROVAL_AUTHORITY[userRole];
  if (!authority) return { allowed: false, escalateTo: 'resident_engineer' };

  // Wildcard = can approve everything
  if (authority.canApprove.includes('*') || authority.canApprove.includes(itemType)) {
    return { allowed: true, escalateTo: null };
  }

  // Not allowed — must escalate
  return { allowed: false, escalateTo: authority.escalateTo };
}

/**
 * Check if a user role can issue a specific instruction/notice type.
 */
export function canIssueItem(userRole, itemType, isPlatformAdmin = false) {
  if (isPlatformAdmin) return { allowed: true, escalateTo: null };

  const authority = APPROVAL_AUTHORITY[userRole];
  if (!authority) return { allowed: false, escalateTo: 'resident_engineer' };

  if (authority.canIssue.includes('*') || authority.canIssue.includes(itemType)) {
    return { allowed: true, escalateTo: null };
  }

  return { allowed: false, escalateTo: authority.escalateTo };
}

/**
 * Get the full escalation chain from a given role up to super_admin.
 * e.g. getEscalationChain('inspector') → ['resident_engineer', 'project_engineer', 'engineer', 'super_admin']
 */
export function getEscalationChain(fromRole) {
  const chain = [];
  let current = APPROVAL_AUTHORITY[fromRole]?.escalateTo;
  while (current) {
    chain.push(current);
    current = APPROVAL_AUTHORITY[current]?.escalateTo;
  }
  return chain;
}

/**
 * Get the next role up for escalation.
 */
export function getEscalationTarget(fromRole) {
  return APPROVAL_AUTHORITY[fromRole]?.escalateTo || null;
}

/**
 * Instruction types that can be issued in the system.
 */
export const INSTRUCTION_TYPES = [
  { key: 'site_instruction', label: 'Site Instruction', minRole: 'resident_engineer', fidic: 'Cl. 3.3' },
  { key: 'engineer_instruction', label: "Engineer's Instruction", minRole: 'project_engineer', fidic: 'Cl. 3.3' },
  { key: 'variation_order_minor', label: 'Variation Order (Minor)', minRole: 'project_engineer', fidic: 'Cl. 13.1' },
  { key: 'variation_order', label: 'Variation Order', minRole: 'engineer', fidic: 'Cl. 13.1' },
  { key: 'noncompliance_notice', label: 'Non-Compliance Notice', minRole: 'resident_engineer', fidic: 'Cl. 7.5' },
  { key: 'defect_notice', label: 'Defect Notice', minRole: 'resident_engineer', fidic: 'Cl. 11.1' },
  { key: 'taking_over_certificate', label: 'Taking-Over Certificate', minRole: 'engineer', fidic: 'Cl. 10.1' },
  { key: 'payment_certificate', label: 'Payment Certificate', minRole: 'engineer', fidic: 'Cl. 14.6' },
];

/**
 * Approval item types with descriptions.
 */
export const APPROVAL_TYPES = [
  { key: 'daily_report', label: 'Daily Site Report', minRole: 'resident_engineer' },
  { key: 'quality_test', label: 'Quality Test Result', minRole: 'resident_engineer' },
  { key: 'material_approval', label: 'Material Approval', minRole: 'resident_engineer' },
  { key: 'pavement_layer', label: 'Pavement Layer Approval', minRole: 'resident_engineer' },
  { key: 'minor_works_change', label: 'Minor Works Change', minRole: 'resident_engineer' },
  { key: 'site_instruction', label: 'Site Instruction', minRole: 'project_engineer' },
  { key: 'interim_payment', label: 'Interim Payment Certificate', minRole: 'project_engineer' },
  { key: 'programme_update', label: 'Programme Update', minRole: 'project_engineer' },
  { key: 'design_change_minor', label: 'Design Change (Minor)', minRole: 'project_engineer' },
  { key: 'variation_order', label: 'Variation Order', minRole: 'engineer' },
  { key: 'eot_claim', label: 'Extension of Time Claim', minRole: 'engineer' },
  { key: 'cost_claim', label: 'Cost Claim', minRole: 'engineer' },
  { key: 'design_change_major', label: 'Design Change (Major)', minRole: 'engineer' },
  { key: 'taking_over', label: 'Taking Over', minRole: 'engineer' },
];

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
