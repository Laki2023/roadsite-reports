import React, { useState, useEffect } from 'react';
import { supabase, ROLE_LABELS, ROLE_LEVELS, hasRole, assignableRoles } from '../lib/supabase';
import { ConfirmDialog } from '../components/SharedUI';

const ROLES = ['pending', 'measurement_engineer', 'resident_engineer', 'deputy_project_engineer', 'project_engineer', 'engineer', 'client'];

const PAGE_MODULES = [
  { key: 'submit-report', label: 'Submit Report', icon: '📝' },
  { key: 'reports', label: 'Daily Reports', icon: '📄' },
  { key: 'works', label: 'Works Activities', icon: '⚒️' },
  { key: 'issues', label: 'Site Issues', icon: '⚠️' },
  { key: 'emergency', label: 'Emergency', icon: '🚨' },
  { key: 'pavement', label: 'Pavement Layers', icon: '🛣️' },
  { key: 'quality', label: 'Quality Tests', icon: '🧪' },
  { key: 'equipment', label: 'Equipment', icon: '🚜' },
  { key: 'structures', label: 'Structures', icon: '🌉' },
  { key: 'programme', label: 'Programme', icon: '📅' },
  { key: 'boq', label: 'Bill of Quantities', icon: '📋' },
  { key: 'taking-off', label: 'Taking Off Sheet', icon: '📐' },
  { key: 'ipc', label: 'Payment Certificates', icon: '💰' },
  { key: 'approvals', label: 'Approvals', icon: '✅' },
  { key: 'monthly-report', label: 'Monthly Report', icon: '📋' },
  { key: 'claims', label: 'Claims Management', icon: '⚖️' },
  { key: 'key-personnel', label: 'Key Personnel', icon: '👥' },
  { key: 'approvals-matrix', label: 'Approvals Matrix', icon: '🔐' },
  { key: 'staff', label: 'Staff & Teams', icon: '👥' },
  { key: 'user-mgmt', label: 'User Management', icon: '🛡️' },
];
const PROJECT_ROLES = [
  'Project Manager','Project Admin','Resident Engineer','Inspector','Surveyor',
  'Materials Technician','Environmental Officer','Accounts Officer'
];

