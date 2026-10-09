import React, { useState, useEffect } from 'react';
import { supabase, hasRole, canEditModule } from '../lib/supabase';

const GUARANTEE_TYPES = [
  { value: 'performance_bond', label: 'Performance Security', fidic: '4.2' },
  { value: 'advance_payment_guarantee', label: 'Advance Payment Guarantee', fidic: '14.2' },
  { value: 'retention_guarantee', label: 'Retention Money Guarantee', fidic: '14.9' },
  { value: 'bid_bond', label: 'Bid Security / Bond', fidic: '—' },
  { value: 'parent_company_guarantee', label: 'Parent Company Guarantee', fidic: '—' },
  { value: 'insurance_policy', label: 'Insurance Policy', fidic: '18.1' },
  { value: 'other', label: 'Other Security', fidic: '—' },
];

function daysUntilExpiry(expiry, extendedTo) {
  const d = extendedTo || expiry;
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
}

function trafficLight(daysLeft, alertDays) {
  if (daysLeft === null) return 'muted';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'red';
  if (daysLeft <= (alertDays || 60)) return 'amber';
  return 'green';
}

const lightColors = { green: '#10b981', amber: '#f59e0b', red: '#ef4444', expired: '#991b1b', muted: '#9ca3af' };
const lightBg = { green: '#ecfdf5', amber: '#fef3c7', red: '#fef2f2', expired: '#fef2f2', muted: '#f3f4f6' };

