import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ROLE_LABELS, ROLE_LEVELS } from '../lib/supabase';

const INSTRUCTION_TYPES = [
  'Site Instruction', 'Variation Order', 'Day Work Order',
  'Suspension Order', 'Resumption Order', 'Defects Notice',
  'Taking Over Notice', 'Other'
];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const PRIORITY_COLORS = { Low: '#6b7280', Normal: '#2563eb', High: '#f59e0b', Urgent: '#dc2626' };

const EMPTY_FORM = {
  instruction_no: '', subject: '', description: '', instruction_type: 'Site Instruction',
  priority: 'Normal', fidic_clause: '', chainage_from: '', chainage_to: '', due_date: '',
};

export default function SiteInstructionsPage({ profile, showToast, navigateTo, selectedProject }) {
  const [instructions, setInstructions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(selectedProject?.id || '');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [escalateModal, setEscalateModal] = useState(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  const isPlatformAdmin = profile.is_platform_admin === true;
  const canIssue = isPlatformAdmin || hasRole(profile.role, 'resident_engineer');
  const canApprove = isPlatformAdmin || hasRole(profile.role, 'project_engineer');
  const canApproveAll = isPlatformAdmin || hasRole(profile.role, 'engineer');

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name')
      .then(({ data }) => { setProjects(data || []); if (!projectId && data?.length) setProjectId(data[0].id); });
  }, []);

  useEffect(() => { if (projectId) loadInstructions(); }, [projectId]);

  async function loadInstructions() {
    setLoading(true);
    const { data, error } = await supabase
      .from('site_instructions')
      .select('*, issuer:issued_by(full_name), approver:approved_by(full_name), escalated_user:escalated_to(full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (!error) setInstructions(data || []);
    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!projectId) { showToast('Select a project first', 'error'); return; }

    const payload = {
      ...form,
      project_id: projectId,
      issued_by: profile.id,
      status: 'Issued',
      due_date: form.due_date || null,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from('site_instructions').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('site_instructions').insert(payload));
    }

    if (error) { showToast(error.message, 'error'); return; }
    showToast(editId ? 'Instruction updated' : 'Instruction issued');
    setShowModal(false);
    setForm(EMPTY_FORM);
    setEditId(null);
    loadInstructions();
  }

  async function handleApprove(id) {
    const { error } = await supabase.from('site_instructions').update({
      status: isPlatformAdmin ? 'Overridden' : 'Approved',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      approval_notes: approvalNotes,
      ...(isPlatformAdmin ? { overridden_by: profile.id, overridden_at: new Date().toISOString(), override_notes: approvalNotes } : {}),
    }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(isPlatformAdmin ? 'Instruction overridden & approved' : 'Instruction approved');
    setApprovalNotes('');
    loadInstructions();
  }

  async function handleReject(id) {
    const { error } = await supabase.from('site_instructions').update({
      status: 'Rejected',
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      approval_notes: approvalNotes || 'Rejected',
    }).eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Instruction rejected');
    setApprovalNotes('');
    loadInstructions();
  }

  async function handleEscalate(instruction) {
    if (!escalateReason.trim()) { showToast('Please provide an escalation reason', 'error'); return; }

    // Determine next role in chain
    const nextRole = getNextRole(profile.role);

    // Find a user with that role on this project
    const { data: candidates } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', [nextRole, 'super_admin'])
      .eq('is_active', true)
      .order('role', { ascending: false });

    const escalateTo = candidates?.[0];

    const { error } = await supabase.from('site_instructions').update({
      status: 'Escalated',
      requires_approval_from: nextRole,
      escalated_to: escalateTo?.id || null,
      escalated_at: new Date().toISOString(),
      escalation_reason: escalateReason,
    }).eq('id', instruction.id);

    if (error) { showToast(error.message, 'error'); return; }

    // Create escalation record
    await supabase.from('approval_escalations').insert({
      project_id: projectId,
      item_type: 'site_instruction',
      item_id: instruction.id,
      item_description: `${instruction.instruction_no}: ${instruction.subject}`,
      initiated_by: profile.id,
      current_level: nextRole,
      chain: [{
        role: profile.role,
        user_name: profile.full_name,
        action: 'escalated',
        notes: escalateReason,
        timestamp: new Date().toISOString(),
      }],
    });

    showToast(`Escalated to ${ROLE_LABELS[nextRole]}`);
    setEscalateModal(null);
    setEscalateReason('');
    loadInstructions();
  }

  function getNextRole(currentRole) {
    const chain = ['inspector', 'resident_engineer', 'project_engineer', 'engineer', 'super_admin'];
    const idx = chain.indexOf(currentRole);
    return idx >= 0 && idx < chain.length - 1 ? chain[idx + 1] : 'super_admin';
  }

  function openEdit(si) {
    setForm({
      instruction_no: si.instruction_no, subject: si.subject, description: si.description || '',
      instruction_type: si.instruction_type, priority: si.priority, fidic_clause: si.fidic_clause || '',
      chainage_from: si.chainage_from || '', chainage_to: si.chainage_to || '',
      due_date: si.due_date || '',
    });
    setEditId(si.id);
    setShowModal(true);
  }

  function canUserApprove(si) {
    if (isPlatformAdmin) return true;
    if (si.status === 'Approved' || si.status === 'Rejected' || si.status === 'Overridden' || si.status === 'Completed') return false;
    if (si.status === 'Escalated' && si.requires_approval_from) {
      return hasRole(profile.role, si.requires_approval_from);
    }
    return canApprove;
  }

  function canUserEscalate(si) {
    if (si.status !== 'Issued' && si.status !== 'Escalated') return false;
    if (isPlatformAdmin) return false; // platform admin approves directly
    if (profile.role === 'super_admin') return false; // top of chain
    return hasRole(profile.role, 'resident_engineer');
  }

  const filtered = filter === 'all' ? instructions : instructions.filter(i => i.status === filter);

  const statusColors = {
    Draft: '#6b7280', Issued: '#2563eb', Escalated: '#f59e0b',
    Approved: '#16a34a', Rejected: '#dc2626', Acknowledged: '#7c3aed',
    Completed: '#059669', Overridden: '#b45309',
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Site Instructions</h2>
          <div className="subtitle">FIDIC contract administration — issue, escalate & approve</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
            <option value="">Select Project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {canIssue && projectId && (
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowModal(true); }}>
              + Issue Instruction
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="card empty-state"><p>Select a project to view site instructions.</p></div>
      ) : loading ? (
        <div className="card empty-state"><p>Loading...</p></div>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="tabs">
            {['all', 'Issued', 'Escalated', 'Approved', 'Rejected', 'Completed'].map(f => (
              <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? `All (${instructions.length})` : `${f} (${instructions.filter(i => i.status === f).length})`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="card empty-state">
              <div className="icon">📋</div>
              <p>No {filter === 'all' ? '' : filter.toLowerCase()} instructions found.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(si => (
                <div key={si.id} className="card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{si.instruction_no}</span>
                        <span className="badge" style={{ background: statusColors[si.status], color: '#fff', fontSize: 11 }}>
                          {si.status}
                        </span>
                        <span style={{ color: PRIORITY_COLORS[si.priority], fontSize: 12, fontWeight: 600 }}>
                          {si.priority !== 'Normal' && `● ${si.priority}`}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>{si.subject}</div>
                      <div className="text-sm text-muted" style={{ marginTop: 2 }}>{si.instruction_type}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                      <div>Issued: {new Date(si.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      <div>By: {si.issuer?.full_name || 'System'}</div>
                      {si.fidic_clause && <div>FIDIC: {si.fidic_clause}</div>}
                    </div>
                  </div>

                  {si.description && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>{si.description}</div>
                  )}

                  {(si.chainage_from || si.chainage_to) && (
                    <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
                      Chainage: {si.chainage_from || '—'} to {si.chainage_to || '—'}
                    </div>
                  )}

                  {/* Escalation info */}
                  {si.status === 'Escalated' && (
                    <div style={{ background: 'var(--bg-hover)', padding: 10, borderRadius: 'var(--radius)', marginBottom: 10, fontSize: 12 }}>
                      <strong>⬆ Escalated</strong> to {ROLE_LABELS[si.requires_approval_from] || 'higher authority'}
                      {si.escalated_user?.full_name && ` (${si.escalated_user.full_name})`}
                      {si.escalation_reason && <div style={{ marginTop: 4, fontStyle: 'italic' }}>Reason: {si.escalation_reason}</div>}
                    </div>
                  )}

                  {/* Approval info */}
                  {(si.status === 'Approved' || si.status === 'Overridden') && (
                    <div style={{ background: '#d1fae5', padding: 10, borderRadius: 'var(--radius)', marginBottom: 10, fontSize: 12, color: '#065f46' }}>
                      <strong>✓ {si.status === 'Overridden' ? 'Overridden & Approved' : 'Approved'}</strong>
                      {' by '}{si.approver?.full_name || 'System'}
                      {si.approval_notes && <div style={{ marginTop: 4 }}>{si.approval_notes}</div>}
                    </div>
                  )}

                  {si.status === 'Rejected' && (
                    <div style={{ background: '#fef2f2', padding: 10, borderRadius: 'var(--radius)', marginBottom: 10, fontSize: 12, color: '#991b1b' }}>
                      <strong>✗ Rejected</strong> by {si.approver?.full_name || 'System'}
                      {si.approval_notes && <div style={{ marginTop: 4 }}>{si.approval_notes}</div>}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {canUserApprove(si) && (
                      <>
                        <input type="text" placeholder="Approval notes..." value={approvalNotes}
                          onChange={e => setApprovalNotes(e.target.value)}
                          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 12, flex: 1, minWidth: 160 }} />
                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(si.id)}>
                          {isPlatformAdmin ? '⚡ Override & Approve' : '✓ Approve'}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleReject(si.id)}>✗ Reject</button>
                      </>
                    )}
                    {canUserEscalate(si) && (
                      <button className="btn btn-sm btn-secondary" onClick={() => setEscalateModal(si)}>
                        ⬆ Escalate to {ROLE_LABELS[getNextRole(profile.role)]}
                      </button>
                    )}
                    {si.status === 'Draft' && si.issued_by === profile.id && (
                      <button className="btn btn-sm btn-secondary" onClick={() => openEdit(si)}>Edit</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ISSUE / EDIT MODAL ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>{editId ? 'Edit' : 'Issue'} Site Instruction<button onClick={() => setShowModal(false)}>×</button></h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Instruction No *</label>
                  <input type="text" value={form.instruction_no} required placeholder="e.g. SI-001"
                    onChange={e => setForm({ ...form, instruction_no: e.target.value })} />
                </div>
                <div className="form-group mb-16">
                  <label>Type *</label>
                  <select value={form.instruction_type} onChange={e => setForm({ ...form, instruction_type: e.target.value })}>
                    {INSTRUCTION_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group mb-16">
                <label>Subject *</label>
                <input type="text" value={form.subject} required placeholder="Brief description of the instruction"
                  onChange={e => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div className="form-group mb-16">
                <label>Description</label>
                <textarea rows={3} value={form.description} placeholder="Detailed instruction..."
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Priority</label>
                  <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>FIDIC Clause</label>
                  <input type="text" value={form.fidic_clause} placeholder="e.g. Cl. 13.1"
                    onChange={e => setForm({ ...form, fidic_clause: e.target.value })} />
                </div>
                <div className="form-group mb-16">
                  <label>Due Date</label>
                  <input type="date" value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Chainage From</label>
                  <input type="text" value={form.chainage_from} placeholder="e.g. 0+000"
                    onChange={e => setForm({ ...form, chainage_from: e.target.value })} />
                </div>
                <div className="form-group mb-16">
                  <label>Chainage To</label>
                  <input type="text" value={form.chainage_to} placeholder="e.g. 5+200"
                    onChange={e => setForm({ ...form, chainage_to: e.target.value })} />
                </div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit">{editId ? 'Update' : 'Issue Instruction'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── ESCALATE MODAL ── */}
      {escalateModal && (
        <div className="modal-overlay" onClick={() => setEscalateModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Escalate Instruction<button onClick={() => setEscalateModal(null)}>×</button></h3>
            <div style={{ background: 'var(--bg-hover)', padding: 12, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
              <strong>{escalateModal.instruction_no}:</strong> {escalateModal.subject}
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              This will escalate to <strong>{ROLE_LABELS[getNextRole(profile.role)]}</strong> for approval.
              Escalation chain: RE → Project Engineer → Engineer → Super Admin
            </p>
            <div className="form-group mb-16">
              <label>Reason for Escalation *</label>
              <textarea rows={3} value={escalateReason} placeholder="Why does this need higher-level approval?"
                onChange={e => setEscalateReason(e.target.value)} />
            </div>
            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => handleEscalate(escalateModal)}
                disabled={!escalateReason.trim()}>
                ⬆ Escalate to {ROLE_LABELS[getNextRole(profile.role)]}
              </button>
              <button className="btn btn-secondary" onClick={() => setEscalateModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
