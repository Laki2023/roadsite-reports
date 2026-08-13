import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const EQUIPMENT_TYPES = [
  'Excavator','Bulldozer','Motor Grader','Wheel Loader','Dump Truck','Water Bowser',
  'Vibratory Roller','Pneumatic Roller','Steel Drum Roller','Asphalt Paver',
  'Bitumen Distributor','Concrete Mixer','Batching Plant','Crushing Plant',
  'Tipper Truck','Low Loader','Compressor','Generator','Survey Equipment',
  'Concrete Vibrator','Plate Compactor','Pickup/Site Vehicle','Ambulance','Other'
];
const STATUSES = ['Operational','Idle','Breakdown','Under Repair','Demobilized','Standby'];

export default function EquipmentPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [equipment, setEquipment] = useState([]);
  const [dailyStatus, setDailyStatus] = useState([]);
  const [tab, setTab] = useState('register');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(null);
  const [addForm, setAddForm] = useState({ equipment_name: '', equipment_type: 'Excavator', specification: '', required_quantity: 1, actual_on_site: 0, is_key_equipment: false, notes: '' });
  const [statusForm, setStatusForm] = useState({ status_date: new Date().toISOString().split('T')[0], status: 'Operational', hours_worked: 0, location_chainage: '', operator: '', fuel_litres: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const canManage = hasRole(profile?.role, 'resident_engineer');

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || []));
  }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    const [eqRes, dsRes] = await Promise.all([
      supabase.from('equipment_register').select('*').eq('project_id', selectedProject).order('equipment_type'),
      supabase.from('equipment_daily_status').select('*, equip:equipment_id(equipment_name, equipment_type), reporter:reported_by(full_name)')
        .eq('project_id', selectedProject).order('status_date', { ascending: false }).limit(50),
    ]);
    setEquipment(eqRes.data || []);
    setDailyStatus(dsRes.data || []);
  }

  async function addEquipment(e) {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('equipment_register').insert({ ...addForm, project_id: selectedProject, required_quantity: parseInt(addForm.required_quantity), actual_on_site: parseInt(addForm.actual_on_site) });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Equipment added'); setShowAddModal(false);
    setAddForm({ equipment_name: '', equipment_type: 'Excavator', specification: '', required_quantity: 1, actual_on_site: 0, is_key_equipment: false, notes: '' });
    loadData();
  }

  async function logDailyStatus(e) {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('equipment_daily_status').upsert({
      equipment_id: showStatusModal, project_id: selectedProject, ...statusForm,
      hours_worked: parseFloat(statusForm.hours_worked) || 0,
      fuel_litres: statusForm.fuel_litres ? parseFloat(statusForm.fuel_litres) : null,
      reported_by: profile.id,
    }, { onConflict: 'equipment_id,status_date' });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Status logged'); setShowStatusModal(null); loadData();
  }

  async function deleteEquipment(id) {
    await supabase.from('equipment_register').delete().eq('id', id);
    showToast('Equipment removed'); loadData();
  }

  const totalRequired = equipment.reduce((s, e) => s + (e.required_quantity || 0), 0);
  const totalOnSite = equipment.reduce((s, e) => s + (e.actual_on_site || 0), 0);
  const keyEquipment = equipment.filter(e => e.is_key_equipment);
  const deficient = equipment.filter(e => e.actual_on_site < e.required_quantity);

  return (
    <div>
      <div className="page-header">
        <div><h2>Equipment Register</h2><div className="subtitle">Contract requirements vs actual deployment</div></div>
        {selectedProject && canManage && <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Equipment</button>}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && equipment.length > 0 && (
        <>
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card">
              <div className="stat-label">Required</div>
              <div className="stat-value">{totalRequired}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">On Site</div>
              <div className="stat-value text-accent">{totalOnSite}</div>
            </div>
            <div className="stat-card" style={{ borderColor: deficient.length > 0 ? 'var(--danger)' : 'var(--border)' }}>
              <div className="stat-label">Deficient</div>
              <div className="stat-value" style={{ color: deficient.length > 0 ? 'var(--danger)' : 'inherit' }}>{deficient.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Compliance</div>
              <div className="stat-value">{totalRequired > 0 ? Math.round((totalOnSite / totalRequired) * 100) : 0}%</div>
            </div>
          </div>

          <div className="tabs">
            <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>Register ({equipment.length})</button>
            <button className={tab === 'daily' ? 'active' : ''} onClick={() => setTab('daily')}>Daily Status ({dailyStatus.length})</button>
          </div>

          {tab === 'register' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Equipment</th><th>Type</th><th>Spec</th><th>Required</th><th>On Site</th><th>Status</th><th>Key</th><th></th></tr></thead>
                <tbody>
                  {equipment.map(eq => {
                    const ok = eq.actual_on_site >= eq.required_quantity;
                    return (
                      <tr key={eq.id}>
                        <td style={{ fontWeight: 500 }}>{eq.equipment_name}</td>
                        <td className="text-sm">{eq.equipment_type}</td>
                        <td className="text-sm">{eq.specification || '—'}</td>
                        <td className="text-mono" style={{ textAlign: 'center' }}>{eq.required_quantity}</td>
                        <td className="text-mono" style={{ textAlign: 'center', color: ok ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                          {eq.actual_on_site}
                        </td>
                        <td>
                          <span className={`badge badge-${ok ? 'success' : 'danger'}`}>
                            {ok ? 'Compliant' : `Short ${eq.required_quantity - eq.actual_on_site}`}
                          </span>
                        </td>
                        <td>{eq.is_key_equipment && <span className="badge badge-accent">Key</span>}</td>
                        <td>
                          <div className="btn-group">
                            <button className="btn btn-sm btn-primary" onClick={() => setShowStatusModal(eq.id)}>Log Status</button>
                            {canManage && <button className="btn btn-sm btn-danger" onClick={() => deleteEquipment(eq.id)}>×</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'daily' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Date</th><th>Equipment</th><th>Status</th><th>Hours</th><th>Location</th><th>Operator</th><th>Fuel (L)</th></tr></thead>
                <tbody>
                  {dailyStatus.map(ds => (
                    <tr key={ds.id}>
                      <td className="text-mono">{ds.status_date}</td>
                      <td style={{ fontWeight: 500 }}>{ds.equip?.equipment_name}</td>
                      <td>
                        <span className={`badge badge-${ds.status === 'Operational' ? 'success' : ds.status === 'Breakdown' ? 'danger' : ds.status === 'Idle' ? 'warning' : 'muted'}`}>
                          {ds.status}
                        </span>
                      </td>
                      <td className="text-mono">{ds.hours_worked || '—'}</td>
                      <td className="text-mono text-sm">{ds.location_chainage || '—'}</td>
                      <td className="text-sm">{ds.operator || '—'}</td>
                      <td className="text-mono">{ds.fuel_litres || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selectedProject && equipment.length === 0 && (
        <div className="card empty-state">
          <div className="icon">⚙️</div>
          <p>No equipment registered for this project</p>
          {canManage && <button className="btn btn-primary mt-16" onClick={() => setShowAddModal(true)}>+ Add Equipment</button>}
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Add Equipment<button onClick={() => setShowAddModal(false)}>×</button></h3>
            <form onSubmit={addEquipment}>
              <div className="form-group mb-16"><label>Equipment Name *</label>
                <input value={addForm.equipment_name} onChange={e => setAddForm({ ...addForm, equipment_name: e.target.value })} required placeholder="e.g. CAT 140H Motor Grader" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Type *</label>
                  <select value={addForm.equipment_type} onChange={e => setAddForm({ ...addForm, equipment_type: e.target.value })}>
                    {EQUIPMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div className="form-group mb-16"><label>Specification</label>
                  <input value={addForm.specification} onChange={e => setAddForm({ ...addForm, specification: e.target.value })} placeholder="e.g. Min 120HP" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Required Qty</label>
                  <input type="number" min="0" value={addForm.required_quantity} onChange={e => setAddForm({ ...addForm, required_quantity: e.target.value })} /></div>
                <div className="form-group mb-16"><label>On Site</label>
                  <input type="number" min="0" value={addForm.actual_on_site} onChange={e => setAddForm({ ...addForm, actual_on_site: e.target.value })} /></div>
                <div className="form-group mb-16" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 24 }}>
                  <input type="checkbox" checked={addForm.is_key_equipment} onChange={e => setAddForm({ ...addForm, is_key_equipment: e.target.checked })} />
                  <label style={{ margin: 0 }}>Key Equipment</label></div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Equipment'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowAddModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Daily Status Modal */}
      {showStatusModal && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Log Equipment Status — {equipment.find(e => e.id === showStatusModal)?.equipment_name}
              <button onClick={() => setShowStatusModal(null)}>×</button></h3>
            <form onSubmit={logDailyStatus}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Date</label>
                  <input type="date" value={statusForm.status_date} onChange={e => setStatusForm({ ...statusForm, status_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Status *</label>
                  <select value={statusForm.status} onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Hours Worked</label>
                  <input type="number" step="0.5" min="0" value={statusForm.hours_worked} onChange={e => setStatusForm({ ...statusForm, hours_worked: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Location Ch.</label>
                  <input value={statusForm.location_chainage} onChange={e => setStatusForm({ ...statusForm, location_chainage: e.target.value })} placeholder="e.g. 5+200" /></div>
                <div className="form-group mb-16"><label>Fuel (L)</label>
                  <input type="number" step="0.1" value={statusForm.fuel_litres} onChange={e => setStatusForm({ ...statusForm, fuel_litres: e.target.value })} /></div>
              </div>
              <div className="form-group mb-16"><label>Operator</label>
                <input value={statusForm.operator} onChange={e => setStatusForm({ ...statusForm, operator: e.target.value })} placeholder="Operator name" /></div>
              <div className="form-group mb-16"><label>Notes</label>
                <textarea rows={2} value={statusForm.notes} onChange={e => setStatusForm({ ...statusForm, notes: e.target.value })} /></div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log Status'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowStatusModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
