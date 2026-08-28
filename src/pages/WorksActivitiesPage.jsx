import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';
import {
  ACTIVITIES_LIST, ACTIVITY_CATEGORIES,
  groupByCategory,
} from '../data/referenceData';
import { generateWorksDocx } from '../lib/generateWorksDocx';
import { syncWorksActivity } from '../lib/syncWorksActivity';
import { parseChainage, fmtChainage as fmtCh } from '../lib/utils';


const CATEGORY_COLORS = {
  'Preliminary & General': '#6366f1', 'Setting Out & Survey': '#8b5cf6',
  'Clearing & Grubbing': '#a16207', 'Earthworks': '#d97706',
  'Gravel & Pavement Layers': '#ea580c', 'Bituminous Works': '#4b5563',
  'Concrete Works': '#0891b2', 'Drainage': '#0d9488',
  'Structures (Bridges/Culverts)': '#1d4ed8', 'Road Furniture & Safety': '#059669',
  'Environmental & Landscaping': '#16a34a', 'Day Works & Variations': '#6b7280',
};

export default function WorksActivitiesPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [entries, setEntries] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tab, setTab] = useState('summary');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedActivity, setExpandedActivity] = useState(null);

  // Log form state
  const [logForm, setLogForm] = useState({
    work_date: new Date().toISOString().split('T')[0],
    activity: '', category: '',
    chainage_from: '', chainage_to: '',
    side: 'Both', width_m: '', notes: '',
  });
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  useEffect(() => {
    supabase.from('projects').select('id, name, category').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => { if (selectedProject) { loadEntries(); loadActivities(); } }, [selectedProject]);

  async function loadEntries() {
    const { data } = await supabase.from('works_progress')
      .select('*, reporter:reported_by(full_name)')
      .eq('project_id', selectedProject)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    setEntries(data || []);
  }

  async function loadActivities() {
    const { data } = await supabase.from('works_activities')
      .select('id, activity_name, activity_code, category, unit, planned_quantity, completed_quantity, status, last_progress_date')
      .eq('project_id', selectedProject)
      .order('sort_order');
    setActivities(data || []);
  }

  // ── Save a single activity entry ──
  async function saveEntry(e) {
    e.preventDefault();
    if (!logForm.activity) { showToast('Select an activity', 'error'); return; }
    setSaving(true);
    try {
      const chFrom = parseChainage(logForm.chainage_from);
      const chTo = parseChainage(logForm.chainage_to);
      const length = chFrom != null && chTo != null ? Math.abs(chTo - chFrom) : 0;

      // Find or create matching works_activities record so Dashboard picks up progress
      const activityId = await syncWorksActivity(selectedProject, null, logForm.activity, logForm.category);

      const { error } = await supabase.from('works_progress').insert({
        project_id: selectedProject,
        work_date: logForm.work_date,
        activity_id: activityId || null,
        start_chainage: chFrom || 0,
        end_chainage: chTo || 0,
        side: logForm.side || 'Both',
        quantity: length,
        notes: `${logForm.activity}${logForm.category ? ' [' + logForm.category + ']' : ''}${logForm.width_m ? ' | Width: ' + logForm.width_m + 'm' : ''}${logForm.notes ? ' — ' + logForm.notes : ''}`,
        reported_by: profile.id,
      });
      if (error) throw error;

      // Re-sync the works_activities row with updated totals from works_progress
      if (activityId) {
        await syncWorksActivity(selectedProject, activityId);
      }

      showToast(`✅ ${logForm.activity} logged — ${fmtCh(chFrom)} → ${fmtCh(chTo)}`);
      // Reset form but keep date and project
      setLogForm(prev => ({ ...prev, activity: '', category: '', chainage_from: '', chainage_to: '', side: 'Both', width_m: '', notes: '' }));
      loadEntries();
      loadActivities();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete an entry ──
  async function deleteEntry(id) {
    if (!window.confirm('Delete this activity entry?')) return;
    // Get the activity_id before deleting so we can re-sync
    const { data: entry } = await supabase.from('works_progress').select('activity_id').eq('id', id).single();
    await supabase.from('works_progress').delete().eq('id', id);
    // Re-sync the works_activities totals after deletion
    if (entry?.activity_id) {
      await syncWorksActivity(selectedProject, entry.activity_id);
    }
    showToast('Entry deleted');
    loadEntries();
    loadActivities();
  }

  // ── Export to Word ──
  async function exportWord() {
    if (entries.length === 0) { showToast('No activities to export', 'error'); return; }
    setExporting(true);
    try {
      const proj = projects.find(p => p.id === selectedProject);
      const fileName = await generateWorksDocx({
        project: proj || { name: 'Project' },
        entries,
      });
      showToast(`Exported ${fileName}`);
    } catch (err) {
      showToast('Export failed: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  // ── Group entries by date ──
  const grouped = {};
  entries.forEach(e => {
    const d = e.work_date || 'Unknown';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(e);
  });
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // ── Activity picker — filter by search ──
  const groupedActivities = groupByCategory(ACTIVITIES_LIST);
  const filteredActivities = pickerSearch.trim()
    ? ACTIVITIES_LIST.filter(a => a.name.toLowerCase().includes(pickerSearch.toLowerCase().trim()))
    : ACTIVITIES_LIST;
  const filteredGrouped = groupByCategory(filteredActivities);

  // ── Parse activity name and category from notes for display ──
  function parseEntry(entry) {
    const notes = entry.notes || '';
    const actMatch = notes.match(/^([^[\]—]+?)(?:\s*\[([^\]]+)\])?(?:\s*\|.*?)?(?:\s*—\s*(.*))?$/);
    return {
      activity: actMatch?.[1]?.trim() || notes.split(' — ')[0] || 'Activity',
      category: actMatch?.[2] || '',
      extraNotes: actMatch?.[3] || '',
    };
  }

  const todayEntries = entries.filter(e => e.work_date === logForm.work_date);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>⚒️ Work Activities</h2>
          <div className="subtitle">Log daily construction activities by chainage</div>
        </div>
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && (
        <>
          <div className="tabs">
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>
              📊 Activity Summary ({activities.length})
            </button>
            <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
              📝 Log Activity
            </button>
            <button className={tab === 'daily' ? 'active' : ''} onClick={() => setTab('daily')}>
              📋 Daily View ({sortedDates.length} days)
            </button>
          </div>

          {/* ══════ ACTIVITY SUMMARY TAB ══════ */}
          {tab === 'summary' && (
            <div>
              {activities.length === 0 ? (
                <div className="card empty-state">
                  <div className="icon">📊</div>
                  <p>No activities registered yet</p>
                  <p className="text-sm text-muted">Activities are automatically created when you log work in daily reports or the Log Activity tab</p>
                </div>
              ) : (
                activities.map(act => {
                  const pct = act.planned_quantity > 0
                    ? Math.min(100, Math.round((act.completed_quantity || 0) / act.planned_quantity * 100))
                    : 0;
                  const isExpanded = expandedActivity === act.id;
                  // Get daily entries for this activity
                  const actEntries = entries.filter(e => e.activity_id === act.id)
                    .sort((a, b) => b.work_date?.localeCompare(a.work_date));
                  const fromDailyReport = actEntries.filter(e => e.daily_report_id);
                  const fromStandalone = actEntries.filter(e => !e.daily_report_id);

                  return (
                    <div key={act.id} className="card" style={{ padding: 0, marginBottom: 8 }}>
                      {/* Activity header — clickable to expand */}
                      <div
                        onClick={() => setExpandedActivity(isExpanded ? null : act.id)}
                        style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>

                        {/* Status indicator */}
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                          background: act.status === 'Completed' ? '#10b981' : act.status === 'In Progress' ? '#e87b35' : '#6b7280',
                        }} />

                        {/* Activity info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {act.activity_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {act.category && <span style={{ marginRight: 8 }}>{act.category}</span>}
                            {act.last_progress_date && <span>Last: {act.last_progress_date}</span>}
                            {actEntries.length > 0 && <span style={{ marginLeft: 8 }}>{actEntries.length} entries</span>}
                            {fromDailyReport.length > 0 && (
                              <span style={{ marginLeft: 6, color: '#6366f1', fontWeight: 600 }}>
                                ({fromDailyReport.length} from daily reports)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div style={{ width: 140, flexShrink: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3, color: 'var(--text-muted)' }}>
                            <span>{(act.completed_quantity || 0).toFixed(2)} / {(act.planned_quantity || 0).toFixed(2)} {act.unit || 'Km'}</span>
                            <span style={{ fontWeight: 700, color: pct >= 80 ? '#10b981' : pct >= 40 ? '#e87b35' : '#ef4444' }}>{pct}%</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg-hover)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 3, transition: 'width 0.3s',
                              width: `${pct}%`,
                              background: pct >= 80 ? '#10b981' : pct >= 40 ? '#e87b35' : '#ef4444',
                            }} />
                          </div>
                        </div>

                        <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>

                      {/* Expanded: daily breakdown */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
                          {actEntries.length === 0 ? (
                            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                              No progress entries yet
                            </div>
                          ) : (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px 80px 60px', gap: 4, padding: '4px 0',
                                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
                                <span>Date</span>
                                <span>Details</span>
                                <span>Chainage</span>
                                <span>Quantity</span>
                                <span>Source</span>
                              </div>
                              {actEntries.map(e => {
                                const p = parseEntry(e);
                                return (
                                  <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 80px 80px 60px', gap: 4,
                                    padding: '6px 0', fontSize: 12, borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{e.work_date}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {p.extraNotes || e.side || '—'}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                      {fmtCh(e.start_chainage)}→{fmtCh(e.end_chainage)}
                                    </span>
                                    <span style={{ fontWeight: 600 }}>
                                      {e.quantity ? Number(e.quantity).toFixed(3) : '—'} {act.unit || 'Km'}
                                    </span>
                                    <span style={{
                                      fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600, textAlign: 'center',
                                      background: e.daily_report_id ? '#6366f120' : '#e87b3520',
                                      color: e.daily_report_id ? '#6366f1' : '#e87b35',
                                    }}>
                                      {e.daily_report_id ? 'Report' : 'Manual'}
                                    </span>
                                  </div>
                                );
                              })}

                              {/* Running total */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px',
                                fontSize: 12, fontWeight: 700, borderTop: '2px solid var(--border)', marginTop: 4 }}>
                                <span>Cumulative Total</span>
                                <span style={{ color: '#10b981' }}>
                                  {actEntries.reduce((sum, e) => sum + (parseFloat(e.quantity) || 0), 0).toFixed(3)} {act.unit || 'Km'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ══════ LOG ACTIVITY TAB ══════ */}
          {tab === 'log' && (
            <div>
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Log Work Activity</h3>

                {/* Date */}
                <div className="form-group mb-16" style={{ maxWidth: 200 }}>
                  <label>Date</label>
                  <input type="date" value={logForm.work_date} onChange={e => setLogForm({ ...logForm, work_date: e.target.value })} />
                </div>

                {/* Activity Picker */}
                <div className="form-group mb-16">
                  <label>Activity *</label>
                  <div style={{ position: 'relative' }}>
                    <div onClick={() => setShowPicker(!showPicker)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 12px', border: `1.5px solid ${showPicker ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, minHeight: 42,
                        background: 'var(--bg-card)', transition: 'border-color 0.15s' }}>
                      <span style={{ color: logForm.activity ? 'var(--text)' : 'var(--text-muted)' }}>
                        {logForm.activity || 'Tap to select activity...'}
                      </span>
                      {logForm.activity && (
                        <span onClick={e => { e.stopPropagation(); setLogForm({ ...logForm, activity: '', category: '' }); }}
                          style={{ color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', fontSize: 16 }}>×</span>
                      )}
                    </div>
                    {logForm.category && (
                      <span style={{ fontSize: 10, color: 'var(--accent)', marginTop: 3, display: 'block' }}>{logForm.category}</span>
                    )}

                    {/* Dropdown picker */}
                    {showPicker && (
                      <>
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 }} onClick={() => { setShowPicker(false); setPickerSearch(''); }} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                          marginTop: 4, border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
                          background: 'var(--bg-card)', boxShadow: '0 12px 32px rgba(0,0,0,0.2)',
                          maxHeight: 400, display: 'flex', flexDirection: 'column' }}>
                          {/* Search */}
                          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                            <input autoFocus type="text" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                              placeholder="Type to search activities..."
                              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
                                borderRadius: 4, fontSize: 13, outline: 'none', boxSizing: 'border-box',
                                background: 'var(--bg-card)', color: 'var(--text)' }} />
                          </div>
                          {/* Grouped list */}
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {(pickerSearch.trim() ? Object.entries(filteredGrouped) :
                              ACTIVITY_CATEGORIES.map(cat => [cat, filteredGrouped[cat]]).filter(([, items]) => items?.length)
                            ).map(([cat, items]) => (
                              <div key={cat}>
                                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700,
                                  color: CATEGORY_COLORS[cat] || 'var(--text-muted)',
                                  textTransform: 'uppercase', letterSpacing: '0.05em',
                                  background: 'var(--bg-hover)', position: 'sticky', top: 0 }}>
                                  {cat}
                                </div>
                                {items.map(a => (
                                  <div key={a.name}
                                    onClick={() => { setLogForm({ ...logForm, activity: a.name, category: a.category }); setShowPicker(false); setPickerSearch(''); }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                                      borderLeft: logForm.activity === a.name ? '3px solid var(--accent)' : '3px solid transparent',
                                      background: logForm.activity === a.name ? 'var(--bg-hover)' : 'transparent',
                                      fontWeight: logForm.activity === a.name ? 600 : 400 }}
                                    onMouseOver={e => { if (logForm.activity !== a.name) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                                    onMouseOut={e => { if (logForm.activity !== a.name) e.currentTarget.style.background = 'transparent'; }}>
                                    {a.name}
                                  </div>
                                ))}
                              </div>
                            ))}
                            {filteredActivities.length === 0 && (
                              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
                                No matches — type to add custom activity
                              </div>
                            )}
                            {/* Custom entry */}
                            {pickerSearch.trim() && !ACTIVITIES_LIST.some(a => a.name.toLowerCase() === pickerSearch.toLowerCase().trim()) && (
                              <div onClick={() => { setLogForm({ ...logForm, activity: pickerSearch.trim(), category: 'Other' }); setShowPicker(false); setPickerSearch(''); }}
                                style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--accent)',
                                  fontWeight: 600, borderTop: '1px solid var(--border)' }}
                                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                + Add "{pickerSearch.trim()}" as custom activity
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Chainage, Side, Width */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                  <div className="form-group mb-16">
                    <label>From Chainage</label>
                    <input type="text" value={logForm.chainage_from} onChange={e => setLogForm({ ...logForm, chainage_from: e.target.value })}
                      placeholder="e.g. 5+200" />
                  </div>
                  <div className="form-group mb-16">
                    <label>To Chainage</label>
                    <input type="text" value={logForm.chainage_to} onChange={e => setLogForm({ ...logForm, chainage_to: e.target.value })}
                      placeholder="e.g. 7+850" />
                  </div>
                  <div className="form-group mb-16">
                    <label>Side</label>
                    <select value={logForm.side} onChange={e => setLogForm({ ...logForm, side: e.target.value })}>
                      {['Both', 'LHS', 'RHS', 'Centre'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group mb-16">
                    <label>Width (m)</label>
                    <input type="number" step="0.1" value={logForm.width_m} onChange={e => setLogForm({ ...logForm, width_m: e.target.value })}
                      placeholder="e.g. 6.5" />
                  </div>
                </div>

                {/* Preview */}
                {logForm.activity && logForm.chainage_from && logForm.chainage_to && (() => {
                  const f = parseChainage(logForm.chainage_from);
                  const t = parseChainage(logForm.chainage_to);
                  if (f == null || t == null) return null;
                  const len = Math.abs(t - f);
                  return (
                    <div style={{ padding: '8px 12px', background: '#05966915', border: '1px solid #05966930',
                      borderRadius: 'var(--radius)', fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 12 }}>
                      ✅ {logForm.activity}: {fmtCh(f)} → {fmtCh(t)} ({logForm.side}) = {len.toFixed(3)} Km
                      {logForm.width_m && ` × ${logForm.width_m}m width`}
                    </div>
                  );
                })()}

                {/* Notes */}
                <div className="form-group mb-16">
                  <label>Notes</label>
                  <input type="text" value={logForm.notes} onChange={e => setLogForm({ ...logForm, notes: e.target.value })}
                    placeholder="e.g. Gravel from Kamweti quarry, 2 tippers hauling" />
                </div>

                {/* Save button */}
                <button className="btn btn-primary" onClick={saveEntry} disabled={saving || !logForm.activity}
                  style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700 }}>
                  {saving ? '⏳ Saving...' : '✅ Log This Activity'}
                </button>
              </div>

              {/* Today's entries */}
              {todayEntries.length > 0 && (
                <div className="card" style={{ padding: 16, marginTop: 16 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>
                    📋 Logged Today — {logForm.work_date} ({todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'})
                  </h3>
                  {todayEntries.map(e => {
                    const p = parseEntry(e);
                    return (
                      <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 10px', marginBottom: 6, background: 'var(--bg-hover)',
                        borderRadius: 'var(--radius)', borderLeft: `3px solid ${CATEGORY_COLORS[p.category] || '#6b7280'}` }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.activity}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {fmtCh(e.start_chainage)} → {fmtCh(e.end_chainage)} | {e.side}
                            {e.quantity > 0 && ` | ${Number(e.quantity).toFixed(3)} Km`}
                            {p.extraNotes && ` — ${p.extraNotes}`}
                          </div>
                        </div>
                        <button onClick={() => deleteEntry(e.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '4px 8px' }}
                          title="Delete">×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══════ DAILY VIEW TAB ══════ */}
          {tab === 'daily' && (
            <div>
              {sortedDates.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button className="btn btn-secondary" onClick={exportWord} disabled={exporting}
                    style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {exporting ? '⏳ Exporting...' : '📄 Export Word'}
                  </button>
                </div>
              )}
              {sortedDates.length === 0 ? (
                <div className="card empty-state">
                  <div className="icon">📋</div>
                  <p>No activities logged yet</p>
                  <p className="text-sm text-muted">Switch to "Log Activity" tab to start recording</p>
                </div>
              ) : (
                sortedDates.map(date => {
                  const dayEntries = grouped[date];
                  // Group this day's entries by activity category
                  const byCat = {};
                  dayEntries.forEach(e => {
                    const p = parseEntry(e);
                    const cat = p.category || 'Other';
                    if (!byCat[cat]) byCat[cat] = [];
                    byCat[cat].push({ ...e, ...p });
                  });

                  return (
                    <details key={date} className="card" style={{ marginBottom: 8, padding: 0 }}
                      open={date === new Date().toISOString().split('T')[0]}>
                      <summary style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex',
                        justifyContent: 'space-between', alignItems: 'center', userSelect: 'none',
                        fontWeight: 600, fontSize: 14, listStyle: 'none' }}>
                        <span>
                          <span style={{ color: 'var(--accent)' }}>📁 {date}</span>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                            {dayEntries.length} {dayEntries.length === 1 ? 'activity' : 'activities'}
                          </span>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>▼</span>
                      </summary>
                      <div style={{ padding: '0 16px 16px' }}>
                        {Object.entries(byCat).map(([cat, catEntries]) => (
                          <div key={cat} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                              letterSpacing: '0.05em', color: CATEGORY_COLORS[cat] || 'var(--text-muted)',
                              marginBottom: 4, paddingBottom: 3, borderBottom: `2px solid ${CATEGORY_COLORS[cat] || 'var(--border)'}30` }}>
                              {cat}
                            </div>
                            {catEntries.map(e => (
                              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start',
                                padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                <div>
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{e.activity}</span>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                    📍 {fmtCh(e.start_chainage)} → {fmtCh(e.end_chainage)}
                                    <span style={{ margin: '0 6px' }}>|</span>{e.side}
                                    {e.quantity > 0 && <><span style={{ margin: '0 6px' }}>|</span><b>{Number(e.quantity).toFixed(3)} Km</b></>}
                                    {e.extraNotes && <><span style={{ margin: '0 6px' }}>|</span>{e.extraNotes}</>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                                  {e.daily_report_id && (
                                    <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                                      background: '#6366f120', color: '#6366f1' }}>Report</span>
                                  )}
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                    {e.reporter?.full_name}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
