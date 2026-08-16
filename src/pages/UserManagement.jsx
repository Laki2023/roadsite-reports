import React, { useState, useEffect, useCallback } from 'react';
import { supabase, ROLE_LABELS, ROLE_LEVELS, ROLE_COLORS, ALL_ROLES, assignableRoles, getModuleAccess } from '../lib/supabase';

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
        <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>
          Position Templates
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

      {/* ── POSITION TEMPLATES TAB ── */}
      {tab === 'templates' && <PositionTemplatesView profile={profile} roles={myRoles} showToast={showToast} />}

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

// ── Page Modules (same as AdminPanel) ──
const PAGE_MODULES = [
  { key: 'submit-report', label: 'Submit Report', icon: '📝' },
  { key: 'reports', label: 'Daily Reports', icon: '📄' },
  { key: 'works', label: 'Works Activities', icon: '⛏️' },
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

// ── Edit User Modal ──
function EditUserModal({ user, profile, roles, onClose, onSuccess, showToast }) {
  const [role, setRole] = useState(user.role || 'viewer');
  const [supervisorId, setSupervisorId] = useState(user.supervisor_id || '');
  const [designation, setDesignation] = useState(user.designation || '');
  const [organisation, setOrganisation] = useState(user.organisation || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [allowedPages, setAllowedPages] = useState(user.allowed_pages || []);
  const [supervisors, setSupervisors] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showModules, setShowModules] = useState(false);

  useEffect(() => {
    supabase.from('profiles').select('id, full_name, role')
      .in('role', ['super_admin', 'engineer', 'project_engineer', 'resident_engineer'])
      .eq('is_active', true).neq('id', user.id).order('full_name')
      .then(({ data }) => setSupervisors(data || []));
    // Load position templates
    supabase.from('position_templates').select('*')
      .eq('org_id', profile.organisation_id || profile.org_id || '')
      .order('display_name')
      .then(({ data }) => setTemplates(data || []))
      .catch(() => setTemplates([]));
  }, [user.id, profile.organisation_id, profile.org_id]);

  function applyTemplate(templateId) {
    const t = templates.find(tp => tp.id === templateId);
    if (!t) return;
    setRole(t.system_role);
    setDesignation(t.display_name);
    setAllowedPages(t.allowed_pages || []);
    showToast(`Template "${t.display_name}" applied`);
  }

  function cycleAccess(key) {
    setAllowedPages(prev => {
      const without = prev.filter(p => p !== key && p !== `${key}:view` && p !== `${key}:edit`);
      const current = getModuleAccess(prev, key);
      if (!current) return [...without, `${key}:view`];
      if (current === 'view') return [...without, `${key}:edit`];
      return without;
    });
  }

  function setAllAccess(mode) {
    if (mode === 'edit') setAllowedPages(PAGE_MODULES.map(m => `${m.key}:edit`));
    else if (mode === 'view') setAllowedPages(PAGE_MODULES.map(m => `${m.key}:view`));
    else setAllowedPages([]);
  }

  const viewCount = PAGE_MODULES.filter(m => getModuleAccess(allowedPages, m.key) === 'view').length;
  const editCount = PAGE_MODULES.filter(m => getModuleAccess(allowedPages, m.key) === 'edit').length;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const oldRole = user.role;
    const { error } = await supabase.from('profiles').update({
      role, supervisor_id: supervisorId || null,
      designation: designation.trim() || null,
      organisation: organisation.trim() || null,
      phone: phone.trim() || null,
      allowed_pages: allowedPages,
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
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>Edit User — {user.full_name}<button onClick={onClose}>×</button></h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-hover)', padding: 10, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13, flexWrap: 'wrap' }}>
          <span>Current role: <span className="badge badge-accent">{ROLE_LABELS[user.role]}</span></span>
          {user.designation && <span>· {user.designation}</span>}
          {user.party && <span>· {user.party}</span>}
        </div>

        {/* Position Template Selector */}
        {templates.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)', border: '1px solid #93c5fd', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 6 }}>QUICK ASSIGN — POSITION TEMPLATE</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {templates.map(t => (
                <button key={t.id} type="button" className="btn btn-sm btn-secondary"
                  onClick={() => applyTemplate(t.id)}
                  style={{ fontSize: 12 }}>
                  {t.display_name}
                  <span style={{ opacity: 0.5, marginLeft: 4 }}>({ROLE_LABELS[t.system_role]})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>System Role</label>
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
              <label>Designation / Title</label>
              <input type="text" value={designation} onChange={e => setDesignation(e.target.value)}
                placeholder="e.g. HQ Quantity Surveyor" />
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

          {/* Module Access — 3-state: Off / View Only / View & Edit */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
            <button type="button" onClick={() => setShowModules(!showModules)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <span>Module Access
                {(viewCount > 0 || editCount > 0) && (
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>
                    {editCount} edit · {viewCount} view only
                  </span>
                )}
              </span>
              <span style={{ fontSize: 16 }}>{showModules ? '▲' : '▼'}</span>
            </button>
            {showModules && (
              <div style={{ padding: '0 14px 14px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAllAccess('edit')} style={{ fontSize: 11 }}>All Edit</button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAllAccess('view')} style={{ fontSize: 11 }}>All View Only</button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAllAccess(null)} style={{ fontSize: 11 }}>Clear All</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                  {PAGE_MODULES.map(m => {
                    const access = getModuleAccess(allowedPages, m.key);
                    const bgMap = { edit: '#dcfce7', view: '#dbeafe', null: 'transparent' };
                    const borderMap = { edit: '#86efac', view: '#93c5fd', null: 'transparent' };
                    const labelMap = { edit: 'Edit', view: 'View', null: 'Off' };
                    const colorMap = { edit: '#166534', view: '#1e40af', null: 'var(--text-muted)' };
                    return (
                      <div key={m.key} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: 6,
                        background: bgMap[access] || 'transparent',
                        border: `1px solid ${borderMap[access] || 'transparent'}`,
                        transition: 'all 0.15s',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span>{m.icon}</span>
                          <span style={{ fontWeight: access ? 600 : 400 }}>{m.label}</span>
                        </span>
                        <button type="button" onClick={() => cycleAccess(m.key)}
                          style={{
                            padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
                            border: `1px solid ${borderMap[access] || 'var(--border)'}`,
                            background: access ? (bgMap[access]) : 'var(--surface-1)',
                            color: colorMap[access], cursor: 'pointer', minWidth: 52, textAlign: 'center',
                            transition: 'all 0.15s',
                          }}>
                          {labelMap[access]}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 8, fontSize: 11 }}>
                  Click the badge to cycle: Off → View Only → View &amp; Edit → Off
                </div>
              </div>
            )}
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

// ── Position Templates View ──
function PositionTemplatesView({ profile, roles, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('position_templates')
      .select('*').order('display_name');
    setTemplates(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete template "${name}"? Users already assigned won't be affected.`)) return;
    const { error } = await supabase.from('position_templates').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(`Template "${name}" deleted`);
    loadTemplates();
  }

  if (loading) return <div className="card" style={{ padding: 24, textAlign: 'center' }}>Loading templates...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div className="text-sm text-muted">
            Create reusable position presets. When assigning a user, pick a template to auto-fill role + module access.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingTemplate(null); setShowForm(true); }}>
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="card empty-state">
          <div className="icon">📋</div>
          <p>No position templates yet. Create templates like "HQ Quantity Surveyor", "Environmental Officer", or "Assistant RE" to speed up user assignments.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {templates.map(t => {
            const rc = ROLE_COLORS[t.system_role] || ROLE_COLORS.viewer;
            const pages = t.allowed_pages || [];
            return (
              <div key={t.id} className="card" style={{ padding: 16, borderLeft: `3px solid ${rc.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{t.display_name}</div>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
                      fontSize: 10, fontWeight: 600, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}`,
                      marginTop: 4
                    }}>{ROLE_LABELS[t.system_role]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => { setEditingTemplate(t); setShowForm(true); }}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t.id, t.display_name)}>×</button>
                  </div>
                </div>
                {t.description && <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{t.description}</div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {pages.map(p => {
                    const key = p.replace(/:view$|:edit$/, '');
                    const access = p.endsWith(':view') ? 'view' : 'edit';
                    const mod = PAGE_MODULES.find(m => m.key === key);
                    if (!mod) return null;
                    const isView = access === 'view';
                    return (
                      <span key={p} style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 500,
                        background: isView ? '#dbeafe' : '#dcfce7',
                        color: isView ? '#1e40af' : '#166534',
                      }}>{mod.icon} {mod.label} {isView ? '(view)' : ''}</span>
                    );
                  })}
                  {pages.length === 0 && <span className="text-sm text-muted">No modules assigned</span>}
                </div>
                <div className="text-sm text-muted" style={{ marginTop: 8, fontSize: 11 }}>
                  Created by {t.created_by_name || 'Admin'} · {t.created_at ? new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <TemplateFormModal
          template={editingTemplate} profile={profile} roles={roles}
          onClose={() => { setShowForm(false); setEditingTemplate(null); }}
          onSuccess={() => { setShowForm(false); setEditingTemplate(null); showToast(editingTemplate ? 'Template updated' : 'Template created'); loadTemplates(); }}
          showToast={showToast} />
      )}
    </div>
  );
}

// ── Template Form Modal (Create / Edit) ──
function TemplateFormModal({ template, profile, roles, onClose, onSuccess, showToast }) {
  const [displayName, setDisplayName] = useState(template?.display_name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [systemRole, setSystemRole] = useState(template?.system_role || 'project_officer');
  const [allowedPages, setAllowedPages] = useState(template?.allowed_pages || []);
  const [submitting, setSubmitting] = useState(false);

  function cycleAccess(key) {
    setAllowedPages(prev => {
      const without = prev.filter(p => p !== key && p !== `${key}:view` && p !== `${key}:edit`);
      const current = getModuleAccess(prev, key);
      if (!current) return [...without, `${key}:view`];
      if (current === 'view') return [...without, `${key}:edit`];
      return without;
    });
  }

  function setAllAccess(mode) {
    if (mode === 'edit') setAllowedPages(PAGE_MODULES.map(m => `${m.key}:edit`));
    else if (mode === 'view') setAllowedPages(PAGE_MODULES.map(m => `${m.key}:view`));
    else setAllowedPages([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!displayName.trim()) { showToast('Enter a position name', 'error'); return; }
    setSubmitting(true);

    const payload = {
      display_name: displayName.trim(),
      description: description.trim() || null,
      system_role: systemRole,
      allowed_pages: allowedPages,
      org_id: profile.organisation_id || profile.org_id || null,
      created_by: profile.id,
      created_by_name: profile.full_name,
    };

    let error;
    if (template) {
      ({ error } = await supabase.from('position_templates').update(payload).eq('id', template.id));
    } else {
      ({ error } = await supabase.from('position_templates').insert(payload));
    }
    if (error) { showToast(error.message, 'error'); setSubmitting(false); return; }
    onSuccess();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3>{template ? 'Edit' : 'New'} Position Template<button onClick={onClose}>×</button></h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group mb-16">
            <label>Position Name *</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. HQ Quantity Surveyor, Environmental Officer, Assistant RE" required />
          </div>
          <div className="form-group mb-16">
            <label>Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this position's responsibilities" />
          </div>
          <div className="form-group mb-16">
            <label>System Role (permission ceiling)</label>
            <select value={systemRole} onChange={e => setSystemRole(e.target.value)}>
              {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <span className="text-sm text-muted" style={{ marginTop: 4, display: 'block' }}>
              This sets the maximum permission level. Module checkboxes below control what they actually see.
            </span>
          </div>

          {/* Module Access — 3-state: Off / View Only / View & Edit */}
          <div className="form-group mb-16">
            <label>Module Access</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAllAccess('edit')} style={{ fontSize: 11 }}>All Edit</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAllAccess('view')} style={{ fontSize: 11 }}>All View Only</button>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => setAllAccess(null)} style={{ fontSize: 11 }}>Clear All</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10 }}>
              {PAGE_MODULES.map(m => {
                const access = getModuleAccess(allowedPages, m.key);
                const bgMap = { edit: '#dcfce7', view: '#dbeafe', null: 'transparent' };
                const borderMap = { edit: '#86efac', view: '#93c5fd', null: 'transparent' };
                const labelMap = { edit: 'Edit', view: 'View', null: 'Off' };
                const colorMap = { edit: '#166534', view: '#1e40af', null: 'var(--text-muted)' };
                return (
                  <div key={m.key} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: 6,
                    background: bgMap[access] || 'transparent',
                    border: `1px solid ${borderMap[access] || 'transparent'}`,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span>{m.icon}</span>
                      <span style={{ fontWeight: access ? 600 : 400 }}>{m.label}</span>
                    </span>
                    <button type="button" onClick={() => cycleAccess(m.key)}
                      style={{
                        padding: '2px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 700,
                        border: `1px solid ${borderMap[access] || 'var(--border)'}`,
                        background: access ? (bgMap[access]) : 'var(--surface-1)',
                        color: colorMap[access], cursor: 'pointer', minWidth: 52, textAlign: 'center',
                        transition: 'all 0.15s',
                      }}>
                      {labelMap[access]}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="text-sm text-muted" style={{ marginTop: 6, fontSize: 11 }}>
              Click the badge to cycle: Off → View Only → View &amp; Edit → Off
            </div>
          </div>

          <div className="btn-group">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
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
