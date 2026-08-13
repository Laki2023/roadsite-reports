import React, { useState, useEffect, useCallback } from 'react';
import { supabase, ROLE_LABELS, ROLE_COLORS } from '../lib/supabase';

const ORG_TYPES = [
  { key: 'agency', label: 'Government Agency', icon: '🏛' },
  { key: 'consultant', label: 'Consulting Firm', icon: '📐' },
  { key: 'contractor', label: 'Contractor', icon: '🏗' },
  { key: 'other', label: 'Other', icon: '🏢' },
];

const EMPTY_ORG = { name: '', short_name: '', org_type: 'agency', address: '', phone: '', email: '', website: '', registration_no: '' };

export default function OrgManagement({ profile, showToast }) {
  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_ORG);
  const [saving, setSaving] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);

  const isPlatformAdmin = profile.is_platform_admin === true;

  const loadAll = useCallback(async () => {
    const [orgRes, userRes, projRes] = await Promise.all([
      supabase.from('organisations').select('*').order('name'),
      supabase.from('profiles').select('id, full_name, email, role, organisation_id, is_active').order('full_name'),
      supabase.from('projects').select('id, name, organisation_id, category').order('name'),
    ]);
    setOrgs(orgRes.data || []);
    setUsers(userRes.data || []);
    setProjects(projRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  function openAdd() { setForm(EMPTY_ORG); setEditId(null); setShowModal(true); }
  function openEdit(org) { setForm({ name: org.name, short_name: org.short_name || '', org_type: org.org_type || 'agency', address: org.address || '', phone: org.phone || '', email: org.email || '', website: org.website || '', registration_no: org.registration_no || '' }); setEditId(org.id); setShowModal(true); }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Organisation name is required', 'error'); return; }
    setSaving(true);
    if (editId) {
      const { error } = await supabase.from('organisations').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editId);
      if (error) { showToast(error.message, 'error'); } else { showToast('Organisation updated'); }
    } else {
      const { error } = await supabase.from('organisations').insert({ ...form, created_by: profile.id });
      if (error) { showToast(error.message, 'error'); } else { showToast('Organisation created'); }
    }
    setSaving(false);
    setShowModal(false);
    loadAll();
  }

  async function toggleActive(orgId, currentlyActive) {
    if (!window.confirm(`${currentlyActive ? 'Deactivate' : 'Reactivate'} this organisation?`)) return;
    await supabase.from('organisations').update({ is_active: !currentlyActive }).eq('id', orgId);
    showToast(`Organisation ${currentlyActive ? 'deactivated' : 'reactivated'}`);
    loadAll();
  }

  async function assignUserToOrg(userId, orgId) {
    const { error } = await supabase.from('profiles').update({ organisation_id: orgId || null }).eq('id', userId);
    if (error) showToast(error.message, 'error');
    else { showToast('User assigned'); loadAll(); }
  }

  async function assignProjectToOrg(projectId, orgId) {
    const { error } = await supabase.from('projects').update({ organisation_id: orgId || null }).eq('id', projectId);
    if (error) showToast(error.message, 'error');
    else { showToast('Project assigned'); loadAll(); }
  }

  if (!isPlatformAdmin) return <div className="page-header"><h2>Access Denied</h2><p>Platform Admin only.</p></div>;
  if (loading) return <div className="page-header"><h2>Loading...</h2></div>;

  const orgDetail = selectedOrg ? orgs.find(o => o.id === selectedOrg) : null;
  const orgUsers = selectedOrg ? users.filter(u => u.organisation_id === selectedOrg) : [];
  const orgProjects = selectedOrg ? projects.filter(p => p.organisation_id === selectedOrg) : [];
  const unassignedUsers = users.filter(u => !u.organisation_id && u.id !== profile.id);
  const unassignedProjects = projects.filter(p => !p.organisation_id);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>🏛 Organisation Management</h2>
          <div className="subtitle">Platform Admin — Manage agencies, firms & contractors</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Organisation</button>
      </div>

      {/* Org Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }}>
        {orgs.map(org => {
          const orgU = users.filter(u => u.organisation_id === org.id);
          const orgP = projects.filter(p => p.organisation_id === org.id);
          const dg = orgU.find(u => u.role === 'director_general');
          const typeInfo = ORG_TYPES.find(t => t.key === org.org_type) || ORG_TYPES[3];
          const isSelected = selectedOrg === org.id;

          return (
            <div key={org.id} className="card" onClick={() => setSelectedOrg(isSelected ? null : org.id)}
              style={{ padding: 0, cursor: 'pointer', transition: 'all 0.2s', overflow: 'hidden',
                border: isSelected ? '2px solid #e87b35' : undefined,
                opacity: org.is_active ? 1 : 0.6 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; }}>
              <div style={{ height: 4, background: org.is_active ? (org.org_type === 'agency' ? '#e87b35' : org.org_type === 'consultant' ? '#2563eb' : org.org_type === 'contractor' ? '#10b981' : '#6b7280') : '#9ca3af' }} />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{typeInfo.icon} {org.name}</div>
                    <div className="text-sm text-muted">{org.short_name || ''} · {typeInfo.label}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); openEdit(org); }}>Edit</button>
                    <button className={`btn btn-sm ${org.is_active ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={e => { e.stopPropagation(); toggleActive(org.id, org.is_active); }}>
                      {org.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11 }}>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{orgP.length}</div>
                    <div className="text-muted">Projects</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{orgU.length}</div>
                    <div className="text-muted">Users</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: dg ? '#10b981' : '#ef4444' }}>{dg ? '✓' : '—'}</div>
                    <div className="text-muted">DG</div>
                  </div>
                </div>
                {dg && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>DG: <strong>{dg.full_name}</strong></div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Org Detail */}
      {selectedOrg && orgDetail && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          <h3 style={{ marginBottom: 14 }}>📋 {orgDetail.name} — Detail View</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Users in this org */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>Users ({orgUsers.length})</h4>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {orgUsers.map(u => {
                  const rc = ROLE_COLORS[u.role] || ROLE_COLORS.viewer;
                  return (
                    <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{u.full_name}</span>
                        <span className="text-muted" style={{ marginLeft: 6 }}>{u.email}</span>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 600, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </div>
                  );
                })}
                {orgUsers.length === 0 && <div className="text-sm text-muted">No users assigned</div>}
              </div>

              {/* Assign unassigned users */}
              {unassignedUsers.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>Assign User:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {unassignedUsers.map(u => (
                      <button key={u.id} className="btn btn-sm btn-secondary" onClick={() => assignUserToOrg(u.id, selectedOrg)}>
                        + {u.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Projects in this org */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>Projects ({orgProjects.length})</h4>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {orgProjects.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span className="badge badge-muted" style={{ fontSize: 9 }}>{p.category || 'Construction'}</span>
                  </div>
                ))}
                {orgProjects.length === 0 && <div className="text-sm text-muted">No projects assigned</div>}
              </div>

              {/* Assign unassigned projects */}
              {unassignedProjects.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--text-muted)' }}>Assign Project:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {unassignedProjects.map(p => (
                      <button key={p.id} className="btn btn-sm btn-secondary" onClick={() => assignProjectToOrg(p.id, selectedOrg)}>
                        + {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Org Info */}
          {(orgDetail.email || orgDetail.phone || orgDetail.address) && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 11, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {orgDetail.email && <span>📧 {orgDetail.email}</span>}
              {orgDetail.phone && <span>📞 {orgDetail.phone}</span>}
              {orgDetail.address && <span>📍 {orgDetail.address}</span>}
              {orgDetail.website && <span>🌐 {orgDetail.website}</span>}
              {orgDetail.registration_no && <span>📋 Reg: {orgDetail.registration_no}</span>}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>{editId ? 'Edit Organisation' : 'Add Organisation'}<button onClick={() => setShowModal(false)}>×</button></h3>
            <form onSubmit={handleSave}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Organisation Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Kenya National Highways Authority" required />
                </div>
                <div className="form-group mb-16">
                  <label>Short Name</label>
                  <input type="text" value={form.short_name} onChange={e => setForm({ ...form, short_name: e.target.value })}
                    placeholder="e.g. KeNHA" />
                </div>
              </div>
              <div className="form-group mb-16">
                <label>Organisation Type</label>
                <select value={form.org_type} onChange={e => setForm({ ...form, org_type: e.target.value })}>
                  {ORG_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="info@kenha.go.ke" />
                </div>
                <div className="form-group mb-16">
                  <label>Phone</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="+254 20 xxx xxxx" />
                </div>
              </div>
              <div className="form-group mb-16">
                <label>Address</label>
                <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="Blue Shield Towers, Upperhill, Nairobi" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Website</label>
                  <input type="url" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })}
                    placeholder="https://www.kenha.go.ke" />
                </div>
                <div className="form-group mb-16">
                  <label>Registration No.</label>
                  <input type="text" value={form.registration_no} onChange={e => setForm({ ...form, registration_no: e.target.value })}
                    placeholder="Company/Agency registration" />
                </div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Create Organisation'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
