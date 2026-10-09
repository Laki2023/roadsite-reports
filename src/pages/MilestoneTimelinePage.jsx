import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const MILESTONE_TYPES = [
  'Commencement', 'Programme Milestone', 'Sectional Completion',
  'Substantial Completion', 'DLP Start', 'DLP End', 'Final Completion', 'Custom'
];
const STATUS_OPTIONS = ['Pending', 'Achieved', 'Delayed', 'At Risk'];
const TYPE_ICONS = {
  'Commencement': '\u{1F680}', 'Programme Milestone': '\u{1F3D7}️',
  'Sectional Completion': '\u{1F3C1}', 'Substantial Completion': '\u{1F3C1}',
  'DLP Start': '\u{1F6E1}️', 'DLP End': '\u{1F6E1}️',
  'Final Completion': '⭐', 'Custom': '\u{1F4CC}', 'Defect': '⚠️',
};
const STATUS_COLORS = {
  Achieved: '#22c55e', Pending: '#3b82f6', 'At Risk': '#f59e0b', Delayed: '#ef4444',
};
const STANDARD_MILESTONES = [
  { milestone_type: 'Commencement', title: 'Commencement Date', fidic_clause: 'Cl. 8.1', description: 'Date of commencement of works as defined under FIDIC.' },
  { milestone_type: 'Programme Milestone', title: 'Tests on Completion', fidic_clause: 'Cl. 9.1', description: 'Tests on completion as specified in the contract.' },
  { milestone_type: 'Substantial Completion', title: 'Taking Over', fidic_clause: 'Cl. 10.1', description: 'Taking-over of the works by the Employer.' },
  { milestone_type: 'DLP Start', title: 'DLP Commencement', fidic_clause: 'Cl. 11.1', description: 'Start of Defects Liability Period.' },
  { milestone_type: 'Final Completion', title: 'Performance Certificate', fidic_clause: 'Cl. 11.9', description: 'Issuance of Performance Certificate after DLP.' },
  { milestone_type: 'Final Completion', title: 'Final Payment Certificate', fidic_clause: 'Cl. 14.13', description: 'Final Payment Certificate issued to Contractor.' },
];

