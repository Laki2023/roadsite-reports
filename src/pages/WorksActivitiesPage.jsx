import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const CATEGORY_COLORS = {
  Survey: '#6366f1', Earthworks: '#a16207', Drainage: '#0891b2', Pavement: '#d97706',
  Surfacing: '#4b5563', 'Road Furniture': '#059669', Environmental: '#16a34a', Other: '#6b7280'
};

export default function WorksActivitiesPage({ profile, showToast }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [activities, setActivities] = useState([]);
  const [progress, setProgress] = useState([]);
  const [tab, setTab] = useState('activities');
  const [showProgressModal, setShowProgressModal] = useState(null);
  const [progressForm, setProgressForm] = useState({
    work_date: new Date().toISOString().split('T')[0],
    start_chainage: '', end_chainage: '', side: 'Both', quantity: '', equipment_used: '', materials_used: '', gang_size: 0, notes: ''
  });
  const [saving, setSaving] = useState(false);
  const canManage = hasRole(profile?.role, 're');

  useEffect(() => {
    supabase.from('projects').select('id, name, category').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    const [actRes, progRes] = await Promise.all([
      supabase.from('works_activities').select('*').eq('project_id', selectedProject).order('sort_order'),
      supabase.from('works_progress').select('*, activity:activity_id(activity_name, activity_code), reporter:reported_by(full_name)')
        .eq('project_id', selectedProject).order('work_date', { ascending: false }).limit(50),
    ]);
    setActivities(actRes.data || []);
    setProgress(progRes.data || []);
  }

  async function seedActivities() {
    const proj = projects.find(p => p.id === selectedProject);
    if (!proj) return;
    const { error } = await supabase.rpc('seed_project_activities', { p_project_id: selectedProject, p_category: proj.category || 'Construction' });
    if (error) { showToast(error.message, 'error'); return; }
    showToast(`Activities seeded for ${proj.category} project`);
    loadData();
  }

  async function logProgress(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('works_progress').insert({
      project_id: selectedProject, activity_id: showProgressModal,
      ...progressForm, quantity: parseFloat(progressForm.quantity) || 0,
      gang_size: parseInt(progressForm.gang_size) || 0,
      start_chainage: parseFloat(progressForm.start_chainage) || 0,
      end_chainage: parseFloat(progressForm.end_chainage) || 0,
      reported_by: profile.id,
    });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    // Update completed quantity
    const act = activities.find(a => a.id === showProgressModal);
    if (act) {
      await supabase.from('works_activities').update({
        completed_quantity: (act.completed_quantity || 0) + (parseFloat(progressForm.quantity) || 0),
        status: 'In Progress'
      }).eq('id', showProgressModal);
    }
    showToast('Progress logged');
    setShowProgressModal(null);
    setProgressForm({ work_date: new Date().toISOString().split('T')[0], start_chainage: '', end_chainage: '', side: 'Both', quantity: '', equipment_used: '', materials_used: '', gang_size: 0, notes: '' });
    loadData();
  }

  async function updateActivityStatus(id, status) {
    await supabase.from('works_activities').update({ status }).eq('id', id);
    showToast(`Activity marked ${status}`);
    loadData();
  }

  const grouped = {};
  activities.forEach(a => { if (!grouped[a.category]) grouped[a.category] = []; grouped[a.category].push(a); });

  return (
    <div>
      <div className="page-header">
        <div><h2>Works Activities</h2><div className="subtitle">Track construction progress by activity and chainage</div></div>
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
        </select>
      </div>

      {selectedProject && activities.length === 0 && (
        <div className="card empty-state">
          <div className="icon">📋</div>
          <p>No activities defined for this project yet</p>
          {canManage && (
            <button className="btn btn-primary mt-16" onClick={seedActivities}>
              Auto-Generate Activities for {projects.find(p => p.id === selectedProject)?.category || 'Construction'}
            </button>
          )}
        </div>
      )}

      {selectedProject && activities.length > 0 && (
        <>
          <div className="tabs">
            <button className={tab === 'activities' ? 'active' : ''} onClick={() => setTab('activities')}>
              Activities ({activities.length})
            </button>
            <button className={tab === 'progress' ? 'active' : ''} onClick={() => setTab('progress')}>
              Recent Progress ({progress.length})
            </button>
            <button className={tab === 'matrix' ? 'active' : ''} onClick={() => setTab('matrix')}>
              Progress Matrix
            </button>
          </div>

          {tab === 'activities' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {Object.entries(grouped).map(([cat, acts]) => (
                <div key={cat} className="card">
                  <div className="card-header">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: CATEGORY_COLORS[cat] || '#666', display: 'inline-block' }}></span>
                      {cat}
                    </h3>
                    <span className="text-mono text-sm">{acts.length} activities</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Code</th><th>Activity</th><th>Planned</th><th>Completed</th><th>Progress</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {acts.map(a => {
                          const pct = a.planned_quantity > 0 ? Math.min(100, (a.completed_quantity / a.planned_quantity) * 100) : 0;
                          return (
                            <tr key={a.id}>
                              <td className="text-mono" style={{ fontWeight: 600 }}>{a.activity_code}</td>
                              <td style={{ fontWeight: 500 }}>{a.activity_name}</td>
                              <td className="text-mono">{a.planned_quantity} {a.unit}</td>
                              <td className="text-mono">{a.completed_quantity} {a.unit}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                                  <div className="progress-bar" style={{ flex: 1 }}>
                                    <div className={`fill ${pct >= 80 ? 'green' : pct >= 40 ? 'orange' : 'red'}`} style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-mono text-sm">{pct.toFixed(0)}%</span>
                                </div>
                              </td>
                              <td>
                                <span className={`badge badge-${a.status === 'Completed' ? 'success' : a.status === 'Approved' ? 'success' : a.status === 'In Progress' ? 'accent' : a.status === 'On Hold' ? 'warning' : 'muted'}`}>
                                  {a.status}
                                </span>
                              </td>
                              <td>
                                <div className="btn-group">
                                  <button className="btn btn-sm btn-primary" onClick={() => setShowProgressModal(a.id)}>+ Log</button>
                                  {canManage && a.status === 'In Progress' && (
                                    <button className="btn btn-sm btn-success" onClick={() => updateActivityStatus(a.id, 'Completed')}>✓</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'progress' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Activity</th><th>Chainage</th><th>Side</th><th>Qty</th><th>Gang</th><th>By</th></tr></thead>
                <tbody>
                  {progress.map(p => (
                    <tr key={p.id}>
                      <td className="text-mono">{p.work_date}</td>
                      <td><span className="text-mono" style={{ marginRight: 6 }}>{p.activity?.activity_code}</span>{p.activity?.activity_name}</td>
                      <td className="text-mono">{p.start_chainage}–{p.end_chainage}</td>
                      <td>{p.side}</td>
                      <td className="text-mono">{p.quantity}</td>
                      <td>{p.gang_size || '—'}</td>
                      <td className="text-sm">{p.reporter?.full_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'matrix' && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <div className="card-header"><h3>Progress Matrix</h3></div>
              <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', gap: 2, fontSize: 12 }}>
                <div style={{ fontWeight: 700, padding: 8, background: 'var(--bg-hover)' }}>Activity</div>
                {['Not Started','In Progress','Completed','Approved','On Hold'].map(s => (
                  <div key={s} style={{ fontWeight: 700, padding: 8, background: 'var(--bg-hover)', textAlign: 'center' }}>{s}</div>
                ))}
                {activities.map(a => (
                  <React.Fragment key={a.id}>
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
                      <span className="text-mono">{a.activity_code}</span> {a.activity_name}
                    </div>
                    {['Not Started','In Progress','Completed','Approved','On Hold'].map(s => (
                      <div key={s} style={{
                        padding: 6, textAlign: 'center', borderBottom: '1px solid var(--border)',
                        background: a.status === s ? (
                          s === 'Completed' || s === 'Approved' ? 'rgba(22,163,74,0.2)' :
                          s === 'In Progress' ? 'rgba(232,123,53,0.2)' :
                          s === 'On Hold' ? 'rgba(217,119,6,0.2)' : 'transparent'
                        ) : 'transparent'
                      }}>
                        {a.status === s && '●'}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Log Progress Modal */}
      {showProgressModal && (
        <div className="modal-overlay" onClick={() => setShowProgressModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Log Progress — {activities.find(a => a.id === showProgressModal)?.activity_name}
              <button onClick={() => setShowProgressModal(null)}>×</button>
            </h3>
            <form onSubmit={logProgress}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Date *</label>
                  <input type="date" value={progressForm.work_date} onChange={e => setProgressForm({ ...progressForm, work_date: e.target.value })} required />
                </div>
                <div className="form-group mb-16">
                  <label>From Ch. *</label>
                  <input type="number" step="0.001" value={progressForm.start_chainage} onChange={e => setProgressForm({ ...progressForm, start_chainage: e.target.value })} required placeholder="0+000" />
                </div>
                <div className="form-group mb-16">
                  <label>To Ch. *</label>
                  <input type="number" step="0.001" value={progressForm.end_chainage} onChange={e => setProgressForm({ ...progressForm, end_chainage: e.target.value })} required placeholder="1+000" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Side</label>
                  <select value={progressForm.side} onChange={e => setProgressForm({ ...progressForm, side: e.target.value })}>
                    {['Both','LHS','RHS','CL'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>Quantity *</label>
                  <input type="number" step="0.001" value={progressForm.quantity} onChange={e => setProgressForm({ ...progressForm, quantity: e.target.value })} required placeholder="0.00" />
                </div>
                <div className="form-group mb-16">
                  <label>Gang Size</label>
                  <input type="number" value={progressForm.gang_size} onChange={e => setProgressForm({ ...progressForm, gang_size: e.target.value })} />
                </div>
              </div>
              <div className="form-group mb-16">
                <label>Equipment Used</label>
                <input value={progressForm.equipment_used} onChange={e => setProgressForm({ ...progressForm, equipment_used: e.target.value })} placeholder="e.g. 1x Grader, 2x Rollers, 3x Tippers" />
              </div>
              <div className="form-group mb-16">
                <label>Materials Used</label>
                <input value={progressForm.materials_used} onChange={e => setProgressForm({ ...progressForm, materials_used: e.target.value })} placeholder="e.g. Natural gravel from Borrow Pit 3" />
              </div>
              <div className="form-group mb-16">
                <label>Notes</label>
                <textarea rows={2} value={progressForm.notes} onChange={e => setProgressForm({ ...progressForm, notes: e.target.value })} />
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log Progress'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowProgressModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
