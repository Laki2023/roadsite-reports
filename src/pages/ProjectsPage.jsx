import React, { useState, useEffect } from 'react';
import { supabase, hasRole, PROJECT_CATEGORIES, FIDIC_EDITIONS, PROJECT_PHASES } from '../lib/supabase';

const EMPTY_PROJECT = {
  name: '', category: 'Construction', contract_no: '', contractor_name: '',
  contract_sum: '', fidic_edition: 'Red Book 1999', employer: 'KeNHA',
  start_chainage: '', end_chainage: '', road_class: '', region: '', county: '', sub_county: '', constituency: '',
  commencement_date: '', original_completion_date: '', current_phase: 'Mobilization',
  status: 'active',
  // Extended contract data
  financier: '', engineer_name: '', engineer_rep: '',
  contract_award_date: '', contract_signing_date: '', order_to_commence_date: '',
  original_contract_sum: '', revised_contract_sum: '',
  defects_liability_months: 12, performance_guarantee_expiry: '',
  addendums: '', latitude: '', longitude: '',
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
        original_contract_sum: form.original_contract_sum ? parseFloat(form.original_contract_sum) : null,
        revised_contract_sum: form.revised_contract_sum ? parseFloat(form.revised_contract_sum) : null,
        start_chainage: form.start_chainage ? parseFloat(form.start_chainage) : null,
        end_chainage: form.end_chainage ? parseFloat(form.end_chainage) : null,
        defects_liability_months: form.defects_liability_months ? parseInt(form.defects_liability_months) : 12,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        // Dates: empty string → null (PostgreSQL rejects '' for DATE)
        commencement_date: form.commencement_date || null,
        original_completion_date: form.original_completion_date || null,
        contract_award_date: form.contract_award_date || null,
        contract_signing_date: form.contract_signing_date || null,
        order_to_commence_date: form.order_to_commence_date || null,
        performance_guarantee_expiry: form.performance_guarantee_expiry || null,
        // Text: empty string → null
        sub_county: form.sub_county || null,
        constituency: form.constituency || null,
        financier: form.financier || null,
        engineer_name: form.engineer_name || null,
        engineer_rep: form.engineer_rep || null,
        addendums: form.addendums || null,
      };
      if (editId) {
        const { error } = await supabase.from('projects').update(payload).eq('id', editId);
        if (error) throw error;
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
      region: p.region || '', county: p.county || '', sub_county: p.sub_county || '', constituency: p.constituency || '',
      commencement_date: p.commencement_date || '', original_completion_date: p.original_completion_date || '',
      current_phase: p.current_phase || 'Construction', status: p.status || 'active',
      financier: p.financier || '', engineer_name: p.engineer_name || '', engineer_rep: p.engineer_rep || '',
      contract_award_date: p.contract_award_date || '', contract_signing_date: p.contract_signing_date || '',
      order_to_commence_date: p.order_to_commence_date || '',
      original_contract_sum: p.original_contract_sum || '', revised_contract_sum: p.revised_contract_sum || '',
      defects_liability_months: p.defects_liability_months || 12,
      performance_guarantee_expiry: p.performance_guarantee_expiry || '',
      addendums: p.addendums || '', latitude: p.latitude || '', longitude: p.longitude || '',
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
                <th>Contractor</th>
                <th>Contract Sum</th>
                <th>Phase</th>
                <th>Road (Km)</th>
                <th>County</th>
                <th>Progress</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const roadLen = p.start_chainage != null && p.end_chainage != null ? (p.end_chainage - p.start_chainage) : (p.road_length || 0);
                const contractSum = p.original_contract_sum || p.contract_sum || 0;
                // Simple time-based progress estimate (will be replaced by real layer progress later)
                const startDt = p.commencement_date || p.start_date;
                const endDt = p.revised_completion_date || p.original_completion_date || p.end_date;
                const elapsed = startDt ? Math.max(0, (Date.now() - new Date(startDt)) / 86400000) : 0;
                const total = startDt && endDt ? Math.max(1, (new Date(endDt) - new Date(startDt)) / 86400000) : 1;
                const timePct = Math.min(100, Math.round(elapsed / total * 100));

                return (
                <tr key={p.id} style={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (profile?.role === 'contractor_qs') {
                      navigateTo('taking-off', p);
                    } else {
                      navigateTo('project-dashboard', p);
                    }
                  }}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.category} · {p.fidic_edition || '—'}</div>
                  </td>
                  <td className="text-mono text-sm">{p.contract_no || '—'}</td>
                  <td className="text-sm">{p.contractor_name || '—'}</td>
                  <td className="text-mono text-sm">{contractSum > 0 ? `KES ${(contractSum / 1e6).toFixed(1)}M` : '—'}</td>
                  <td><span className={`badge badge-${phaseColors[p.current_phase] || 'muted'}`}>{p.current_phase}</span></td>
                  <td className="text-mono text-sm">{roadLen > 0 ? `${roadLen.toFixed(1)}` : '—'}</td>
                  <td className="text-sm">
                    <div>{p.county || '—'}</div>
                    {(p.sub_county || p.constituency) && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {[p.sub_county, p.constituency].filter(Boolean).join(' | ')}
                      </div>
                    )}
                  </td>
                  <td style={{ width: 100 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${timePct}%`, borderRadius: 3,
                          background: timePct >= 80 ? '#10b981' : timePct >= 40 ? '#e87b35' : '#3b82f6' }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, minWidth: 28, color: 'var(--text-muted)' }}>{timePct}%</span>
                    </div>
                  </td>
                  <td>
                    {hasRole(profile.role, 'engineer') && (
                      <button className="btn btn-sm btn-secondary"
                        onClick={e => { e.stopPropagation(); openEdit(p); }}>Edit</button>
                    )}
                  </td>
                </tr>
                );
              })}
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
                  <label>County(ies)</label>
                  <input value={form.county} onChange={e => setForm({ ...form, county: e.target.value })}
                    placeholder="e.g. Murang'a, Nyeri" />
                </div>
                <div className="form-group">
                  <label>Sub-County(ies)</label>
                  <input value={form.sub_county || ''} onChange={e => setForm({ ...form, sub_county: e.target.value })}
                    placeholder="e.g. Mathioya, Kigumo" />
                </div>
                <div className="form-group">
                  <label>Constituency(ies)</label>
                  <input value={form.constituency || ''} onChange={e => setForm({ ...form, constituency: e.target.value })}
                    placeholder="e.g. Mathioya, Kigumo" />
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
                {/* Extended Contract Data */}
                <div className="form-group">
                  <label>Financier</label>
                  <input value={form.financier || ''} onChange={e => setForm({ ...form, financier: e.target.value })}
                    placeholder="e.g. GOK, World Bank" />
                </div>
                <div className="form-group">
                  <label>Engineer</label>
                  <input value={form.engineer_name || ''} onChange={e => setForm({ ...form, engineer_name: e.target.value })}
                    placeholder="e.g. Director, Development, KeNHA" />
                </div>
                <div className="form-group full-width">
                  <label>Engineer's Representative</label>
                  <input value={form.engineer_rep || ''} onChange={e => setForm({ ...form, engineer_rep: e.target.value })}
                    placeholder="e.g. WITTS Engineering Consultancy Ltd" />
                </div>
                <div className="form-group">
                  <label>Contract Award Date</label>
                  <input type="date" value={form.contract_award_date || ''} onChange={e => setForm({ ...form, contract_award_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Contract Signing Date</label>
                  <input type="date" value={form.contract_signing_date || ''} onChange={e => setForm({ ...form, contract_signing_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Order to Commence Date</label>
                  <input type="date" value={form.order_to_commence_date || ''} onChange={e => setForm({ ...form, order_to_commence_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Original Contract Sum (KES)</label>
                  <input type="number" step="0.01" value={form.original_contract_sum || ''}
                    onChange={e => setForm({ ...form, original_contract_sum: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Revised Contract Sum (KES)</label>
                  <input type="number" step="0.01" value={form.revised_contract_sum || ''}
                    onChange={e => setForm({ ...form, revised_contract_sum: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Defects Liability (months)</label>
                  <input type="number" value={form.defects_liability_months || 12}
                    onChange={e => setForm({ ...form, defects_liability_months: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Performance Guarantee Expiry</label>
                  <input type="date" value={form.performance_guarantee_expiry || ''}
                    onChange={e => setForm({ ...form, performance_guarantee_expiry: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Addendums</label>
                  <input value={form.addendums || ''} onChange={e => setForm({ ...form, addendums: e.target.value })}
                    placeholder="e.g. Addendum No. 1, 2" />
                </div>
                <div className="form-group">
                  <label>Latitude</label>
                  <input type="number" step="0.0001" value={form.latitude || ''}
                    onChange={e => setForm({ ...form, latitude: e.target.value })}
                    placeholder="e.g. -0.52" />
                </div>
                <div className="form-group">
                  <label>Longitude</label>
                  <input type="number" step="0.0001" value={form.longitude || ''}
                    onChange={e => setForm({ ...form, longitude: e.target.value })}
                    placeholder="e.g. 37.05" />
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