export default function GuaranteeRegisterPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [guarantees, setGuarantees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all'); // all, active, expiring, expired
  const [form, setForm] = useState({
    guarantee_type: 'performance_bond', reference_no: '', description: '',
    issuing_institution: '', beneficiary: 'Employer', amount: '',
    currency: 'KES', issue_date: '', effective_date: '', expiry_date: '',
    extended_to: '', fidic_clause: '4.2', alert_days_before: 60, notes: '',
  });

  const isPlatformAdmin = profile?.is_platform_admin === true;
  const canManage = isPlatformAdmin || hasRole(profile?.role, 'project_engineer') ||
    canEditModule(profile?.allowed_pages, 'guarantees');

  useEffect(() => { supabase.from('projects').select('*').order('name').then(({ data }) => setProjects(data || [])); }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase.from('guarantee_register')
      .select('*')
      .eq('project_id', selectedProject)
      .order('expiry_date', { ascending: true });
    if (error) { showToast?.(error.message, 'error'); }
    setGuarantees(data || []);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm({
      guarantee_type: 'performance_bond', reference_no: '', description: '',
      issuing_institution: '', beneficiary: 'Employer', amount: '',
      currency: 'KES', issue_date: new Date().toISOString().split('T')[0],
      effective_date: '', expiry_date: '', extended_to: '',
      fidic_clause: '4.2', alert_days_before: 60, notes: '',
    });
    setShowForm(true);
  }

  function openEdit(g) {
    setEditing(g);
    setForm({
      guarantee_type: g.guarantee_type, reference_no: g.reference_no || '',
      description: g.description, issuing_institution: g.issuing_institution,
      beneficiary: g.beneficiary || 'Employer', amount: g.amount,
      currency: g.currency || 'KES', issue_date: g.issue_date || '',
      effective_date: g.effective_date || '', expiry_date: g.expiry_date || '',
      extended_to: g.extended_to || '', fidic_clause: g.fidic_clause || '',
      alert_days_before: g.alert_days_before || 60, notes: g.notes || '',
    });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        project_id: selectedProject,
        guarantee_type: form.guarantee_type,
        reference_no: form.reference_no || null,
        description: form.description,
        issuing_institution: form.issuing_institution,
        beneficiary: form.beneficiary,
        amount: parseFloat(form.amount),
        currency: form.currency,
        issue_date: form.issue_date,
        effective_date: form.effective_date || null,
        expiry_date: form.expiry_date,
        extended_to: form.extended_to || null,
        fidic_clause: form.fidic_clause || null,
        alert_days_before: parseInt(form.alert_days_before) || 60,
        notes: form.notes || null,
        status: 'Active',
      };
      if (editing) {
        const { error } = await supabase.from('guarantee_register').update(payload).eq('id', editing.id);
        if (error) throw error;
        showToast?.('Guarantee updated');
      } else {
        payload.created_by = profile?.id;
        const { error } = await supabase.from('guarantee_register').insert(payload);
        if (error) throw error;
        showToast?.('Guarantee registered');
      }
      setShowForm(false); setEditing(null); loadData();
    } catch (err) { showToast?.(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function updateStatus(g, status) {
    const updates = { status };
    if (status === 'Released') {
      updates.released_date = new Date().toISOString().split('T')[0];
      updates.released_by = profile?.id;
    }
    const { error } = await supabase.from('guarantee_register').update(updates).eq('id', g.id);
    if (error) { showToast?.(error.message, 'error'); return; }
    showToast?.(`${g.description} — ${status}`); loadData();
  }

  async function deleteGuarantee(g) {
    if (!window.confirm(`Delete "${g.description}"? This cannot be undone.`)) return;
    await supabase.from('guarantee_register').delete().eq('id', g.id);
    showToast?.('Guarantee deleted'); loadData();
  }

  const fmt = (n) => n != null ? `${form.currency || 'KES'} ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  const typeLabel = (t) => GUARANTEE_TYPES.find(g => g.value === t)?.label || t;

  // Summary stats
  const activeGuarantees = guarantees.filter(g => g.status === 'Active');
  const expiringCount = activeGuarantees.filter(g => {
    const d = daysUntilExpiry(g.expiry_date, g.extended_to);
    return d !== null && d >= 0 && d <= (g.alert_days_before || 60);
  }).length;
  const expiredCount = activeGuarantees.filter(g => {
    const d = daysUntilExpiry(g.expiry_date, g.extended_to);
    return d !== null && d < 0;
  }).length;
  const totalValue = activeGuarantees.reduce((s, g) => s + (g.amount || 0), 0);

  // Filter
  const filtered = guarantees.filter(g => {
    if (filter === 'all') return true;
    if (filter === 'active') return g.status === 'Active';
    if (filter === 'expired') return g.status === 'Expired' || (g.status === 'Active' && daysUntilExpiry(g.expiry_date, g.extended_to) < 0);
    if (filter === 'expiring') {
      const d = daysUntilExpiry(g.expiry_date, g.extended_to);
      return g.status === 'Active' && d !== null && d >= 0 && d <= (g.alert_days_before || 60);
    }
    return true;
  });

  if (loading) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',color:'var(--text-muted)'}}><div style={{fontSize:28,marginBottom:12}}>◈</div><div>Loading...</div></div>;

  return (
    <div>
      <div className="page-header">
        <div><h2>🔐 Guarantee & Security Register</h2><div className="subtitle">FIDIC Cl. 4.2, 14.2, 14.9 — Securities, Bonds & Insurance Tracking</div></div>
        {selectedProject && canManage && (
          <button className="btn btn-primary" onClick={openNew}>+ Add Guarantee</button>
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
          {/* Alert Banner */}
          {(expiringCount > 0 || expiredCount > 0) && (
            <div style={{
              padding: '12px 16px', marginBottom: 16, borderRadius: 'var(--radius)',
              background: expiredCount > 0 ? '#fef2f2' : '#fef3c7',
              border: `1px solid ${expiredCount > 0 ? '#fca5a5' : '#fde68a'}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 20 }}>{expiredCount > 0 ? '🚨' : '⚠️'}</span>
              <div>
                {expiredCount > 0 && <div style={{ fontWeight: 700, color: '#991b1b' }}>{expiredCount} guarantee(s) EXPIRED — immediate action required</div>}
                {expiringCount > 0 && <div style={{ fontWeight: 600, color: '#92400e' }}>{expiringCount} guarantee(s) expiring within alert window</div>}
              </div>
            </div>
          )}

          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total Securities', value: guarantees.length, icon: '📋', color: '#6366f1' },
              { label: 'Active', value: activeGuarantees.length, icon: '✅', color: '#10b981' },
              { label: 'Expiring Soon', value: expiringCount, icon: '⚠️', color: expiringCount > 0 ? '#f59e0b' : '#9ca3af' },
              { label: 'Expired', value: expiredCount, icon: '🚨', color: expiredCount > 0 ? '#ef4444' : '#9ca3af' },
              { label: 'Total Value', value: `KES ${Number(totalValue).toLocaleString()}`, icon: '💰', color: '#3b82f6' },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border)', borderLeft: `4px solid ${kpi.color}`, background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kpi.label}</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="tabs" style={{ marginBottom: 16 }}>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All ({guarantees.length})</button>
            <button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Active ({activeGuarantees.length})</button>
            <button className={filter === 'expiring' ? 'active' : ''} onClick={() => setFilter('expiring')} style={{ color: expiringCount > 0 ? '#f59e0b' : undefined }}>⚠ Expiring ({expiringCount})</button>
            <button className={filter === 'expired' ? 'active' : ''} onClick={() => setFilter('expired')} style={{ color: expiredCount > 0 ? '#ef4444' : undefined }}>🚨 Expired ({expiredCount})</button>
          </div>

          {/* Register Table */}
          {filtered.length === 0 ? (
            <div className="card empty-state"><div className="icon">🔐</div><p>{guarantees.length === 0 ? 'No guarantees registered yet' : 'No matches for this filter'}</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Issuing Institution</th>
                    <th>Amount</th>
                    <th>Expiry Date</th>
                    <th>Days Left</th>
                    <th>FIDIC</th>
                    {canManage && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(g => {
                    const days = daysUntilExpiry(g.expiry_date, g.extended_to);
                    const light = g.status !== 'Active' ? 'muted' : trafficLight(days, g.alert_days_before);
                    return (
                      <tr key={g.id}>
                        <td>
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '3px 10px', borderRadius: 20,
                            background: lightBg[light], color: lightColors[light],
                            fontWeight: 700, fontSize: 11,
                          }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: lightColors[light],
                              boxShadow: light === 'red' || light === 'expired' ? `0 0 6px ${lightColors[light]}` : 'none',
                              animation: light === 'red' || light === 'expired' ? 'pulse 1.5s infinite' : 'none',
                            }} />
                            {g.status}
                          </div>
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{typeLabel(g.guarantee_type)}</td>
                        <td style={{ fontSize: 12, maxWidth: 200 }}>{g.description}</td>
                        <td className="text-mono" style={{ fontSize: 11 }}>{g.reference_no || '—'}</td>
                        <td style={{ fontSize: 12 }}>{g.issuing_institution}</td>
                        <td className="text-mono" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {g.currency} {Number(g.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-mono" style={{ fontSize: 12 }}>
                          {g.extended_to || g.expiry_date}
                          {g.extended_to && <div style={{ fontSize: 9, color: '#6366f1' }}>Extended from {g.expiry_date}</div>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {days !== null ? (
                            <span style={{
                              fontWeight: 700, fontSize: 14,
                              color: lightColors[light],
                            }}>
                              {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.fidic_clause || '—'}</td>
                        {canManage && (
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <button className="btn btn-sm btn-secondary" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => openEdit(g)}>Edit</button>
                              {g.status === 'Active' && (
                                <>
                                  <button className="btn btn-sm btn-accent" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => updateStatus(g, 'Renewed')}>Renew</button>
                                  <button className="btn btn-sm btn-success" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => updateStatus(g, 'Released')}>Release</button>
                                </>
                              )}
                              {g.status === 'Active' && days !== null && days < 0 && (
                                <button className="btn btn-sm btn-danger" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => updateStatus(g, 'Expired')}>Mark Expired</button>
                              )}
                              <button className="btn btn-sm btn-danger" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => deleteGuarantee(g)}>×</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── ADD / EDIT MODAL ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <h3>{editing ? 'Edit Guarantee' : 'Register New Guarantee'}<button onClick={() => setShowForm(false)}>×</button></h3>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Type *</label>
                  <select value={form.guarantee_type} onChange={e => {
                    const t = GUARANTEE_TYPES.find(g => g.value === e.target.value);
                    setForm({ ...form, guarantee_type: e.target.value, fidic_clause: t?.fidic || form.fidic_clause });
                  }}>
                    {GUARANTEE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} (Cl. {t.fidic})</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>Reference No.</label>
                  <input type="text" value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} placeholder="e.g. BG/2026/0045" />
                </div>
              </div>

              <div className="form-group mb-16">
                <label>Description *</label>
                <input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Performance Bond — 10% of Contract Sum" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Issuing Institution *</label>
                  <input type="text" required value={form.issuing_institution} onChange={e => setForm({ ...form, issuing_institution: e.target.value })} placeholder="e.g. KCB Bank Kenya" />
                </div>
                <div className="form-group mb-16">
                  <label>Beneficiary</label>
                  <input type="text" value={form.beneficiary} onChange={e => setForm({ ...form, beneficiary: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Currency</label>
                  <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                    <option value="KES">KES</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>Amount *</label>
                  <input type="number" step="0.01" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="e.g. 50000000" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Issue Date *</label><input type="date" required value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Effective Date</label><input type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Expiry Date *</label><input type="date" required value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Extended To</label><input type="date" value={form.extended_to} onChange={e => setForm({ ...form, extended_to: e.target.value })} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>FIDIC Clause</label>
                  <input type="text" value={form.fidic_clause} onChange={e => setForm({ ...form, fidic_clause: e.target.value })} placeholder="e.g. 4.2" />
                </div>
                <div className="form-group mb-16">
                  <label>Alert Days Before Expiry</label>
                  <input type="number" value={form.alert_days_before} onChange={e => setForm({ ...form, alert_days_before: e.target.value })} />
                </div>
              </div>

              <div className="form-group mb-16"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? '💾 Update' : '🔐 Register Guarantee'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
