/**
 * autosave.js — Three-layer autosave for Submit Report wizard
 *
 * Layer 1: localStorage  — instant, every field change (debounced 500ms)
 * Layer 2: Server draft   — Supabase `report_drafts` table, every 30s when dirty
 * Layer 3: Final submit   — existing handleSubmit flow (unchanged)
 *
 * Recovery: on wizard mount, check localStorage first (fastest), then server draft.
 * Whichever is newer wins.
 */

import { supabase } from './supabase';

const LS_KEY_PREFIX = 'roadsite_draft_';

// ── State keys that get serialized ──
// Photos (File objects) can't be serialized — we store counts only
export const SERIALIZABLE_KEYS = [
  'form', 'step', 'selectedProject',
  'worksEntries', 'equipEntries', 'structEntries', 'testEntries',
  'issueEntries', 'instructionEntries', 'materialEntries',
  'contractorPresence', 'supervisionPresence',
  'contractorLabour', 'supervisionLabour',
  'nilSections',
];

// ── localStorage helpers ──

function lsKey(userId) {
  return `${LS_KEY_PREFIX}${userId}`;
}

export function saveToLocalStorage(userId, state) {
  try {
    const payload = {};
    for (const key of SERIALIZABLE_KEYS) {
      if (state[key] !== undefined) payload[key] = state[key];
    }
    payload._savedAt = Date.now();
    payload._version = 2; // bump if schema changes
    localStorage.setItem(lsKey(userId), JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn('[Autosave] localStorage save failed:', e);
    return false;
  }
}

export function loadFromLocalStorage(userId) {
  try {
    const raw = localStorage.getItem(lsKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed._version || !parsed._savedAt) return null;
    // Expire after 48 hours
    if (Date.now() - parsed._savedAt > 48 * 60 * 60 * 1000) {
      localStorage.removeItem(lsKey(userId));
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('[Autosave] localStorage load failed:', e);
    return null;
  }
}

export function clearLocalStorage(userId) {
  try {
    localStorage.removeItem(lsKey(userId));
  } catch (e) {
    // ignore
  }
}

// ── Server Draft helpers (Supabase `report_drafts` table) ──

export async function saveServerDraft(userId, state) {
  try {
    const payload = {};
    for (const key of SERIALIZABLE_KEYS) {
      if (state[key] !== undefined) payload[key] = state[key];
    }
    const { error } = await supabase.from('report_drafts').upsert({
      user_id: userId,
      draft_data: payload,
      project_id: state.selectedProject || null,
      current_step: state.step || 1,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('[Autosave] Server draft save failed:', e);
    return false;
  }
}

export async function loadServerDraft(userId) {
  try {
    const { data, error } = await supabase
      .from('report_drafts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    // Expire after 48 hours
    const updatedAt = new Date(data.updated_at).getTime();
    if (Date.now() - updatedAt > 48 * 60 * 60 * 1000) {
      await clearServerDraft(userId);
      return null;
    }
    return {
      ...data.draft_data,
      _savedAt: updatedAt,
      _source: 'server',
    };
  } catch (e) {
    console.warn('[Autosave] Server draft load failed:', e);
    return null;
  }
}

export async function clearServerDraft(userId) {
  try {
    await supabase.from('report_drafts').delete().eq('user_id', userId);
  } catch (e) {
    // ignore
  }
}

// ── Recovery: pick the newest draft ──

export async function recoverDraft(userId) {
  const lsDraft = loadFromLocalStorage(userId);
  const serverDraft = await loadServerDraft(userId);

  if (!lsDraft && !serverDraft) return null;
  if (!lsDraft) return { ...serverDraft, _source: 'server' };
  if (!serverDraft) return { ...lsDraft, _source: 'local' };

  // Return whichever is newer
  return (lsDraft._savedAt || 0) >= (serverDraft._savedAt || 0)
    ? { ...lsDraft, _source: 'local' }
    : { ...serverDraft, _source: 'server' };
}

// ── Clear all drafts (after successful submit) ──

export async function clearAllDrafts(userId) {
  clearLocalStorage(userId);
  await clearServerDraft(userId);
}
