import React, { useState, useEffect } from 'react';
import { supabase, hasRole, LAYER_TYPES, LAYER_STATUSES } from '../lib/supabase';

const EMPTY_LAYER = {
  layer_type: 'Subgrade', material_type: '', design_thickness_mm: '',
  start_chainage: '', end_chainage: '', side: 'Both', width_m: '',
  layer_status: 'Not Started', date_laid: '', date_tested: '', date_approved: '',
  compaction_passes: '', notes: '',
};

export default function PavementPage({ profile, showToast, selectedProject }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(selectedProject?.id || '');
  const [layers, setLayers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_LAYER);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // table | stack
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    supabase.from('projects').select('id, name, category, start_chainage, end_chainage')
      .order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => { if (projectId) loadLayers(); }, [projectId]);

  async function loadLayers() {
    const { data } = await supabase.from('pavement_layers')
      .select('*, approved_by_profile:approved_by(full_name)')
      .eq('project_id', projectId)
      .order('start_chainage');
    setLayers(data || []);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        layer_type: form.layer_type,
        material_type: form.material_type || null,
        design_thickness_mm: form.design_thickness_mm ? parseFloat(form.design_thickness_mm) : null,
        start_chainage: parseFloat(form.start_chainage),
        end_chainage: parseFloat(form.end_chainage),
        side: form.side,
        width_m: form.width_m ? parseFloat(form.width_m) : null,
        layer_status: form.layer_status,
        date_laid: form.date_laid || null,
        date_tested: form.date_tested || null,
        date_approved: form.date_approved || null,
        compaction_passes: form.compaction_passes ? parseInt(form.compaction_passes) : null,
        notes: form.notes || null,
      };

      if (form.layer_status === 'Approved') {
        payload.approved_by = profile.id;
        payload.date_approved = payload.date_approved || new Date().toISOString().split('T')[0];
      }

      if (editId) {
        await supabase.from('pavement_layers').update(payload).eq('id', editId);
        showToast('Layer updated');
      } else {
        const { error } = await supabase.from('pavement_layers').insert(payload);
        if (error) throw error;
        showToast('Pavement layer added');
      }
      setShowModal(false);
      setForm(EMPTY_LAYER);
      setEditId(null);
      loadLayers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(l) {
    setForm({
      layer_type: l.layer_type, material_type: l.material_type || '',
      design_thickness_mm: l.design_thickness_mm || '', start_chainage: l.start_chainage,
      end_chainage: l.end_chainage, side: l.side || 'Both', width_m: l.width_m || '',
      layer_status: l.layer_status, date_laid: l.date_laid || '',
      date_tested: l.date_tested || '', date_approved: l.date_approved || '',
      compaction_passes: l.compaction_passes || '', notes: l.notes || '',
    });
    setEditId(l.id);
    setShowModal(true);
  }

  const filtered = layers.filter(l => {
    if (filterType !== 'all' && l.layer_type !== filterType) return false;
    if (filterStatus !== 'all' && l.layer_status !== filterStatus) return false;
    return true;
  });

  const layerColors = {
    'Subgrade': '#8B6914', 'Improved Subgrade': '#A0823B', 'Sub-base': '#C4956A',
    'Base': '#D4A574', 'Prime Coat': '#2a2a2a', 'Tack Coat': '#1a1a1a',
    'Binder Course': '#3d3d3d', 'Wearing Course': '#555',
    'Surface Dressing': '#4a4a4a', 'Seal Coat': '#333',
  };

  const statusColor = (s) => {
    const m = { 'Approved': 'success', 'Laid': 'info', 'Laying In Progress': 'accent',
      'Tested': 'info', 'Rejected': 'danger', 'Rework': 'warning',
      'Not Started': 'muted', 'Material Approved': 'pending' };
    return m[s] || 'muted';
  };

  // Summary stats
  const statusCounts = {};
  layers.forEach(l => { statusCounts[l.layer_status] = (statusCounts[l.layer_status] || 0) + 1; });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Pavement Layers</h2>
          <div className="subtitle">Track pavement construction layer by layer, chainage by chainage</div>
        </div>
        {projectId && hasRole(profile.role, 'resident_engineer') && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_LAYER); setEditId(null); setShowModal(true); }}>
            + Add Layer
          </button>
        )}
      </div>

      {/* Project selector */}
      <div className="filter-bar">
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ minWidth: 300 }}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && (
          <>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Layer Types</option>
              {LAYER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {LAYER_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <div style={{ marginLeft: 'auto' }}>
              <button className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('table')}>Table</button>
              <button className={`btn btn-sm ${viewMode === 'stack' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('stack')} style={{ marginLeft: 4 }}>Stack</button>
            </div>
          </>
        )}
      </div>

      {!projectId ? (
        <div className="card empty-state">
          <div className="icon">▤</div>
          <p>Select a project to view pavement layers</p>
        </div>
      ) : (
        <>
          {/* Status summary */}
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="stat-card" style={{ padding: '10px 16px' }}>
                <div className="flex-between">
                  <span className={`badge badge-${statusColor(status)}`}>{status}</span>
                  <span className="text-mono" style={{ fontSize: 20, fontWeight: 700 }}>{count}</span>
                </div>
              </div>
            ))}
          </div>

          {viewMode === 'stack' ? (
            /* Layer Stack Visualization */
            <div className="card">
              <div className="card-header"><h3>Layer Stack (bottom → top)</h3></div>
              {filtered.length === 0 ? (
                <div className="empty-state"><p>No layers recorded</p></div>
              ) : (
                <div className="layer-stack">
                  {[...filtered].reverse().map(l => (
                    <div key={l.id} className="layer-bar" onClick={() => hasRole(profile.role, 'resident_engineer') && openEdit(l)}
                      style={{
                        background: layerColors[l.layer_type] || '#555',
                        color: '#fff',
                        minHeight: Math.max(36, (l.design_thickness_mm || 30) * 0.6),
                        opacity: l.layer_status === 'Not Started' ? 0.5 : 1,
                        borderLeft: l.layer_status === 'Rejected' ? '3px solid var(--danger)' : 'none',
                      }}>
                      <span className="layer-name">
                        {l.layer_type}
                        {l.material_type && ` — ${l.material_type}`}
                      </span>
                      <span className="layer-info">
                        {l.design_thickness_mm}mm | Ch.{l.start_chainage}–{l.end_chainage} | {l.side}
                      </span>
                      <span className={`badge badge-${statusColor(l.layer_status)}`} style={{ marginLeft: 8 }}>
                        {l.layer_status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Table View */
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Layer Type</th><th>Material</th><th>Thickness</th>
                    <th>Chainage</th><th>Side</th><th>Status</th>
                    <th>Date Laid</th><th>Approved By</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.layer_type}</td>
                      <td className="text-sm">{l.material_type || '—'}</td>
                      <td className="text-mono">{l.design_thickness_mm ? `${l.design_thickness_mm}mm` : '—'}</td>
                      <td className="chainage">{l.start_chainage} — {l.end_chainage}</td>
                      <td>{l.side}</td>
                      <td><span className={`badge badge-${statusColor(l.layer_status)}`}>{l.layer_status}</span></td>
                      <td className="text-mono text-sm">{l.date_laid || '—'}</td>
                      <td className="text-sm">{l.approved_by_profile?.full_name || (l.approved_by ? 'System' : '—')}</td>
                      <td>
                        {hasRole(profile.role, 'resident_engineer') && (
                          <button className="btn btn-sm btn-secondary" onClick={() => openEdit(l)}>Edit</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>
              {editId ? 'Edit Layer' : 'Add Pavement Layer'}
              <button onClick={() => setShowModal(false)}>×</button>
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Layer Type *</label>
                  <select value={form.layer_type} onChange={e => setForm({ ...form, layer_type: e.target.value })}>
                    {LAYER_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Material Type</label>
                  <input value={form.material_type} onChange={e => setForm({ ...form, material_type: e.target.value })}
                    placeholder="e.g. Natural Gravel, AC 20, Crushed Stone" />
                </div>
                <div className="form-group">
                  <label>Design Thickness (mm)</label>
                  <input type="number" step="0.1" value={form.design_thickness_mm}
                    onChange={e => setForm({ ...form, design_thickness_mm: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Width (m)</label>
                  <input type="number" step="0.01" value={form.width_m}
                    onChange={e => setForm({ ...form, width_m: e.target.value })} placeholder="e.g. 7.0" />
                </div>
                <div className="form-group">
                  <label>Start Chainage (km) *</label>
                  <input type="number" step="0.001" value={form.start_chainage}
                    onChange={e => setForm({ ...form, start_chainage: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>End Chainage (km) *</label>
                  <input type="number" step="0.001" value={form.end_chainage}
                    onChange={e => setForm({ ...form, end_chainage: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Side</label>
                  <select value={form.side} onChange={e => setForm({ ...form, side: e.target.value })}>
                    {['LHS', 'RHS', 'CL', 'Both'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.layer_status} onChange={e => setForm({ ...form, layer_status: e.target.value })}>
                    {LAYER_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Compaction Passes</label>
                  <input type="number" value={form.compaction_passes}
                    onChange={e => setForm({ ...form, compaction_passes: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Date Laid</label>
                  <input type="date" value={form.date_laid} onChange={e => setForm({ ...form, date_laid: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Date Tested</label>
                  <input type="date" value={form.date_tested} onChange={e => setForm({ ...form, date_tested: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Date Approved</label>
                  <input type="date" value={form.date_approved} onChange={e => setForm({ ...form, date_approved: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Additional observations or remarks..." rows={3} />
                </div>
              </div>
              <div className="btn-group mt-24">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editId ? 'Update Layer' : 'Add Layer'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
