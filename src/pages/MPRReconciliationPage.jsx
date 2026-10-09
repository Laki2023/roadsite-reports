import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_COLORS = {
  Draft: { bg: '#6b7280', text: '#fff' },
  Submitted: { bg: '#3b82f6', text: '#fff' },
  'Under Review': { bg: '#f59e0b', text: '#fff' },
  Approved: { bg: '#10b981', text: '#fff' },
  Rejected: { bg: '#ef4444', text: '#fff' },
};

const VARIANCE_COLORS = {
  Matched: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  'Minor Variance': { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  'Major Variance': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  Unreconciled: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

const EMPTY_MPR = {
  report_month: '', report_period_start: '', report_period_end: '',
  contractor_ref: '', engineer_ref: '', physical_progress_pct: '',
  financial_progress_pct: '', time_elapsed_pct: '', planned_progress_pct: '',
  notes: '', status: 'Draft',
};

const EMPTY_LINE = {
  boq_item_no: '', description: '', unit: '', contract_qty: '',
  previous_qty: '', this_period_qty: '', contract_rate: '',
};

function kpiCard(label, value, sub, color) {
  return (
    <div style={{
      flex: '1 1 200px', background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 8px)', padding: '16px', minWidth: 0,
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function statusBadge(status) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Draft;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 12, fontWeight: 600, background: c.bg, color: c.text,
    }}>{status}</span>
  );
}

function varianceBadge(status) {
  const c = VARIANCE_COLORS[status] || VARIANCE_COLORS.Unreconciled;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12,
      fontWeight: 600, background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>{status}</span>
  );
}

