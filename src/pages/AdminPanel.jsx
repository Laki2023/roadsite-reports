import React, { useState, useEffect } from 'react';
import { supabase, ROLE_LABELS } from '../lib/supabase';

const ROLES = ['pending', 'inspector', 're', 'engineer', 'pm', 'admin'];

export default function AdminPanel({ profile, showToast }) {
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('pending');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const isSuperAdmin = profile.is_super_admin === true;

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
  }

  async function updateRole(userId, newRole) {
    // Only super admin can promote to admin or demote from admin
    const targetUser = users.find(u => u.id === userId);
    if ((newRole === 'admin' || targetUser?.role === 'admin') && !isSuperAdmin) {
      showToast('Only the Super Admin can manage admin roles', 'error');
      return;
    }
    const updates = { role: newRole };
    if (newRole !== 'pending') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = profile.id;
    }
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(`Role updated to ${ROLE_LABELS[newRole]}`);
      loadUsers();
    }
  }

  async function toggleSuperAdmin(userId, currentValue) {
    if (!isSuperAdmin) return;
    const { error } = await supabase.from('profiles').update({ is_super_admin: !currentValue }).eq('id', userId);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast(!currentValue ? 'Super Admin access granted' : 'Super Admin access revoked');
      loadUsers();
    }
  }

  async function deleteUser(userId) {
    if (!isSuperAdmin) return;
    const targetUser = users.find(u => u.id === userId);
    if (targetUser?.is_super_admin) {
      showToast('Cannot delete a Super Admin', 'error');
      return;
    }
    // Soft delete: set role to pending and clear data
    const { error } = await supabase.from('profiles').update({
      role: 'pending',
      designation: null,
      reports_to: null,
      can_approve_reports: false,
      is_super_admin: false,
    }).eq('id', userId);
    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('User removed and reset to pending');
      setConfirmDelete(null);
      loadUsers();
    }
  }

  const pending = users.filter(u => u.role === 'pending');
  const active = users.filter(u => u.role !== 'pending');
  const admins = active.filter(u => u.role === 'admin');
  const nonAdmins = active.filter(u => u.role !== 'admin');

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Administration</h2>
          <div className="subtitle">
            {isSuperAdmin ? '🔑 Super Admin — Full system control' : 'Manage users and roles'}
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {pending.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                    <td className="text-sm">{u.email}</td>
                    <td className="text-sm">{u.phone || '—'}</td>
                    <td className="text-mono text-sm">{u.created_at?.split('T')[0]}</td>
                    <td>
                      <div className="btn-group">
                        <button className="btn btn-sm btn-success" onClick={() => updateRole(u.id, 'inspector')}>Inspector</button>
                        <button className="btn btn-sm btn-primary" onClick={() => updateRole(u.id, 're')}>RE</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => updateRole(u.id, 'engineer')}>Engineer</button>
                        {isSuperAdmin && (
                          <button className="btn btn-sm" style={{ background: '#b45309', color: '#fff' }}
                            onClick={() => updateRole(u.id, 'admin')}>Admin</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── ADMIN MANAGEMENT TAB (Super Admin only) ── */}
      {tab === 'admins' && isSuperAdmin && (
        <div>
          <div className="card" style={{ marginBottom: 16, padding: 16, background: 'var(--bg-hover)', borderLeft: '3px solid var(--accent)' }}>
            <strong>Admin Management</strong>
            <div className="text-sm text-muted" style={{ marginTop: 4 }}>
              As Super Admin, you control who has admin access. You can promote users to admin, revoke admin rights, grant Super Admin privileges, or remove users entirely.
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Super Admin</th><th>Actions</th></tr>
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
                      {u.is_super_admin ? (
                        <span className="badge" style={{ background: '#b45309', color: '#fff' }}>🔑 Super</span>
                      ) : (
                        <button className="btn btn-sm btn-secondary" onClick={() => toggleSuperAdmin(u.id, false)}
                          disabled={u.id === profile.id}>
                          Grant Super
                        </button>
                      )}
                    </td>
                    <td>
                      {u.id !== profile.id && (
                        <div className="btn-group">
                          {u.is_super_admin && (
                            <button className="btn btn-sm btn-secondary" onClick={() => toggleSuperAdmin(u.id, true)}>
                              Revoke Super
                            </button>
                          )}
                          <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff' }}
                            onClick={() => updateRole(u.id, 'pm')}>Demote to PM</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(u.id)}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header"><h3>Promote User to Admin</h3></div>
            <div className="text-sm text-muted" style={{ marginBottom: 12 }}>Select an active non-admin user to promote.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {nonAdmins.map(u => (
                <button key={u.id} className="btn btn-sm btn-secondary" onClick={() => updateRole(u.id, 'admin')}>
                  {u.full_name} ({ROLE_LABELS[u.role]})
                </button>
              ))}
              {nonAdmins.length === 0 && <span className="text-muted">No non-admin users to promote</span>}
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
                <th>Name</th><th>Email</th><th>Designation</th><th>Role</th>
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
                  <td className="text-sm">{u.designation || '—'}</td>
                  <td><span className="badge badge-accent">{ROLE_LABELS[u.role]}</span></td>
                  {isSuperAdmin && (
                    <td>{u.is_super_admin && <span className="badge" style={{ background: '#b45309', color: '#fff' }}>🔑</span>}</td>
                  )}
                  <td>
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                      disabled={u.role === 'admin' && !isSuperAdmin}
                      style={{ padding: '5px 10px', fontSize: 12 }}>
                      {ROLES.filter(r => r !== 'pending').map(r => (
                        <option key={r} value={r}
                          disabled={r === 'admin' && !isSuperAdmin}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                  {isSuperAdmin && (
                    <td>
                      {u.id !== profile.id && (
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(u.id)}>Remove</button>
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
          <div><span className="text-muted">Active Users:</span> {active.length}</div>
          <div><span className="text-muted">Admins:</span> {admins.length}</div>
          <div><span className="text-muted">Super Admins:</span> {users.filter(u => u.is_super_admin).length}</div>
          <div><span className="text-muted">Pending:</span> {pending.length}</div>
        </div>
        <div style={{ marginTop: 16, padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 12 }}>
          <strong>Role Hierarchy:</strong> Super Admin → Admin → PM → Engineer → RE → Inspector → Pending
          <br /><span className="text-muted">Super Admin can add/remove admins and has full system control. Project Leads manage their own project teams.</span>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Remove User<button onClick={() => setConfirmDelete(null)}>×</button></h3>
            <p>Are you sure you want to remove <strong>{users.find(u => u.id === confirmDelete)?.full_name}</strong>? This will reset their role to Pending and remove all permissions.</p>
            <div className="btn-group" style={{ marginTop: 16 }}>
              <button className="btn btn-danger" onClick={() => deleteUser(confirmDelete)}>Yes, Remove User</button>
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
