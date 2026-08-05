import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ROLE_LABELS } from '../lib/supabase';

const DESIGNATIONS = [
  'Project Manager', 'Engineer', 'Resident Engineer', 'Inspector',
  'Surveyor', 'Materials Technician', 'Environmental Officer', 'Accounts Officer'
];
const PROJECT_ROLES = [
  'Project Manager', 'Resident Engineer', 'Inspector', 'Surveyor',
  'Materials Technician', 'Environmental Officer', 'Accounts Officer'
];

export default function StaffPage({ profile, showToast }) {
  const [staff, setStaff] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState('staff');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ project_id: '', staff_id: '', role_on_project: 'Inspector' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    const [staffRes, projRes, assignRes] = await Promise.all([
      supabase.from('profiles').select('*').neq('role', 'pending').order('full_name'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('staff_assignments')
        .select('*, profiles(full_name, designation, role), projects(name)')
        .eq('is_active', true)
        .order('assigned_at', { ascending: false }),
    ]);
    setStaff(staffRes.data || []);
    setProjects(projRes.data || []);
    setAssignments(assignRes.data || []);
  }

  async function handleAssign(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from('staff_assignments').upsert({
        project_id: assignForm.project_id,
        staff_id: assignForm.staff_id,
        role_on_project: assignForm.role_on_project,
        is_active: true,
      }, { onConflict: 'project_id,staff_id' });
      if (error) throw error;
      showToast('Staff assigned to project');
      setShowAssignModal(false);
      loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignment(id) {
    await supabase.from('staff_assignments').update({ is_active: false }).eq('id', id);
    showToast('Assignment removed');
    loadAll();
  }

  async function updateDesignation(userId, designation) {
    await supabase.from('profiles').update({ designation }).eq('id', userId);
    showToast('Designation updated');
    loadAll();
  }

  async function updateReportsTo(userId, reportsTo) {
    await supabase.from('profiles').update({ reports_to: reportsTo || null }).eq('id', userId);
    showToast('Reporting line updated');
    loadAll();
  }

  // Build hierarchy tree
  const buildTree = () => {
    const map = {};
    staff.forEach(s => { map[s.id] = { ...s, children: [] }; });
    const roots = [];
    staff.forEach(s => {
      if (s.reports_to && map[s.reports_to]) {
        map[s.reports_to].children.push(map[s.id]);
      } else {
        roots.push(map[s.id]);
      }
    });
    return roots;
  };

  const renderTree = (nodes, depth = 0) => (
    <div style={{ paddingLeft: depth * 24 }}>
      {nodes.map(n => (
        <div key={n.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderLeft: depth > 0 ? '2px solid var(--border)' : 'none',
            marginBottom: 4, background: depth === 0 ? 'var(--bg-hover)' : 'transparent',
            borderRadius: 'var(--radius)',
          }}>
            <span style={{ fontWeight: 500, flex: 1 }}>{n.full_name}</span>
            <span className="badge badge-accent">{n.designation || '—'}</span>
            <span className="badge badge-muted">{ROLE_LABELS[n.role]}</span>
          </div>
          {n.children.length > 0 && renderTree(n.children, depth + 1)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Staff & Teams</h2>
          <div className="subtitle">{staff.length} active team members</div>
        </div>
        {hasRole(profile.role, 'engineer') && (
          <button className="btn btn-primary" onClick={() => setShowAssignModal(true)}>
            + Assign to Project
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={tab === 'staff' ? 'active' : ''} onClick={() => setTab('staff')}>
          Staff Directory
        </button>
        <button className={tab === 'hierarchy' ? 'active' : ''} onClick={() => setTab('hierarchy')}>
          Org Hierarchy
        </button>
        <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>
          Project Assignments ({assignments.length})
        </button>
      </div>

      {tab === 'staff' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Designation</th><th>System Role</th><th>Reports To</th><th></th></tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.full_name}</td>
                  <td className="text-sm">{s.email}</td>
                  <td>
                    {hasRole(profile.role, 'engineer') ? (
                      <select value={s.designation || ''} onChange={e => updateDesignation(s.id, e.target.value)}
                        style={{ padding: '4px 8px', fontSize: 12 }}>
                        <option value="">—</option>
                        {DESIGNATIONS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    ) : (
                      <span className="badge badge-accent">{s.designation || '—'}</span>
                    )}
                  </td>
                  <td><span className="badge badge-muted">{ROLE_LABELS[s.role]}</span></td>
                  <td>
                    {hasRole(profile.role, 'engineer') ? (
                      <select value={s.reports_to || ''} onChange={e => updateReportsTo(s.id, e.target.value)}
                        style={{ padding: '4px 8px', fontSize: 12 }}>
                        <option value="">None</option>
                        {staff.filter(st => st.id !== s.id).map(st => (
                          <option key={st.id} value={st.id}>{st.full_name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm">{staff.find(st => st.id === s.reports_to)?.full_name || '—'}</span>
                    )}
                  </td>
                  <td className="text-mono text-sm">{s.phone || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'hierarchy' && (
        <div className="card">
          <div className="card-header"><h3>Organizational Hierarchy</h3></div>
          {staff.length === 0 ? (
            <div className="empty-state"><p>No active staff</p></div>
          ) : (
            renderTree(buildTree())
          )}
        </div>
      )}

      {tab === 'assignments' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Staff Member</th><th>Designation</th><th>Project</th><th>Project Role</th><th>Assigned</th><th></th></tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 500 }}>{a.profiles?.full_name}</td>
                  <td className="text-sm">{a.profiles?.designation || '—'}</td>
                  <td>{a.projects?.name || '—'}</td>
                  <td><span className="badge badge-accent">{a.role_on_project}</span></td>
                  <td className="text-mono text-sm">{a.assigned_at?.split('T')[0]}</td>
                  <td>
                    {hasRole(profile.role, 'engineer') && (
                      <button className="btn btn-sm btn-danger" onClick={() => removeAssignment(a.id)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Assign Staff to Project<button onClick={() => setShowAssignModal(false)}>×</button></h3>
            <form onSubmit={handleAssign}>
              <div className="form-group mb-16">
                <label>Staff Member *</label>
                <select value={assignForm.staff_id} onChange={e => setAssignForm({ ...assignForm, staff_id: e.target.value })} required>
                  <option value="">Select staff...</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.designation || s.role})</option>)}
                </select>
              </div>
              <div className="form-group mb-16">
                <label>Project *</label>
                <select value={assignForm.project_id} onChange={e => setAssignForm({ ...assignForm, project_id: e.target.value })} required>
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group mb-16">
                <label>Role on Project *</label>
                <select value={assignForm.role_on_project} onChange={e => setAssignForm({ ...assignForm, role_on_project: e.target.value })}>
                  {PROJECT_ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Assigning...' : 'Assign'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowAssignModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
