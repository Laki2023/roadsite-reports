import React, { useState, useEffect, useCallback } from 'react';
import { supabase, ROLE_LABELS, ROLE_LEVELS, ROLE_COLORS, ALL_ROLES, assignableRoles } from '../lib/supabase';

export default function UserManagement({ profile, showToast, navigateTo }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals
  const [inviteModal, setInviteModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null);

  const isPlatformAdmin = profile.is_platform_admin === true;
  const isSuperAdmin = isPlatformAdmin || profile.is_super_admin === true || profile.role === 'super_admin';
  const myRoles = isPlatformAdmin
    ? ALL_ROLES.filter(r => r !== 'pending')
    : assignableRoles(profile.role);

  // ── Data Loading ──
  const loadAll = useCallback(async () => {
    const [usersRes, projRes, invRes] = await Promise.all([
      supabase.from('profiles').select('*').order('role').order('full_name'),
      supabase.from('projects').select('id, name, contract_no').order('name'),
      supabase.from('user_invitations').select('*').order('created_at', { ascending: false }),
    ]);
    setUsers(usersRes.data || []);
    setProjects(projRes.data || []);
    setInvitations(invRes.data || []);
    setLoading(false);
  }, []);

  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from('role_audit_log')
      .select('*, target:profiles!role_audit_log_target_user_id_fkey(full_name), changer:profiles!role_audit_log_changed_by_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(50);
    setAuditLogs(data || []);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === 'audit') loadAudit(); }, [tab, loadAudit]);

  // ── Actions ──
  async function handleDeactivate(userId, currentlyActive) {
    const action = currentlyActive ? 'deactivate' : 'reactivate';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this user?`)) return;
    const { error } = await supabase.from('profiles')
      .update({ is_active: !currentlyActive }).eq('id', userId);
    if (error) { showToast(error.message, 'error'); return; }
    await supabase.from('role_audit_log').insert({
      target_user_id: userId, changed_by: profile.id, action,
    });
    showToast(`User ${action}d`);
    loadAll();
  }

  async function handleRevokeInvite(invId) {
    if (!window.confirm('Revoke this invitation?')) return;
    await supabase.from('user_invitations').update({ status: 'revoked' }).eq('id', invId);
    showToast('Invitation revoked');
    loadAll();
  }

  // ── Filters ──
  const filtered = users.filter(u => {
    if (u.role === 'pending') return false; // pending users go through AdminPanel
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // ── Stats ──
  const activeUsers = users.filter(u => u.role !== 'pending');
  const roleCounts = {};
  ALL_ROLES.forEach(r => { roleCounts[r] = users.filter(u => u.role === r).length; });

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  if (loading) return <div className="page-header"><h2>Loading...</h2></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>User Management</h2>
          <div className="subtitle">{activeUsers.length} active users · Manage roles, invitations & project access</div>
        </div>
        <button className="btn btn-primary" onClick={() => setInviteModal(true)}>+ Invite User</button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
        {ALL_ROLES.filter(r => r !== 'pending' && roleCounts[r] > 0).map(r => (
          <div key={r} className="card" style={{ padding: '16px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{roleCounts[r]}</div>
            <div className="text-sm text-muted">{ROLE_LABELS[r]}s</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          All Users ({activeUsers.length})
        </button>
        <button className={tab === 'invitations' ? 'active' : ''} onClick={() => setTab('invitations')}>
          Invitations ({invitations.length})
        </button>
        <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>
          Project Assignments
        </button>
        <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}>
          Audit Log
        </button>
      </div>

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <input type="text" placeholder="Search by name or email..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, width: 240 }} />
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
              <option value="all">All Roles</option>
              {ALL_ROLES.filter(r => r !== 'pending').map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="card empty-state"><p>No users match the current filters.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User</th><th>Role</th><th>Organisation</th><th>Status</th><th>Last Login</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const isSelf = u.id === profile.id;
                    const canEdit = !isSelf && (isPlatformAdmin || ROLE_LEVELS[profile.role] > ROLE_LEVELS[u.role]);
                    const rc = ROLE_COLORS[u.role] || ROLE_COLORS.viewer;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 34, height: 34, borderRadius: '50%', background: '#dbeafe', color: '#2563eb',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0
                            }}>{getInitials(u.full_name)}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>
                                {u.full_name || 'Unnamed'}
                                {isSelf && <span className="badge badge-muted" style={{ marginLeft: 6 }}>You</span>}
                              </div>
                              <div className="text-sm text-muted">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
                            fontSize: 11, fontWeight: 600, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`
                          }}>{ROLE_LABELS[u.role] || u.role}</span>
                        </td>
                        <td className="text-sm">{u.organisation || '—'}</td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12
                          }}>
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: u.is_active !== false ? '#10b981' : '#ef4444'
                            }} />
                            {u.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="text-sm">{fmtDate(u.last_login)}</td>
                        <td>
                          {canEdit && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => setEditModal(u)}>Edit</button>
                              <button className="btn btn-sm btn-secondary" onClick={() => setAssignModal(u)}>Projects</button>
                              <button className={`btn btn-sm ${u.is_active !== false ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => handleDeactivate(u.id, u.is_active !== false)}>
                                {u.is_active !== false ? 'Deactivate' : 'Reactivate'}
                              </button>
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
        </>
      )}

      {/* ── INVITATIONS TAB ── */}
      {tab === 'invitations' && (
        invitations.length === 0 ? (
          <div className="card empty-state">
            <div className="icon">📨</div>
            <p>No invitations sent yet. Click "Invite User" to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Sent</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody>
                {invitations.map(inv => {
                  const expired = new Date(inv.expires_at) < new Date();
                  const status = expired && inv.status === 'pending' ? 'expired' : inv.status;
                  const statusColor = { pending: '#f59e0b', accepted: '#10b981', expired: '#9ca3af', revoked: '#ef4444' }[status] || '#6b7280';
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 500 }}>{inv.email}</td>
                      <td><span className="badge badge-accent">{ROLE_LABELS[inv.role]}</span></td>
                      <td><span style={{ color: statusColor, fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>{status}</span></td>
                      <td className="text-sm">{fmtDate(inv.created_at)}</td>
                      <td className="text-sm">{fmtDate(inv.expires_at)}</td>
                      <td>
                        {inv.status === 'pending' && !expired && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleRevokeInvite(inv.id)}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── PROJECT ASSIGNMENTS TAB ── */}
      {tab === 'assignments' && <ProjectAssignmentsView users={activeUsers} projects={projects} profile={profile} showToast={showToast} onRefresh={loadAll} />}

      {/* ── AUDIT LOG TAB ── */}
      {tab === 'audit' && (
        auditLogs.length === 0 ? (
          <div className="card empty-state"><p>No audit log entries yet.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {auditLogs.map(log => {
              const actionLabels = {
                role_change: 'Role Changed', deactivate: 'Deactivated', reactivate: 'Reactivated',
                project_assign: 'Project Assignment',
              };
              const actionColors = {
                role_change: '#3b82f6', deactivate: '#ef4444', reactivate: '#10b981', project_assign: '#8b5cf6',
              };
              return (
                <div key={log.id} className="card" style={{ padding: '12px 16px', borderLeft: `3px solid ${actionColors[log.action] || '#9ca3af'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: actionColors[log.action] || '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {actionLabels[log.action] || log.action}
                      </span>
                      <div style={{ fontSize: 13, marginTop: 2 }}>
                        <strong>{log.target?.full_name || 'Unknown'}</strong>
                        {log.action === 'role_change' && log.old_role && log.new_role && (
                          <span> — {ROLE_LABELS[log.old_role]} → {ROLE_LABELS[log.new_role]}</span>
                        )}
                        {log.action === 'project_assign' && ` — ${log.details?.projects?.length || 0} project(s)`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
                      <div>{fmtDate(log.created_at)}</div>
                      <div>by {log.changer?.full_name || 'System'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── INVITE MODAL ── */}
      {inviteModal && <InviteModal projects={projects} profile={profile} roles={myRoles}
        onClose={() => setInviteModal(false)} onSuccess={() => { setInviteModal(false); showToast('Invitation sent'); loadAll(); }} showToast={showToast} />}

      {/* ── EDIT USER MODAL ── */}
      {editModal && <EditUserModal user={editModal} profile={profile} roles={myRoles}
        onClose={() => setEditModal(null)} onSuccess={() => { setEditModal(null); showToast('User updated'); loadAll(); }} showToast={showToast} />}

      {/* ── PROJECT ASSIGN MODAL ── */}
      {assignModal && <AssignProjectsModal user={assignModal} projects={projects} profile={profile} roles={myRoles}
        onClose={() => setAssignModal(null)} onSuccess={() => { setAssignModal(null); showToast('Assignments saved'); loadAll(); }} showToast={showToast} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS (inline to avoid extra files)
   ═══════════════════════════════════════════════ */

// ── Invite Modal ──
function InviteModal({ projects, profile, roles, onClose, onSuccess, showToast }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('inspector');
  const [selProjects, setSelProjects] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Enter a valid email', 'error'); return;
    }
    setSubmitting(true);
    const { data: existing } = await supabase.from('user_invitations')
      .select('id').eq('email', email.trim().toLowerCase()).eq('status', 'pending').maybeSingle();
    if (existing) { showToast('Pending invitation already exists for this email', 'error'); setSubmitting(false); return; }

    const { error } = await supabase.from('user_invitations').insert({
      email: email.trim().toLowerCase(), role,
      project_ids: selProjects, invited_by: profile.id,
    });
    if (error) { showToast(error.message, 'error'); setSubmitting(false); return; }
    onSuccess();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3>Invite User <button onClick={onClose}>×</button></h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group mb-16">
            <label>Email Address *</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="inspector@example.com" required />
          </div>
          <div className="form-group mb-16">
            <label>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <span className="text-sm text-muted">You can assign roles below your own level.</span>
          </div>
          <div className="form-group mb-16">
            <label>Assign to Projects (optional)</label>
            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8 }}>
              {projects.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selProjects.includes(p.id)}
                    onChange={() => setSelProjects(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} />
                  {p.name} {p.contract_no && <span className="text-muted">({p.contract_no})</span>}
                </label>
              ))}
              {projects.length === 0 && <span className="text-muted text-sm">No projects yet.</span>}
            </div>
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send Invitation'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ──
function EditUserModal({ user, profile, roles, onClose, onSuccess, showToast }) {
  const [role, setRole] = useState(user.role || 'viewer');
  const [supervisorId, setSupervisorId] = useState(user.supervisor_id || '');
  const [designation, setDesignation] = useState(user.designation || '');
  const [organisation, setOrganisation] = useState(user.organisation || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [supervisors, setSupervisors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, role')
      .in('role', ['super_admin', 'engineer', 'resident_engineer'])
      .eq('is_active', true).neq('id', user.id).order('full_name')
      .then(({ data }) => setSupervisors(data || []));
  }, [user.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const oldRole = user.role;
    const { error } = await supabase.from('profiles').update({
      role, supervisor_id: supervisorId || null,
      designation: designation.trim() || null,
      organisation: organisation.trim() || null,
      phone: phone.trim() || null,
    }).eq('id', user.id);
    if (error) { showToast(error.message, 'error'); setSubmitting(false); return; }
    if (oldRole !== role) {
      await supabase.from('role_audit_log').insert({
        target_user_id: user.id, changed_by: profile.id,
        old_role: oldRole, new_role: role, action: 'role_change',
      });
    }
    onSuccess();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h3>Edit User — {user.full_name}<button onClick={onClose}>×</button></h3>
        <div style={{ background: 'var(--bg-hover)', padding: 10, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
          Current role: <span className="badge badge-accent">{ROLE_LABELS[user.role]}</span>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>New Role</label>
              <select value={role} onChange={e => setRole(e.target.value)}>
                {(roles.includes(user.role) ? roles : [user.role, ...roles]).map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div className="form-group mb-16">
              <label>Reports To</label>
              <select value={supervisorId} onChange={e => setSupervisorId(e.target.value)}>
                <option value="">— None —</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} ({ROLE_LABELS[s.role]})</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>Designation</label>
              <input type="text" value={designation} onChange={e => setDesignation(e.target.value)}
                placeholder="e.g. Site Inspector" />
            </div>
            <div className="form-group mb-16">
              <label>Organisation</label>
              <input type="text" value={organisation} onChange={e => setOrganisation(e.target.value)}
                placeholder="e.g. KeNHA" />
            </div>
          </div>
          <div className="form-group mb-16">
            <label>Phone</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+254 7XX XXX XXX" />
          </div>
          <div className="btn-group">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Assign Projects Modal ──
function AssignProjectsModal({ user, projects, profile, roles, onClose, onSuccess, showToast }) {
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('project_role_assignments').select('*').eq('user_id', user.id)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(a => { map[a.project_id] = { id: a.id, role: a.role, isActive: a.is_active }; });
        setAssignments(map);
        setLoading(false);
      });
  }, [user.id]);

  function toggle(pid) {
    setAssignments(prev => {
      const copy = { ...prev };
      if (copy[pid]) copy[pid] = { ...copy[pid], isActive: !copy[pid].isActive };
      else copy[pid] = { role: user.role || 'inspector', isActive: true, id: null };
      return copy;
    });
  }

  async function handleSave() {
    setSubmitting(true);
    for (const [pid, info] of Object.entries(assignments)) {
      if (info.id) {
        await supabase.from('project_role_assignments')
          .update({ role: info.role, is_active: info.isActive }).eq('id', info.id);
      } else if (info.isActive) {
        await supabase.from('project_role_assignments').insert({
          project_id: pid, user_id: user.id, role: info.role, assigned_by: profile.id, is_active: true,
        });
      }
    }
    await supabase.from('role_audit_log').insert({
      target_user_id: user.id, changed_by: profile.id, action: 'project_assign',
      details: { projects: Object.entries(assignments).filter(([, v]) => v.isActive).map(([pid, v]) => ({ project_id: pid, role: v.role })) },
    });
    onSuccess();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h3>Project Assignments — {user.full_name}<button onClick={onClose}>×</button></h3>
        <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
          Engineers and Super Admins access all projects. Toggle projects and set project-specific roles for other users.
        </p>
        {loading ? <p className="text-muted">Loading...</p> : (
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {projects.map(p => {
              const a = assignments[p.id];
              const isOn = a?.isActive;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, fontSize: 13 }}>
                    <input type="checkbox" checked={!!isOn} onChange={() => toggle(p.id)} />
                    <span style={{ fontWeight: isOn ? 600 : 400 }}>{p.name}</span>
                  </label>
                  {isOn && (
                    <select value={a.role} onChange={e => setAssignments(prev => ({
                      ...prev, [p.id]: { ...prev[p.id], role: e.target.value }
                    }))} style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
                      {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="btn-group" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Assignments'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Project Assignments Overview ──
function ProjectAssignmentsView({ users, projects, profile, showToast, onRefresh }) {
  const [assignments, setAssignments] = useState([]);
  const [selectedProject, setSelectedProject] = useState('all');

  useEffect(() => {
    supabase.from('project_role_assignments').select('*, user:profiles!project_role_assignments_user_id_fkey(full_name, email, role), project:projects!project_role_assignments_project_id_fkey(name)')
      .eq('is_active', true).order('assigned_at', { ascending: false })
      .then(({ data }) => setAssignments(data || []));
  }, []);

  const filtered = selectedProject === 'all' ? assignments : assignments.filter(a => a.project_id === selectedProject);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
          <option value="all">All Projects ({assignments.length} assignments)</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name} ({assignments.filter(a => a.project_id === p.id).length})</option>
          ))}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="card empty-state"><p>No project assignments found. Use the Users tab to assign users to projects.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Global Role</th><th>Project</th><th>Project Role</th><th>Assigned</th></tr></thead>
            <tbody>
              {filtered.map(a => {
                const rc = ROLE_COLORS[a.role] || ROLE_COLORS.viewer;
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.user?.full_name || '—'}</td>
                    <td className="text-sm">{ROLE_LABELS[a.user?.role] || '—'}</td>
                    <td className="text-sm">{a.project?.name || '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
                        fontSize: 11, fontWeight: 600, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`
                      }}>{ROLE_LABELS[a.role]}</span>
                    </td>
                    <td className="text-sm">{a.assigned_at ? new Date(a.assigned_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
