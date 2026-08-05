import React, { useState, useEffect } from 'react';
import { supabase, ROLE_LABELS } from '../lib/supabase';

const ROLES = ['pending', 'inspector', 're', 'engineer', 'pm', 'admin'];

export default function AdminPanel({ profile, showToast }) {
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('pending');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers(data || []);
  }

  async function updateRole(userId, newRole) {
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

  const pending = users.filter(u => u.role === 'pending');
  const active = users.filter(u => u.role !== 'pending');

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Administration</h2>
          <div className="subtitle">Manage users, roles, and system settings</div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Pending Approval ({pending.length})
        </button>
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          Active Users ({active.length})
        </button>
      </div>

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
                        <button className="btn btn-sm btn-success" onClick={() => updateRole(u.id, 'inspector')}>
                          Approve as Inspector
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={() => updateRole(u.id, 're')}>
                          Approve as RE
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => updateRole(u.id, 'engineer')}>
                          As Engineer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'active' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Designation</th><th>Current Role</th><th>Change Role</th></tr>
            </thead>
            <tbody>
              {active.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                  <td className="text-sm">{u.email}</td>
                  <td className="text-sm">{u.designation || '—'}</td>
                  <td><span className="badge badge-accent">{ROLE_LABELS[u.role]}</span></td>
                  <td>
                    <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                      style={{ padding: '5px 10px', fontSize: 12 }}>
                      {ROLES.filter(r => r !== 'pending').map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* System Info */}
      <div className="card mt-24">
        <div className="card-header"><h3>System Information</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
          <div><span className="text-muted">App Version:</span> 2.0.0</div>
          <div><span className="text-muted">Total Users:</span> {users.length}</div>
          <div><span className="text-muted">Active Users:</span> {active.length}</div>
          <div><span className="text-muted">Pending Approvals:</span> {pending.length}</div>
          <div><span className="text-muted">Supabase Project:</span> <span className="text-mono">gyqmlynozcnzihbsfyfx</span></div>
          <div><span className="text-muted">Deployment:</span> Vercel</div>
        </div>
        <div style={{ marginTop: 16, padding: '12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 12 }}>
          <strong>Role Hierarchy:</strong> Admin → PM → Engineer → RE → Inspector → Pending
          <br /><span className="text-muted">Each role inherits all permissions of the roles below it.</span>
        </div>
      </div>
    </div>
  );
}
