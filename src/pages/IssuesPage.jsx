import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ISSUE_CATEGORIES } from '../lib/supabase';

const EMPTY_ISSUE = {
  title: '', description: '', category: 'General', severity: 'Medium',
  chainage_from: '', chainage_to: '', status: 'Open', resolution_notes: '',
};

export default function IssuesPage({ profile, showToast }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [issues, setIssues] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_ISSUE);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterSev, setFilterSev] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [staff, setStaff] = useState([]);
  const [assignTo, setAssignTo] = useState('');

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => setProjects(data || []));
    supabase.from('profiles').select('id, full_name').neq('role', 'pending')
      .then(({ data }) => setStaff(data || []));
  }, []);

  useEffect(() => { if (projectId) loadIssues(); }, [projectId]);

  async function loadIssues() {
    const { data } = await supabase.from('site_issues')
      .select('*, raised_by_profile:raised_by(full_name), assigned_to_profile:assigned_to(full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setIssues(data || []);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        title: form.title,
        description: form.description || null,
        category: form.category,
        severity: form.severity,
        status: form.status,
        chainage_from: form.chainage_from ? parseFloat(form.chainage_from) : null,
        chainage_to: form.chainage_to ? parseFloat(form.chainage_to) : null,
        resolution_notes: form.resolution_notes || null,
        assigned_to: assignTo || null,
      };
      if (!editId) {
        payload.raised_by = profile.id;
        payload.date_raised = new Date().toISOString().split('T')[0];
      }
      if (form.status === 'Resolved' || form.status === 'Closed') {
        payload.date_resolved = new Date().toISOString().split('T')[0];
      }

      if (editId) {
        await supabase.from('site_issues').update(payload).eq('id', editId);
        showToast('Issue updated');
      } else {
        const { error } = await supabase.from('site_issues').insert(payload);
        if (error) throw error;
        showToast('Issue raised');
      }
      setShowModal(false);
      setForm(EMPTY_ISSUE);
      setEditId(null);
      setAssignTo('');
      loadIssues();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function openEdit(iss) {
    setForm({
      title: iss.title, description: iss.description || '',
      category: iss.category, severity: iss.severity, status: iss.status,
      chainage_from: iss.chainage_from ?? '', chainage_to: iss.chainage_to ?? '',
      resolution_notes: iss.resolution_notes || '',
    });
    setAssignTo(iss.assigned_to || '');
    setEditId(iss.id);
    setShowModal(true);
  }

  const filtered = issues.filter(iss => {
    if (filterSev !== 'all' && iss.severity !== filterSev) return false;
    if (filterStatus !== 'all' && iss.status !== filterStatus) return false;
    return true;
  });

  const sevBadge = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'muted' };
  const statusBadge = { Open: 'warning', 'In Progress': 'accent', Resolved: 'success', Closed: 'muted', Escalated: 'danger' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Site Issues</h2>
          <div className="subtitle">Track and resolve project issues</div>
        </div>
        {projectId && hasRole(profile.role, 'inspector') && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_ISSUE); setEditId(null); setAssignTo(''); setShowModal(true); }}>
            + Raise Issue
          </button>
        )}
      </div>

      <div className="filter-bar">
        <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ minWidth: 300 }}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {projectId && (
          <>
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)}>
              <option value="all">All Severities</option>
              {['Critical', 'High', 'Medium', 'Low'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated'].map(s => <option key={s}>{s}</option>)}
            </select>
          </>
        )}
      </div>

      {!projectId ? (
        <div className="card empty-state"><div className="icon">⚠</div><p>Select a project</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th><th>Category</th><th>Severity</th><th>Chainage</th>
                <th>Raised By</th><th>Assigned To</th><th>Status</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(iss => (
                <tr key={iss.id}>
                  <td style={{ fontWeight: 500, maxWidth: 240 }}>{iss.title}</td>
                  <td className="text-sm">{iss.category}</td>
                  <td><span className={`badge badge-${sevBadge[iss.severity]}`}>{iss.severity}</span></td>
                  <td className="chainage">
                    {iss.chainage_from != null ? `${iss.chainage_from}${iss.chainage_to != null ? ` – ${iss.chainage_to}` : ''}` : '—'}
                  </td>
                  <td className="text-sm">{iss.raised_by_profile?.full_name || '—'}</td>
                  <td className="text-sm">{iss.assigned_to_profile?.full_name || '—'}</td>
                  <td><span className={`badge badge-${statusBadge[iss.status]}`}>{iss.status}</span></td>
                  <td className="text-mono text-sm">{iss.date_raised}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(iss)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && projectId && (
        <div className="card empty-state mt-16"><p>No issues match your filters</p></div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editId ? 'Edit Issue' : 'Raise Site Issue'}<button onClick={() => setShowModal(false)}>×</button></h3>
            <form onSubmit={handleSave}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Title *</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Brief description of the issue" required />
                </div>
                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Detailed description..." rows={3} />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {ISSUE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Severity</label>
                  <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {['Low', 'Medium', 'High', 'Critical'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Chainage From (km)</label>
                  <input type="number" step="0.001" value={form.chainage_from}
                    onChange={e => setForm({ ...form, chainage_from: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Chainage To (km)</label>
                  <input type="number" step="0.001" value={form.chainage_to}
                    onChange={e => setForm({ ...form, chainage_to: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Assign To</label>
                  <select value={assignTo} onChange={e => setAssignTo(e.target.value)}>
                    <option value="">Unassigned</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                {(form.status === 'Resolved' || form.status === 'Closed') && (
                  <div className="form-group full-width">
                    <label>Resolution Notes</label>
                    <textarea value={form.resolution_notes} onChange={e => setForm({ ...form, resolution_notes: e.target.value })}
                      placeholder="How was this resolved?" rows={2} />
                  </div>
                )}
              </div>
              <div className="btn-group mt-24">
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editId ? 'Update Issue' : 'Raise Issue'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
