import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const STRUCTURE_TYPES = [
  'Box Culvert','Pipe Culvert','Slab Culvert','Bridge','Footbridge',
  'Gabion Wall','Gabion Mattress','Retaining Wall (Masonry)','Retaining Wall (RC)',
  'Drift/Causeway','Headwall','Wingwall','Apron','Scour Protection',
  'River Training','Guard Rail at Structure','Other'
];
const CULVERT_STAGES = ['Setting Out','Excavation','Blinding','Foundation/Base Slab','Base Reinforcement','Base Concrete','Wall Formwork','Wall Reinforcement','Wall Concrete','Top Slab Formwork','Top Slab Reinforcement','Top Slab Concrete','Headwall','Wingwall','Apron','Backfilling','Scour Protection','Waterproofing','Inspection'];
const BRIDGE_STAGES = ['Setting Out','Pile Driving/Boring','Pile Cap','Abutment Foundation','Abutment Construction','Pier Foundation','Pier Construction','Bearing Installation','Deck Beams/Girders','Deck Slab','Parapet/Railing','Approach Slab','Expansion Joints','Waterproofing','Surfacing','Inspection'];
const GABION_STAGES = ['Setting Out','Excavation','Blinding','Gabion Basket Placement','Wire Mesh Installation','Stone Filling','Lacing/Tying','Backfilling','Scour Protection','Inspection'];
const WALL_STAGES = ['Setting Out','Excavation','Blinding','Foundation/Base Slab','Base Concrete','Masonry Work','Plastering','Curing','Backfilling','Inspection'];
const SIMPLE_STAGES = ['Setting Out','Excavation','Blinding','Foundation/Base Slab','Base Concrete','Wall Concrete','Backfilling','Inspection'];

function getStages(type) {
  if (type.includes('Bridge') || type === 'Footbridge') return BRIDGE_STAGES;
  if (type.includes('Culvert')) return CULVERT_STAGES;
  if (type.includes('Gabion')) return GABION_STAGES;
  if (type.includes('Retaining') || type.includes('Masonry')) return WALL_STAGES;
  return SIMPLE_STAGES;
}

const TYPE_ICONS = {
  'Box Culvert': '🔲', 'Pipe Culvert': '⭕', 'Slab Culvert': '▬', 'Bridge': '🌉', 'Footbridge': '🚶',
  'Gabion Wall': '🧱', 'Gabion Mattress': '🧱', 'Retaining Wall (Masonry)': '🏗️', 'Retaining Wall (RC)': '🏗️',
  'Drift/Causeway': '🌊', 'Headwall': '▐', 'Wingwall': '◣', 'Apron': '▤', 'Scour Protection': '🛡️',
};

