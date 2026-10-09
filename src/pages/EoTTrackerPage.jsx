import React, { useState, useEffect } from 'react';
import { supabase, hasRole, canEditModule } from '../lib/supabase';

const EOT_GROUNDS = [
  { value: '8.4(a)', label: 'Cl. 8.4(a) — Variation / substantial change in quantity' },
  { value: '8.4(b)', label: 'Cl. 8.4(b) — Cause of delay giving entitlement under a Sub-Clause' },
  { value: '8.4(c)', label: 'Cl. 8.4(c) — Exceptionally adverse climatic conditions' },
  { value: '8.4(d)', label: 'Cl. 8.4(d) — Unforeseeable shortages / Employer\'s risk' },
  { value: '8.4(e)', label: 'Cl. 8.4(e) — Any delay, impediment or prevention by the Employer' },
  { value: '17.4', label: 'Cl. 17.4 — Employer\'s risks (force majeure)' },
  { value: '19.4', label: 'Cl. 19.4 — Force Majeure consequences' },
  { value: 'other', label: 'Other grounds' },
];

const STATUS_OPTIONS = [
  'Draft', 'Notice Given', 'Applied', 'Under Review',
  'Granted', 'Partially Granted', 'Rejected', 'Withdrawn',
];

const statusColors = {
  Draft: '#9ca3af', 'Notice Given': '#3b82f6', Applied: '#6366f1',
  'Under Review': '#8b5cf6', Granted: '#10b981', 'Partially Granted': '#f59e0b',
  Rejected: '#ef4444', Withdrawn: '#9ca3af',
};