export default function AdminPanel({ profile, showToast }) {
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('pending');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [approveForm, setApproveForm] = useState({ role: 'resident_engineer', designation: '', project_id: '', project_role: 'Resident Engineer' });

  const isSuperAdmin = profile.is_platform_admin === true || profile.role === 'client';
  const isRE = hasRole(profile.role, 'resident_engineer');
  const canApprove = isSuperAdmin || isRE; // RE can approve their team

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [usersRes, projRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name').order('name'),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (projRes.error) throw projRes.error;
      setUsers(usersRes.data || []);
      setProjects(projRes.data || []);
    } catch (err) {
      setError(err.message);
      showToast?.('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }

  function openApproveModal(user) {
    setApproveModal(user);
    // Auto-suggest role and pages based on user's party
    const autoRole = user.party === 'engineer_rep' ? 'resident_engineer' :
                     user.party === 'engineer' ? 'project_engineer' :
                     user.party === 'client' || user.party === 'project_manager' ? 'engineer' : 'measurement_engineer';

    // Default pages by role
    const measurementPages = ['reports', 'pavement', 'quality', 'taking-off', 'construction-guide'];
    const rePages = ['submit-report', 'reports', 'works', 'issues', 'emergency', 'pavement', 'quality', 'equipment', 'structures', 'programme',
                     'boq', 'taking-off', 'ipc', 'approvals', 'site-instructions', 'monthly-report', 'claims', 'key-personnel', 'approvals-matrix',
                     'guarantees', 'eot', 'mpr', 'doc-register', 'quality-matrix', 'milestones', 'financial-forecast', 'alert-centre', 'obligations', 'construction-guide'];
    const engineerPages = [...rePages, 'staff', 'user-mgmt'];

    const autoPages = user.party === 'engineer_rep' ? rePages :
                      (user.party === 'engineer' || user.party === 'project_manager') ? engineerPages : measurementPages;

    setApproveForm({
      role: autoRole,
      party: user.party || '',
      designation: user.designation || '',
      full_name: user.full_name || '',
      project_id: '',
      project_role: 'Inspector',
      allowed_pages: user.allowed_pages || autoPages,
    });
  }

  async function handleApprove(e) {
    e.preventDefault();
    const user = approveModal;
    if (!user) return;

    // Update role, party, designation, and name
    const updates = {
      role: approveForm.role,
      designation: approveForm.designation,
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
      allowed_pages: approveForm.allowed_pages || [],
    };
    if (approveForm.party) updates.party = approveForm.party;
    if (approveForm.full_name && approveForm.full_name !== user.full_name) updates.full_name = approveForm.full_name;

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) { showToast(error.message, 'error'); return; }

    // Optionally assign to project
    if (approveForm.project_id) {
      await supabase.from('staff_assignments').upsert({
        project_id: approveForm.project_id,
        staff_id: user.id,
        role_on_project: approveForm.project_role,
        is_active: true,
      }, { onConflict: 'project_id,staff_id' });
    }

    // Send approval notification via password reset email
    // (This triggers Supabase to send an email to the user, confirming their account is active)
    try {
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin,
      });
      showToast(`${user.full_name} approved as ${ROLE_LABELS[approveForm.role]} — notification email sent`);
    } catch (emailErr) {
      showToast(`${user.full_name} approved as ${ROLE_LABELS[approveForm.role]} (email notification failed)`);
    }

    setApproveModal(null);
    loadAll();
  }

  async function updateRole(userId, newRole) {
    const targetUser = users.find(u => u.id === userId);
    if ((newRole === 'client' || targetUser?.role === 'client') && !isSuperAdmin) {
      showToast('Only a Client or Platform Admin can manage Client roles', 'error');
      return;
    }
    const updates = { role: newRole };
    if (newRole !== 'pending') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = profile.id;
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) { showToast(error.message, 'error'); } 
    else { showToast(`Role updated to ${ROLE_LABELS[newRole]}`); loadAll(); }
  }

  async function toggleSuperAdmin(userId, currentValue) {
    if (!isSuperAdmin) return;
    const { error } = await supabase.from('profiles').update({ is_platform_admin: !currentValue }).eq('id', userId);
    if (error) { showToast(error.message, 'error'); }
    else { showToast(!currentValue ? 'Platform Admin access granted' : 'Platform Admin access revoked'); loadAll(); }
  }

  async function deleteUser(userId) {
    if (!isSuperAdmin) return;
    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.role === 'client') { showToast('Cannot delete a Client user', 'error'); return; }
    const { error } = await supabase.from('profiles').update({
      role: 'pending', designation: null, reports_to: null,
      can_approve_reports: false,
    }).eq('id', userId);
    if (error) { showToast(error.message, 'error'); }
    else { showToast('User removed'); setConfirmDelete(null); loadAll(); }
  }

  async function assignProjectAdmin(userId, projectId) {
    if (!projectId) return;
    const { error } = await supabase.from('staff_assignments').upsert({
      project_id: projectId, staff_id: userId,
      role_on_project: 'Project Admin', is_active: true,
    }, { onConflict: 'project_id,staff_id' });
    if (error) { showToast(error.message, 'error'); }
    else { showToast('User assigned as Project Admin'); }
  }

  const pending = users.filter(u => u.role === 'pending');
  const active = users.filter(u => u.role !== 'pending');
  const admins = active.filter(u => u.role === 'client' || u.role === 'engineer');
  const nonAdmins = active.filter(u => u.role !== 'client' && u.role !== 'engineer');

  if (loading) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',color:'var(--text-muted)'}}><div style={{fontSize:28,marginBottom:12}}>◈</div><div>Loading...</div></div>;

  return (
    <div>
      {error && <div style={{padding:'12px 16px',background:'#fef2f2',border:'1px solid #fca5a5',borderRadius:8,color:'#991b1b',marginBottom:16}}>Failed to load: {error}</div>}
      <div className="page-header">
        <div>
          <h2>Administration</h2>
          <div className="subtitle">
            {profile.is_platform_admin ? '🔑 Platform Admin — Full system control' : profile.role === 'client' ? '🔑 Client — Organisation oversight' : 'Manage users and roles'}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Pending Approval ({pending.length})
        </button>
        {isSuperAdmin && (
          <button className={tab === 'admins' ? 'active' : ''} onClick={() => setTab('admins')}>
            Admin Management ({admins.length})
          </button>
        )}
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          All Users ({active.length})
        </button>
      </div>

      {/* ── PENDING TAB ── */}
      {tab === 'pending' && (
        pending.length === 0 ? (
          <div className="card empty-state">
            <div className="icon">✓</div>
            <p>No pending approvals</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pending.map(u => (
              <div key={u.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{u.full_name}</h3>
                    <div className="text-sm text-muted">{u.email}</div>
                  </div>
                  <span className="badge badge-warning">Pending</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 20px', fontSize: 13, marginBottom: 16 }}>
                  <div><span className="text-muted">Phone:</span> {u.phone || '—'}</div>
                  <div><span className="text-muted">Designation:</span> {u.designation || '—'}</div>
                  <div><span className="text-muted">Region:</span> {u.region || '—'}</div>
                  <div><span className="text-muted">County:</span> {u.county || '—'}</div>
                  <div><span className="text-muted">Registered:</span> <span className="text-mono">{u.created_at?.split('T')[0]}</span></div>
                </div>

                {u.bio && (
                  <div style={{ background: 'var(--bg-hover)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 16, fontStyle: 'italic' }}>
                    "{u.bio}"
                  </div>
                )}

                <div className="btn-group">
                  <button className="btn btn-success" onClick={() => openApproveModal(u)}>
                    Review & Approve
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => updateRole(u.id, 'measurement_engineer')}>
                    Quick Approve (Measurement Eng.)
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── ADMIN MANAGEMENT TAB ── */}
      {tab === 'admins' && isSuperAdmin && (
        <div>
          <div className="card" style={{ marginBottom: 16, padding: 16, background: 'var(--bg-hover)', borderLeft: '3px solid var(--accent)' }}>
            <strong>Admin Management</strong>
            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
              Promote users to admin, revoke access, or assign them as Project Admins on specific projects.
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Admin</th><th>Make Project Admin</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {admins.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>
                      {u.full_name}
                      {u.id === profile.id && <span className="badge badge-accent" style={{ marginLeft: 8 }}>You</span>}
                    </td>
                    <td className="text-sm">{u.email}</td>
                    <td><span className="badge badge-accent">{ROLE_LABELS[u.role]}</span></td>
                    <td>
                      {u.is_platform_admin ? (
                        <span className="badge" style={{ background: '#b45309', color: '#fff' }}>🔑 Platform</span>
                      ) : (
                        <span className="badge badge-accent">{ROLE_LABELS[u.role]}</span>
                      )}
                    </td>
                    <td>
                      <select onChange={e => assignProjectAdmin(u.id, e.target.value)} defaultValue=""
                        style={{ padding: '4px 8px', fontSize: 12 }}>
                        <option value="">Assign to project...</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                    <td>
                      {u.id !== profile.id && (
                        <div className="btn-group">
                          <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff' }}
                            onClick={() => setConfirmAction({
                              title: 'Demote User?',
                              message: `Are you sure you want to demote ${u.full_name} to Measurement Engineer? They will lose current privileges.`,
                              confirmLabel: 'Demote',
                              variant: 'danger',
                              action: () => updateRole(u.id, 'measurement_engineer'),
                            })}>Demote</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setConfirmAction({
                              title: 'Remove User?',
                              message: `Are you sure you want to remove ${u.full_name}? Their role will be reset to Pending.`,
                              confirmLabel: 'Remove',
                              variant: 'danger',
                              action: () => deleteUser(u.id),
                            })}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header"><h3>Promote User to Engineer</h3></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {nonAdmins.map(u => (
                <button key={u.id} className="btn btn-sm btn-secondary" onClick={() => updateRole(u.id, 'engineer')}>
                  {u.full_name} ({ROLE_LABELS[u.role]})
                </button>
              ))}
              {nonAdmins.length === 0 && <span className="text-muted text-sm">No users to promote</span>}
            </div>
          </div>
        </div>
      )}

      {/* ── ALL USERS TAB ── */}
      {tab === 'active' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Party</th><th>Designation</th><th>Role</th>
                {isSuperAdmin && <th>Super</th>}
                <th>Change Role</th>
                {isSuperAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {active.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>
                    {u.full_name}
                    {u.id === profile.id && <span className="badge badge-muted" style={{ marginLeft: 6 }}>You</span>}
                  </td>
                  <td className="text-sm">{u.email}</td>
                  <td>{u.party ? (
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                      background: u.party === 'contractor' || u.party === 'subcontractor' ? '#e87b3520' : u.party === 'engineer' || u.party === 'engineer_rep' ? '#05966920' : '#3b82f620',
                      color: u.party === 'contractor' || u.party === 'subcontractor' ? '#e87b35' : u.party === 'engineer' || u.party === 'engineer_rep' ? '#059669' : '#3b82f6' }}>
                      {u.party === 'contractor' ? '🔨' : u.party === 'engineer' ? '📐' : u.party === 'engineer_rep' ? '👷' : u.party === 'client' ? '🏛️' : '🔧'} {u.party}
                    </span>
                  ) : <span className="text-muted">—</span>}</td>
                  <td className="text-sm">{u.designation || '—'}</td>
                  <td><span className="badge badge-accent">{ROLE_LABELS[u.role]}</span></td>
                  {isSuperAdmin && (
                    <td>{u.is_platform_admin && <span className="badge" style={{ background: '#b45309', color: '#fff' }}>🔑</span>}</td>
                  )}
                  <td>
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                      disabled={!isSuperAdmin && ROLE_LEVELS[u.role] >= ROLE_LEVELS[profile.role]}
                      style={{ padding: '5px 10px', fontSize: 12 }}>
                      {(isSuperAdmin ? ROLES.filter(r => r !== 'pending') : [u.role, ...assignableRoles(profile.role)].filter((v, i, a) => a.indexOf(v) === i)).map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                      ))}
                    </select>
                  </td>
                  {isSuperAdmin && (
                    <td>
                      {u.id !== profile.id && (
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmAction({
                          title: 'Remove User?',
                          message: `Are you sure you want to remove ${u.full_name}? Their role will be reset to Pending.`,
                          confirmLabel: 'Remove',
                          variant: 'danger',
                          action: () => deleteUser(u.id),
                        })}>Remove</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* System Info */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header"><h3>System Information</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
          <div><span className="text-muted">App Version:</span> 3.0.0</div>
          <div><span className="text-muted">Total Users:</span> {users.length}</div>
          <div><span className="text-muted">Active:</span> {active.length}</div>
          <div><span className="text-muted">Admins:</span> {admins.length}</div>
          <div><span className="text-muted">Platform Admins:</span> {users.filter(u => u.is_platform_admin).length}</div>
          <div><span className="text-muted">Pending:</span> {pending.length}</div>
        </div>
        <div style={{ marginTop: 16, padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 12 }}>
          <strong>Role Hierarchy:</strong> Client → Engineer → Project Engineer → Deputy PE / RE → Measurement Engineer → Pending
          <br /><strong>FIDIC Chain:</strong> Employer (Client) → The Engineer → Engineer's Rep (PE) → RE → Measurement Team
          <br /><strong>IPC Flow:</strong> Measurement Eng. measures → RE prepares → PE reviews → Engineer certifies → Client pays
          <br /><span className="text-muted">Client has organisation-wide oversight. Engineer certifies payments. PE manages contract admin. RE runs the site.</span>
        </div>
      </div>

      {/* ── APPROVE MODAL ── */}
      {approveModal && (
        <div className="modal-overlay" onClick={() => setApproveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Approve {approveModal.full_name}<button onClick={() => setApproveModal(null)}>×</button></h3>

            <div style={{ background: 'var(--bg-hover)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                <div><span className="text-muted">Email:</span> {approveModal.email}</div>
                <div><span className="text-muted">Phone:</span> {approveModal.phone || '—'}</div>
                <div><span className="text-muted">Designation:</span> {approveModal.designation || '—'}</div>
                <div><span className="text-muted">Party:</span> {approveModal.party ? (
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                    background: approveModal.party === 'contractor' ? '#e87b3520' : approveModal.party === 'engineer' || approveModal.party === 'engineer_rep' ? '#05966920' : '#3b82f620',
                    color: approveModal.party === 'contractor' ? '#e87b35' : approveModal.party === 'engineer' || approveModal.party === 'engineer_rep' ? '#059669' : '#3b82f6' }}>
                    {approveModal.party}
                  </span>
                ) : '—'}</div>
                <div><span className="text-muted">Qualification:</span> {approveModal.profession || '—'}</div>
                <div><span className="text-muted">Registration:</span> {approveModal.region || '—'}</div>
                <div><span className="text-muted">Experience:</span> {approveModal.county || '—'}</div>
                <div><span className="text-muted">Registered:</span> {approveModal.created_at?.split('T')[0]}</div>
              </div>
              {approveModal.bio && (
                <div style={{ marginTop: 8, fontStyle: 'italic', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  "{approveModal.bio}"
                </div>
              )}
            </div>

            <form onSubmit={handleApprove}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Party (organisation side) *</label>
                  <select value={approveForm.party || approveModal.party || ''} onChange={e => {
                    const p = e.target.value;
                    setApproveForm({ ...approveForm, party: p,
                      role: p === 'engineer_rep' ? 'resident_engineer' :
                            p === 'engineer' ? 'project_engineer' :
                            p === 'client' || p === 'project_manager' ? 'engineer' : 'measurement_engineer'
                    });
                  }}>
                    <option value="">— Select party —</option>
                    <option value="client">🏛️ Client / Employer</option>
                    <option value="engineer">📐 Engineer (Consulting Firm)</option>
                    <option value="project_manager">👔 Project Manager</option>
                    <option value="engineer_rep">👷 Engineer's Representative</option>
                    <option value="contractor">🔨 Contractor (external)</option>
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>System Role *</label>
                  <select value={approveForm.role} onChange={e => setApproveForm({ ...approveForm, role: e.target.value })} required>
                    {(isSuperAdmin ? ROLES.filter(r => r !== 'pending') : assignableRoles(profile.role)).map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Position / Designation</label>
                  <input value={approveForm.designation} onChange={e => setApproveForm({ ...approveForm, designation: e.target.value })}
                    placeholder="e.g. Quantity Surveyor" />
                </div>
                <div className="form-group mb-16">
                  <label>Full Name (editable)</label>
                  <input value={approveForm.full_name || approveModal.full_name || ''} onChange={e => setApproveForm({ ...approveForm, full_name: e.target.value })}
                    placeholder="Correct name if needed" />
                </div>
              </div>

              <div style={{ background: 'var(--bg-hover)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>Assign to Project (optional)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="text-sm">Project</label>
                    <select value={approveForm.project_id} onChange={e => setApproveForm({ ...approveForm, project_id: e.target.value })}>
                      <option value="">No project assignment</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="text-sm">Role on Project</label>
                    <select value={approveForm.project_role} onChange={e => setApproveForm({ ...approveForm, project_role: e.target.value })}
                      disabled={!approveForm.project_id}>
                      {PROJECT_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Module Access Control */}
              <div style={{ background: 'var(--bg-hover)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>🔐 Module access</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => setApproveForm({ ...approveForm, allowed_pages: PAGE_MODULES.map(m => m.key) })}
                      style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)' }}>Select all</button>
                    <button type="button" onClick={() => setApproveForm({ ...approveForm, allowed_pages: [] })}
                      style={{ fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)' }}>Clear all</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {PAGE_MODULES.map(m => {
                    const checked = (approveForm.allowed_pages || []).includes(m.key);
                    return (
                      <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                        background: checked ? '#05966910' : 'transparent', transition: 'all 0.15s' }}>
                        <input type="checkbox" checked={checked} onChange={() => {
                          const pages = [...(approveForm.allowed_pages || [])];
                          if (checked) { pages.splice(pages.indexOf(m.key), 1); }
                          else { pages.push(m.key); }
                          setApproveForm({ ...approveForm, allowed_pages: pages });
                        }} style={{ accentColor: '#059669' }} />
                        <span>{m.icon} {m.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
                  Only ticked modules will appear in the user's sidebar. Dashboard and Projects are always visible.
                </div>
              </div>

              <div className="btn-group">
                <button className="btn btn-success" type="submit">Approve User</button>
                <button className="btn btn-secondary" type="button" onClick={() => setApproveModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={confirmAction?.confirmLabel || 'Confirm'}
        variant={confirmAction?.variant || 'danger'}
        onConfirm={() => { confirmAction?.action(); setConfirmAction(null); }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
