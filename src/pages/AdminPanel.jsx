import { useState, useEffect } from 'react';
import { getAllProfiles, approveUser, getProjects, createProject, updateProject } from '../lib/supabase';

const ROLES = ['pending', 're', 'engineer', 'admin'];

function Toast({ msg, type = 'success', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast ${type}`}>{msg}</div>;
}

export default function AdminPanel({ currentUser }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', contract_number: '', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: u }, { data: p }] = await Promise.all([getAllProfiles(), getProjects()]);
    if (u) setUsers(u);
    if (p) setProjects(p);
    setLoading(false);
  };

  const handleRoleChange = async (userId, newRole) => {
    const { error } = await approveUser(userId, newRole, currentUser.id);
    if (error) return showToast('Failed to update role.', 'error');
    setUsers(us => us.map(u => u.id === userId ? { ...u, role: newRole, approved_at: new Date().toISOString() } : u));
    showToast(`Role updated to "${newRole}" successfully.`);
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProject.name.trim()) return showToast('Project name is required.', 'error');
    setSaving(true);
    const { data, error } = await createProject({ ...newProject, created_by: currentUser.id });
    if (error) { showToast('Failed to create project.', 'error'); setSaving(false); return; }
    setProjects(p => [data, ...p]);
    setNewProject({ name: '', contract_number: '', start_date: '', end_date: '' });
    setShowNewProject(false);
    showToast('Project created successfully.');
    setSaving(false);
  };

  const handleProgressUpdate = async (projectId, pct) => {
    const { error } = await updateProject(projectId, { progress_pct: pct });
    if (!error) {
      setProjects(ps => ps.map(p => p.id === projectId ? { ...p, progress_pct: pct } : p));
    }
  };

  const pendingCount = users.filter(u => u.role === 'pending').length;

  const roleBadge = (role) => {
    const map = { admin: 'badge-admin', engineer: 'badge-engineer', re: 'badge-re', pending: 'badge-pending' };
    return <span className={`badge ${map[role] || 'badge-pending'}`}>{role}</span>;
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
      Loading admin panel…
    </div>
  );

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <div>
          <h1>Admin Panel</h1>
          <p>Manage users, roles, and projects</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['users', `Users ${pendingCount > 0 ? `(${pendingCount} pending)` : ''}`], ['projects', 'Projects']].map(([key, label]) => (
          <button
            key={key}
            className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-200)' }}>
            <strong style={{ fontSize: 14 }}>All registered users</strong>
            <span style={{ fontSize: 12, color: 'var(--gray-500)', marginLeft: 8 }}>
              {users.length} total · {pendingCount} awaiting approval
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Current role</th>
                  <th>Registered</th>
                  <th>Change role</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} style={user.role === 'pending' ? { background: '#FFFBEB' } : {}}>
                    <td style={{ fontWeight: 500 }}>
                      {user.full_name}
                      {user.id === currentUser.id && (
                        <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 6 }}>(you)</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{user.email}</td>
                    <td>{roleBadge(user.role)}</td>
                    <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>
                      {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      {user.id !== currentUser.id ? (
                        <select
                          value={user.role}
                          onChange={e => handleRoleChange(user.id, e.target.value)}
                          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--gray-200)', cursor: 'pointer' }}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingCount > 0 && (
            <div style={{ padding: '12px 18px', background: '#FFFBEB', borderTop: '1px solid var(--gray-200)', fontSize: 12, color: '#92400E' }}>
              ⚠ {pendingCount} user{pendingCount > 1 ? 's are' : ' is'} waiting for role assignment. Set their role to <strong>re</strong>, <strong>engineer</strong>, or <strong>admin</strong> above to grant access.
            </div>
          )}
        </div>
      )}

      {tab === 'projects' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn btn-yellow" onClick={() => setShowNewProject(!showNewProject)}>
              + Add project
            </button>
          </div>

          {showNewProject && (
            <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--yellow)' }}>
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 14 }}>New road project</strong>
              <form onSubmit={handleCreateProject}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Project / Road name *</label>
                    <input
                      type="text"
                      placeholder="e.g. A104 Thika – Kenol Road"
                      value={newProject.name}
                      onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Contract number</label>
                    <input
                      type="text"
                      placeholder="e.g. KRB/2024/041"
                      value={newProject.contract_number}
                      onChange={e => setNewProject(p => ({ ...p, contract_number: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start date</label>
                    <input type="date" value={newProject.start_date} onChange={e => setNewProject(p => ({ ...p, start_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>End date</label>
                    <input type="date" value={newProject.end_date} onChange={e => setNewProject(p => ({ ...p, end_date: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" type="submit" disabled={saving}>
                    {saving ? 'Creating…' : 'Create project'}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setShowNewProject(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project name</th>
                  <th>Contract no.</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Update %</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 30 }}>No projects yet. Add one above.</td></tr>
                ) : projects.map(proj => (
                  <tr key={proj.id}>
                    <td style={{ fontWeight: 500 }}>{proj.name}</td>
                    <td style={{ color: 'var(--gray-500)', fontSize: 12 }}>{proj.contract_number || '—'}</td>
                    <td style={{ width: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="prog-bar" style={{ flex: 1 }}>
                          <div
                            className={`prog-fill ${proj.progress_pct >= 70 ? 'prog-green' : proj.progress_pct >= 40 ? 'prog-orange' : 'prog-red'}`}
                            style={{ width: `${proj.progress_pct}%` }}
                          />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--gray-500)', minWidth: 30 }}>{proj.progress_pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${proj.status === 'active' ? 'badge-on-track' : proj.status === 'completed' ? 'badge-reviewed' : 'badge-attention'}`}>
                        {proj.status}
                      </span>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={proj.progress_pct}
                        style={{ width: 64, padding: '4px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--gray-200)' }}
                        onBlur={e => handleProgressUpdate(proj.id, parseInt(e.target.value) || 0)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
