import React, { useState, useEffect } from 'react';
import { supabase, hasRole, TEST_TYPES, SPEC_LIMITS } from '../lib/supabase';

const EMPTY_TEST = {
  test_type: 'MDD', layer_id: '', test_standard: '', sample_location_chainage: '',
  sample_location_side: 'CL', sample_location_offset_m: '',
  date_sampled: new Date().toISOString().split('T')[0], date_tested: '',
  lab_ref: '', result_value: '', result_unit: '', spec_min: '', spec_max: '',
  spec_reference: '', result_status: 'Pending', notes: '',
};

export default function QualityTestsPage({ profile, showToast, selectedProject }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(selectedProject?.id || '');
  const [tests, setTests] = useState([]);
  const [layers, setLayers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_TEST);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [tab, setTab] = useState('all');

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => {
    if (projectId) {
      loadTests();
      supabase.from('pavement_layers').select('id, layer_type, start_chainage, end_chainage, material_type')
        .eq('project_id', projectId).order('start_chainage')
        .then(({ data }) => setLayers(data || []));
    }
  }, [projectId]);

  async function loadTests() {
    const { data } = await supabase.from('quality_tests')
      .select('*, tested_by_profile:tested_by(full_name), reviewed_by_profile:reviewed_by(full_name), pavement_layers(layer_type, start_chainage, end_chainage)')
      .eq('project_id', projectId)
      .order('date_sampled', { ascending: false });
    setTests(data || []);
  }

  // Auto-fill spec limits when layer and test type change
  function autoFillSpecs(layerId, testType) {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return {};
    const specs = SPEC_LIMITS[layer.layer_type]?.[testType];
    if (!specs) return {};
    return {
      spec_min: specs.min ?? '',
      spec_max: specs.max ?? '',
      result_unit: specs.unit || '',
      spec_reference: specs.ref || '',
    };
  }

  function handleLayerOrTestChange(newLayerId, newTestType) {
    const layerId = newLayerId !== undefined ? newLayerId : form.layer_id;
    const testType = newTestType !== undefined ? newTestType : form.test_type;
    const specs = autoFillSpecs(layerId, testType);
    setForm(f => ({ ...f, ...(newLayerId !== undefined ? { layer_id: newLayerId } : {}),
      ...(newTestType !== undefined ? { test_type: newTestType } : {}), ...specs }));
  }

  // Auto-evaluate pass/fail
  function evaluateResult(value, specMin, specMax) {
    if (!value && value !== 0) return 'Pending';
    const v = parseFloat(value);
    if (isNaN(v)) return 'Pending';
    const mn = specMin !== '' ? parseFloat(specMin) : null;
    const mx = specMax !== '' ? parseFloat(specMax) : null;
    if (mn !== null && v < mn) return 'Fail';
    if (mx !== null && v > mx) return 'Fail';
    if (mn !== null && v < mn * 1.05) return 'Marginal';
    return 'Pass';
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      // Auto-evaluate
      let status = form.result_status;
      if (form.result_value && status === 'Pending') {
        status = evaluateResult(form.result_value, form.spec_min, form.spec_max);
      }

      const payload = {
        project_id: projectId,
        layer_id: form.layer_id || null,
        test_type: form.test_type,
        test_standard: form.test_standard || null,
        sample_location_chainage: form.sample_location_chainage ? parseFloat(form.sample_location_chainage) : null,
        sample_location_side: form.sample_location_side || null,
        sample_location_offset_m: form.sample_location_offset_m ? parseFloat(form.sample_location_offset_m) : null,
        date_sampled: form.date_sampled,
        date_tested: form.date_tested || null,
        lab_ref: form.lab_ref || null,
        result_value: form.result_value ? parseFloat(form.result_value) : null,
        result_unit: form.result_unit || null,
        spec_min: form.spec_min !== '' ? parseFloat(form.spec_min) : null,
        spec_max: form.spec_max !== '' ? parseFloat(form.spec_max) : null,
        spec_reference: form.spec_reference || null,
        result_status: status,
        notes: form.notes || null,
        tested_by: profile.id,
      };

      if (editId) {
        await supabase.from('quality_tests').update(payload).eq('id', editId);
        showToast('Test result updated');
      } else {
        const { error } = await supabase.from('quality_tests').insert(payload);
        if (error) throw error;
        showToast('Test recorded');
      }
      setShowModal(false);
      setForm(EMPTY_TEST);
      setEditId(null);
      loadTests();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(t) {
    setForm({
      test_type: t.test_type, layer_id: t.layer_id || '', test_standard: t.test_standard || '',
      sample_location_chainage: t.sample_location_chainage ?? '',
      sample_location_side: t.sample_location_side || 'CL',
      sample_location_offset_m: t.sample_location_offset_m ?? '',
      date_sampled: t.date_sampled || '', date_tested: t.date_tested || '',
      lab_ref: t.lab_ref || '', result_value: t.result_value ?? '',
      result_unit: t.result_unit || '', spec_min: t.spec_min ?? '',
      spec_max: t.spec_max ?? '', spec_reference: t.spec_reference || '',
      result_status: t.result_status, notes: t.notes || '',
    });
    setEditId(t.id);
    setShowModal(true);
  }

  const filtered = tests.filter(t => {
    if (filterType !== 'all' && t.test_type !== filterType) return false;
    if (filterStatus !== 'all' && t.result_status !== filterStatus) return false;
    if (tab === 'failed') return t.result_status === 'Fail';
    if (tab === 'pending') return t.result_status === 'Pending';
    return true;
  });

  const statusBadge = (s) => {
    const m = { Pass: 'pass', Fail: 'fail', Pending: 'pending', Marginal: 'warning', 'Retest Required': 'danger' };
    return <span className={`badge badge-${m[s] || 'muted'}`}>{s}</span>;
  };

  // Summary
  const counts = { total: tests.length, Pass: 0, Fail: 0, Pending: 0, Marginal: 0 };
  tests.forEach(t => { if (counts[t.result_status] !== undefined) counts[t.result_status]++; });
  const passRate = counts.total > 0 ? ((counts.Pass / (counts.total - counts.Pending)) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Quality Tests</h2>
          <div className="subtitle">Testing matrix against Kenya RDM specifications</div>
        </div>
        {projectId && hasRole(profile.role, 'inspector') && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_TEST); setEditId(null); setShowModal(true); }}>
            + Record Test
          </button>
        )}
      </div>

      <div className="filter-bar">
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ minWidth: 300 }}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && (
          <>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="all">All Test Types</option>
              {TEST_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Results</option>
              {['Pending', 'Pass', 'Fail', 'Marginal', 'Retest Required'].map(s => <option key={s}>{s}</option>)}
            </select>
          </>
        )}
      </div>

      {!projectId ? (
        <div className="card empty-state">
          <div className="icon">⬡</div>
          <p>Select a project to view quality tests</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-label">Total Tests</div>
              <div className="stat-value">{counts.total}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pass Rate</div>
              <div className="stat-value" style={{ color: passRate >= 90 ? 'var(--success)' : passRate >= 70 ? 'var(--warning)' : 'var(--danger)' }}>
                {isFinite(passRate) ? `${passRate.toFixed(0)}%` : '—'}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pending</div>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{counts.Pending}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Failed</div>
              <div className="stat-value text-danger">{counts.Fail}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
              All ({counts.total})
            </button>
            <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
              Pending ({counts.Pending})
            </button>
            <button className={tab === 'failed' ? 'active' : ''} onClick={() => setTab('failed')}>
              Failed ({counts.Fail})
            </button>
          </div>

          {/* Tests Table */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Test Type</th><th>Layer</th><th>Chainage</th><th>Sampled</th>
                  <th>Lab Ref</th><th>Result</th><th>Spec</th><th>Status</th>
                  <th>Tested By</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.test_type}</td>
                    <td className="text-sm">
                      {t.pavement_layers
                        ? `${t.pavement_layers.layer_type} (${t.pavement_layers.start_chainage}–${t.pavement_layers.end_chainage})`
                        : '—'}
                    </td>
                    <td className="chainage">{t.sample_location_chainage ?? '—'}</td>
                    <td className="text-mono text-sm">{t.date_sampled}</td>
                    <td className="text-mono text-sm">{t.lab_ref || '—'}</td>
                    <td className="text-mono" style={{ fontWeight: 600 }}>
                      {t.result_value != null ? `${t.result_value} ${t.result_unit || ''}` : '—'}
                    </td>
                    <td className="text-sm text-muted">
                      {t.spec_min != null || t.spec_max != null
                        ? `${t.spec_min ?? '—'} – ${t.spec_max ?? '—'} ${t.result_unit || ''}`
                        : '—'}
                    </td>
                    <td>{statusBadge(t.result_status)}</td>
                    <td className="text-sm">{t.tested_by_profile?.full_name || '—'}</td>
                    <td>
                      {hasRole(profile.role, 'inspector') && (
                        <button className="btn btn-sm btn-secondary" onClick={() => openEdit(t)}>Edit</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="card empty-state mt-16"><p>No tests match your filters</p></div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>
              {editId ? 'Edit Test Result' : 'Record Quality Test'}
              <button onClick={() => setShowModal(false)}>×</button>
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Test Type *</label>
                  <select value={form.test_type} onChange={e => handleLayerOrTestChange(undefined, e.target.value)}>
                    {TEST_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Linked Layer</label>
                  <select value={form.layer_id} onChange={e => handleLayerOrTestChange(e.target.value, undefined)}>
                    <option value="">None</option>
                    {layers.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.layer_type} — Ch.{l.start_chainage}–{l.end_chainage} ({l.material_type || 'TBD'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Test Standard</label>
                  <input value={form.test_standard} onChange={e => setForm({ ...form, test_standard: e.target.value })}
                    placeholder="e.g. BS 1377:Part 4" />
                </div>
                <div className="form-group">
                  <label>Lab Reference</label>
                  <input value={form.lab_ref} onChange={e => setForm({ ...form, lab_ref: e.target.value })}
                    placeholder="e.g. LAB-2026-0142" />
                </div>
                <div className="form-group">
                  <label>Sample Chainage (km)</label>
                  <input type="number" step="0.001" value={form.sample_location_chainage}
                    onChange={e => setForm({ ...form, sample_location_chainage: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Side</label>
                  <select value={form.sample_location_side} onChange={e => setForm({ ...form, sample_location_side: e.target.value })}>
                    {['LHS', 'RHS', 'CL'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Offset (m)</label>
                  <input type="number" step="0.01" value={form.sample_location_offset_m}
                    onChange={e => setForm({ ...form, sample_location_offset_m: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Date Sampled *</label>
                  <input type="date" value={form.date_sampled}
                    onChange={e => setForm({ ...form, date_sampled: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Date Tested</label>
                  <input type="date" value={form.date_tested}
                    onChange={e => setForm({ ...form, date_tested: e.target.value })} />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0', paddingTop: 16 }}>
                <h4 style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 12 }}>Result & Specification</h4>
                {form.spec_reference && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
                    Ref: {form.spec_reference}
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-group">
                    <label>Result Value</label>
                    <input type="number" step="0.0001" value={form.result_value}
                      onChange={e => setForm({ ...form, result_value: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Unit</label>
                    <input value={form.result_unit} onChange={e => setForm({ ...form, result_unit: e.target.value })}
                      placeholder="e.g. %, kN, kg/m³" />
                  </div>
                  <div className="form-group">
                    <label>Spec Min</label>
                    <input type="number" step="0.01" value={form.spec_min}
                      onChange={e => setForm({ ...form, spec_min: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Spec Max</label>
                    <input type="number" step="0.01" value={form.spec_max}
                      onChange={e => setForm({ ...form, spec_max: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Spec Reference</label>
                    <input value={form.spec_reference} onChange={e => setForm({ ...form, spec_reference: e.target.value })}
                      placeholder="e.g. Kenya RDM Part III, Table 5.1" />
                  </div>
                  <div className="form-group">
                    <label>Result Status</label>
                    <select value={form.result_status} onChange={e => setForm({ ...form, result_status: e.target.value })}>
                      {['Pending', 'Pass', 'Fail', 'Marginal', 'Retest Required'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {form.result_value && (
                  <div style={{ fontSize: 12, marginTop: 8, padding: '6px 10px', borderRadius: 'var(--radius)', background: 'var(--bg-hover)' }}>
                    Auto-evaluation: {statusBadge(evaluateResult(form.result_value, form.spec_min, form.spec_max))}
                    <span className="text-muted" style={{ marginLeft: 8 }}>
                      (value {form.result_value} vs spec {form.spec_min || '—'}–{form.spec_max || '—'})
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional observations, sample conditions..." rows={3} />
              </div>

              <div className="btn-group mt-24">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editId ? 'Update Test' : 'Record Test'}
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