export default function EoTTrackerPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [projectData, setProjectData] = useState(null);
  const [eots, setEots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedEot, setSelectedEot] = useState(null);
  const [tab, setTab] = useState('summary');
  const [form, setForm] = useState({
    title: '', grounds: '', fidic_clause: '8.4(a)',
    event_date: '', notice_date: '', application_date: '',
    days_claimed: '', days_granted: '',
    engineer_determination_date: '', engineer_determination_ref: '',
    determination_notes: '', original_completion_date: '', revised_completion_date: '',
    cost_claimed: 0, cost_awarded: 0, status: 'Draft',
    supporting_details: '', notes: '',
  });

  const isPlatformAdmin = profile?.is_platform_admin === true;
  const canManage = isPlatformAdmin || hasRole(profile?.role, 'resident_engineer') ||
    canEditModule(profile?.allowed_pages, 'eot');

  useEffect(() => { supabase.from('projects').select('*').order('name').then(({ data }) => setProjects(data || [])); }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    setLoading(true);
    const [projRes, eotRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', selectedProject).single(),
      supabase.from('eot_applications').select('*').eq('project_id', selectedProject).order('eot_no'),
    ]);
    setProjectData(projRes.data || null);
    setEots(eotRes.data || []);
    setLoading(false);
  }

  function openNew() {
    const nextNo = eots.length > 0 ? Math.max(...eots.map(e => e.eot_no)) + 1 : 1;
    setEditing(null);
    setForm({
      title: '', grounds: '', fidic_clause: '8.4(a)',
      event_date: '', notice_date: '', application_date: '',
      days_claimed: '', days_granted: '',
      engineer_determination_date: '', engineer_determination_ref: '',
      determination_notes: '',
      original_completion_date: projectData?.completion_date || projectData?.intended_completion_date || '',
      revised_completion_date: '',
      cost_claimed: 0, cost_awarded: 0, status: 'Draft',
      supporting_details: '', notes: '', eot_no: nextNo,
    });
    setShowForm(true);
  }

  function openEdit(eot) {
    setEditing(eot);
    setForm({
      title: eot.title, grounds: eot.grounds || '', fidic_clause: eot.fidic_clause || '',
      event_date: eot.event_date || '', notice_date: eot.notice_date || '',
      application_date: eot.application_date || '',
      days_claimed: eot.days_claimed || '', days_granted: eot.days_granted ?? '',
      engineer_determination_date: eot.engineer_determination_date || '',
      engineer_determination_ref: eot.engineer_determination_ref || '',
      determination_notes: eot.determination_notes || '',
      original_completion_date: eot.original_completion_date || '',
      revised_completion_date: eot.revised_completion_date || '',
      cost_claimed: eot.cost_claimed || 0, cost_awarded: eot.cost_awarded || 0,
      status: eot.status, supporting_details: eot.supporting_details || '',
      notes: eot.notes || '', eot_no: eot.eot_no,
    });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        project_id: selectedProject,
        eot_no: parseInt(form.eot_no),
        title: form.title,
        grounds: form.grounds,
        fidic_clause: form.fidic_clause || null,
        event_date: form.event_date || null,
        notice_date: form.notice_date || null,
        application_date: form.application_date || null,
        days_claimed: parseInt(form.days_claimed) || 0,
        days_granted: form.days_granted !== '' ? parseInt(form.days_granted) : null,
        engineer_determination_date: form.engineer_determination_date || null,
        engineer_determination_ref: form.engineer_determination_ref || null,
        determination_notes: form.determination_notes || null,
        original_completion_date: form.original_completion_date || null,
        revised_completion_date: form.revised_completion_date || null,
        cost_claimed: parseFloat(form.cost_claimed) || 0,
        cost_awarded: parseFloat(form.cost_awarded) || 0,
        status: form.status,
        supporting_details: form.supporting_details || null,
        notes: form.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from('eot_applications').update(payload).eq('id', editing.id);
        if (error) throw error;
        showToast?.(`EoT No. ${editing.eot_no} updated`);
      } else {
        payload.submitted_by = profile?.id;
        const { error } = await supabase.from('eot_applications').insert(payload);
        if (error) throw error;
        showToast?.(`EoT No. ${form.eot_no} created`);
      }
      setShowForm(false); setEditing(null); loadData();
    } catch (err) { showToast?.(err.message, 'error'); }
    finally { setSaving(false); }
  }

  async function deleteEot(eot) {
    if (!window.confirm(`Delete EoT No. ${eot.eot_no}? This cannot be undone.`)) return;
    await supabase.from('eot_applications').delete().eq('id', eot.id);
    showToast?.('EoT deleted'); setSelectedEot(null); loadData();
  }

  const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  // Derived values
  const totalDaysClaimed = eots.reduce((s, e) => s + (e.days_claimed || 0), 0);
  const totalDaysGranted = eots.filter(e => e.days_granted != null).reduce((s, e) => s + (e.days_granted || 0), 0);
  const pendingEots = eots.filter(e => ['Draft', 'Notice Given', 'Applied', 'Under Review'].includes(e.status));
  const grantedEots = eots.filter(e => ['Granted', 'Partially Granted'].includes(e.status));
  const originalCompletion = projectData?.completion_date || projectData?.intended_completion_date;
  const revisedCompletion = grantedEots.length > 0
    ? grantedEots[grantedEots.length - 1].revised_completion_date
    : originalCompletion;

  // Notice timeliness check — FIDIC 20.1 requires 28-day notice
  function noticeTimely(eot) {
    if (!eot.event_date || !eot.notice_date) return null;
    const days = Math.ceil((new Date(eot.notice_date) - new Date(eot.event_date)) / 86400000);
    return days <= 28;
  }

  if (loading) return <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',color:'var(--text-muted)'}}><div style={{fontSize:28,marginBottom:12}}>◈</div><div>Loading...</div></div>;

  return (
    <div>
      <div className="page-header">
        <div><h2>⏱️ Extension of Time Tracker</h2><div className="subtitle">FIDIC Cl. 8.4 & 20.1 — EoT Applications, Determinations & Programme Impact</div></div>
        {selectedProject && canManage && (
          <button className="btn btn-primary" onClick={openNew}>+ New EoT Application</button>
        )}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedEot(null); setTab('summary'); }} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total Applications', value: eots.length, icon: '📋', color: '#6366f1' },
              { label: 'Days Claimed', value: `${totalDaysClaimed}d`, icon: '📤', color: '#3b82f6' },
              { label: 'Days Granted', value: `${totalDaysGranted}d`, icon: '✅', color: '#10b981' },
              { label: 'Pending', value: pendingEots.length, icon: '⏳', color: pendingEots.length > 0 ? '#f59e0b' : '#9ca3af' },
              { label: 'Original Completion', value: originalCompletion || '—', icon: '📅', color: '#6366f1' },
              { label: 'Revised Completion', value: revisedCompletion || '—', icon: '📅', color: revisedCompletion !== originalCompletion ? '#f59e0b' : '#10b981' },
            ].map((kpi, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border)', borderLeft: `4px solid ${kpi.color}`, background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kpi.label}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="tabs" style={{ marginBottom: 16 }}>
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>EoT Register ({eots.length})</button>
            <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>Programme Impact</button>
            {selectedEot && <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>EoT No. {selectedEot.eot_no}</button>}
          </div>

          {/* ══════ REGISTER TAB ══════ */}
          {tab === 'summary' && (
            eots.length === 0 ? (
              <div className="card empty-state"><div className="icon">⏱️</div><p>No Extension of Time applications yet</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EoT No.</th>
                      <th>Title</th>
                      <th>FIDIC Clause</th>
                      <th>Event Date</th>
                      <th>Notice</th>
                      <th>Days Claimed</th>
                      <th>Days Granted</th>
                      <th>Revised Completion</th>
                      <th>Status</th>
                      {canManage && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {eots.map(eot => {
                      const timely = noticeTimely(eot);
                      return (
                        <tr key={eot.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedEot(eot); setTab('detail'); }}>
                          <td style={{ fontWeight: 700, fontSize: 16, textAlign: 'center' }}>{eot.eot_no}</td>
                          <td style={{ fontSize: 12, maxWidth: 200 }}>{eot.title}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{eot.fidic_clause || '—'}</td>
                          <td className="text-mono" style={{ fontSize: 11 }}>{eot.event_date || '—'}</td>
                          <td>
                            <span className="text-mono" style={{ fontSize: 11 }}>{eot.notice_date || '—'}</span>
                            {timely !== null && (
                              <div style={{ fontSize: 9, fontWeight: 600, color: timely ? '#10b981' : '#ef4444' }}>
                                {timely ? '✓ Within 28d' : '⚠ Late notice'}
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{eot.days_claimed || '—'}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: eot.days_granted != null ? '#10b981' : 'var(--text-muted)' }}>
                            {eot.days_granted != null ? eot.days_granted : '—'}
                          </td>
                          <td className="text-mono" style={{ fontSize: 11 }}>{eot.revised_completion_date || '—'}</td>
                          <td>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                              fontSize: 10, fontWeight: 700,
                              background: (statusColors[eot.status] || '#9ca3af') + '20',
                              color: statusColors[eot.status] || '#9ca3af',
                            }}>{eot.status}</span>
                          </td>
                          {canManage && (
                            <td onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-sm btn-secondary" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => openEdit(eot)}>Edit</button>
                                <button className="btn btn-sm btn-danger" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => deleteEot(eot)}>×</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {/* Totals */}
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--accent)', background: 'var(--bg-hover)' }}>
                      <td colSpan={5} style={{ textAlign: 'right' }}>TOTALS</td>
                      <td style={{ textAlign: 'center', fontSize: 14 }}>{totalDaysClaimed}d</td>
                      <td style={{ textAlign: 'center', fontSize: 14, color: '#10b981' }}>{totalDaysGranted}d</td>
                      <td colSpan={canManage ? 3 : 2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ══════ PROGRAMME IMPACT TAB ══════ */}
          {tab === 'timeline' && (
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>📅 Programme Impact — Completion Date Adjustments</h3>

              {originalCompletion ? (
                <div>
                  {/* Visual timeline */}
                  <div style={{ position: 'relative', padding: '20px 0 20px 120px', minHeight: 60 }}>
                    {/* Base line */}
                    <div style={{ position: 'absolute', top: 30, left: 120, right: 20, height: 3, background: 'var(--border)' }} />

                    {/* Original completion */}
                    <div style={{ position: 'absolute', top: 10, left: 120 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#6366f1', border: '3px solid #fff', boxShadow: '0 0 0 2px #6366f1' }} />
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginTop: 20 }}>Original</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{originalCompletion}</div>
                    </div>

                    {/* Revised completion */}
                    {revisedCompletion && revisedCompletion !== originalCompletion && (
                      <div style={{ position: 'absolute', top: 10, right: 20 }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#f59e0b', border: '3px solid #fff', boxShadow: '0 0 0 2px #f59e0b' }} />
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginTop: 20 }}>Revised</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{revisedCompletion}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b' }}>+{totalDaysGranted} days</div>
                      </div>
                    )}
                  </div>

                  {/* EoT breakdown */}
                  <div style={{ marginTop: 30 }}>
                    <h4 style={{ fontSize: 13, margin: '0 0 12px' }}>Granted Extensions Breakdown</h4>
                    {grantedEots.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No extensions granted yet</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {grantedEots.map(eot => (
                          <div key={eot.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px', borderRadius: 'var(--radius)',
                            background: 'var(--bg-hover)',
                          }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: statusColors[eot.status],
                              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: 12, flexShrink: 0,
                            }}>{eot.eot_no}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{eot.title}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{eot.fidic_clause} — {eot.grounds?.substring(0, 60)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>+{eot.days_granted}d</div>
                              {eot.cost_awarded > 0 && <div style={{ fontSize: 10, color: '#f59e0b' }}>+{fmt(eot.cost_awarded)}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Summary box */}
                  <div style={{
                    marginTop: 20, padding: 16, borderRadius: 'var(--radius)',
                    background: 'var(--bg-hover)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Original Contract Period</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{originalCompletion}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total EoT Granted</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: totalDaysGranted > 0 ? '#f59e0b' : 'inherit' }}>{totalDaysGranted} days</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Revised Completion Date</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: revisedCompletion !== originalCompletion ? '#f59e0b' : '#10b981' }}>{revisedCompletion || originalCompletion}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Set the project's completion date to see programme impact</div>
              )}
            </div>
          )}

          {/* ══════ DETAIL TAB ══════ */}
          {tab === 'detail' && selectedEot && (() => {
            const eot = selectedEot;
            const timely = noticeTimely(eot);
            return (
              <div className="card" style={{ padding: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>EoT No. {eot.eot_no} — {eot.title}</h3>
                    <div className="text-sm text-muted">FIDIC {eot.fidic_clause || '8.4'} — {eot.grounds?.substring(0, 80)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {canManage && <button className="btn btn-secondary" onClick={() => openEdit(eot)}>✏️ Edit</button>}
                    <span style={{
                      padding: '4px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                      background: (statusColors[eot.status] || '#9ca3af') + '20',
                      color: statusColors[eot.status],
                    }}>{eot.status}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  {/* Left: Dates & Notices */}
                  <div style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius)' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>📅 Key Dates</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 16px', fontSize: 13 }}>
                      <div className="text-muted">Event Date:</div><div className="text-mono">{eot.event_date || '—'}</div>
                      <div className="text-muted">Notice Given:</div>
                      <div>
                        <span className="text-mono">{eot.notice_date || '—'}</span>
                        {timely !== null && (
                          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: timely ? '#10b981' : '#ef4444' }}>
                            {timely ? '✓ Timely (Cl. 20.1)' : '⚠ Late (>28d)'}
                          </span>
                        )}
                      </div>
                      <div className="text-muted">Notice Due (28d):</div><div className="text-mono">{eot.notice_due_date || '—'}</div>
                      <div className="text-muted">Application Submitted:</div><div className="text-mono">{eot.application_date || '—'}</div>
                      <div className="text-muted">Engineer Determination:</div><div className="text-mono">{eot.engineer_determination_date || '—'}</div>
                      {eot.engineer_determination_ref && <><div className="text-muted">Determination Ref:</div><div>{eot.engineer_determination_ref}</div></>}
                    </div>
                  </div>

                  {/* Right: Duration & Cost */}
                  <div style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius)' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>⏱️ Duration & Cost</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 16px', fontSize: 13 }}>
                      <div className="text-muted">Days Claimed:</div><div style={{ fontWeight: 700, fontSize: 16 }}>{eot.days_claimed}d</div>
                      <div className="text-muted">Days Granted:</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: eot.days_granted != null ? '#10b981' : 'var(--text-muted)' }}>
                        {eot.days_granted != null ? `${eot.days_granted}d` : 'Pending'}
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', gridColumn: 'span 2', margin: '4px 0' }} />
                      <div className="text-muted">Original Completion:</div><div className="text-mono">{eot.original_completion_date || '—'}</div>
                      <div className="text-muted">Revised Completion:</div>
                      <div className="text-mono" style={{ fontWeight: 600, color: eot.revised_completion_date ? '#f59e0b' : 'inherit' }}>
                        {eot.revised_completion_date || '—'}
                      </div>
                      {(eot.cost_claimed > 0 || eot.cost_awarded > 0) && (
                        <>
                          <div style={{ borderTop: '1px solid var(--border)', gridColumn: 'span 2', margin: '4px 0' }} />
                          <div className="text-muted">Cost Claimed:</div><div className="text-mono">{fmt(eot.cost_claimed)}</div>
                          <div className="text-muted">Cost Awarded:</div><div className="text-mono" style={{ color: '#10b981', fontWeight: 600 }}>{fmt(eot.cost_awarded)}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details */}
                {(eot.supporting_details || eot.determination_notes || eot.notes) && (
                  <div style={{ marginTop: 16 }}>
                    {eot.supporting_details && (
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Supporting Details</h4>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{eot.supporting_details}</div>
                      </div>
                    )}
                    {eot.determination_notes && (
                      <div style={{ marginBottom: 12 }}>
                        <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Engineer's Determination Notes</h4>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{eot.determination_notes}</div>
                      </div>
                    )}
                    {eot.notes && (
                      <div>
                        <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Notes</h4>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{eot.notes}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}

      {/* ── ADD / EDIT MODAL ── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
            <h3>{editing ? `Edit EoT No. ${editing.eot_no}` : `New EoT Application No. ${form.eot_no}`}<button onClick={() => setShowForm(false)}>×</button></h3>
            <form onSubmit={handleSave}>
              <div className="form-group mb-16">
                <label>Title / Brief Description *</label>
                <input type="text" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Delayed land acquisition at Km 12+400" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div className="form-group mb-16">
                  <label>FIDIC Clause / Grounds *</label>
                  <select value={form.fidic_clause} onChange={e => setForm({ ...form, fidic_clause: e.target.value })}>
                    {EOT_GROUNDS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                </div>
                <div className="form-group mb-16">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group mb-16">
                <label>Detailed Grounds / Cause of Delay *</label>
                <textarea rows={2} required value={form.grounds} onChange={e => setForm({ ...form, grounds: e.target.value })} placeholder="Describe the delay event and entitlement basis..." />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Event Date</label><input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Notice Date (Cl. 20.1)</label><input type="date" value={form.notice_date} onChange={e => setForm({ ...form, notice_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Application Date</label><input type="date" value={form.application_date} onChange={e => setForm({ ...form, application_date: e.target.value })} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Days Claimed *</label><input type="number" required value={form.days_claimed} onChange={e => setForm({ ...form, days_claimed: e.target.value })} placeholder="e.g. 45" /></div>
                <div className="form-group mb-16"><label>Days Granted (by Engineer)</label><input type="number" value={form.days_granted} onChange={e => setForm({ ...form, days_granted: e.target.value })} placeholder="Leave blank if pending" /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Engineer Determination Date</label><input type="date" value={form.engineer_determination_date} onChange={e => setForm({ ...form, engineer_determination_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Determination Reference</label><input type="text" value={form.engineer_determination_ref} onChange={e => setForm({ ...form, engineer_determination_ref: e.target.value })} placeholder="e.g. EOT/DET/003" /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Original Completion Date</label><input type="date" value={form.original_completion_date} onChange={e => setForm({ ...form, original_completion_date: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Revised Completion Date</label><input type="date" value={form.revised_completion_date} onChange={e => setForm({ ...form, revised_completion_date: e.target.value })} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Cost Claimed (KES)</label><input type="number" step="0.01" value={form.cost_claimed} onChange={e => setForm({ ...form, cost_claimed: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Cost Awarded (KES)</label><input type="number" step="0.01" value={form.cost_awarded} onChange={e => setForm({ ...form, cost_awarded: e.target.value })} /></div>
              </div>

              <div className="form-group mb-16"><label>Supporting Details</label><textarea rows={2} value={form.supporting_details} onChange={e => setForm({ ...form, supporting_details: e.target.value })} placeholder="Detailed justification, impact analysis..." /></div>
              <div className="form-group mb-16"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>

              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editing ? '💾 Update EoT' : '⏱️ Submit EoT Application'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