export default function MPRReconciliationPage({ profile, showToast, navigateTo, selectedProject }) {
  const [tab, setTab] = useState('register');
  const [mprs, setMprs] = useState([]);
  const [selectedMpr, setSelectedMpr] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [reconciliation, setReconciliation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [mprForm, setMprForm] = useState({ ...EMPTY_MPR });
  const [editLines, setEditLines] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [reconciling, setReconciling] = useState(false);

  const projectId = selectedProject?.id;

  useEffect(() => { if (projectId) loadMprs(); }, [projectId]);

  useEffect(() => {
    if (selectedMpr) {
      loadLineItems(selectedMpr.id);
      loadReconciliation(selectedMpr.id);
    }
  }, [selectedMpr]);

  async function loadMprs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('monthly_progress_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('report_month', { ascending: false });
      if (error) throw error;
      setMprs(data || []);
    } catch (err) {
      showToast('Failed to load MPRs: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadLineItems(mprId) {
    try {
      const { data, error } = await supabase
        .from('mpr_line_items')
        .select('*')
        .eq('mpr_id', mprId)
        .order('boq_item_no');
      if (error) throw error;
      setLineItems(data || []);
    } catch (err) {
      showToast('Failed to load line items: ' + err.message, 'error');
    }
  }

  async function loadReconciliation(mprId) {
    try {
      const { data, error } = await supabase
        .from('mpr_reconciliation')
        .select('*')
        .eq('mpr_id', mprId)
        .order('boq_item_no');
      if (error) throw error;
      setReconciliation(data || []);
    } catch (err) {
      showToast('Failed to load reconciliation: ' + err.message, 'error');
    }
  }

  function openNewMpr() {
    setEditingId(null);
    setMprForm({ ...EMPTY_MPR });
    setEditLines([{ ...EMPTY_LINE, _key: Date.now() }]);
    setShowModal(true);
  }

  function openEditMpr(mpr) {
    setEditingId(mpr.id);
    setMprForm({
      report_month: mpr.report_month || '',
      report_period_start: mpr.report_period_start || '',
      report_period_end: mpr.report_period_end || '',
      contractor_ref: mpr.contractor_ref || '',
      engineer_ref: mpr.engineer_ref || '',
      physical_progress_pct: mpr.physical_progress_pct ?? '',
      financial_progress_pct: mpr.financial_progress_pct ?? '',
      time_elapsed_pct: mpr.time_elapsed_pct ?? '',
      planned_progress_pct: mpr.planned_progress_pct ?? '',
      notes: mpr.notes || '',
      status: mpr.status || 'Draft',
    });
    const items = lineItems.length > 0 ? lineItems.map((li, i) => ({
      ...li, _key: Date.now() + i,
      contract_qty: li.contract_qty ?? '',
      previous_qty: li.previous_qty ?? '',
      this_period_qty: li.this_period_qty ?? '',
      contract_rate: li.contract_rate ?? '',
    })) : [{ ...EMPTY_LINE, _key: Date.now() }];
    setEditLines(items);
    setShowModal(true);
  }

  async function saveMpr(submitStatus) {
    if (!projectId) return;
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        report_month: mprForm.report_month || null,
        report_period_start: mprForm.report_period_start || null,
        report_period_end: mprForm.report_period_end || null,
        contractor_ref: mprForm.contractor_ref || null,
        engineer_ref: mprForm.engineer_ref || null,
        physical_progress_pct: parseFloat(mprForm.physical_progress_pct) || 0,
        financial_progress_pct: parseFloat(mprForm.financial_progress_pct) || 0,
        time_elapsed_pct: parseFloat(mprForm.time_elapsed_pct) || 0,
        planned_progress_pct: parseFloat(mprForm.planned_progress_pct) || 0,
        notes: mprForm.notes || null,
        status: submitStatus || mprForm.status || 'Draft',
        created_by: profile?.id,
        updated_at: new Date().toISOString(),
      };
      if (submitStatus === 'Submitted') {
        payload.submitted_date = new Date().toISOString();
      }

      let mprId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from('monthly_progress_reports')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        payload.created_at = new Date().toISOString();
        const { data, error } = await supabase
          .from('monthly_progress_reports')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        mprId = data.id;
      }

      // Save line items: delete old, insert new
      if (editingId) {
        await supabase.from('mpr_line_items').delete().eq('mpr_id', mprId);
      }
      const validLines = editLines.filter(l => l.boq_item_no && l.description);
      if (validLines.length > 0) {
        const rows = validLines.map(l => {
          const prevQty = parseFloat(l.previous_qty) || 0;
          const periodQty = parseFloat(l.this_period_qty) || 0;
          const contractQty = parseFloat(l.contract_qty) || 0;
          const rate = parseFloat(l.contract_rate) || 0;
          const cumQty = prevQty + periodQty;
          return {
            mpr_id: mprId,
            boq_item_no: l.boq_item_no,
            description: l.description,
            unit: l.unit || null,
            contract_qty: contractQty,
            previous_qty: prevQty,
            this_period_qty: periodQty,
            cumulative_qty: cumQty,
            contract_rate: rate,
            this_period_amount: periodQty * rate,
            cumulative_amount: cumQty * rate,
            physical_pct: contractQty > 0 ? Math.round((cumQty / contractQty) * 10000) / 100 : 0,
          };
        });
        const { error: liErr } = await supabase.from('mpr_line_items').insert(rows);
        if (liErr) throw liErr;
      }

      showToast(submitStatus === 'Submitted' ? 'MPR submitted successfully' : 'MPR saved as draft', 'success');
      setShowModal(false);
      await loadMprs();
      if (mprId) {
        const found = (await supabase.from('monthly_progress_reports').select('*').eq('id', mprId).single()).data;
        if (found) { setSelectedMpr(found); loadLineItems(mprId); }
      }
    } catch (err) {
      showToast('Failed to save MPR: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function runReconciliation() {
    if (!selectedMpr) return;
    setReconciling(true);
    try {
      // Fetch daily report quantities for the MPR period
      const { data: dailyData, error: dailyErr } = await supabase
        .from('works_activities')
        .select('boq_item_no, quantity')
        .eq('project_id', projectId)
        .gte('activity_date', selectedMpr.report_period_start)
        .lte('activity_date', selectedMpr.report_period_end);
      if (dailyErr) throw dailyErr;

      // Aggregate by boq_item_no
      const dailyMap = {};
      (dailyData || []).forEach(r => {
        const key = r.boq_item_no;
        if (!key) return;
        dailyMap[key] = (dailyMap[key] || 0) + (parseFloat(r.quantity) || 0);
      });

      // Delete old reconciliation for this MPR
      await supabase.from('mpr_reconciliation').delete().eq('mpr_id', selectedMpr.id);

      // Build reconciliation rows
      const items = lineItems.length > 0 ? lineItems : [];
      const reconRows = items.map(li => {
        const mprQty = parseFloat(li.this_period_qty) || 0;
        const drQty = dailyMap[li.boq_item_no] || 0;
        const variance = mprQty - drQty;
        const variancePct = mprQty !== 0 ? Math.abs(variance / mprQty) * 100 : (drQty !== 0 ? 100 : 0);
        let status = 'Matched';
        if (variancePct >= 15) status = 'Major Variance';
        else if (variancePct >= 5) status = 'Minor Variance';
        return {
          mpr_id: selectedMpr.id,
          boq_item_no: li.boq_item_no,
          mpr_qty: mprQty,
          daily_report_qty: drQty,
          variance: Math.round(variance * 1000) / 1000,
          variance_pct: Math.round(variancePct * 100) / 100,
          status,
          reconciled_at: new Date().toISOString(),
        };
      });

      if (reconRows.length > 0) {
        const { error: insErr } = await supabase.from('mpr_reconciliation').insert(reconRows);
        if (insErr) throw insErr;
      }

      showToast(`Reconciliation complete: ${reconRows.length} items processed`, 'success');
      await loadReconciliation(selectedMpr.id);
    } catch (err) {
      showToast('Reconciliation failed: ' + err.message, 'error');
    } finally {
      setReconciling(false);
    }
  }

  async function updateReconStatus(reconId, newStatus, notes) {
    try {
      const { error } = await supabase
        .from('mpr_reconciliation')
        .update({ status: newStatus, reviewed_by: profile?.id, review_notes: notes || null })
        .eq('id', reconId);
      if (error) throw error;
      showToast('Item updated', 'success');
      if (selectedMpr) loadReconciliation(selectedMpr.id);
    } catch (err) {
      showToast('Update failed: ' + err.message, 'error');
    }
  }

  // --- Computed values ---
  const latestMpr = mprs.length > 0 ? mprs[0] : null;
  const programmeVariance = latestMpr
    ? ((latestMpr.physical_progress_pct || 0) - (latestMpr.planned_progress_pct || 0)).toFixed(1)
    : '---';
  const matchedCount = reconciliation.filter(r => r.status === 'Matched').length;
  const minorCount = reconciliation.filter(r => r.status === 'Minor Variance').length;
  const majorCount = reconciliation.filter(r => r.status === 'Major Variance').length;

  // Helpers for line item editing
  function updateLine(idx, field, value) {
    setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  }
  function addLine() {
    setEditLines(prev => [...prev, { ...EMPTY_LINE, _key: Date.now() }]);
  }
  function removeLine(idx) {
    setEditLines(prev => prev.filter((_, i) => i !== idx));
  }

  // --- Guard ---
  if (!selectedProject) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#128203;</div>
        <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>No Project Selected</h2>
        <p>Please select a project from the sidebar to view Monthly Progress Reports.</p>
      </div>
    );
  }

  // --- Tab bar styles ---
  const tabStyle = (active) => ({
    padding: '10px 20px', cursor: 'pointer', fontWeight: active ? 600 : 400,
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)', background: 'none',
    border: 'none', fontSize: 14, transition: 'all 0.15s',
  });

  const cardStyle = {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius, 8px)', padding: 20, marginBottom: 16,
  };

  const thStyle = {
    padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600,
    color: 'var(--text-muted)', borderBottom: '2px solid var(--border)',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  };

  const tdStyle = {
    padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--border)',
    color: 'var(--text)',
  };

  const btnPrimary = {
    padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
  };

  const btnSecondary = {
    padding: '8px 18px', background: 'transparent', color: 'var(--accent)',
    border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer',
    fontWeight: 600, fontSize: 13,
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', fontSize: 13,
    boxSizing: 'border-box',
  };

  // ========================= RENDER =========================
  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text)' }}>Monthly Progress Reports</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {selectedProject?.name} &mdash; Upload, review, and reconcile MPRs with daily reports
          </p>
        </div>
        <button style={btnPrimary} onClick={openNewMpr}>+ New MPR</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button style={tabStyle(tab === 'register')} onClick={() => setTab('register')}>MPR Register</button>
        <button style={tabStyle(tab === 'upload')} onClick={() => setTab('upload')}>Upload &amp; Review</button>
        <button style={tabStyle(tab === 'reconciliation')} onClick={() => setTab('reconciliation')}>Reconciliation</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>}

      {!loading && tab === 'register' && renderRegister()}
      {!loading && tab === 'upload' && renderUploadReview()}
      {!loading && tab === 'reconciliation' && renderReconciliation()}

      {showModal && renderModal()}
    </div>
  );

  // ========================= TAB 1: MPR Register =========================
  function renderRegister() {
    return (
      <>
        {/* KPI Cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {kpiCard('Total MPRs', mprs.length, `${mprs.filter(m => m.status === 'Approved').length} approved`)}
          {kpiCard('Latest Physical Progress', latestMpr ? `${latestMpr.physical_progress_pct || 0}%` : '---', latestMpr ? `Month: ${latestMpr.report_month}` : '', 'var(--accent)')}
          {kpiCard('Programme Variance', `${programmeVariance}%`,
            parseFloat(programmeVariance) >= 0 ? 'Ahead of programme' : 'Behind programme',
            parseFloat(programmeVariance) >= 0 ? '#10b981' : '#ef4444')}
          {kpiCard('Financial Progress', latestMpr ? `${latestMpr.financial_progress_pct || 0}%` : '---', 'Contract expenditure', '#3b82f6')}
        </div>

        {/* Table */}
        <div style={cardStyle}>
          {mprs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No monthly progress reports yet. Click "+ New MPR" to create one.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Month', 'Contractor Ref', 'Engineer Ref', 'Physical %', 'Financial %', 'Time %', 'Status', 'Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mprs.map(mpr => (
                    <tr key={mpr.id}
                      onClick={() => { setSelectedMpr(mpr); setTab('upload'); }}
                      style={{
                        cursor: 'pointer', transition: 'background 0.1s',
                        background: selectedMpr?.id === mpr.id ? 'var(--accent-light, rgba(59,130,246,0.08))' : 'transparent',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light, rgba(59,130,246,0.05))'}
                      onMouseLeave={e => e.currentTarget.style.background = selectedMpr?.id === mpr.id ? 'var(--accent-light, rgba(59,130,246,0.08))' : 'transparent'}
                    >
                      <td style={tdStyle}>{mpr.report_month || '---'}</td>
                      <td style={tdStyle}>{mpr.contractor_ref || '---'}</td>
                      <td style={tdStyle}>{mpr.engineer_ref || '---'}</td>
                      <td style={tdStyle}>{mpr.physical_progress_pct ?? '---'}%</td>
                      <td style={tdStyle}>{mpr.financial_progress_pct ?? '---'}%</td>
                      <td style={tdStyle}>{mpr.time_elapsed_pct ?? '---'}%</td>
                      <td style={tdStyle}>{statusBadge(mpr.status)}</td>
                      <td style={tdStyle}>
                        <button
                          style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12 }}
                          onClick={e => { e.stopPropagation(); setSelectedMpr(mpr); openEditMpr(mpr); }}
                        >Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  // ========================= TAB 2: Upload & Review =========================
  function renderUploadReview() {
    if (!selectedMpr) {
      return (
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <p style={{ marginBottom: 12 }}>Select an MPR from the Register tab or create a new one to review.</p>
            <button style={btnPrimary} onClick={openNewMpr}>+ New MPR</button>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* MPR Summary */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--text)' }}>
                MPR: {selectedMpr.report_month || 'No date'} {statusBadge(selectedMpr.status)}
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                Period: {selectedMpr.report_period_start || '---'} to {selectedMpr.report_period_end || '---'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnSecondary} onClick={() => openEditMpr(selectedMpr)}>Edit</button>
              <button style={btnPrimary} onClick={() => setTab('reconciliation')}>Reconcile</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[
              ['Contractor Ref', selectedMpr.contractor_ref],
              ['Engineer Ref', selectedMpr.engineer_ref],
              ['Physical Progress', `${selectedMpr.physical_progress_pct ?? 0}%`],
              ['Financial Progress', `${selectedMpr.financial_progress_pct ?? 0}%`],
              ['Time Elapsed', `${selectedMpr.time_elapsed_pct ?? 0}%`],
              ['Planned Progress', `${selectedMpr.planned_progress_pct ?? 0}%`],
            ].map(([label, val]) => (
              <div key={label} style={{ padding: 10, background: 'var(--bg)', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{val || '---'}</div>
              </div>
            ))}
          </div>
          {selectedMpr.notes && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--bg)', borderRadius: 6, fontSize: 13, color: 'var(--text)' }}>
              <strong>Notes:</strong> {selectedMpr.notes}
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', color: 'var(--text)', fontSize: 16 }}>BOQ Line Items ({lineItems.length})</h3>
          {lineItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
              No line items. Edit this MPR to add BOQ items.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Item No', 'Description', 'Unit', 'Contract Qty', 'Previous Qty', 'This Period', 'Cumulative', 'Rate', 'Period Amt', 'Cumul. Amt', 'Phys. %'].map(h => (
                      <th key={h} style={{ ...thStyle, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map(li => (
                    <tr key={li.id}>
                      <td style={tdStyle}>{li.boq_item_no}</td>
                      <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{li.description}</td>
                      <td style={tdStyle}>{li.unit}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.contract_qty ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.previous_qty ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.this_period_qty ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.cumulative_qty ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.contract_rate ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.this_period_amount ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{(li.cumulative_amount ?? 0).toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{li.physical_pct ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={8} style={{ ...tdStyle, textAlign: 'right' }}>Totals:</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{lineItems.reduce((s, l) => s + (l.this_period_amount || 0), 0).toLocaleString()}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{lineItems.reduce((s, l) => s + (l.cumulative_amount || 0), 0).toLocaleString()}</td>
                    <td style={tdStyle}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  // ========================= TAB 3: Reconciliation =========================
  function renderReconciliation() {
    if (!selectedMpr) {
      return (
        <div style={cardStyle}>
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Select an MPR from the Register tab to run reconciliation.
          </div>
        </div>
      );
    }

    return (
      <>
        {/* Summary Bar */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {kpiCard('Total Items', reconciliation.length, 'BOQ line items')}
          {kpiCard('Matched', matchedCount, 'Variance < 5%', '#10b981')}
          {kpiCard('Minor Variance', minorCount, '5% - 15%', '#f59e0b')}
          {kpiCard('Major Variance', majorCount, '> 15%', '#ef4444')}
        </div>

        {/* Action bar */}
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: 16 }}>
              Reconciliation: {selectedMpr.report_month || '---'}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Comparing MPR quantities with aggregated daily report data for {selectedMpr.report_period_start} to {selectedMpr.report_period_end}
            </p>
          </div>
          <button
            style={{ ...btnPrimary, opacity: reconciling ? 0.6 : 1 }}
            onClick={runReconciliation}
            disabled={reconciling}
          >
            {reconciling ? 'Running...' : 'Run Reconciliation'}
          </button>
        </div>

        {/* Reconciliation Table */}
        <div style={cardStyle}>
          {reconciliation.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              No reconciliation data. Click "Run Reconciliation" to compare MPR with daily reports.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['BOQ Item', 'MPR Qty', 'Daily Report Qty', 'Variance', 'Variance %', 'Status', 'Actions'].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.map(r => {
                    const varColor = r.variance_pct >= 15 ? '#ef4444' : r.variance_pct >= 5 ? '#f59e0b' : '#10b981';
                    return (
                      <tr key={r.id}>
                        <td style={tdStyle}>{r.boq_item_no}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{(r.mpr_qty ?? 0).toLocaleString()}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{(r.daily_report_qty ?? 0).toLocaleString()}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: varColor, fontWeight: 600 }}>
                          {r.variance > 0 ? '+' : ''}{(r.variance ?? 0).toLocaleString()}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            background: r.variance_pct >= 15 ? '#fee2e2' : r.variance_pct >= 5 ? '#fef9c3' : '#dcfce7',
                            color: varColor, fontWeight: 600,
                          }}>
                            {(r.variance_pct ?? 0).toFixed(1)}%
                          </span>
                        </td>
                        <td style={tdStyle}>{varianceBadge(r.status)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #10b981', borderRadius: 4, background: '#dcfce7', color: '#166534', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => updateReconStatus(r.id, 'Matched', 'Accepted by reviewer')}
                              title="Accept"
                            >Accept</button>
                            <button
                              style={{ padding: '3px 10px', fontSize: 11, border: '1px solid #ef4444', borderRadius: 4, background: '#fee2e2', color: '#991b1b', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => updateReconStatus(r.id, 'Major Variance', 'Flagged for review')}
                              title="Flag"
                            >Flag</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    );
  }

  // ========================= MODAL: Create/Edit MPR =========================
  function renderModal() {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, overflowY: 'auto',
        padding: '40px 16px',
      }} onClick={() => setShowModal(false)}>
        <div style={{
          background: 'var(--card)', borderRadius: 'var(--radius, 8px)', width: '100%',
          maxWidth: 1100, padding: 24, border: '1px solid var(--border)',
          maxHeight: '85vh', overflowY: 'auto',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18 }}>
              {editingId ? 'Edit Monthly Progress Report' : 'New Monthly Progress Report'}
            </h2>
            <button onClick={() => setShowModal(false)} style={{
              background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)',
            }}>&times;</button>
          </div>

          {/* Form Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
            {[
              ['Report Month', 'report_month', 'date'],
              ['Period Start', 'report_period_start', 'date'],
              ['Period End', 'report_period_end', 'date'],
              ['Contractor Ref', 'contractor_ref', 'text'],
              ['Engineer Ref', 'engineer_ref', 'text'],
              ['Physical Progress %', 'physical_progress_pct', 'number'],
              ['Financial Progress %', 'financial_progress_pct', 'number'],
              ['Time Elapsed %', 'time_elapsed_pct', 'number'],
              ['Planned Progress %', 'planned_progress_pct', 'number'],
            ].map(([label, field, type]) => (
              <div key={field}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
                <input
                  type={type} style={inputStyle}
                  value={mprForm[field]} onChange={e => setMprForm(prev => ({ ...prev, [field]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Notes</label>
            <textarea
              rows={3} style={{ ...inputStyle, resize: 'vertical' }}
              value={mprForm.notes} onChange={e => setMprForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </div>

          {/* Line Items */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: 'var(--text)' }}>BOQ Line Items</h3>
              <button style={{ ...btnSecondary, padding: '4px 14px', fontSize: 12 }} onClick={addLine}>+ Add Row</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Item No', 'Description', 'Unit', 'Contract Qty', 'Previous Qty', 'This Period', 'Cumulative', 'Rate', 'Period Amt', 'Cumul. Amt', 'Phys. %', ''].map(h => (
                      <th key={h} style={{ ...thStyle, fontSize: 10, padding: '6px 4px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editLines.map((line, idx) => {
                    const prevQty = parseFloat(line.previous_qty) || 0;
                    const periodQty = parseFloat(line.this_period_qty) || 0;
                    const contractQty = parseFloat(line.contract_qty) || 0;
                    const rate = parseFloat(line.contract_rate) || 0;
                    const cumQty = prevQty + periodQty;
                    const periodAmt = periodQty * rate;
                    const cumAmt = cumQty * rate;
                    const physPct = contractQty > 0 ? ((cumQty / contractQty) * 100).toFixed(1) : '0.0';
                    return (
                      <tr key={line._key || idx}>
                        <td style={{ padding: '4px 2px' }}>
                          <input style={{ ...inputStyle, padding: '4px 6px', width: 80 }} value={line.boq_item_no} onChange={e => updateLine(idx, 'boq_item_no', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px' }}>
                          <input style={{ ...inputStyle, padding: '4px 6px', width: 160 }} value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px' }}>
                          <input style={{ ...inputStyle, padding: '4px 6px', width: 50 }} value={line.unit} onChange={e => updateLine(idx, 'unit', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px' }}>
                          <input type="number" style={{ ...inputStyle, padding: '4px 6px', width: 80 }} value={line.contract_qty} onChange={e => updateLine(idx, 'contract_qty', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px' }}>
                          <input type="number" style={{ ...inputStyle, padding: '4px 6px', width: 80 }} value={line.previous_qty} onChange={e => updateLine(idx, 'previous_qty', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px' }}>
                          <input type="number" style={{ ...inputStyle, padding: '4px 6px', width: 80 }} value={line.this_period_qty} onChange={e => updateLine(idx, 'this_period_qty', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px', textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>{cumQty.toLocaleString()}</td>
                        <td style={{ padding: '4px 2px' }}>
                          <input type="number" style={{ ...inputStyle, padding: '4px 6px', width: 80 }} value={line.contract_rate} onChange={e => updateLine(idx, 'contract_rate', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 2px', textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>{periodAmt.toLocaleString()}</td>
                        <td style={{ padding: '4px 2px', textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>{cumAmt.toLocaleString()}</td>
                        <td style={{ padding: '4px 2px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{physPct}%</td>
                        <td style={{ padding: '4px 2px' }}>
                          <button onClick={() => removeLine(idx)} style={{
                            background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px',
                          }} title="Remove row">&times;</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button style={btnSecondary} onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
            <button
              style={{ ...btnSecondary, borderColor: '#6b7280', color: '#6b7280' }}
              onClick={() => saveMpr('Draft')} disabled={saving}
            >{saving ? 'Saving...' : 'Save as Draft'}</button>
            <button
              style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
              onClick={() => saveMpr('Submitted')} disabled={saving}
            >{saving ? 'Submitting...' : 'Submit'}</button>
          </div>
        </div>
      </div>
    );
  }
}
