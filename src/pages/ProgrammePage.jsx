import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { autoGenerateProgramme, syncProgressFromReports, parseContractorProgramme } from '../lib/programmeEngine';

const CATEGORY_COLORS = {
  preliminary: '#6366f1', mobilisation: '#8b5cf6', earthworks: '#b45309',
  pavement: '#059669', drainage: '#0284c7', structures: '#dc2626',
  road_furniture: '#7c3aed', environmental: '#16a34a', demobilisation: '#64748b',
  construction: '#e87b35', rehabilitation: '#0ea5e9', maintenance: '#f59e0b', other: '#94a3b8',
};

const STATUS_COLORS = {
  not_started: '#64748b', in_progress: '#e87b35', completed: '#059669',
  on_hold: '#f59e0b', cancelled: '#dc2626',
};

function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: '2-digit' });
}

export default function ProgrammePage({ profile, showToast, selectedProject: contextProject, navigateTo }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(contextProject?.id || '');
  const [items, setItems] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [viewMode, setViewMode] = useState('months'); // weeks | months | quarters
  const [sourceView, setSourceView] = useState('engineer'); // engineer | contractor | compare
  const [syncing, setSyncing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const ganttRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id, name, start_date, end_date').order('name');
    setProjects(data || []);
  }

  async function loadData() {
    setLoading(true);
    const [itemsRes, revsRes, actsRes] = await Promise.all([
      supabase.from('programme_items').select('*').eq('project_id', selectedProject).order('sort_order'),
      supabase.from('programme_revisions').select('*').eq('project_id', selectedProject).order('revision_number'),
      supabase.from('works_activities').select('id, activity_name, activity_code, category, planned_quantity, completed_quantity').eq('project_id', selectedProject).order('sort_order'),
    ]);
    setItems(itemsRes.data || []);
    setRevisions(revsRes.data || []);
    setActivities(actsRes.data || []);
    setLoading(false);
  }

  // ── Filter items by source view ──
  const filteredItems = useMemo(() => {
    if (sourceView === 'compare') return items;
    return items.filter(i => !i.source_type || i.source_type === sourceView);
  }, [items, sourceView]);

  const engineerItems = items.filter(i => !i.source_type || i.source_type === 'engineer');
  const contractorItems = items.filter(i => i.source_type === 'contractor');

  // ── Timeline calculations ──
  const timeline = useMemo(() => {
    if (filteredItems.length === 0) {
      const proj = projects.find(p => p.id === selectedProject);
      const start = proj?.start_date || new Date().toISOString().split('T')[0];
      const end = proj?.end_date || addDays(start, 365);
      return { start, end, totalDays: daysBetween(start, end) || 365 };
    }
    const allDates = filteredItems.flatMap(i => [i.baseline_start, i.baseline_end, i.planned_start, i.planned_end, i.actual_start, i.actual_end].filter(Boolean));
    const start = allDates.sort()[0];
    const end = allDates.sort().reverse()[0];
    const padStart = addDays(start, -14);
    const padEnd = addDays(end, 30);
    return { start: padStart, end: padEnd, totalDays: daysBetween(padStart, padEnd) };
  }, [filteredItems, selectedProject, projects]);

  // ── Generate time columns ──
  const timeColumns = useMemo(() => {
    const cols = [];
    const s = new Date(timeline.start);
    const e = new Date(timeline.end);
    if (viewMode === 'months') {
      const cur = new Date(s.getFullYear(), s.getMonth(), 1);
      while (cur <= e) {
        const label = cur.toLocaleDateString('en-KE', { month: 'short', year: '2-digit' });
        const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        cols.push({ label, days: daysInMonth, date: new Date(cur) });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (viewMode === 'weeks') {
      const cur = new Date(s);
      cur.setDate(cur.getDate() - cur.getDay() + 1); // start on Monday
      while (cur <= e) {
        const label = `W${Math.ceil(cur.getDate() / 7)} ${cur.toLocaleDateString('en-KE', { month: 'short' })}`;
        cols.push({ label, days: 7, date: new Date(cur) });
        cur.setDate(cur.getDate() + 7);
      }
    } else {
      const cur = new Date(s.getFullYear(), Math.floor(s.getMonth() / 3) * 3, 1);
      while (cur <= e) {
        const q = Math.floor(cur.getMonth() / 3) + 1;
        const label = `Q${q} ${cur.getFullYear()}`;
        const nextQ = new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
        const days = daysBetween(cur, nextQ);
        cols.push({ label, days, date: new Date(cur) });
        cur.setMonth(cur.getMonth() + 3);
      }
    }
    return cols;
  }, [timeline, viewMode]);

  const totalTimelineDays = timeColumns.reduce((s, c) => s + c.days, 0);
  const dayWidth = viewMode === 'weeks' ? 18 : viewMode === 'months' ? 4 : 1.5;
  const chartWidth = totalTimelineDays * dayWidth;

  function getBarPosition(startDate, endDate) {
    if (!startDate) return null;
    const start = daysBetween(timeline.start, startDate);
    const duration = endDate ? daysBetween(startDate, endDate) : 1;
    return { left: start * dayWidth, width: Math.max(duration * dayWidth, 4) };
  }

  // ── Slippage analysis ──
  function getSlippage(item) {
    if (!item.planned_end) return { days: 0, status: 'on_track' };
    const today = new Date().toISOString().split('T')[0];
    if (item.status === 'completed') {
      if (!item.actual_end || !item.planned_end) return { days: 0, status: 'on_track' };
      const d = daysBetween(item.planned_end, item.actual_end);
      return { days: d, status: d > 0 ? 'late' : d < 0 ? 'early' : 'on_track' };
    }
    if (item.planned_end < today && item.progress_pct < 100) {
      const d = daysBetween(item.planned_end, today);
      return { days: d, status: 'late' };
    }
    if (item.planned_start && item.planned_start <= today && item.progress_pct === 0) {
      return { days: daysBetween(item.planned_start, today), status: 'late' };
    }
    return { days: 0, status: 'on_track' };
  }

  // ── Summary stats ──
  const stats = useMemo(() => {
    const nonSummary = filteredItems.filter(i => !i.is_summary);
    const totalWeight = nonSummary.reduce((s, i) => s + (i.weight || 1), 0);
    const weightedProgress = totalWeight > 0
      ? nonSummary.reduce((s, i) => s + (i.progress_pct || 0) * (i.weight || 1), 0) / totalWeight : 0;
    const completed = nonSummary.filter(i => i.status === 'completed').length;
    const inProgress = nonSummary.filter(i => i.status === 'in_progress').length;
    const late = nonSummary.filter(i => getSlippage(i).status === 'late').length;
    const notStarted = nonSummary.filter(i => i.status === 'not_started').length;
    return { weightedProgress: weightedProgress.toFixed(1), completed, inProgress, late, notStarted, total: nonSummary.length };
  }, [filteredItems]);

  // ── Add / Edit item ──
  const emptyItem = {
    item_name: '', item_code: '', category: 'construction', is_milestone: false, is_summary: false,
    baseline_start: '', baseline_end: '', planned_start: '', planned_end: '',
    actual_start: '', actual_end: '', progress_pct: 0, weight: 1, notes: '',
    chainage_from: '', chainage_to: '', activity_id: '', sort_order: items.length,
  };

  async function saveItem(formData) {
    const payload = { ...formData, project_id: selectedProject, created_by: profile?.id };
    // Clean empty strings to null
    ['activity_id', 'parent_id', 'baseline_start', 'baseline_end', 'planned_start', 'planned_end', 'actual_start', 'actual_end']
      .forEach(k => { if (!payload[k]) payload[k] = null; });
    payload.progress_pct = parseFloat(payload.progress_pct) || 0;
    payload.weight = parseFloat(payload.weight) || 1;
    payload.sort_order = parseInt(payload.sort_order) || 0;

    let error;
    if (editItem?.id) {
      delete payload.project_id;
      delete payload.created_by;
      ({ error } = await supabase.from('programme_items').update(payload).eq('id', editItem.id));
    } else {
      ({ error } = await supabase.from('programme_items').insert(payload));
    }
    if (error) { showToast?.('Error: ' + error.message); return; }
    showToast?.(`✅ ${editItem?.id ? 'Updated' : 'Added'} programme item`);
    setShowEditor(false);
    setEditItem(null);
    loadData();
  }

  async function deleteItem(id) {
    if (!window.confirm('Delete this programme item?')) return;
    await supabase.from('programme_items').delete().eq('id', id);
    showToast?.('🗑️ Item deleted');
    loadData();
  }

  async function seedFromActivities() {
    if (items.length > 0 && !window.confirm('This will add activities not yet in the programme. Continue?')) return;
    const existing = new Set(items.map(i => i.activity_id).filter(Boolean));
    const proj = projects.find(p => p.id === selectedProject);
    const toAdd = activities.filter(a => !existing.has(a.id));
    if (toAdd.length === 0) { showToast?.('All activities already in programme'); return; }

    const baseStart = proj?.start_date || new Date().toISOString().split('T')[0];
    const inserts = toAdd.map((a, i) => ({
      project_id: selectedProject,
      activity_id: a.id,
      item_name: a.activity_name,
      item_code: a.activity_code,
      category: a.category === 'Construction' ? 'construction' : a.category === 'Rehabilitation' ? 'rehabilitation' : 'construction',
      sort_order: items.length + i,
      baseline_start: baseStart,
      baseline_end: addDays(baseStart, 90),
      planned_start: baseStart,
      planned_end: addDays(baseStart, 90),
      progress_pct: a.planned_quantity > 0 ? Math.min(100, ((a.completed_quantity || 0) / a.planned_quantity) * 100) : 0,
      weight: 1,
      source_type: sourceView === 'contractor' ? 'contractor' : 'engineer',
      created_by: profile?.id,
    }));

    const { error } = await supabase.from('programme_items').insert(inserts);
    if (error) { showToast?.('Error: ' + error.message); return; }
    showToast?.(`✅ Added ${inserts.length} activities to programme`);
    loadData();
  }

  // ── Auto-generate Engineer's Programme ──
  async function handleAutoGenerate(source = 'engineer') {
    const existing = items.filter(i => i.source_type === source);
    if (existing.length > 0) {
      if (!window.confirm(`This will delete the existing ${source === 'engineer' ? "Engineer's" : "Contractor's"} programme (${existing.length} items) and regenerate. Continue?`)) return;
      await supabase.from('programme_items').delete().eq('project_id', selectedProject).eq('source_type', source);
    }

    setGenerating(true);
    try {
      const proj = projects.find(p => p.id === selectedProject);
      const count = await autoGenerateProgramme(selectedProject, proj, activities, profile?.id, source);
      showToast?.(`✅ Auto-generated ${count} programme items (${source === 'engineer' ? "Engineer's" : "Contractor's"} estimate)`);
      loadData();
    } catch (err) {
      showToast?.('Error: ' + err.message);
    }
    setGenerating(false);
  }

  // ── Sync progress from daily reports ──
  async function handleSyncProgress() {
    setSyncing(true);
    try {
      const count = await syncProgressFromReports(selectedProject);
      showToast?.(`✅ Synced progress — ${count} items updated from daily reports`);
      loadData();
    } catch (err) {
      showToast?.('Error: ' + err.message);
    }
    setSyncing(false);
  }

  // ── Upload Contractor's Programme (CSV/Excel) ──
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const text = await file.text();
      const rows = text.split('\n').map(line => line.split(',').map(c => c.trim().replace(/^"|"$/g, '')));

      if (rows.length < 2) { showToast?.('File must have a header row and at least one data row'); return; }

      // Delete existing contractor items
      const existing = items.filter(i => i.source_type === 'contractor');
      if (existing.length > 0) {
        if (!window.confirm(`This will replace ${existing.length} existing contractor programme items. Continue?`)) return;
        await supabase.from('programme_items').delete().eq('project_id', selectedProject).eq('source_type', 'contractor');
      }

      const parsed = parseContractorProgramme(rows, selectedProject, profile?.id);
      if (parsed.length === 0) { showToast?.('No valid items found in file. Need columns: Activity Name, Start Date, End Date'); return; }

      const { error } = await supabase.from('programme_items').insert(parsed);
      if (error) { showToast?.('Error: ' + error.message); return; }

      showToast?.(`✅ Imported ${parsed.length} items from Contractor's programme`);
      setSourceView('contractor');
      loadData();
    } catch (err) {
      showToast?.('Error reading file: ' + err.message);
    }
  }

  // ── Today line position ──
  const todayPos = getBarPosition(new Date().toISOString().split('T')[0], null);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📅 Programme of Works</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Baseline vs Actual Gantt chart · FIDIC Cl. 8.3</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedProject && (
            <>
              <button className="btn btn-secondary" onClick={handleSyncProgress} disabled={syncing} style={{ fontSize: 11 }}>
                {syncing ? '⏳ Syncing...' : '🔄 Sync from Reports'}
              </button>
              <button className="btn btn-secondary" onClick={() => handleAutoGenerate('engineer')} disabled={generating} style={{ fontSize: 11 }}>
                {generating ? '⏳...' : '🤖 Auto-Generate'}
              </button>
              <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} style={{ fontSize: 11 }}>
                📤 Upload Contractor PoW
              </button>
              <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowEditor(true); }} style={{ fontSize: 11 }}>
                + Add Item
              </button>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
            </>
          )}
        </div>
      </div>

      {/* Project Selector */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="select">
            <option value="">Select Project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['weeks', 'months', 'quarters'].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '5px 10px', fontSize: 10, fontWeight: 700, border: '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize',
              background: viewMode === m ? 'var(--accent)' : 'var(--bg-card)',
              color: viewMode === m ? '#fff' : 'var(--text-muted)',
            }}>{m}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'engineer', label: '🏗️ Engineer', count: engineerItems.length },
            { key: 'contractor', label: '📋 Contractor', count: contractorItems.length },
            { key: 'compare', label: '⚖️ Compare', count: null },
          ].map(v => (
            <button key={v.key} onClick={() => setSourceView(v.key)} style={{
              padding: '5px 10px', fontSize: 10, fontWeight: 700, border: '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer',
              background: sourceView === v.key ? (v.key === 'engineer' ? '#059669' : v.key === 'contractor' ? '#e87b35' : '#6366f1') : 'var(--bg-card)',
              color: sourceView === v.key ? '#fff' : 'var(--text-muted)',
            }}>{v.label}{v.count !== null ? ` (${v.count})` : ''}</button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⏳ Loading programme data...</div>}

      {!loading && selectedProject && (
        <>
          {/* KPI Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
            {[
              { icon: '📊', label: 'Overall Progress', value: `${stats.weightedProgress}%`, color: '#e87b35' },
              { icon: '✅', label: 'Completed', value: stats.completed, color: '#059669' },
              { icon: '🔄', label: 'In Progress', value: stats.inProgress, color: '#0284c7' },
              { icon: '⏳', label: 'Not Started', value: stats.notStarted, color: '#64748b' },
              { icon: '🚨', label: 'Behind Schedule', value: stats.late, color: stats.late > 0 ? '#dc2626' : '#059669' },
              { icon: '📋', label: 'Total Items', value: stats.total, color: '#8b5cf6' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16 }}>{s.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Gantt Chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>No programme items yet</div>
                <div style={{ fontSize: 11, margin: '8px 0 16px' }}>
                  {sourceView === 'engineer' && 'Click "🤖 Auto-Generate" to create an Engineer\'s programme from production rates, or "Add Item" to build manually.'}
                  {sourceView === 'contractor' && 'Click "📤 Upload Contractor PoW" to import the Contractor\'s programme from CSV.'}
                  {sourceView === 'compare' && 'Generate both programmes first, then switch to Compare view.'}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', overflow: 'hidden' }}>
                {/* Left panel: Item list */}
                <div style={{ minWidth: 320, maxWidth: 360, borderRight: '2px solid var(--border)', flexShrink: 0 }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 50px 40px', padding: '8px 10px', background: 'var(--accent)', fontSize: 9, fontWeight: 800, color: '#fff', position: 'sticky', top: 0 }}>
                    <span>Activity</span><span>Progress</span><span>Status</span><span></span>
                  </div>
                  {/* Rows */}
                  <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {filteredItems.map((item, idx) => {
                      const slip = getSlippage(item);
                      return (
                        <div key={item.id} style={{
                          display: 'grid', gridTemplateColumns: '1fr 60px 50px 40px',
                          padding: '6px 10px', fontSize: 10, borderBottom: '1px solid var(--border)',
                          background: idx % 2 ? 'var(--bg-hover)' : 'transparent',
                          alignItems: 'center',
                        }}>
                          <div style={{ paddingLeft: (item.indent_level || 0) * 12 }}>
                            <div style={{ fontWeight: item.is_summary ? 800 : 500, fontSize: item.is_summary ? 11 : 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                              {sourceView === 'compare' && <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: item.source_type === 'contractor' ? '#e87b35' : '#059669' }} />}
                              {item.is_milestone ? '◆ ' : ''}{item.item_name}
                            </div>
                            {item.item_code && <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{item.item_code}</div>}
                          </div>
                          <div>
                            <div style={{ background: 'var(--bg-hover)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${item.progress_pct}%`, background: item.progress_pct >= 100 ? '#059669' : 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ fontSize: 8, textAlign: 'center', marginTop: 1, color: 'var(--text-muted)' }}>{item.progress_pct?.toFixed(0)}%</div>
                          </div>
                          <div>
                            <span style={{
                              fontSize: 8, padding: '1px 4px', borderRadius: 3, fontWeight: 700,
                              background: slip.status === 'late' ? '#fef2f2' : slip.status === 'early' ? '#f0fdf4' : 'var(--bg-hover)',
                              color: slip.status === 'late' ? '#dc2626' : slip.status === 'early' ? '#059669' : 'var(--text-muted)',
                            }}>
                              {slip.status === 'late' ? `${slip.days}d late` : slip.status === 'early' ? `${Math.abs(slip.days)}d early` : 'On track'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button onClick={() => { setEditItem(item); setShowEditor(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: 2 }}>✏️</button>
                            <button onClick={() => deleteItem(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: 2 }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right panel: Gantt bars */}
                <div style={{ flex: 1, overflow: 'auto' }} ref={ganttRef}>
                  {/* Time header */}
                  <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)' }}>
                    {timeColumns.map((col, i) => (
                      <div key={i} style={{
                        width: col.days * dayWidth, minWidth: col.days * dayWidth,
                        padding: '8px 4px', fontSize: 9, fontWeight: 700,
                        borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)',
                        textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                        background: 'var(--bg-card)',
                      }}>{col.label}</div>
                    ))}
                  </div>

                  {/* Bars */}
                  <div style={{ position: 'relative', width: chartWidth }}>
                    {/* Today line */}
                    {todayPos && (
                      <div style={{
                        position: 'absolute', left: todayPos.left, top: 0, bottom: 0,
                        width: 2, background: '#dc2626', zIndex: 3, opacity: 0.7,
                      }}>
                        <div style={{ position: 'absolute', top: -2, left: -12, fontSize: 7, color: '#dc2626', fontWeight: 800, whiteSpace: 'nowrap' }}>TODAY</div>
                      </div>
                    )}

                    {/* Column grid lines */}
                    {timeColumns.reduce((acc, col, i) => {
                      const left = acc.offset;
                      acc.offset += col.days * dayWidth;
                      acc.lines.push(
                        <div key={i} style={{ position: 'absolute', left, top: 0, bottom: 0, width: 1, background: 'var(--border)', opacity: 0.4 }} />
                      );
                      return acc;
                    }, { offset: 0, lines: [] }).lines}

                    {filteredItems.map((item, idx) => {
                      const baselineBar = getBarPosition(item.baseline_start, item.baseline_end);
                      const plannedBar = getBarPosition(item.planned_start, item.planned_end);
                      const actualBar = item.actual_start ? getBarPosition(item.actual_start, item.actual_end || new Date().toISOString().split('T')[0]) : null;
                      const rowH = 32;
                      const catColor = CATEGORY_COLORS[item.category] || '#94a3b8';
                      const slip = getSlippage(item);

                      return (
                        <div key={item.id} style={{
                          height: rowH, position: 'relative',
                          borderBottom: '1px solid var(--border)',
                          background: idx % 2 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        }}>
                          {/* Baseline bar (thin, gray) */}
                          {baselineBar && (
                            <div style={{
                              position: 'absolute', left: baselineBar.left, top: 5, height: 5,
                              width: baselineBar.width, background: '#475569', borderRadius: 2, opacity: 0.4,
                            }} title={`Baseline: ${formatDate(item.baseline_start)} → ${formatDate(item.baseline_end)}`} />
                          )}

                          {/* Planned bar (main colored bar) */}
                          {plannedBar && !item.is_milestone && (
                            <div style={{
                              position: 'absolute', left: plannedBar.left, top: 12,
                              height: 10, width: plannedBar.width,
                              background: catColor, borderRadius: 3, opacity: 0.3,
                            }} title={`Planned: ${formatDate(item.planned_start)} → ${formatDate(item.planned_end)}`} />
                          )}

                          {/* Actual / progress bar */}
                          {plannedBar && !item.is_milestone && (
                            <div style={{
                              position: 'absolute', left: actualBar ? actualBar.left : plannedBar.left, top: 12,
                              height: 10, width: (actualBar ? actualBar.width : plannedBar.width) * (item.progress_pct / 100),
                              background: slip.status === 'late' ? '#dc2626' : catColor,
                              borderRadius: 3, minWidth: item.progress_pct > 0 ? 3 : 0,
                            }} title={`Progress: ${item.progress_pct}%`} />
                          )}

                          {/* Milestone diamond */}
                          {item.is_milestone && plannedBar && (
                            <div style={{
                              position: 'absolute', left: plannedBar.left - 5, top: 10,
                              width: 12, height: 12, background: catColor,
                              transform: 'rotate(45deg)', borderRadius: 2,
                            }} title={`Milestone: ${formatDate(item.planned_start)}`} />
                          )}

                          {/* Label on bar */}
                          {plannedBar && plannedBar.width > 60 && (
                            <div style={{
                              position: 'absolute', left: plannedBar.left + 4, top: 13,
                              fontSize: 7, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap',
                              maxWidth: plannedBar.width - 8, overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>{item.item_name}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, padding: '10px 14px', fontSize: 9, color: 'var(--text-muted)', flexWrap: 'wrap', marginTop: 8 }}>
            <span>■ <span style={{ color: '#475569' }}>Baseline</span></span>
            <span>■ <span style={{ color: 'var(--accent)' }}>Planned</span></span>
            <span>■ <span style={{ color: '#059669' }}>Actual Progress</span></span>
            <span>■ <span style={{ color: '#dc2626' }}>Behind Schedule</span></span>
            <span style={{ color: '#dc2626' }}>│ Today</span>
            <span>◆ Milestone</span>
            {sourceView === 'compare' && <>
              <span>● <span style={{ color: '#059669' }}>Engineer</span></span>
              <span>● <span style={{ color: '#e87b35' }}>Contractor</span></span>
            </>}
          </div>
        </>
      )}

      {/* Empty state */}
      {!selectedProject && !loading && (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Programme of Works</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Select a project above to view or create the Gantt chart</div>
        </div>
      )}

      {/* ══ EDITOR MODAL ══ */}
      {showEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) { setShowEditor(false); setEditItem(null); } }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 550, maxHeight: '85vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>{editItem?.id ? '✏️ Edit' : '+ New'} Programme Item</h3>
            <ItemForm
              initial={editItem || emptyItem}
              activities={activities}
              items={items}
              onSave={saveItem}
              onCancel={() => { setShowEditor(false); setEditItem(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Item Editor Form ──
function ItemForm({ initial, activities, items, onSave, onCancel }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm({ ...form, [k]: v });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.item_name) return;
    onSave(form);
  }

  const fieldStyle = { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-card)' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3, display: 'block' };
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 };

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Activity Name *</label>
        <input value={form.item_name} onChange={e => set('item_name', e.target.value)} style={fieldStyle} placeholder="e.g. Subbase Layer Construction" />
      </div>

      <div style={row}>
        <div>
          <label style={labelStyle}>Activity Code</label>
          <input value={form.item_code || ''} onChange={e => set('item_code', e.target.value)} style={fieldStyle} placeholder="e.g. PV-01" />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} style={fieldStyle}>
            {Object.keys(CATEGORY_COLORS).map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      <div style={row}>
        <div>
          <label style={labelStyle}>Link to Works Activity</label>
          <select value={form.activity_id || ''} onChange={e => set('activity_id', e.target.value)} style={fieldStyle}>
            <option value="">— None —</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.activity_code} — {a.activity_name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Sort Order</label>
          <input type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} style={fieldStyle} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={form.is_milestone} onChange={e => set('is_milestone', e.target.checked)} /> Milestone
        </label>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={form.is_summary} onChange={e => set('is_summary', e.target.checked)} /> Summary Row
        </label>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Baseline Schedule</div>
      <div style={row}>
        <div><label style={labelStyle}>Baseline Start</label><input type="date" value={form.baseline_start || ''} onChange={e => set('baseline_start', e.target.value)} style={fieldStyle} /></div>
        <div><label style={labelStyle}>Baseline End</label><input type="date" value={form.baseline_end || ''} onChange={e => set('baseline_end', e.target.value)} style={fieldStyle} /></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Planned Schedule (Current Revision)</div>
      <div style={row}>
        <div><label style={labelStyle}>Planned Start</label><input type="date" value={form.planned_start || ''} onChange={e => set('planned_start', e.target.value)} style={fieldStyle} /></div>
        <div><label style={labelStyle}>Planned End</label><input type="date" value={form.planned_end || ''} onChange={e => set('planned_end', e.target.value)} style={fieldStyle} /></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, color: '#059669', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Actual Progress</div>
      <div style={row}>
        <div><label style={labelStyle}>Actual Start</label><input type="date" value={form.actual_start || ''} onChange={e => set('actual_start', e.target.value)} style={fieldStyle} /></div>
        <div><label style={labelStyle}>Actual End</label><input type="date" value={form.actual_end || ''} onChange={e => set('actual_end', e.target.value)} style={fieldStyle} /></div>
      </div>
      <div style={row}>
        <div>
          <label style={labelStyle}>Progress (%)</label>
          <input type="number" min="0" max="100" value={form.progress_pct} onChange={e => set('progress_pct', e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Weight</label>
          <input type="number" min="0" step="0.1" value={form.weight} onChange={e => set('weight', e.target.value)} style={fieldStyle} />
        </div>
      </div>

      <div style={row}>
        <div><label style={labelStyle}>Chainage From</label><input value={form.chainage_from || ''} onChange={e => set('chainage_from', e.target.value)} style={fieldStyle} placeholder="e.g. 0+000" /></div>
        <div><label style={labelStyle}>Chainage To</label><input value={form.chainage_to || ''} onChange={e => set('chainage_to', e.target.value)} style={fieldStyle} placeholder="e.g. 5+200" /></div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Notes</label>
        <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} style={{ ...fieldStyle, height: 60, resize: 'vertical' }} placeholder="Any additional notes..." />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel} type="button">Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit}>💾 {initial?.id ? 'Update' : 'Add Item'}</button>
      </div>
    </div>
  );
}
