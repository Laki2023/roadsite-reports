import React, { useState, useEffect } from 'react';
import { supabase, hasRole, PROJECT_CATEGORIES, FIDIC_EDITIONS, PROJECT_PHASES } from '../lib/supabase';

const EMPTY_PROJECT = {
  name: '', category: 'Construction', contract_no: '', contractor_name: '',
  contract_sum: '', fidic_edition: 'Red Book 1999', employer: 'KeNHA',
  start_chainage: '', end_chainage: '', road_class: '', region: '', county: '',
  commencement_date: '', original_completion_date: '', current_phase: 'Mobilization',
  status: 'active',
};

export default function ProjectsPage({ profile, showToast, navigateTo }) {
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_PROJECT);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects(data || []);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        contract_sum: form.contract_sum ? parseFloat(form.contract_sum) : null,
        start_chainage: form.start_chainage ? parseFloat(form.start_chainage) : null,
        end_chainage: form.end_chainage ? parseFloat(form.end_chainage) : null,
      };
      if (editId) {
        await supabase.from('projects').update(payload).eq('id', editId);
        showToast('Project updated');
      } else {
        const { data, error } = await supabase.from('projects').insert(payload).select().single();
        if (error) throw error;
        // Seed default construction elements
        if (data) {
          await supabase.rpc('seed_project_elements', {
            p_project_id: data.id,
            p_category: data.category,
          });
        }
        showToast('Project created with default elements');
      }
      setShowModal(false);
      setForm(EMPTY_PROJECT);
      setEditId(null);
      loadProjects();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(p) {
    setForm({
      name: p.name || '', category: p.category || 'Construction',
      contract_no: p.contract_no || '', contractor_name: p.contractor_name || '',
      contract_sum: p.contract_sum || '', fidic_edition: p.fidic_edition || 'Red Book 1999',
      employer: p.employer || 'KeNHA', start_chainage: p.start_chainage || '',
      end_chainage: p.end_chainage || '', road_class: p.road_class || '',
      region: p.region || '', county: p.county || '',
      commencement_date: p.commencement_date || '', original_completion_date: p.original_completion_date || '',
      current_phase: p.current_phase || 'Construction', status: p.status || 'active',
    });
    setEditId(p.id);
    setShowModal(true);
  }

  const filtered = projects.filter(p => {
    if (filter !== 'all' && p.category !== filter) return false;
    if (search && !p.name?.toLowerCase().includes(search.toLowerCase())
      && !p.contract_no?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const catColors = { Construction: 'accent', Rehabilitation: 'info', Maintenance: 'success' };
  const phaseColors = { Procurement: 'muted', Mobilization: 'info', Construction: 'accent', 'Defects Liability': 'warning', Completed: 'success', Suspended: 'danger' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Projects</h2>
          <div className="subtitle">{projects.length} road projects</div>
        </div>
        {hasRole(profile.role, 'engineer') && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_PROJECT); setEditId(null); setShowModal(true); }}>
              + New Project
            </button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <input placeholder="Search projects..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ flex: 1, maxWidth: 300 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {PROJECT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <div className="icon">◈</div>
          <p>No projects found</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Contract No.</th>
                <th>Category</th>
                <th>Phase</th>
                <th>Contractor</th>
                <th>FIDIC</th>
                <th>Chainage (km)</th>
                <th>County</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (profile?.role === 'contractor_qs') {
                      navigateTo('taking-off', p);
                    } else {
                      navigateTo('project-dashboard', p);
                    }
                  }}>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td className="text-mono text-sm">{p.contract_no || '—'}</td>
                  <td><span className={`badge badge-${catColors[p.category] || 'muted'}`}>{p.category}</span></td>
                  <td><span className={`badge badge-${phaseColors[p.current_phase] || 'muted'}`}>{p.current_phase}</span></td>
                  <td className="text-sm">{p.contractor_name || '—'}</td>
                  <td className="text-sm">{p.fidic_edition || '—'}</td>
                  <td className="chainage">
                    {p.start_chainage != null && p.end_chainage != null
                      ? `${p.start_chainage.toFixed(3)} — ${p.end_chainage.toFixed(3)}`
                      : '—'}
                  </td>
                  <td className="text-sm">{p.county || '—'}</td>
                  <td>
                    {hasRole(profile.role, 'engineer') && (
                      <button className="btn btn-sm btn-secondary"
                        onClick={e => { e.stopPropagation(); openEdit(p); }}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>
              {editId ? 'Edit Project' : 'New Project'}
              <button onClick={() => setShowModal(false)}>×</button>
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Project Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Mau Mau Roads Lot 2B" required />
                </div>
                <div className="form-group">
                  <label>Category *</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {PROJECT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Contract Number</label>
                  <input value={form.contract_no} onChange={e => setForm({ ...form, contract_no: e.target.value })}
                    placeholder="e.g. KeNHA/RD/D/4178/2024" />
                </div>
                <div className="form-group">
                  <label>Contractor Name</label>
                  <input value={form.contractor_name} onChange={e => setForm({ ...form, contractor_name: e.target.value })}
                    placeholder="e.g. WAK Construction Ltd" />
                </div>
                <div className="form-group">
                  <label>Contract Sum (KES)</label>
                  <input type="number" step="0.01" value={form.contract_sum}
                    onChange={e => setForm({ ...form, contract_sum: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>FIDIC Edition</label>
                  <select value={form.fidic_edition} onChange={e => setForm({ ...form, fidic_edition: e.target.value })}>
                    {FIDIC_EDITIONS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Employer</label>
                  <input value={form.employer} onChange={e => setForm({ ...form, employer: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Start Chainage (km)</label>
                  <input type="number" step="0.001" value={form.start_chainage}
                    onChange={e => setForm({ ...form, start_chainage: e.target.value })}
                    placeholder="e.g. 0.000" />
                </div>
                <div className="form-group">
                  <label>End Chainage (km)</label>
                  <input type="number" step="0.001" value={form.end_chainage}
                    onChange={e => setForm({ ...form, end_chainage: e.target.value })}
                    placeholder="e.g. 45.200" />
                </div>
                <div className="form-group">
                  <label>Road Class</label>
                  <input value={form.road_class} onChange={e => setForm({ ...form, road_class: e.target.value })}
                    placeholder="e.g. Class B" />
                </div>
                <div className="form-group">
                  <label>Region</label>
                  <input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}
                    placeholder="e.g. Central" />
                </div>
                <div className="form-group">
                  <label>County</label>
                  <input value={form.county} onChange={e => setForm({ ...form, county: e.target.value })}
                    placeholder="e.g. Murang'a" />
                </div>
                <div className="form-group">
                  <label>Phase</label>
                  <select value={form.current_phase} onChange={e => setForm({ ...form, current_phase: e.target.value })}>
                    {PROJECT_PHASES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Commencement Date</label>
                  <input type="date" value={form.commencement_date}
                    onChange={e => setForm({ ...form, commencement_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Original Completion Date</label>
                  <input type="date" value={form.original_completion_date}
                    onChange={e => setForm({ ...form, original_completion_date: e.target.value })} />
                </div>
              </div>
              <div className="btn-group mt-24">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editId ? 'Update Project' : 'Create Project'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
