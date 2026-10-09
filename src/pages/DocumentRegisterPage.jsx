import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DOC_TYPES = [
  'Letter', 'Memo', 'Site Instruction', 'Variation Order',
  'Notice', 'RFI', 'NCR', 'Claim', 'Other'
];

const DOC_ICONS = {
  Letter: '✉️', Memo: '📝', 'Site Instruction': '📜',
  'Variation Order': '🔄', Notice: '📢', RFI: '❓',
  NCR: '❌', Claim: '⚖️', Other: '📎'
};

const DIRECTIONS = ['Incoming', 'Outgoing'];
const PARTIES = ['Engineer', 'Contractor', 'Employer', 'Subcontractor'];
const STATUSES = ['Open', 'Responded', 'Closed', 'Overdue'];
const PRIORITIES = ['Normal', 'Urgent', 'Critical'];

const STATUS_COLORS = {
  Open: { bg: '#dbeafe', text: '#1d4ed8' },
  Responded: { bg: '#dcfce7', text: '#15803d' },
  Closed: { bg: '#f3f4f6', text: '#6b7280' },
  Overdue: { bg: '#fef2f2', text: '#dc2626' },
};

const PRIORITY_STYLES = {
  Normal: { bg: '#f3f4f6', text: '#6b7280' },
  Urgent: { bg: '#fef3c7', text: '#d97706' },
  Critical: { bg: '#fef2f2', text: '#dc2626' },
};

const PARTY_COLORS = {
  Engineer: '#3b82f6',
  Contractor: '#f59e0b',
  Employer: '#10b981',
  Subcontractor: '#8b5cf6',
};

const TEMPLATES = [
  { key: 'payment_cert', label: 'Payment Certificate Transmittal (Cl. 14.6)', type: 'Letter', clause: '14.6',
    subject: 'Transmittal of Interim Payment Certificate No. [IPC_NO]',
    body: 'Dear Sir,\n\nWe hereby transmit Interim Payment Certificate No. [IPC_NO] for the period ending [DATE].\n\nThe certified amount is [CURRENCY] [AMOUNT].\n\nPlease arrange payment within the time prescribed under Sub-Clause 14.7 of the Conditions of Contract.\n\nYours faithfully,' },
  { key: 'eot_notice', label: 'Extension of Time Notice (Cl. 20.1)', type: 'Notice', clause: '20.1',
    subject: 'Notice of Claim for Extension of Time',
    body: 'Dear Sir,\n\nIn accordance with Sub-Clause 20.1 of the Conditions of Contract, we hereby give notice of our intention to claim an extension of the Time for Completion.\n\nThe event or circumstance giving rise to this claim is:\n[DESCRIBE EVENT]\n\nThe anticipated effect on the programme is [DAYS] days.\n\nA fully detailed claim shall be submitted within 42 days of the Contractor becoming aware of the event.\n\nYours faithfully,' },
  { key: 'delay_notice', label: 'Delay Notice (Cl. 8.4)', type: 'Notice', clause: '8.4',
    subject: 'Notification of Delay',
    body: 'Dear Sir,\n\nWe hereby notify you that the progress of the Works is being delayed by the following circumstances:\n\n[DESCRIBE DELAY CAUSE]\n\nThis delay is affecting the following activities on the approved programme:\n[LIST ACTIVITIES]\n\nWe request your urgent attention to this matter.\n\nYours faithfully,' },
  { key: 'variation', label: 'Variation Instruction (Cl. 13.1)', type: 'Variation Order', clause: '13.1',
    subject: 'Variation Instruction No. [VO_NO]',
    body: 'Dear Sir,\n\nPursuant to Sub-Clause 13.1 of the Conditions of Contract, you are hereby instructed to carry out the following variation to the Works:\n\nDescription:\n[DESCRIBE VARIATION]\n\nLocation/Chainage:\n[LOCATION]\n\nThe Contractor shall submit a quotation in accordance with Sub-Clause 13.3.\n\nYours faithfully,' },
  { key: 'ncr', label: 'Non-Conformance Report', type: 'NCR', clause: '',
    subject: 'Non-Conformance Report - [DESCRIPTION]',
    body: 'NCR Reference: [REF]\nDate of Observation: [DATE]\nLocation/Chainage: [LOCATION]\n\n1. Description of Non-Conformance:\n[DESCRIBE]\n\n2. Specification/Drawing Reference:\n[REFERENCE]\n\n3. Proposed Corrective Action:\n[ACTION]\n\n4. Deadline for Correction:\n[DEADLINE]\n\nThis NCR must be closed out before the affected work can be accepted.' },
  { key: 'rfi', label: 'Request for Information', type: 'RFI', clause: '',
    subject: 'Request for Information - [TOPIC]',
    body: 'Dear Sir,\n\nWe request clarification on the following matter:\n\n[DESCRIBE INFORMATION REQUIRED]\n\nDrawing/Specification Reference: [REFERENCE]\nLocation/Chainage: [LOCATION]\n\nA response is required by [DATE] to avoid delay to the Works.\n\nYours faithfully,' },
  { key: 'taking_over', label: 'Taking Over Certificate (Cl. 10.1)', type: 'Letter', clause: '10.1',
    subject: 'Taking Over Certificate',
    body: 'Dear Sir,\n\nIn accordance with Sub-Clause 10.1 of the Conditions of Contract, we hereby certify that the Works (or Section) described below were substantially completed on [DATE] and are taken over by the Employer.\n\nDescription: [SECTION]\nCompletion Date: [DATE]\n\nOutstanding items (if any) are listed in the attached schedule and shall be completed within [DAYS] days.\n\nYours faithfully,' },
];