const emptyMilestoneForm = {
  milestone_type: 'Programme Milestone', title: '', description: '', planned_date: '',
  revised_date: '', actual_date: '', status: 'Pending', fidic_clause: '',
  responsible_party: '', notes: '',
};
const emptyDefectForm = {
  title: '', description: '', planned_date: '', status: 'Pending',
  responsible_party: '', notes: '',
};

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MilestoneTimelinePage({ profile, showToast, navigateTo, selectedProject }) {
  const [tab, setTab] = useState('timeline');
  const [milestones, setMilestones] = useState([]);
  const [eots, setEots] = useState([]);
  const [guarantees, setGuarantees] = useState([]);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyMilestoneForm });
  const [showDefectModal, setShowDefectModal] = useState(false);
  const [defectForm, setDefectForm] = useState({ ...emptyDefectForm });
  const [editingDefectId, setEditingDefectId] = useState(null);

  const projectId = selectedProject?.id;

  useEffect(() => {
    if (projectId) loadAll();
  }, [projectId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [mRes, eRes, gRes, pRes] = await Promise.all([
        supabase.from('contract_milestones').select('*').eq('project_id', projectId).order('planned_date'),
        supabase.from('eot_applications').select('*').eq('project_id', projectId).order('event_date'),
        supabase.from('guarantee_register').select('*').eq('project_id', projectId),
        supabase.from('projects').select('*').eq('id', projectId).single(),
      ]);
      if (mRes.error) throw mRes.error;
      setMilestones(mRes.data || []);
      setEots(eRes.data || []);
      setGuarantees(gRes.data || []);
      setProject(pRes.data || null);
    } catch (err) {
      showToast('Failed to load milestone data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // --- Derived data ---
  const today = new Date().toISOString().slice(0, 10);
  const actualMilestones = milestones.filter(m => m.milestone_type !== 'Defect');
  const defects = milestones.filter(m => m.milestone_type === 'Defect');
  const dlpStart = milestones.find(m => m.milestone_type === 'DLP Start');
  const dlpEnd = milestones.find(m => m.milestone_type === 'DLP End');

  function computeStatus(m) {
    if (m.status === 'Achieved') return 'Achieved';
    if (m.status === 'Delayed') return 'Delayed';
    if (!m.planned_date) return m.status;
    const planned = new Date(m.planned_date);
    const now = new Date(today);
    if (planned < now) return 'Delayed';
    if (daysBetween(today, m.planned_date) <= 30) return 'At Risk';
    return 'Pending';
  }

  function calcDaysDelay(m) {
    if (!m.planned_date) return 0;
    if (m.actual_date) return Math.max(0, daysBetween(m.planned_date, m.actual_date));
    const planned = new Date(m.planned_date);
    if (planned < new Date(today)) return daysBetween(m.planned_date, today);
    return 0;
  }

  // --- KPI ---
  const kpiTotal = actualMilestones.length;
  const kpiAchieved = actualMilestones.filter(m => computeStatus(m) === 'Achieved').length;
  const kpiAtRisk = actualMilestones.filter(m => computeStatus(m) === 'At Risk').length;
  const kpiDelayed = actualMilestones.filter(m => computeStatus(m) === 'Delayed').length;
  const dlpRemaining = dlpEnd?.planned_date ? Math.max(0, daysBetween(today, dlpEnd.planned_date)) : null;

  // --- CRUD ---
  async function saveMilestone() {
    const payload = {
      ...form, project_id: projectId, created_by: profile?.id,
      days_delay: calcDaysDelay(form),
    };
    try {
      if (editingId) {
        const { error } = await supabase.from('contract_milestones').update(payload).eq('id', editingId);
        if (error) throw error;
        showToast('Milestone updated', 'success');
      } else {
        const { error } = await supabase.from('contract_milestones').insert(payload);
        if (error) throw error;
        showToast('Milestone added', 'success');
      }
      setShowModal(false);
      setEditingId(null);
      setForm({ ...emptyMilestoneForm });
      loadAll();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  }

  async function deleteMilestone(id) {
    if (!confirm('Delete this milestone?')) return;
    const { error } = await supabase.from('contract_milestones').delete().eq('id', id);
    if (error) showToast('Delete failed: ' + error.message, 'error');
    else { showToast('Deleted', 'success'); loadAll(); }
  }

  function openEdit(m) {
    setForm({
      milestone_type: m.milestone_type, title: m.title, description: m.description || '',
      planned_date: m.planned_date || '', revised_date: m.revised_date || '',
      actual_date: m.actual_date || '', status: m.status || 'Pending',
      fidic_clause: m.fidic_clause || '', responsible_party: m.responsible_party || '',
      notes: m.notes || '',
    });
    setEditingId(m.id);
    setShowModal(true);
  }

  async function generateStandard() {
    const existing = actualMilestones.map(m => m.title);
    const toInsert = STANDARD_MILESTONES.filter(s => !existing.includes(s.title))
      .map(s => ({ ...s, project_id: projectId, status: 'Pending', created_by: profile?.id }));
    if (!toInsert.length) { showToast('Standard milestones already exist', 'info'); return; }
    const { error } = await supabase.from('contract_milestones').insert(toInsert);
    if (error) showToast('Failed: ' + error.message, 'error');
    else { showToast(`${toInsert.length} standard milestones created`, 'success'); loadAll(); }
  }

  // --- Defect CRUD ---
  async function saveDefect() {
    const payload = {
      ...defectForm, milestone_type: 'Defect', project_id: projectId,
      created_by: profile?.id, days_delay: 0,
    };
    try {
      if (editingDefectId) {
        const { error } = await supabase.from('contract_milestones').update(payload).eq('id', editingDefectId);
        if (error) throw error;
        showToast('Defect updated', 'success');
      } else {
        const { error } = await supabase.from('contract_milestones').insert(payload);
        if (error) throw error;
        showToast('Defect added', 'success');
      }
      setShowDefectModal(false);
      setEditingDefectId(null);
      setDefectForm({ ...emptyDefectForm });
      loadAll();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    }
  }

  async function deleteDefect(id) {
    if (!confirm('Delete this defect?')) return;
    const { error } = await supabase.from('contract_milestones').delete().eq('id', id);
    if (error) showToast('Delete failed: ' + error.message, 'error');
    else { showToast('Deleted', 'success'); loadAll(); }
  }

  // --- No project guard ---
  if (!projectId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ marginBottom: 8 }}>Contract Milestone Timeline</h2>
        <p>Please select a project to view milestones.</p>
      </div>
    );
  }

  // --- Styles ---
  const s = {
    page: { padding: '24px 16px', maxWidth: 1200, margin: '0 auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    title: { fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 },
    tabs: { display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 },
    tab: (active) => ({
      padding: '10px 20px', cursor: 'pointer', fontWeight: active ? 600 : 400,
      color: active ? 'var(--accent)' : 'var(--text-muted)', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      marginBottom: -2, background: 'none', border: 'none', fontSize: 14, transition: 'color 0.2s',
    }),
    card: {
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius, 8px)',
      padding: 16, marginBottom: 16,
    },
    kpiRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
    kpi: (color) => ({
      flex: '1 1 140px', background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 8px)', padding: '14px 16px', textAlign: 'center',
      borderTop: `3px solid ${color}`,
    }),
    kpiVal: { fontSize: 28, fontWeight: 700, margin: 0 },
    kpiLabel: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 },
    btn: (variant) => ({
      padding: '8px 16px', borderRadius: 'var(--radius, 6px)', border: 'none', cursor: 'pointer',
      fontWeight: 600, fontSize: 13, transition: 'opacity 0.2s',
      background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? '#ef4444' : 'var(--border)',
      color: variant === 'primary' || variant === 'danger' ? '#fff' : 'var(--text)',
    }),
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid var(--border)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' },
    td: { padding: '10px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text)', verticalAlign: 'top' },
    badge: (color) => ({
      display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 11,
      fontWeight: 600, background: color + '22', color: color, whiteSpace: 'nowrap',
    }),
    overlay: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
    },
    modal: {
      background: 'var(--card)', borderRadius: 'var(--radius, 10px)', padding: 24,
      maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto',
      border: '1px solid var(--border)',
    },
    formGroup: { marginBottom: 14 },
    label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 },
    input: {
      width: '100%', padding: '8px 10px', borderRadius: 'var(--radius, 6px)',
      border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
      fontSize: 13, boxSizing: 'border-box',
    },
    select: {
      width: '100%', padding: '8px 10px', borderRadius: 'var(--radius, 6px)',
      border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
    },
  };

  // ==================== TIMELINE TAB ====================
  function renderTimeline() {
    const allDates = [];
    actualMilestones.forEach(m => { if (m.planned_date) allDates.push(new Date(m.planned_date)); if (m.actual_date) allDates.push(new Date(m.actual_date)); });
    if (project?.start_date) allDates.push(new Date(project.start_date));
    if (project?.end_date) allDates.push(new Date(project.end_date));
    if (!allDates.length) {
      return <div style={{ ...s.card, textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>No milestones to display. Add milestones in the Register tab.</div>;
    }
    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));
    const spanDays = Math.max(daysBetween(minDate.toISOString(), maxDate.toISOString()), 30);
    const timelineWidth = Math.max(800, spanDays * 3);
    const pxPerDay = timelineWidth / spanDays;

    function dateToX(d) {
      return daysBetween(minDate.toISOString(), d) * pxPerDay;
    }

    const todayX = dateToX(today);
    const trackY = 90;

    const grantedEots = eots.filter(e => e.status === 'Approved' || e.days_granted > 0);
    const activeGuarantees = guarantees.filter(g => g.expiry_date);

    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>Project: <strong style={{ color: 'var(--text)' }}>{project?.name || '-'}</strong></span>
          <span>{fmtDate(project?.start_date)} &mdash; {fmtDate(project?.end_date)}</span>
        </div>
        <div style={{ ...s.card, overflowX: 'auto', padding: '20px 16px' }}>
          <svg width={timelineWidth + 60} height={220} style={{ display: 'block', minWidth: timelineWidth + 60 }}>
            {/* Main track line */}
            <line x1={30} y1={trackY} x2={timelineWidth + 30} y2={trackY} stroke="var(--border)" strokeWidth={3} />

            {/* Today marker */}
            {todayX >= 0 && todayX <= timelineWidth && (
              <g>
                <line x1={todayX + 30} y1={20} x2={todayX + 30} y2={200} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6,4" />
                <text x={todayX + 30} y={14} textAnchor="middle" fontSize={10} fill="var(--accent)" fontWeight={600}>TODAY</text>
              </g>
            )}

            {/* EoT extension arrows */}
            {grantedEots.map((e, i) => {
              if (!e.original_completion_date || !e.revised_completion_date) return null;
              const x1 = dateToX(e.original_completion_date) + 30;
              const x2 = dateToX(e.revised_completion_date) + 30;
              const ey = trackY + 40 + (i % 3) * 18;
              return (
                <g key={`eot-${i}`}>
                  <line x1={x1} y1={ey} x2={x2} y2={ey} stroke="#8b5cf6" strokeWidth={2} markerEnd="url(#arrowhead)" />
                  <text x={(x1 + x2) / 2} y={ey - 4} textAnchor="middle" fontSize={9} fill="#8b5cf6">
                    EoT #{e.eot_no} (+{e.days_granted || e.days_claimed}d)
                  </text>
                </g>
              );
            })}
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#8b5cf6" />
              </marker>
            </defs>

            {/* Guarantee diamonds */}
            {activeGuarantees.map((g, i) => {
              const gx = dateToX(g.extended_to || g.expiry_date) + 30;
              const gy = trackY - 50 - (i % 2) * 22;
              return (
                <g key={`g-${i}`}>
                  <polygon points={`${gx},${gy - 8} ${gx + 8},${gy} ${gx},${gy + 8} ${gx - 8},${gy}`} fill="#a855f7" opacity={0.8} />
                  <text x={gx} y={gy + 20} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{g.guarantee_type}</text>
                </g>
              );
            })}

            {/* Milestone nodes */}
            {actualMilestones.map((m, i) => {
              if (!m.planned_date) return null;
              const mx = dateToX(m.planned_date) + 30;
              const above = i % 2 === 0;
              const my = above ? trackY - 22 : trackY + 22;
              const st = computeStatus(m);
              const color = STATUS_COLORS[st] || '#999';
              const icon = TYPE_ICONS[m.milestone_type] || '\u{1F4CC}';
              const isSelected = selectedNode?.id === m.id;
              return (
                <g key={m.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedNode(isSelected ? null : m)}>
                  {/* Connector line */}
                  <line x1={mx} y1={trackY} x2={mx} y2={my} stroke={color} strokeWidth={1.5} />
                  {/* Circle node */}
                  <circle cx={mx} cy={my} r={isSelected ? 16 : 13} fill={color} opacity={isSelected ? 1 : 0.85}
                    stroke={isSelected ? '#fff' : 'none'} strokeWidth={isSelected ? 2 : 0}
                  />
                  {/* Icon */}
                  <text x={mx} y={my + 5} textAnchor="middle" fontSize={12}>{icon}</text>
                  {/* Label */}
                  <text x={mx} y={above ? my - 20 : my + 28} textAnchor="middle" fontSize={10}
                    fill="var(--text)" fontWeight={500} style={{ maxWidth: 80 }}>
                    {m.title?.length > 18 ? m.title.slice(0, 16) + '..' : m.title}
                  </text>
                  <text x={mx} y={above ? my - 10 : my + 38} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                    {fmtDate(m.planned_date)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            {Object.entries(STATUS_COLORS).map(([k, c]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />{k}
              </span>
            ))}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, background: '#a855f7', transform: 'rotate(45deg)', display: 'inline-block' }} />Guarantee Expiry
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 16, height: 2, background: '#8b5cf6', display: 'inline-block' }} />&rarr; EoT Extension
            </span>
          </div>
        </div>

        {/* Selected node detail card */}
        {selectedNode && (
          <div style={{ ...s.card, marginTop: 4, borderLeft: `4px solid ${STATUS_COLORS[computeStatus(selectedNode)]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {TYPE_ICONS[selectedNode.milestone_type]} {selectedNode.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{selectedNode.milestone_type}</div>
              </div>
              <span style={s.badge(STATUS_COLORS[computeStatus(selectedNode)])}>{computeStatus(selectedNode)}</span>
            </div>
            {selectedNode.description && <p style={{ fontSize: 13, color: 'var(--text)', margin: '10px 0 0' }}>{selectedNode.description}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Planned:</span> <strong>{fmtDate(selectedNode.planned_date)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Revised:</span> <strong>{fmtDate(selectedNode.revised_date)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Actual:</span> <strong>{fmtDate(selectedNode.actual_date)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Days Delay:</span> <strong>{calcDaysDelay(selectedNode)}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>FIDIC Clause:</span> <strong>{selectedNode.fidic_clause || '-'}</strong></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Responsible:</span> <strong>{selectedNode.responsible_party || '-'}</strong></div>
            </div>
            {selectedNode.linked_eot_id && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Linked EoT ID: {selectedNode.linked_eot_id}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==================== MILESTONES REGISTER TAB ====================
  function renderRegister() {
    return (
      <div>
        {/* KPI Row */}
        <div style={s.kpiRow}>
          <div style={s.kpi('#3b82f6')}><div style={s.kpiVal}>{kpiTotal}</div><div style={s.kpiLabel}>Total Milestones</div></div>
          <div style={s.kpi('#22c55e')}><div style={{ ...s.kpiVal, color: '#22c55e' }}>{kpiAchieved}</div><div style={s.kpiLabel}>Achieved</div></div>
          <div style={s.kpi('#f59e0b')}><div style={{ ...s.kpiVal, color: '#f59e0b' }}>{kpiAtRisk}</div><div style={s.kpiLabel}>At Risk</div></div>
          <div style={s.kpi('#ef4444')}><div style={{ ...s.kpiVal, color: '#ef4444' }}>{kpiDelayed}</div><div style={s.kpiLabel}>Delayed</div></div>
          <div style={s.kpi('#8b5cf6')}><div style={{ ...s.kpiVal, color: '#8b5cf6' }}>{dlpRemaining !== null ? dlpRemaining : '-'}</div><div style={s.kpiLabel}>DLP Days Left</div></div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button style={s.btn('primary')} onClick={() => { setForm({ ...emptyMilestoneForm }); setEditingId(null); setShowModal(true); }}>+ Add Milestone</button>
          <button style={s.btn()} onClick={generateStandard}>Generate Standard Milestones</button>
        </div>

        {/* Table */}
        <div style={{ ...s.card, overflowX: 'auto', padding: 0 }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Type</th><th style={s.th}>Title</th><th style={s.th}>Planned</th>
                <th style={s.th}>Revised</th><th style={s.th}>Actual</th><th style={s.th}>Delay</th>
                <th style={s.th}>Status</th><th style={s.th}>Responsible</th><th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {actualMilestones.length === 0 && (
                <tr><td colSpan={9} style={{ ...s.td, textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No milestones yet.</td></tr>
              )}
              {actualMilestones.map(m => {
                const st = computeStatus(m);
                return (
                  <tr key={m.id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={s.td}><span title={m.milestone_type}>{TYPE_ICONS[m.milestone_type] || '\u{1F4CC}'}</span></td>
                    <td style={{ ...s.td, fontWeight: 500, maxWidth: 200 }}>{m.title}</td>
                    <td style={s.td}>{fmtDate(m.planned_date)}</td>
                    <td style={s.td}>{fmtDate(m.revised_date)}</td>
                    <td style={s.td}>{fmtDate(m.actual_date)}</td>
                    <td style={s.td}>{calcDaysDelay(m) > 0 ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{calcDaysDelay(m)}d</span> : '-'}</td>
                    <td style={s.td}><span style={s.badge(STATUS_COLORS[st])}>{st}</span></td>
                    <td style={s.td}>{m.responsible_party || '-'}</td>
                    <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(m)} style={{ ...s.btn(), padding: '4px 10px', marginRight: 4, fontSize: 12 }}>Edit</button>
                      <button onClick={() => deleteMilestone(m.id)} style={{ ...s.btn('danger'), padding: '4px 10px', fontSize: 12 }}>Del</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ==================== DLP TRACKER TAB ====================
  function renderDLP() {
    const dlpStartDate = dlpStart?.actual_date || dlpStart?.planned_date;
    const dlpEndDate = dlpEnd?.actual_date || dlpEnd?.planned_date;
    const dlpTotalDays = dlpStartDate && dlpEndDate ? daysBetween(dlpStartDate, dlpEndDate) : null;
    const dlpElapsedDays = dlpStartDate ? Math.max(0, daysBetween(dlpStartDate, today)) : 0;
    const dlpRemainingDays = dlpEndDate ? Math.max(0, daysBetween(today, dlpEndDate)) : null;
    const dlpPct = dlpTotalDays ? Math.min(100, Math.round((dlpElapsedDays / dlpTotalDays) * 100)) : 0;
    const dlpColor = dlpRemainingDays === null ? '#999' : dlpRemainingDays > 90 ? '#22c55e' : dlpRemainingDays > 30 ? '#f59e0b' : '#ef4444';

    return (
      <div>
        {/* DLP Summary Card */}
        <div style={{ ...s.card, borderTop: `4px solid ${dlpColor}` }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: 'var(--text)' }}>Defects Liability Period</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>DLP Start</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtDate(dlpStartDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>DLP End</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{fmtDate(dlpEndDate)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Days Remaining</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: dlpColor }}>{dlpRemainingDays !== null ? dlpRemainingDays : '-'}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total DLP Days</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{dlpTotalDays || '-'}</div>
            </div>
          </div>

          {/* Progress bar */}
          {dlpTotalDays && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>{dlpPct}% elapsed</span>
                <span>{dlpRemainingDays} days left</span>
              </div>
              <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${dlpPct}%`, height: '100%', background: dlpColor, borderRadius: 5, transition: 'width 0.4s' }} />
              </div>
            </div>
          )}

          {!dlpStartDate && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 0' }}>
              DLP dates not set. Add "DLP Start" and "DLP End" milestones in the Register tab.
            </p>
          )}
        </div>

        {/* Countdown badge */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 20px' }}>
          <div style={{
            background: dlpColor + '18', border: `2px solid ${dlpColor}`, borderRadius: 12,
            padding: '12px 32px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: dlpColor }}>{dlpRemainingDays !== null ? dlpRemainingDays : '--'}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: dlpColor, textTransform: 'uppercase', letterSpacing: 1 }}>Days to DLP End</div>
          </div>
        </div>

        {/* Defects Table */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text)' }}>Outstanding Defects</h3>
          <button style={s.btn('primary')} onClick={() => { setDefectForm({ ...emptyDefectForm }); setEditingDefectId(null); setShowDefectModal(true); }}>
            + Add Defect
          </button>
        </div>
        <div style={{ ...s.card, overflowX: 'auto', padding: 0 }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Item</th><th style={s.th}>Location / Chainage</th>
                <th style={s.th}>Reported</th><th style={s.th}>Status</th>
                <th style={s.th}>Responsible</th><th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defects.length === 0 && (
                <tr><td colSpan={6} style={{ ...s.td, textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>No defects recorded.</td></tr>
              )}
              {defects.map(d => (
                <tr key={d.id}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...s.td, fontWeight: 500 }}>{d.title}</td>
                  <td style={s.td}>{d.description || '-'}</td>
                  <td style={s.td}>{fmtDate(d.planned_date)}</td>
                  <td style={s.td}>
                    <span style={s.badge(d.status === 'Achieved' ? '#22c55e' : d.status === 'Delayed' ? '#ef4444' : '#f59e0b')}>
                      {d.status === 'Achieved' ? 'Rectified' : d.status}
                    </span>
                  </td>
                  <td style={s.td}>{d.responsible_party || '-'}</td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <button onClick={() => {
                      setDefectForm({ title: d.title, description: d.description || '', planned_date: d.planned_date || '', status: d.status || 'Pending', responsible_party: d.responsible_party || '', notes: d.notes || '' });
                      setEditingDefectId(d.id);
                      setShowDefectModal(true);
                    }} style={{ ...s.btn(), padding: '4px 10px', marginRight: 4, fontSize: 12 }}>Edit</button>
                    <button onClick={() => deleteDefect(d.id)} style={{ ...s.btn('danger'), padding: '4px 10px', fontSize: 12 }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ==================== MODALS ====================
  function renderMilestoneModal() {
    if (!showModal) return null;
    return (
      <div style={s.overlay} onClick={() => setShowModal(false)}>
        <div style={s.modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text)' }}>
            {editingId ? 'Edit Milestone' : 'Add Milestone'}
          </h3>
          <div style={s.formGroup}>
            <label style={s.label}>Milestone Type</label>
            <select style={s.select} value={form.milestone_type} onChange={e => setForm({ ...form, milestone_type: e.target.value })}>
              {MILESTONE_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
            </select>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Title *</label>
            <input style={s.input} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Taking Over Certificate" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Description</label>
            <textarea style={{ ...s.input, minHeight: 60, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Planned Date</label>
              <input type="date" style={s.input} value={form.planned_date} onChange={e => setForm({ ...form, planned_date: e.target.value })} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Revised Date</label>
              <input type="date" style={s.input} value={form.revised_date} onChange={e => setForm({ ...form, revised_date: e.target.value })} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Actual Date</label>
              <input type="date" style={s.input} value={form.actual_date} onChange={e => setForm({ ...form, actual_date: e.target.value })} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Status</label>
              <select style={s.select} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={s.formGroup}>
              <label style={s.label}>FIDIC Clause</label>
              <input style={s.input} value={form.fidic_clause} onChange={e => setForm({ ...form, fidic_clause: e.target.value })} placeholder="e.g. Cl. 10.1" />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Responsible Party</label>
              <input style={s.input} value={form.responsible_party} onChange={e => setForm({ ...form, responsible_party: e.target.value })} placeholder="e.g. Contractor" />
            </div>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={s.btn()} onClick={() => setShowModal(false)}>Cancel</button>
            <button style={s.btn('primary')} onClick={saveMilestone} disabled={!form.title}>
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderDefectModal() {
    if (!showDefectModal) return null;
    return (
      <div style={s.overlay} onClick={() => setShowDefectModal(false)}>
        <div style={s.modal} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--text)' }}>
            {editingDefectId ? 'Edit Defect' : 'Add Defect'}
          </h3>
          <div style={s.formGroup}>
            <label style={s.label}>Defect Item *</label>
            <input style={s.input} value={defectForm.title} onChange={e => setDefectForm({ ...defectForm, title: e.target.value })} placeholder="e.g. Pavement cracking" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Location / Chainage</label>
            <input style={s.input} value={defectForm.description} onChange={e => setDefectForm({ ...defectForm, description: e.target.value })} placeholder="e.g. Km 12+300 to 12+450 LHS" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={s.formGroup}>
              <label style={s.label}>Reported Date</label>
              <input type="date" style={s.input} value={defectForm.planned_date} onChange={e => setDefectForm({ ...defectForm, planned_date: e.target.value })} />
            </div>
            <div style={s.formGroup}>
              <label style={s.label}>Status</label>
              <select style={s.select} value={defectForm.status} onChange={e => setDefectForm({ ...defectForm, status: e.target.value })}>
                <option value="Pending">Pending</option>
                <option value="Achieved">Rectified</option>
                <option value="Delayed">Overdue</option>
              </select>
            </div>
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Responsible Party</label>
            <input style={s.input} value={defectForm.responsible_party} onChange={e => setDefectForm({ ...defectForm, responsible_party: e.target.value })} placeholder="e.g. Main Contractor" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Notes</label>
            <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} value={defectForm.notes} onChange={e => setDefectForm({ ...defectForm, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={s.btn()} onClick={() => setShowDefectModal(false)}>Cancel</button>
            <button style={s.btn('primary')} onClick={saveDefect} disabled={!defectForm.title}>
              {editingDefectId ? 'Update' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== MAIN RENDER ====================
  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Contract Milestone Timeline</h1>
        {project && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{project.name}</span>}
      </div>

      <div style={s.tabs}>
        <button style={s.tab(tab === 'timeline')} onClick={() => setTab('timeline')}>Timeline</button>
        <button style={s.tab(tab === 'register')} onClick={() => setTab('register')}>Milestones Register</button>
        <button style={s.tab(tab === 'dlp')} onClick={() => setTab('dlp')}>DLP Tracker</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>Loading...</div>
        </div>
      ) : (
        <>
          {tab === 'timeline' && renderTimeline()}
          {tab === 'register' && renderRegister()}
          {tab === 'dlp' && renderDLP()}
        </>
      )}

      {renderMilestoneModal()}
      {renderDefectModal()}
    </div>
  );
}
