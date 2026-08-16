import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const OB_TYPES = [
  'Performance Guarantee', 'Advance Payment Guarantee', 'Retention Guarantee',
  "Contractor's All Risk Insurance", 'Third Party Liability Insurance',
  "Workers' Compensation Insurance", 'Professional Indemnity Insurance',
  'Motor Vehicle Insurance', 'NEMA Licence', 'NCA Registration',
  'OSHA Registration', 'Tax Compliance Certificate', 'Other',
];

export default function ObligationsPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [obligations, setObligations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    obligation_type: 'Performance Guarantee', provider: '', amount: '',
    reference_no: '', expiry_date: '', issue_date: '', notes: '',
  });
  const canManage = profile?.is_platform_admin || hasRole(profile?.role, 'resident_engineer');

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    const { data } = await supabase.from('project_obligations')
      .select('*')
      .eq('project_id', selectedProject)
      .order('display_order');
    setObligations(data || []);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        project_id: selectedProject,
        obligation_type: form.obligation_type,
        provider: form.provider || null,
        amount: form.amount ? parseFloat(form.amount) : null,
        reference_no: form.reference_no || null,
        expiry_date: form.expiry_date || null,
        issue_date: form.issue_date || null,
        notes: form.notes || null,
        display_order: obligations.length + 1,
      };
      if (editId) {
        const { error } = await supabase.from('project_obligations').update(payload).eq('id', editId);
        if (error) throw error;
        showToast('Obligation updated');
      } else {
        const { error } = await supabase.from('project_obligations').insert(payload);
        if (error) throw error;
        showToast('Obligation added');
      }
      setShowModal(false); setEditId(null);
      setForm({ obligation_type: 'Performance Guarantee', provider: '', amount: '', reference_no: '', expiry_date: '', issue_date: '', notes: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  }

  function openEdit(ob) {
    setForm({
      obligation_type: ob.obligation_type, provider: ob.provider || '',
      amount: ob.amount || '', reference_no: ob.reference_no || '',
      expiry_date: ob.expiry_date || '', issue_date: ob.issue_date || '',
      notes: ob.notes || '',
    });
    setEditId(ob.id); setShowModal(true);
  }

  async function deleteOb(id) {
    if (!window.confirm('Delete this obligation?')) return;
    await supabase.from('project_obligations').delete().eq('id', id);
    showToast('Obligation deleted');
    loadData();
  }

  const today = new Date();
  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - today) / 86400000);
  };

  const expiredCount = obligations.filter(o => daysUntil(o.expiry_date) !== null && daysUntil(o.expiry_date) < 0).length;
  const warningCount = obligations.filter(o => { const d = daysUntil(o.expiry_date); return d !== null && d >= 0 && d <= 90; }).length;
  const validCount = obligations.filter(o => { const d = daysUntil(o.expiry_date); return d === null || d > 90; }).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🔒 Statutory Obligations</h2>
          <div className="subtitle">Guarantees, insurance, licences & compliance tracking</div>
        </div>
        {selectedProject && canManage && (
          <button className="btn btn-primary" onClick={() => {
            setEditId(null);
            setForm({ obligation_type: 'Performance Guarantee', provider: '', amount: '', reference_no: '', expiry_date: '', issue_date: '', notes: '' });
            setShowModal(true);
          }}>+ Add Obligation</button>
        )}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && (
        <>
          {/* Summary strip */}
          {obligations.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <div className="card" style={{ padding: '10px 16px', flex: 1, minWidth: 120, borderLeft: '4px solid #10b981' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Valid</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981' }}>{validCount}</div>
              </div>
              {warningCount > 0 && (
                <div className="card" style={{ padding: '10px 16px', flex: 1, minWidth: 120, borderLeft: '4px solid #f59e0b' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expiring Soon</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#f59e0b' }}>{warningCount}</div>
                </div>
              )}
              {expiredCount > 0 && (
                <div className="card" style={{ padding: '10px 16px', flex: 1, minWidth: 120, borderLeft: '4px solid #ef4444' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Expired</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>{expiredCount}</div>
                </div>
              )}
              <div className="card" style={{ padding: '10px 16px', flex: 1, minWidth: 120, borderLeft: '4px solid var(--accent)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{obligations.length}</div>
              </div>
            </div>
          )}

          {/* Obligations table */}
          {obligations.length === 0 ? (
            <div className="card empty-state">
              <div className="icon">🔒</div>
              <p>No obligations recorded for this project</p>
              <p className="text-sm text-muted">Add performance guarantees, insurance policies, licences</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Obligation</th>
                    <th>Provider / Insurer</th>
                    <th>Reference</th>
                    <th>Amount (KES)</th>
                    <th>Issue Date</th>
                    <th>Expiry Date</th>
                    <th>Status</th>
                    <th>Days</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map(ob => {
                    const days = daysUntil(ob.expiry_date);
                    const isExpired = days !== null && days < 0;
                    const isWarning = days !== null && days >= 0 && days <= 90;
                    return (
                      <tr key={ob.id} style={{ background: isExpired ? '#ef444410' : isWarning ? '#f59e0b08' : 'transparent' }}>
                        <td style={{ fontWeight: 600 }}>{ob.obligation_type}</td>
                        <td className="text-sm">{ob.provider || '—'}</td>
                        <td className="text-mono text-sm">{ob.reference_no || '—'}</td>
                        <td className="text-mono text-sm" style={{ textAlign: 'right' }}>
                          {ob.amount ? Number(ob.amount).toLocaleString() : '—'}
                        </td>
                        <td className="text-mono text-sm">{ob.issue_date || '—'}</td>
                        <td className="text-mono text-sm">{ob.expiry_date || '—'}</td>
                        <td>
                          {days === null ? <span className="badge badge-muted">N/A</span>
                            : isExpired ? <span className="badge badge-danger">Expired</span>
                            : isWarning ? <span className="badge badge-warning">Expiring</span>
                            : <span className="badge badge-success">Valid</span>}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 12,
                          color: isExpired ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981' }}>
                          {days !== null ? (isExpired ? `${Math.abs(days)}d ago` : `${days}d`) : '—'}
                        </td>
                        <td>
                          {canManage && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => openEdit(ob)}>Edit</button>
                              <button style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}
                                onClick={() => deleteOb(ob.id)}>×</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Notes section */}
          {obligations.some(o => o.notes) && (
            <div className="card" style={{ padding: 16, marginTop: 12 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>📝 Notes</h4>
              {obligations.filter(o => o.notes).map(o => (
                <div key={o.id} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                  <b>{o.obligation_type}:</b> {o.notes}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>{editId ? 'Edit Obligation' : 'Add Statutory Obligation'}
              <button onClick={() => setShowModal(false)}>×</button>
            </h3>
            <div className="form-group mb-16">
              <label>Type *</label>
              <select value={form.obligation_type} onChange={e => setForm({ ...form, obligation_type: e.target.value })}>
                {OB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group mb-16">
                <label>Provider / Bank / Insurer</label>
                <input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}
                  placeholder="e.g. KCB Bank, Jubilee Insurance" />
              </div>
              <div className="form-group mb-16">
                <label>Amount (KES)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="e.g. 254000000" />
              </div>
            </div>
            <div className="form-group mb-16">
              <label>Reference / Policy No.</label>
              <input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })}
                placeholder="e.g. BG/2024/001, POL-123456" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group mb-16">
                <label>Issue Date</label>
                <input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} />
              </div>
              <div className="form-group mb-16">
                <label>Expiry Date</label>
                <input type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} />
              </div>
            </div>
            <div className="form-group mb-16">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Renewal letter sent to Contractor 15 Aug 2026" />
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editId ? 'Update' : 'Add Obligation'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
