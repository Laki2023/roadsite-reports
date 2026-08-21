import React, { useState, useEffect, useCallback } from 'react';
import { supabase, hasRole, ROLE_LABELS, ROLE_LEVELS, ROLE_COLORS, APPROVAL_AUTHORITY,
  canApproveItem, canIssueItem, getEscalationTarget, INSTRUCTION_TYPES, APPROVAL_TYPES } from '../lib/supabase';

const STATUS_COLORS = {
  pending: '#f59e0b', approved: '#10b981', rejected: '#ef4444',
  escalated: '#8b5cf6', overridden: '#2563eb',
  issued: '#3b82f6', acknowledged: '#f59e0b', complied: '#10b981',
  closed: '#6b7280', draft: '#9ca3af', withdrawn: '#ef4444',
};
const PRIORITY_COLORS = { low: '#6b7280', normal: '#3b82f6', high: '#f59e0b', urgent: '#ef4444' };

export default function ApprovalsPage({ profile, showToast, navigateTo, selectedProject }) {
  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState([]);
  const [instructions, setInstructions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState(selectedProject?.id || 'all');
  const [filterStatus, setFilterStatus] = useState('pending');
  const [actionModal, setActionModal] = useState(null); // { item, action: 'approve'|'reject'|'escalate' }
  const [instructionModal, setInstructionModal] = useState(false);
  const [actionNotes, setActionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isPlatformAdmin = profile.is_platform_admin === true;
  const userRole = profile.role;
  const userLevel = ROLE_LEVELS[userRole] || 0;

  const loadData = useCallback(async () => {
    const [qRes, siRes, pRes] = await Promise.all([
      supabase.from('approval_queue')
        .select('*, project:projects(name), submitter:submitted_by(full_name), decider:decision_by(full_name)')
        .order('created_at', { ascending: false }),
      supabase.from('site_instructions')
        .select('*, project:projects(name), issuer:issued_by(full_name)')
        .order('issued_at', { ascending: false }),
      supabase.from('projects').select('id, name').order('name'),
    ]);
    setQueue(qRes.data || []);
    setInstructions(siRes.data || []);
    setProjects(pRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter queue
  const filteredQueue = queue.filter(q => {
    const matchProject = filterProject === 'all' || q.project_id === filterProject;
    const matchStatus = filterStatus === 'all' || q.status === filterStatus;
    return matchProject && matchStatus;
  });

  // Items needing MY action (assigned to me or at my role level)
  const myQueue = queue.filter(q =>
    q.status === 'pending' && (
      isPlatformAdmin ||
      q.assigned_to === profile.id ||
      (ROLE_LEVELS[q.current_approver_role] || 0) <= userLevel
    )
  );

  // ── Actions ──
  async function handleAction() {
    if (!actionModal) return;
    setSubmitting(true);
    const { item, action } = actionModal;

    try {
      if (action === 'approve' || action === 'reject' || action === 'override') {
        await supabase.from('approval_queue').update({
          status: action === 'override' ? 'overridden' : action === 'approve' ? 'approved' : 'rejected',
          decision_by: profile.id,
          decision_at: new Date().toISOString(),
          decision_notes: actionNotes || null,
        }).eq('id', item.id);

        await supabase.from('approval_history').insert({
          queue_id: item.id,
          action: action === 'override' ? 'overridden' : action === 'approve' ? 'approved' : 'rejected',
          action_by: profile.id,
          action_role: userRole,
          notes: actionNotes || null,
        });
      }

      if (action === 'escalate') {
        const nextRole = getEscalationTarget(item.current_approver_role) || getEscalationTarget(userRole);
        if (!nextRole) { showToast('No higher role to escalate to', 'error'); setSubmitting(false); return; }

        await supabase.from('approval_queue').update({
          status: 'escalated',
          current_approver_role: nextRole,
          escalated_from: userRole,
          escalation_reason: actionNotes || null,
          assigned_to: null,
        }).eq('id', item.id);

        // Reset to pending for next level
        await supabase.from('approval_queue').update({ status: 'pending' }).eq('id', item.id);

        await supabase.from('approval_history').insert({
          queue_id: item.id,
          action: 'escalated',
          action_by: profile.id,
          action_role: userRole,
          notes: actionNotes || null,
          escalated_to: nextRole,
        });
      }

      showToast(`Item ${action === 'escalate' ? 'escalated' : action + 'd'} successfully`);
      setActionModal(null);
      setActionNotes('');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Issue Instruction ──
  const [instrForm, setInstrForm] = useState({
    project_id: '', instruction_type: 'site_instruction', subject: '', description: '',
    chainage_from: '', chainage_to: '', fidic_clause: '', response_required: false, response_due_date: '',
  });

  async function handleIssueInstruction(e) {
    e.preventDefault();
    if (!instrForm.project_id || !instrForm.subject) { showToast('Project and subject required', 'error'); return; }

    // Check authority
    const { allowed, escalateTo } = canIssueItem(userRole, instrForm.instruction_type, isPlatformAdmin);
    if (!allowed) {
      showToast(`You cannot issue this type. It requires ${ROLE_LABELS[escalateTo]} or above.`, 'error');
      return;
    }

    setSubmitting(true);
    // Generate instruction number
    const { data: instrNo } = await supabase.rpc('next_instruction_no', { p_project_id: instrForm.project_id });

    const { error } = await supabase.from('site_instructions').insert({
      ...instrForm,
      instruction_no: instrNo,
      issued_by: profile.id,
      issued_by_role: userRole,
      fidic_clause: instrForm.fidic_clause || INSTRUCTION_TYPES.find(t => t.key === instrForm.instruction_type)?.fidic || null,
      response_due_date: instrForm.response_due_date || null,
      status: 'issued',
    });

    if (error) { showToast(error.message, 'error'); } else {
      showToast(`Instruction ${instrNo} issued`);
      setInstructionModal(false);
      setInstrForm({ project_id: '', instruction_type: 'site_instruction', subject: '', description: '',
        chainage_from: '', chainage_to: '', fidic_clause: '', response_required: false, response_due_date: '' });
      loadData();
    }
    setSubmitting(false);
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
          <h2>Approvals & Instructions</h2>
          <div className="subtitle">
            {myQueue.length > 0
              ? `${myQueue.length} item${myQueue.length !== 1 ? 's' : ''} awaiting your action`
              : 'No items pending your approval'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => setInstructionModal(true)}>
            + Issue Instruction
          </button>
        </div>
      </div>

      {/* My Queue Summary */}
      {myQueue.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
          <h3 style={{ marginBottom: 12 }}>⏳ Awaiting Your Action</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myQueue.slice(0, 5).map(q => {
              const rc = ROLE_COLORS[q.current_approver_role] || ROLE_COLORS.viewer;
              return (
                <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{q.title}</div>
                    <div className="text-sm text-muted">{q.project?.name} · {q.submitter?.full_name} · {fmtDate(q.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-success" onClick={() => setActionModal({ item: q, action: 'approve' })}>Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setActionModal({ item: q, action: 'reject' })}>Reject</button>
                    {getEscalationTarget(userRole) && (
                      <button className="btn btn-sm btn-secondary" onClick={() => setActionModal({ item: q, action: 'escalate' })}>
                        Escalate ↑
                      </button>
                    )}
                    {isPlatformAdmin && (
                      <button className="btn btn-sm" style={{ background: '#2563eb', color: '#fff' }}
                        onClick={() => setActionModal({ item: q, action: 'override' })}>Override</button>
                    )}
                  </div>
                </div>
              );
            })}
            {myQueue.length > 5 && <div className="text-sm text-muted" style={{ textAlign: 'center' }}>+ {myQueue.length - 5} more</div>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>
          Approval Queue ({queue.filter(q => q.status === 'pending').length} pending)
        </button>
        <button className={tab === 'instructions' ? 'active' : ''} onClick={() => setTab('instructions')}>
          Site Instructions ({instructions.length})
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          Completed
        </button>
      </div>

      {/* ── APPROVAL QUEUE TAB ── */}
      {tab === 'queue' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
              <option value="all">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="escalated">Escalated</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {filteredQueue.length === 0 ? (
            <div className="card empty-state"><div className="icon">✓</div><p>No items in the queue.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Item</th><th>Project</th><th>Type</th><th>Submitted By</th><th>Current Level</th><th>Priority</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredQueue.map(q => {
                    const rc = ROLE_COLORS[q.current_approver_role] || ROLE_COLORS.viewer;
                    const { allowed } = canApproveItem(userRole, q.item_type, isPlatformAdmin);
                    const canAct = q.status === 'pending' && (isPlatformAdmin || allowed);
                    return (
                      <tr key={q.id}>
                        <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 200 }}>{q.title}</td>
                        <td className="text-sm">{q.project?.name || '—'}</td>
                        <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{q.item_type?.replace(/_/g, ' ')}</span></td>
                        <td className="text-sm">{q.submitter?.full_name || 'System'}</td>
                        <td>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
                            fontSize: 10, fontWeight: 600, background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}>
                            {ROLE_LABELS[q.current_approver_role]}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: PRIORITY_COLORS[q.priority], fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                            {q.priority}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: STATUS_COLORS[q.status], fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                            {q.status}
                          </span>
                        </td>
                        <td className="text-sm">{fmtDate(q.created_at)}</td>
                        <td>
                          {canAct && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm btn-success" onClick={() => setActionModal({ item: q, action: 'approve' })}>✓</button>
                              <button className="btn btn-sm btn-danger" onClick={() => setActionModal({ item: q, action: 'reject' })}>✗</button>
                              {getEscalationTarget(q.current_approver_role) && (
                                <button className="btn btn-sm btn-secondary" onClick={() => setActionModal({ item: q, action: 'escalate' })}>↑</button>
                              )}
                              {isPlatformAdmin && (
                                <button className="btn btn-sm" style={{ background: '#2563eb', color: '#fff', fontSize: 10 }}
                                  onClick={() => setActionModal({ item: q, action: 'override' })}>⚡</button>
                              )}
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

      {/* ── SITE INSTRUCTIONS TAB ── */}
      {tab === 'instructions' && (
        instructions.length === 0 ? (
          <div className="card empty-state"><div className="icon">📋</div><p>No site instructions issued yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>No.</th><th>Type</th><th>Subject</th><th>Project</th><th>Issued By</th><th>Date</th><th>Status</th><th>FIDIC</th></tr></thead>
              <tbody>
                {instructions.map(si => (
                  <tr key={si.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{si.instruction_no}</td>
                    <td><span className="badge badge-muted" style={{ fontSize: 10 }}>{si.instruction_type?.replace(/_/g, ' ')}</span></td>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{si.subject}</td>
                    <td className="text-sm">{si.project?.name || '—'}</td>
                    <td className="text-sm">{si.issuer?.full_name || 'System'}</td>
                    <td className="text-sm">{fmtDate(si.issued_at)}</td>
                    <td>
                      <span style={{ color: STATUS_COLORS[si.status], fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                        {si.status}
                      </span>
                    </td>
                    <td className="text-sm text-muted">{si.fidic_clause || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── COMPLETED TAB ── */}
      {tab === 'history' && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Project</th><th>Type</th><th>Decision</th><th>By</th><th>Date</th><th>Notes</th></tr></thead>
            <tbody>
              {queue.filter(q => q.status !== 'pending').map(q => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{q.title}</td>
                  <td className="text-sm">{q.project?.name || '—'}</td>
                  <td className="text-sm">{q.item_type?.replace(/_/g, ' ')}</td>
                  <td>
                    <span style={{ color: STATUS_COLORS[q.status], fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                      {q.status}
                    </span>
                  </td>
                  <td className="text-sm">{q.decider?.full_name || 'System'}</td>
                  <td className="text-sm">{fmtDate(q.decision_at)}</td>
                  <td className="text-sm text-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {q.decision_notes || '—'}
                  </td>
                </tr>
              ))}
              {queue.filter(q => q.status !== 'pending').length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No completed items yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ACTION MODAL ── */}
      {actionModal && (
        <div className="modal-overlay" onClick={() => setActionModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>
              {actionModal.action === 'approve' && '✓ Approve Item'}
              {actionModal.action === 'reject' && '✗ Reject Item'}
              {actionModal.action === 'escalate' && '↑ Escalate Item'}
              {actionModal.action === 'override' && '⚡ Override (Platform Admin)'}
              <button onClick={() => setActionModal(null)}>×</button>
            </h3>

            <div style={{ background: 'var(--bg-hover)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
              <div><strong>{actionModal.item.title}</strong></div>
              <div className="text-muted">{actionModal.item.project?.name} · {actionModal.item.item_type?.replace(/_/g, ' ')}</div>
              <div className="text-muted">Submitted by: {actionModal.item.submitter?.full_name}</div>
            </div>

            {actionModal.action === 'escalate' && (
              <div style={{ padding: '10px 14px', background: '#ede9fe', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13, color: '#5b21b6' }}>
                This will escalate to: <strong>{ROLE_LABELS[getEscalationTarget(actionModal.item.current_approver_role) || getEscalationTarget(userRole)]}</strong>
              </div>
            )}

            {actionModal.action === 'override' && (
              <div style={{ padding: '10px 14px', background: '#dbeafe', borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
                Platform Admin override — this action will show as "System" to other users.
              </div>
            )}

            <div className="form-group mb-16">
              <label>{actionModal.action === 'escalate' ? 'Escalation Reason' : 'Notes'} (optional)</label>
              <textarea rows={3} value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                placeholder={actionModal.action === 'reject' ? 'Reason for rejection...' :
                  actionModal.action === 'escalate' ? 'Why this needs higher authority...' : 'Any notes...'}
                style={{ fontSize: 13 }} />
            </div>

            <div className="btn-group">
              <button
                className={`btn ${actionModal.action === 'reject' ? 'btn-danger' : actionModal.action === 'escalate' ? 'btn-secondary' : 'btn-success'}`}
                onClick={handleAction} disabled={submitting}>
                {submitting ? 'Processing...' :
                  actionModal.action === 'approve' ? 'Confirm Approval' :
                  actionModal.action === 'reject' ? 'Confirm Rejection' :
                  actionModal.action === 'escalate' ? 'Escalate to ' + ROLE_LABELS[getEscalationTarget(actionModal.item.current_approver_role) || getEscalationTarget(userRole)] :
                  'Confirm Override'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setActionModal(null); setActionNotes(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ISSUE INSTRUCTION MODAL ── */}
      {instructionModal && (
        <div className="modal-overlay" onClick={() => setInstructionModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Issue Instruction<button onClick={() => setInstructionModal(false)}>×</button></h3>

            <form onSubmit={handleIssueInstruction}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Project *</label>
                  <select value={instrForm.project_id} onChange={e => setInstrForm({ ...instrForm, project_id: e.target.value })} required>
                    <option value="">Select project...</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>Instruction Type *</label>
                  <select value={instrForm.instruction_type} onChange={e => setInstrForm({ ...instrForm, instruction_type: e.target.value })}>
                    {INSTRUCTION_TYPES.filter(t => isPlatformAdmin || hasRole(userRole, t.minRole)).map(t => (
                      <option key={t.key} value={t.key}>{t.label} ({t.fidic})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group mb-16">
                <label>Subject *</label>
                <input type="text" value={instrForm.subject} onChange={e => setInstrForm({ ...instrForm, subject: e.target.value })}
                  placeholder="e.g. Rectification of subgrade level at Ch. 12+500" required />
              </div>

              <div className="form-group mb-16">
                <label>Description</label>
                <textarea rows={3} value={instrForm.description} onChange={e => setInstrForm({ ...instrForm, description: e.target.value })}
                  placeholder="Detailed instruction..." style={{ fontSize: 13 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>Chainage From</label>
                  <input type="text" value={instrForm.chainage_from} onChange={e => setInstrForm({ ...instrForm, chainage_from: e.target.value })}
                    placeholder="e.g. 12+500" />
                </div>
                <div className="form-group mb-16">
                  <label>Chainage To</label>
                  <input type="text" value={instrForm.chainage_to} onChange={e => setInstrForm({ ...instrForm, chainage_to: e.target.value })}
                    placeholder="e.g. 13+000" />
                </div>
                <div className="form-group mb-16">
                  <label>FIDIC Clause</label>
                  <input type="text" value={instrForm.fidic_clause} onChange={e => setInstrForm({ ...instrForm, fidic_clause: e.target.value })}
                    placeholder="e.g. Cl. 3.3" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={instrForm.response_required}
                      onChange={e => setInstrForm({ ...instrForm, response_required: e.target.checked })} />
                    Response Required
                  </label>
                </div>
                {instrForm.response_required && (
                  <div className="form-group mb-16">
                    <label>Response Due Date</label>
                    <input type="date" value={instrForm.response_due_date}
                      onChange={e => setInstrForm({ ...instrForm, response_due_date: e.target.value })} />
                  </div>
                )}
              </div>

              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Issuing...' : 'Issue Instruction'}
                </button>
                <button className="btn btn-secondary" type="button" onClick={() => setInstructionModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