export default function StructuresPage({ profile, showToast }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [structures, setStructures] = useState([]);
  const [progressData, setProgressData] = useState({});
  const [tab, setTab] = useState('list');
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(null);
  const [addForm, setAddForm] = useState({ structure_type: 'Box Culvert', structure_ref: '', chainage: '', side: 'CL', dimensions: '', span_m: '', height_m: '', width_m: '', length_m: '', no_of_cells: 1, drawing_ref: '', concrete_grade: 'C25/30', foundation_type: '', notes: '' });
  const [progressForm, setProgressForm] = useState({ stage: '', status: 'Completed', work_date: new Date().toISOString().split('T')[0], quantity: '', unit: '', concrete_volume_m3: '', rebar_kg: '', gang_size: 0, materials_used: '', equipment_used: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const canManage = hasRole(profile?.role, 'resident_engineer');

  useEffect(() => { supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || [])); }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    const [strRes, progRes] = await Promise.all([
      supabase.from('structures').select('*').eq('project_id', selectedProject).order('chainage'),
      supabase.from('structure_progress').select('*, reporter:reported_by(full_name)')
        .eq('project_id', selectedProject).order('work_date', { ascending: false }),
    ]);
    setStructures(strRes.data || []);
    const grouped = {};
    (progRes.data || []).forEach(p => {
      if (!grouped[p.structure_id]) grouped[p.structure_id] = [];
      grouped[p.structure_id].push(p);
    });
    setProgressData(grouped);
  }

  async function addStructure(e) {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('structures').insert({
      ...addForm, project_id: selectedProject,
      chainage: parseFloat(addForm.chainage) || 0,
      span_m: addForm.span_m ? parseFloat(addForm.span_m) : null,
      height_m: addForm.height_m ? parseFloat(addForm.height_m) : null,
      width_m: addForm.width_m ? parseFloat(addForm.width_m) : null,
      length_m: addForm.length_m ? parseFloat(addForm.length_m) : null,
      no_of_cells: parseInt(addForm.no_of_cells) || 1,
    });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Structure added');
    setShowAddModal(false); loadData();
  }

  async function logStageProgress(e) {
    e.preventDefault(); setSaving(true);
    const str = selectedStructure;
    const { error } = await supabase.from('structure_progress').insert({
      structure_id: str.id, project_id: selectedProject, ...progressForm,
      quantity: progressForm.quantity ? parseFloat(progressForm.quantity) : null,
      concrete_volume_m3: progressForm.concrete_volume_m3 ? parseFloat(progressForm.concrete_volume_m3) : null,
      rebar_kg: progressForm.rebar_kg ? parseFloat(progressForm.rebar_kg) : null,
      gang_size: parseInt(progressForm.gang_size) || 0,
      reported_by: profile.id,
    });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    // Update overall status
    const stages = getStages(str.structure_type);
    const completedStages = [...(progressData[str.id] || []), { stage: progressForm.stage, status: progressForm.status }]
      .filter(p => p.status === 'Completed' || p.status === 'Approved');
    const pct = Math.round((completedStages.length / stages.length) * 100);
    await supabase.from('structures').update({
      percent_complete: Math.min(100, pct),
      overall_status: pct >= 100 ? 'Completed' : pct > 0 ? 'In Progress' : 'Not Started',
    }).eq('id', str.id);
    showToast('Stage progress logged');
    setShowProgressModal(null); loadData();
  }

  const statusColor = s => {
    const m = { 'Not Started': '#6b7280', 'Excavation': '#a16207', 'Foundation': '#d97706', 'Substructure': '#2563eb',
      'Superstructure': '#7c3aed', 'Finishing': '#059669', 'Completed': '#16a34a', 'Approved': '#16a34a', 'Defective': '#dc2626' };
    return m[s] || '#6b7280';
  };

  const typeSummary = {};
  structures.forEach(s => { typeSummary[s.structure_type] = (typeSummary[s.structure_type] || 0) + 1; });

  return (
    <div>
      <div className="page-header">
        <div><h2>🌉 Structures</h2><div className="subtitle">Culverts, bridges, gabions, retaining walls & drainage structures</div></div>
        {selectedProject && canManage && <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Structure</button>}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedStructure(null); setTab('list'); }} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && structures.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-label">Total Structures</div><div className="stat-value text-accent">{structures.length}</div></div>
            <div className="stat-card"><div className="stat-label">Completed</div><div className="stat-value" style={{ color: '#16a34a' }}>{structures.filter(s => s.overall_status === 'Completed' || s.overall_status === 'Approved').length}</div></div>
            <div className="stat-card"><div className="stat-label">In Progress</div><div className="stat-value" style={{ color: '#d97706' }}>{structures.filter(s => !['Not Started','Completed','Approved'].includes(s.overall_status)).length}</div></div>
            <div className="stat-card"><div className="stat-label">Not Started</div><div className="stat-value">{structures.filter(s => s.overall_status === 'Not Started').length}</div></div>
          </div>

          {/* Type breakdown */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {Object.entries(typeSummary).map(([type, count]) => (
              <span key={type} className="badge badge-muted" style={{ fontSize: 12 }}>
                {TYPE_ICONS[type] || '🔧'} {type}: {count}
              </span>
            ))}
          </div>

          <div className="tabs">
            <button className={tab === 'list' ? 'active' : ''} onClick={() => { setTab('list'); setSelectedStructure(null); }}>All Structures</button>
            {selectedStructure && (
              <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>
                {selectedStructure.structure_ref} Detail
              </button>
            )}
          </div>

          {tab === 'list' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th></th><th>Ref</th><th>Type</th><th>Ch.</th><th>Dimensions</th><th>Progress</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {structures.map(s => (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedStructure(s); setTab('detail'); }}>
                      <td style={{ fontSize: 20 }}>{TYPE_ICONS[s.structure_type] || '🔧'}</td>
                      <td style={{ fontWeight: 600 }}>{s.structure_ref}</td>
                      <td>{s.structure_type}{s.no_of_cells > 1 ? ` (${s.no_of_cells}-cell)` : ''}</td>
                      <td className="text-mono">{s.chainage}</td>
                      <td className="text-sm">
                        {s.span_m && `${s.span_m}m span`}
                        {s.dimensions || (s.width_m && s.height_m ? `${s.width_m}×${s.height_m}m` : '')}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
                          <div className="progress-bar" style={{ flex: 1 }}>
                            <div className={`fill ${s.percent_complete >= 80 ? 'green' : s.percent_complete >= 40 ? 'orange' : 'red'}`}
                              style={{ width: `${s.percent_complete || 0}%` }} />
                          </div>
                          <span className="text-mono text-sm">{s.percent_complete || 0}%</span>
                        </div>
                      </td>
                      <td><span className="badge" style={{ background: statusColor(s.overall_status), color: '#fff', fontSize: 11 }}>{s.overall_status}</span></td>
                      <td><button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); setSelectedStructure(s); setShowProgressModal(true); }}>+ Log</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'detail' && selectedStructure && (() => {
            const s = selectedStructure;
            const stages = getStages(s.structure_type);
            const stageProgress = progressData[s.id] || [];
            const stageMap = {};
            stageProgress.forEach(p => { if (!stageMap[p.stage] || p.status === 'Completed' || p.status === 'Approved') stageMap[p.stage] = p; });
            return (
              <div>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{TYPE_ICONS[s.structure_type] || '🔧'} {s.structure_ref} — {s.structure_type}</h3>
                      <div className="text-sm text-muted">Chainage: {s.chainage} | Side: {s.side}</div>
                    </div>
                    <button className="btn btn-primary" onClick={() => setShowProgressModal(true)}>+ Log Stage Progress</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 20px', fontSize: 13 }}>
                    {s.span_m && <div><span className="text-muted">Span:</span> {s.span_m}m</div>}
                    {s.width_m && <div><span className="text-muted">Width:</span> {s.width_m}m</div>}
                    {s.height_m && <div><span className="text-muted">Height:</span> {s.height_m}m</div>}
                    {s.length_m && <div><span className="text-muted">Length:</span> {s.length_m}m</div>}
                    {s.no_of_cells > 1 && <div><span className="text-muted">Cells:</span> {s.no_of_cells}</div>}
                    {s.concrete_grade && <div><span className="text-muted">Concrete:</span> {s.concrete_grade}</div>}
                    {s.drawing_ref && <div><span className="text-muted">Drawing:</span> {s.drawing_ref}</div>}
                    {s.foundation_type && <div><span className="text-muted">Foundation:</span> {s.foundation_type}</div>}
                  </div>
                </div>

                {/* Stage progress checklist */}
                <div className="card">
                  <div className="card-header"><h3>Construction Stages</h3>
                    <span className="text-mono">{Object.keys(stageMap).filter(k => stageMap[k].status === 'Completed' || stageMap[k].status === 'Approved').length}/{stages.length} complete</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {stages.map((stage, i) => {
                      const prog = stageMap[stage];
                      const done = prog && (prog.status === 'Completed' || prog.status === 'Approved');
                      const inProg = prog && prog.status === 'In Progress';
                      const failed = prog && (prog.status === 'Failed' || prog.status === 'Rework');
                      return (
                        <div key={stage} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                          background: done ? 'rgba(22,163,74,0.08)' : inProg ? 'rgba(232,123,53,0.08)' : failed ? 'rgba(220,38,38,0.08)' : 'transparent',
                          borderLeft: `3px solid ${done ? '#16a34a' : inProg ? '#e87b35' : failed ? '#dc2626' : 'var(--border)'}`,
                          borderRadius: '0 var(--radius) var(--radius) 0',
                        }}>
                          <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
                            {done ? '✅' : inProg ? '🔨' : failed ? '❌' : '○'}
                          </span>
                          <span style={{ fontWeight: 500, flex: 1, fontSize: 13 }}>
                            <span className="text-muted" style={{ marginRight: 6 }}>{i + 1}.</span>{stage}
                          </span>
                          {prog && (
                            <span className="text-sm text-muted">
                              {prog.work_date} {prog.concrete_volume_m3 ? `| ${prog.concrete_volume_m3}m³ concrete` : ''} {prog.rebar_kg ? `| ${prog.rebar_kg}kg rebar` : ''}
                            </span>
                          )}
                          {prog && <span className={`badge badge-${done ? 'success' : inProg ? 'accent' : 'danger'}`} style={{ fontSize: 10 }}>{prog.status}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Progress history */}
                {stageProgress.length > 0 && (
                  <div className="card" style={{ marginTop: 16 }}>
                    <div className="card-header"><h3>Progress History</h3></div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Date</th><th>Stage</th><th>Status</th><th>Concrete</th><th>Rebar</th><th>Gang</th><th>By</th></tr></thead>
                        <tbody>
                          {stageProgress.map(p => (
                            <tr key={p.id}>
                              <td className="text-mono">{p.work_date}</td>
                              <td>{p.stage}</td>
                              <td><span className={`badge badge-${p.status === 'Completed' ? 'success' : p.status === 'In Progress' ? 'accent' : p.status === 'Approved' ? 'success' : 'danger'}`}>{p.status}</span></td>
                              <td className="text-mono">{p.concrete_volume_m3 ? `${p.concrete_volume_m3}m³` : '—'}</td>
                              <td className="text-mono">{p.rebar_kg ? `${p.rebar_kg}kg` : '—'}</td>
                              <td>{p.gang_size || '—'}</td>
                              <td className="text-sm">{p.reporter?.full_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {selectedProject && structures.length === 0 && (
        <div className="card empty-state">
          <div className="icon">🌉</div>
          <p>No structures registered for this project</p>
          {canManage && <button className="btn btn-primary mt-16" onClick={() => setShowAddModal(true)}>+ Add First Structure</button>}
        </div>
      )}

      {/* Add Structure Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Add Structure<button onClick={() => setShowAddModal(false)}>×</button></h3>
            <form onSubmit={addStructure}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Type *</label>
                  <select value={addForm.structure_type} onChange={e => setAddForm({ ...addForm, structure_type: e.target.value })}>
                    {STRUCTURE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div className="form-group mb-16"><label>Reference *</label>
                  <input value={addForm.structure_ref} onChange={e => setAddForm({ ...addForm, structure_ref: e.target.value })} required placeholder="e.g. BC-01, BR-03" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Chainage *</label>
                  <input type="number" step="0.001" value={addForm.chainage} onChange={e => setAddForm({ ...addForm, chainage: e.target.value })} required placeholder="5.200" /></div>
                <div className="form-group mb-16"><label>Side</label>
                  <select value={addForm.side} onChange={e => setAddForm({ ...addForm, side: e.target.value })}>
                    {['CL','LHS','RHS','Both'].map(s => <option key={s}>{s}</option>)}</select></div>
                <div className="form-group mb-16"><label>No. of Cells</label>
                  <input type="number" min="1" value={addForm.no_of_cells} onChange={e => setAddForm({ ...addForm, no_of_cells: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Span (m)</label>
                  <input type="number" step="0.01" value={addForm.span_m} onChange={e => setAddForm({ ...addForm, span_m: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Width (m)</label>
                  <input type="number" step="0.01" value={addForm.width_m} onChange={e => setAddForm({ ...addForm, width_m: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Height (m)</label>
                  <input type="number" step="0.01" value={addForm.height_m} onChange={e => setAddForm({ ...addForm, height_m: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Length (m)</label>
                  <input type="number" step="0.01" value={addForm.length_m} onChange={e => setAddForm({ ...addForm, length_m: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Concrete Grade</label>
                  <input value={addForm.concrete_grade} onChange={e => setAddForm({ ...addForm, concrete_grade: e.target.value })} placeholder="C25/30" /></div>
                <div className="form-group mb-16"><label>Drawing Ref</label>
                  <input value={addForm.drawing_ref} onChange={e => setAddForm({ ...addForm, drawing_ref: e.target.value })} placeholder="DWG-STR-01" /></div>
                <div className="form-group mb-16"><label>Foundation</label>
                  <input value={addForm.foundation_type} onChange={e => setAddForm({ ...addForm, foundation_type: e.target.value })} placeholder="Strip/Pad/Pile" /></div>
              </div>
              <div className="form-group mb-16"><label>Notes</label>
                <textarea rows={2} value={addForm.notes} onChange={e => setAddForm({ ...addForm, notes: e.target.value })} /></div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Structure'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowAddModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Stage Progress Modal */}
      {showProgressModal && selectedStructure && (
        <div className="modal-overlay" onClick={() => setShowProgressModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Log Stage — {selectedStructure.structure_ref} ({selectedStructure.structure_type})
              <button onClick={() => setShowProgressModal(false)}>×</button></h3>
            <form onSubmit={logStageProgress}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Stage *</label>
                  <select value={progressForm.stage} onChange={e => setProgressForm({ ...progressForm, stage: e.target.value })} required>
                    <option value="">Select stage...</option>
                    {getStages(selectedStructure.structure_type).map(s => <option key={s}>{s}</option>)}
                  </select></div>
                <div className="form-group mb-16"><label>Status *</label>
                  <select value={progressForm.status} onChange={e => setProgressForm({ ...progressForm, status: e.target.value })}>
                    {['Not Started','In Progress','Completed','Approved','Failed','Rework'].map(s => <option key={s}>{s}</option>)}
                  </select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Date</label>
                  <input type="date" value={progressForm.work_date} onChange={e => setProgressForm({ ...progressForm, work_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Concrete (m³)</label>
                  <input type="number" step="0.01" value={progressForm.concrete_volume_m3} onChange={e => setProgressForm({ ...progressForm, concrete_volume_m3: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Rebar (kg)</label>
                  <input type="number" step="0.01" value={progressForm.rebar_kg} onChange={e => setProgressForm({ ...progressForm, rebar_kg: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Gang Size</label>
                  <input type="number" value={progressForm.gang_size} onChange={e => setProgressForm({ ...progressForm, gang_size: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Materials</label>
                  <input value={progressForm.materials_used} onChange={e => setProgressForm({ ...progressForm, materials_used: e.target.value })} placeholder="e.g. C25 concrete, Y16 rebar" /></div>
              </div>
              <div className="form-group mb-16"><label>Equipment</label>
                <input value={progressForm.equipment_used} onChange={e => setProgressForm({ ...progressForm, equipment_used: e.target.value })} placeholder="e.g. Concrete mixer, vibrator" /></div>
              <div className="form-group mb-16"><label>Notes</label>
                <textarea rows={2} value={progressForm.notes} onChange={e => setProgressForm({ ...progressForm, notes: e.target.value })} /></div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log Progress'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowProgressModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