const TYPE_PREFIXES = {
  Letter: 'LTR', Memo: 'MEM', 'Site Instruction': 'SI', 'Variation Order': 'VO',
  Notice: 'NOT', RFI: 'RFI', NCR: 'NCR', Claim: 'CLM', Other: 'DOC',
};

const today = () => new Date().toISOString().split('T')[0];

function isOverdue(doc) {
  if (!doc.response_required) return false;
  if (doc.response_received_date) return false;
  if (!doc.response_due_date) return false;
  return new Date(doc.response_due_date) < new Date();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  return Math.floor((new Date() - new Date(dateStr)) / 86400000);
}

const emptyForm = {
  doc_type: 'Letter', direction: 'Outgoing', reference_no: '', subject: '',
  from_party: '', to_party: '', date_sent: today(), date_received: '',
  response_required: false, response_due_date: '', response_received_date: '',
  ball_in_court: 'Engineer', status: 'Open', priority: 'Normal',
  fidic_clause: '', linked_ipc_no: '', linked_eot_no: '',
  summary: '', notes: '', file_url: '',
};

export default function DocumentRegisterPage({ profile, showToast, navigateTo, selectedProject }) {
  const [tab, setTab] = useState('register');
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterDirection, setFilterDirection] = useState('');
  const [filterBIC, setFilterBIC] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Draft tab
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [draftForm, setDraftForm] = useState({ ...emptyForm });

  useEffect(() => {
    if (selectedProject?.id) loadDocs();
  }, [selectedProject]);

  async function loadDocs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('correspondence')
      .select('*')
      .eq('project_id', selectedProject.id)
      .order('created_at', { ascending: false });
    if (error) showToast?.(error.message, 'error');
    setDocs(data || []);
    setLoading(false);
  }

  // Compute effective status (auto-overdue)
  function effectiveStatus(doc) {
    if (doc.status === 'Closed' || doc.status === 'Responded') return doc.status;
    if (isOverdue(doc)) return 'Overdue';
    return doc.status;
  }

  // Filtered docs
  const filtered = docs.map(d => ({ ...d, _status: effectiveStatus(d) })).filter(d => {
    if (filterType && d.doc_type !== filterType) return false;
    if (filterDirection && d.direction !== filterDirection) return false;
    if (filterBIC && d.ball_in_court !== filterBIC) return false;
    if (filterStatus && d._status !== filterStatus) return false;
    if (filterDateFrom && d.date_sent < filterDateFrom) return false;
    if (filterDateTo && d.date_sent > filterDateTo) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(d.reference_no || '').toLowerCase().includes(q) &&
          !(d.subject || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // KPIs
  const allWithStatus = docs.map(d => ({ ...d, _status: effectiveStatus(d) }));
  const kpis = {
    total: docs.length,
    open: allWithStatus.filter(d => d._status === 'Open').length,
    overdue: allWithStatus.filter(d => d._status === 'Overdue').length,
    bicEngineer: allWithStatus.filter(d => d.ball_in_court === 'Engineer' && d._status !== 'Closed').length,
    bicContractor: allWithStatus.filter(d => d.ball_in_court === 'Contractor' && d._status !== 'Closed').length,
    bicEmployer: allWithStatus.filter(d => d.ball_in_court === 'Employer' && d._status !== 'Closed').length,
  };

  function openNew() {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  }

  function openEdit(doc) {
    setEditing(doc);
    setForm({
      doc_type: doc.doc_type || 'Letter',
      direction: doc.direction || 'Outgoing',
      reference_no: doc.reference_no || '',
      subject: doc.subject || '',
      from_party: doc.from_party || '',
      to_party: doc.to_party || '',
      date_sent: doc.date_sent || '',
      date_received: doc.date_received || '',
      response_required: doc.response_required || false,
      response_due_date: doc.response_due_date || '',
      response_received_date: doc.response_received_date || '',
      ball_in_court: doc.ball_in_court || 'Engineer',
      status: doc.status || 'Open',
      priority: doc.priority || 'Normal',
      fidic_clause: doc.fidic_clause || '',
      linked_ipc_no: doc.linked_ipc_no || '',
      linked_eot_no: doc.linked_eot_no || '',
      summary: doc.summary || '',
      notes: doc.notes || '',
      file_url: doc.file_url || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.reference_no || !form.subject) {
      showToast?.('Reference No and Subject are required', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      project_id: selectedProject.id,
      response_due_date: form.response_due_date || null,
      response_received_date: form.response_received_date || null,
      date_received: form.date_received || null,
      linked_ipc_no: form.linked_ipc_no || null,
      linked_eot_no: form.linked_eot_no || null,
      file_url: form.file_url || null,
    };
    if (editing) {
      payload.updated_at = new Date().toISOString();
      const { error } = await supabase.from('correspondence').update(payload).eq('id', editing.id);
      if (error) { showToast?.(error.message, 'error'); setSaving(false); return; }
      showToast?.('Document updated successfully', 'success');
    } else {
      payload.created_by = profile?.id || null;
      payload.created_at = new Date().toISOString();
      const { error } = await supabase.from('correspondence').insert(payload);
      if (error) { showToast?.(error.message, 'error'); setSaving(false); return; }
      showToast?.('Document registered successfully', 'success');
    }
    setSaving(false);
    setShowModal(false);
    loadDocs();
  }

  // Template selection for drafts
  async function handleTemplateSelect(key) {
    setSelectedTemplate(key);
    if (!key) return;
    const tpl = TEMPLATES.find(t => t.key === key);
    if (!tpl) return;

    // Auto-generate reference number
    const prefix = TYPE_PREFIXES[tpl.type] || 'DOC';
    const projectCode = selectedProject?.project_code || selectedProject?.name?.substring(0, 6)?.toUpperCase() || 'PRJ';
    const { count } = await supabase
      .from('correspondence')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', selectedProject.id)
      .eq('doc_type', tpl.type);
    const nextNum = String((count || 0) + 1).padStart(3, '0');
    const refNo = `${projectCode}/${prefix}/${nextNum}`;

    setDraftForm({
      ...emptyForm,
      doc_type: tpl.type,
      direction: 'Outgoing',
      reference_no: refNo,
      subject: tpl.subject,
      from_party: 'Engineer',
      to_party: tpl.type === 'NCR' ? 'Contractor' : 'Contractor',
      date_sent: today(),
      fidic_clause: tpl.clause,
      ball_in_court: 'Contractor',
      response_required: true,
      response_due_date: '',
      summary: tpl.body,
      status: 'Open',
      priority: 'Normal',
    });
  }

  async function saveDraft() {
    if (!draftForm.reference_no || !draftForm.subject) {
      showToast?.('Reference No and Subject are required', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      ...draftForm,
      project_id: selectedProject.id,
      created_by: profile?.id || null,
      created_at: new Date().toISOString(),
      status: 'Open',
      response_due_date: draftForm.response_due_date || null,
      response_received_date: null,
      date_received: null,
      linked_ipc_no: draftForm.linked_ipc_no || null,
      linked_eot_no: draftForm.linked_eot_no || null,
      file_url: null,
    };
    const { error } = await supabase.from('correspondence').insert(payload);
    if (error) { showToast?.(error.message, 'error'); setSaving(false); return; }
    showToast?.('Draft saved and registered', 'success');
    setSaving(false);
    setSelectedTemplate('');
    setDraftForm({ ...emptyForm });
    loadDocs();
  }

  // Guard: no project
  if (!selectedProject?.id) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Document Register & Correspondence</h2>
        <p style={{ marginTop: 12 }}>Please select a project to view the document register.</p>
      </div>
    );
  }

  const tabStyle = (t) => ({
    padding: '10px 20px',
    cursor: 'pointer',
    borderBottom: tab === t ? '3px solid var(--accent)' : '3px solid transparent',
    fontWeight: tab === t ? 600 : 400,
    color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
    background: 'none',
    border: 'none',
    fontSize: 14,
    transition: 'all 0.2s',
  });

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text)' }}>Document Register & Correspondence</h2>
        {tab === 'register' && (
          <button onClick={openNew} style={btnStyle('var(--accent)', '#fff')}>+ New Document</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
        <button style={tabStyle('register')} onClick={() => setTab('register')}>Register</button>
        <button style={tabStyle('bic')} onClick={() => setTab('bic')}>Ball in Court</button>
        <button style={tabStyle('draft')} onClick={() => setTab('draft')}>Draft Correspondence</button>
      </div>

      {tab === 'register' && renderRegisterTab()}
      {tab === 'bic' && renderBallInCourtTab()}
      {tab === 'draft' && renderDraftTab()}

      {showModal && renderModal()}
    </div>
  );

  /* ========== TAB 1: Register ========== */
  function renderRegisterTab() {
    return (
      <>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <KpiCard label="Total Documents" value={kpis.total} color="#3b82f6" />
          <KpiCard label="Open Items" value={kpis.open} color="#2563eb" />
          <KpiCard label="Overdue Responses" value={kpis.overdue} color="#dc2626" />
          <KpiCard label="Engineer" value={kpis.bicEngineer} color={PARTY_COLORS.Engineer} sub="Ball in Court" />
          <KpiCard label="Contractor" value={kpis.bicContractor} color={PARTY_COLORS.Contractor} sub="Ball in Court" />
          <KpiCard label="Employer" value={kpis.bicEmployer} color={PARTY_COLORS.Employer} sub="Ball in Court" />
        </div>

        {/* Filter bar */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, padding: 12,
          background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        }}>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
            <option value="">All Types</option>
            {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_ICONS[t]} {t}</option>)}
          </select>
          <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} style={selectStyle}>
            <option value="">All Directions</option>
            {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterBIC} onChange={e => setFilterBIC(e.target.value)} style={selectStyle}>
            <option value="">All Parties</option>
            {PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
            style={inputStyle} placeholder="From Date" title="From Date" />
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
            style={inputStyle} placeholder="To Date" title="To Date" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ref or subject..." style={{ ...inputStyle, minWidth: 180, flex: 1 }} />
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading documents...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No documents found. {docs.length === 0 ? 'Click "+ New Document" to add one.' : 'Try adjusting filters.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--card)', borderBottom: '2px solid var(--border)' }}>
                  {['Ref No', 'Type', 'Date', 'Subject', 'From → To', 'Dir', 'Ball in Court', 'Response Due', 'Status', 'Priority'].map(h => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => {
                  const st = doc._status;
                  const sc = STATUS_COLORS[st] || STATUS_COLORS.Open;
                  const pc = PRIORITY_STYLES[doc.priority] || PRIORITY_STYLES.Normal;
                  return (
                    <tr key={doc.id} onClick={() => openEdit(doc)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--card)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={cellStyle}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{doc.reference_no}</span></td>
                      <td style={cellStyle}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: 'var(--card)', fontSize: 12 }}>
                          {DOC_ICONS[doc.doc_type] || '📎'} {doc.doc_type}
                        </span>
                      </td>
                      <td style={cellStyle}>{doc.date_sent || '—'}</td>
                      <td style={{ ...cellStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.subject}</td>
                      <td style={cellStyle}><span style={{ fontSize: 12 }}>{doc.from_party} → {doc.to_party}</span></td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: 16 }}>{doc.direction === 'Incoming' ? '⬇️' : '⬆️'}</span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: PARTY_COLORS[doc.ball_in_court] || '#6b7280' }}>
                          {doc.ball_in_court}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, color: st === 'Overdue' ? '#dc2626' : 'var(--text)', fontWeight: st === 'Overdue' ? 600 : 400 }}>
                        {doc.response_due_date || '—'}
                      </td>
                      <td style={cellStyle}>
                        <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text }}>
                          {st}
                        </span>
                      </td>
                      <td style={cellStyle}>
                        <span style={{
                          padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: pc.bg, color: pc.text,
                          animation: doc.priority === 'Critical' ? 'pulse 1.5s infinite' : 'none',
                        }}>
                          {doc.priority}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pulse animation via style tag */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </>
    );
  }

  /* ========== TAB 2: Ball in Court ========== */
  function renderBallInCourtTab() {
    const activeDocs = docs
      .map(d => ({ ...d, _status: effectiveStatus(d) }))
      .filter(d => d._status !== 'Closed');

    const columns = PARTIES.map(party => {
      const items = activeDocs
        .filter(d => d.ball_in_court === party)
        .sort((a, b) => {
          const aOver = a._status === 'Overdue' ? 0 : 1;
          const bOver = b._status === 'Overdue' ? 0 : 1;
          if (aOver !== bOver) return aOver - bOver;
          const aDate = a.response_due_date || '9999-12-31';
          const bDate = b.response_due_date || '9999-12-31';
          return aDate.localeCompare(bDate);
        });
      const overdueCount = items.filter(d => d._status === 'Overdue').length;
      return { party, items, overdueCount };
    });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, alignItems: 'start' }}>
        {columns.map(col => (
          <div key={col.party} style={{
            background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {/* Column header */}
            <div style={{
              background: PARTY_COLORS[col.party], padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{col.party}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  background: 'rgba(255,255,255,0.25)', color: '#fff', borderRadius: 10,
                  padding: '2px 10px', fontSize: 12, fontWeight: 600,
                }}>{col.items.length}</span>
                {col.overdueCount > 0 && (
                  <span style={{
                    background: '#dc2626', color: '#fff', borderRadius: 10,
                    padding: '2px 10px', fontSize: 11, fontWeight: 700,
                  }}>{col.overdueCount} overdue</span>
                )}
              </span>
            </div>

            {/* Cards */}
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
              {col.items.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No items
                </div>
              )}
              {col.items.map(doc => {
                const isOvd = doc._status === 'Overdue';
                const days = daysSince(doc.date_received || doc.date_sent);
                return (
                  <div key={doc.id} onClick={() => openEdit(doc)} style={{
                    padding: 10, borderRadius: 8, cursor: 'pointer',
                    border: isOvd ? '2px solid #dc2626' : '1px solid var(--border)',
                    background: isOvd ? '#fef2f2' : 'var(--bg)',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--accent)' }}>{doc.reference_no}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{DOC_ICONS[doc.doc_type] || ''}</span>
                    </div>
                    <div style={{
                      fontSize: 13, color: 'var(--text)', lineHeight: 1.3, marginBottom: 6,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {doc.subject}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>{days !== null ? `${days}d ago` : '—'}</span>
                      {doc.response_due_date && (
                        <span style={{ color: isOvd ? '#dc2626' : 'var(--text-muted)', fontWeight: isOvd ? 700 : 400 }}>
                          Due: {doc.response_due_date}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ========== TAB 3: Draft Correspondence ========== */
  function renderDraftTab() {
    const tpl = TEMPLATES.find(t => t.key === selectedTemplate);

    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{
          background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          padding: 20, marginBottom: 16,
        }}>
          <label style={labelStyle}>Select Template</label>
          <select value={selectedTemplate} onChange={e => handleTemplateSelect(e.target.value)}
            style={{ ...inputStyle, width: '100%', fontSize: 14 }}>
            <option value="">-- Choose a correspondence template --</option>
            {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        {tpl && (
          <div style={{
            background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
            padding: 20,
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: 'var(--text)' }}>{tpl.label}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Reference No (auto-generated)</label>
                <input value={draftForm.reference_no} onChange={e => setDraftForm(f => ({ ...f, reference_no: e.target.value }))}
                  style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontWeight: 700 }} />
              </div>
              <div>
                <label style={labelStyle}>Document Type</label>
                <select value={draftForm.doc_type} onChange={e => setDraftForm(f => ({ ...f, doc_type: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={draftForm.date_sent} onChange={e => setDraftForm(f => ({ ...f, date_sent: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>FIDIC Clause</label>
                <input value={draftForm.fidic_clause} onChange={e => setDraftForm(f => ({ ...f, fidic_clause: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }} placeholder="e.g. 14.6" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>From</label>
                <select value={draftForm.from_party} onChange={e => setDraftForm(f => ({ ...f, from_party: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  {PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>To</label>
                <select value={draftForm.to_party} onChange={e => setDraftForm(f => ({ ...f, to_party: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  {PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Subject</label>
              <input value={draftForm.subject} onChange={e => setDraftForm(f => ({ ...f, subject: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Ball in Court</label>
                <select value={draftForm.ball_in_court} onChange={e => setDraftForm(f => ({ ...f, ball_in_court: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  {PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Response Due Date</label>
                <input type="date" value={draftForm.response_due_date}
                  onChange={e => setDraftForm(f => ({ ...f, response_due_date: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={draftForm.priority} onChange={e => setDraftForm(f => ({ ...f, priority: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Direction</label>
                <select value={draftForm.direction} onChange={e => setDraftForm(f => ({ ...f, direction: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}>
                  {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Body / Content</label>
              <textarea value={draftForm.summary} onChange={e => setDraftForm(f => ({ ...f, summary: e.target.value }))}
                rows={12} style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={saveDraft} disabled={saving} style={btnStyle('#6b7280', '#fff')}>
                {saving ? 'Saving...' : 'Save as Draft'}
              </button>
              <button onClick={saveDraft} disabled={saving} style={btnStyle('var(--accent)', '#fff')}>
                {saving ? 'Registering...' : 'Register & Send'}
              </button>
            </div>
          </div>
        )}

        {!tpl && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Select a template above to start drafting correspondence.
          </div>
        )}
      </div>
    );
  }

  /* ========== MODAL ========== */
  function renderModal() {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }} onClick={() => setShowModal(false)}>
        <div style={{
          background: 'var(--card)', borderRadius: 'var(--radius)', width: '100%', maxWidth: 720,
          maxHeight: '90vh', overflowY: 'auto', padding: 24, position: 'relative',
          border: '1px solid var(--border)',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>
              {editing ? 'Edit Document' : 'Register New Document'}
            </h3>
            <button onClick={() => setShowModal(false)}
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>&times;</button>
          </div>

          {/* Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Reference No *</label>
              <input value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} placeholder="PRJ/LTR/001" />
            </div>
            <div>
              <label style={labelStyle}>Document Type</label>
              <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }}>
                {DOC_TYPES.map(t => <option key={t} value={t}>{DOC_ICONS[t]} {t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Direction</label>
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }}>
                {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Subject *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }} />
          </div>

          {/* Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input value={form.from_party} onChange={e => setForm(f => ({ ...f, from_party: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} placeholder="Engineer / Contractor / etc." />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input value={form.to_party} onChange={e => setForm(f => ({ ...f, to_party: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} placeholder="Contractor / Engineer / etc." />
            </div>
          </div>

          {/* Row 3: dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Date Sent</label>
              <input type="date" value={form.date_sent} onChange={e => setForm(f => ({ ...f, date_sent: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Date Received</label>
              <input type="date" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>

          {/* Row 4: BIC, status, priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Ball in Court</label>
              <select value={form.ball_in_court} onChange={e => setForm(f => ({ ...f, ball_in_court: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }}>
                {PARTIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Response section */}
          <div style={{ marginBottom: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              <input type="checkbox" checked={form.response_required}
                onChange={e => setForm(f => ({ ...f, response_required: e.target.checked }))} />
              Response Required
            </label>
            {form.response_required && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Response Due Date</label>
                  <input type="date" value={form.response_due_date}
                    onChange={e => setForm(f => ({ ...f, response_due_date: e.target.value }))}
                    style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={labelStyle}>Response Received Date</label>
                  <input type="date" value={form.response_received_date}
                    onChange={e => setForm(f => ({ ...f, response_received_date: e.target.value }))}
                    style={{ ...inputStyle, width: '100%' }} />
                </div>
              </div>
            )}
          </div>

          {/* Row 5: FIDIC and links */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>FIDIC Clause</label>
              <input value={form.fidic_clause} onChange={e => setForm(f => ({ ...f, fidic_clause: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} placeholder="e.g. 20.1" />
            </div>
            <div>
              <label style={labelStyle}>Linked IPC No</label>
              <input value={form.linked_ipc_no} onChange={e => setForm(f => ({ ...f, linked_ipc_no: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Linked EoT No</label>
              <input value={form.linked_eot_no} onChange={e => setForm(f => ({ ...f, linked_eot_no: e.target.value }))}
                style={{ ...inputStyle, width: '100%' }} placeholder="Optional" />
            </div>
          </div>

          {/* Summary & Notes */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Summary / Body</label>
            <textarea value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={4} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
          </div>

          {/* File URL */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>File URL</label>
            <input value={form.file_url} onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }} placeholder="Link to attached document" />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowModal(false)} style={btnStyle('var(--border)', 'var(--text)')}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={btnStyle('var(--accent)', '#fff')}>
              {saving ? 'Saving...' : editing ? 'Update Document' : 'Register Document'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

/* ========== Shared sub-components & styles ========== */

function KpiCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
      padding: 14, textAlign: 'center',
    }}>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sub}</div>}
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const cellStyle = { padding: '8px', whiteSpace: 'nowrap', color: 'var(--text)', verticalAlign: 'middle' };

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };

const inputStyle = {
  padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box',
};

const selectStyle = {
  ...inputStyle, minWidth: 120, cursor: 'pointer',
};

function btnStyle(bg, color) {
  return {
    padding: '8px 18px', borderRadius: 6, border: 'none',
    background: bg, color, fontWeight: 600, fontSize: 13,
    cursor: 'pointer', transition: 'opacity 0.15s',
  };
}
