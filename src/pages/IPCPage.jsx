import React, { useState, useEffect } from 'react';
import { supabase, hasRole, canEditModule } from '../lib/supabase';

export default function IPCPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [projectData, setProjectData] = useState(null);
  const [ipcs, setIpcs] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [boqSections, setBoqSections] = useState([]);
  const [tab, setTab] = useState('dashboard');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [editingIpc, setEditingIpc] = useState(null);
  const [selectedIpc, setSelectedIpc] = useState(null);
  const [genForm, setGenForm] = useState({
    period_from: '', period_to: '', retention_pct: 10,
    advance_recovery: 0, materials_on_site: 0, vop_amount: 0,
    other_deductions: 0, notes: ''
  });
  const [saving, setSaving] = useState(false);
  const isPlatformAdmin = profile?.is_platform_admin === true;
  const canManage = isPlatformAdmin || hasRole(profile?.role, 'project_engineer') ||
    canEditModule(profile?.allowed_pages, 'ipc');

  useEffect(() => { supabase.from('projects').select('*').order('name').then(({ data }) => setProjects(data || [])); }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    const [projRes, ipcRes, itemRes, secRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', selectedProject).single(),
      supabase.from('ipc_certificates').select('*, preparer:prepared_by(full_name), certifier:certified_by(full_name)')
        .eq('project_id', selectedProject).order('ipc_no', { ascending: false }),
      supabase.from('boq_items').select('*, section:section_id(section_no, section_title)')
        .eq('project_id', selectedProject).order('sort_order'),
      supabase.from('boq_sections').select('*').eq('project_id', selectedProject).order('sort_order'),
    ]);
    setProjectData(projRes.data);
    setIpcs(ipcRes.data || []);
    setBoqItems(itemRes.data || []);
    setBoqSections(secRes.data || []);
  }

  async function generateIPC(e) {
    e.preventDefault(); setSaving(true);
    try {
      const lastIpc = ipcs.length > 0 ? ipcs[0] : null;
      const ipcNo = lastIpc ? lastIpc.ipc_no + 1 : 1;

      const grossValue = boqItems.reduce((s, i) => s + ((i.completed_quantity || 0) * (i.rate || 0)), 0);
      const materialsOnSite = parseFloat(genForm.materials_on_site) || 0;
      const vopAmount = parseFloat(genForm.vop_amount) || 0;
      const totalGross = grossValue + materialsOnSite + vopAmount;
      const retentionPct = parseFloat(genForm.retention_pct) || 10;
      const retentionAmount = totalGross * (retentionPct / 100);
      const advanceRecovery = parseFloat(genForm.advance_recovery) || 0;
      const otherDeductions = parseFloat(genForm.other_deductions) || 0;
      const netAmount = totalGross - retentionAmount - advanceRecovery - otherDeductions;

      const payload = {
        project_id: selectedProject, ipc_no: ipcNo,
        period_from: genForm.period_from, period_to: genForm.period_to,
        gross_value: totalGross, works_value: grossValue,
        materials_on_site: materialsOnSite, vop_amount: vopAmount,
        retention_pct: retentionPct, retention_amount: retentionAmount,
        advance_recovery: advanceRecovery, other_deductions: otherDeductions,
        net_amount: netAmount, prepared_by: profile.id,
        status: 'Draft', notes: genForm.notes,
      };

      if (editingIpc) {
        const { error } = await supabase.from('ipc_certificates').update(payload).eq('id', editingIpc.id);
        if (error) throw error;
        showToast(`IPC No. ${editingIpc.ipc_no} updated — ${fmt(netAmount)} net`);
      } else {
        const { error } = await supabase.from('ipc_certificates').insert(payload).select().single();
        if (error) throw error;
        // Snapshot current quantities as previous for next IPC
        for (const item of boqItems) {
          await supabase.from('boq_items').update({ previous_quantity: item.completed_quantity }).eq('id', item.id);
        }
        showToast(`IPC No. ${ipcNo} generated — ${fmt(netAmount)} net`);
      }

      setShowGenerateModal(false); setEditingIpc(null);
      setGenForm({ period_from: '', period_to: '', retention_pct: 10, advance_recovery: 0, materials_on_site: 0, vop_amount: 0, other_deductions: 0, notes: '' });
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  }

  async function updateIpcStatus(id, status) {
    const updates = { status };
    if (status === 'Certified') {
      updates.certified_by = profile.id;
      updates.certified_date = new Date().toISOString().split('T')[0];
    }
    if (status === 'Paid') {
      updates.paid_date = new Date().toISOString().split('T')[0];
    }
    await supabase.from('ipc_certificates').update(updates).eq('id', id);
    showToast(`IPC ${status}`);
    loadData();
  }

  async function deleteIpc(ipc) {
    if (!window.confirm(`Delete Draft IPC No. ${ipc.ipc_no}? This cannot be undone.`)) return;
    await supabase.from('ipc_certificates').delete().eq('id', ipc.id);
    showToast('Draft IPC deleted');
    setSelectedIpc(null); setTab('dashboard');
    loadData();
  }

  function openEditIpc(ipc) {
    setEditingIpc(ipc);
    setGenForm({
      period_from: ipc.period_from || '',
      period_to: ipc.period_to || '',
      retention_pct: ipc.retention_pct || 10,
      advance_recovery: ipc.advance_recovery || 0,
      materials_on_site: ipc.materials_on_site || 0,
      vop_amount: ipc.vop_amount || 0,
      other_deductions: ipc.other_deductions || 0,
      notes: ipc.notes || '',
    });
    setShowGenerateModal(true);
  }

  function viewIpc(ipc) { setSelectedIpc(ipc); setTab('detail'); }

  // ── Print / PDF ──
  function printIPC() {
    const printWindow = window.open('', '_blank');
    const ipc = selectedIpc;
    const p = projectData;
    const prevIpc = ipcs.find(i => i.ipc_no === ipc.ipc_no - 1);
    const previousNet = prevIpc ? prevIpc.net_amount : 0;
    const previousGross = prevIpc ? prevIpc.gross_value : 0;
    const thisPeriodGross = ipc.gross_value - previousGross;

    const grouped = {};
    boqItems.forEach(i => {
      const secId = i.section_id || '_unsectioned';
      if (!grouped[secId]) grouped[secId] = { section: i.section || { section_no: '-', section_title: 'Other Items' }, items: [] };
      grouped[secId].items.push(i);
    });

    let itemRows = '';
    Object.values(grouped).forEach(({ section, items }) => {
      itemRows += `<tr style="background:#f0f0f0;font-weight:700"><td colspan="10" style="padding:6px 8px">${section.section_no}: ${section.section_title}</td></tr>`;
      let secTotal = 0;
      items.forEach(item => {
        const prevQty = item.previous_quantity || 0;
        const currQty = item.completed_quantity || 0;
        const thisQty = currQty - prevQty;
        const cumAmt = currQty * (item.rate || 0);
        secTotal += cumAmt;
        itemRows += `<tr><td style="font-size:10px">${item.item_no}</td><td style="font-size:10px;max-width:180px">${item.description}</td><td style="text-align:center;font-size:10px">${item.unit}</td><td style="text-align:right;font-size:10px">${N(item.rate)}</td><td style="text-align:right;font-size:10px">${N(item.boq_quantity)}</td><td style="text-align:right;font-size:10px">${N(item.boq_amount)}</td><td style="text-align:right;font-size:10px">${N(prevQty)}</td><td style="text-align:right;font-size:10px;font-weight:600">${N(thisQty)}</td><td style="text-align:right;font-size:10px">${N(currQty)}</td><td style="text-align:right;font-size:10px;font-weight:600">${N(cumAmt)}</td></tr>`;
      });
      itemRows += `<tr style="border-top:1px solid #999;font-weight:600"><td colspan="5" style="text-align:right;padding:4px 8px">Section Total:</td><td></td><td colspan="3"></td><td style="text-align:right">${N(secTotal)}</td></tr>`;
    });

    const contractSum = boqItems.reduce((s, i) => s + (i.boq_amount || 0), 0);
    const worksValue = ipc.works_value || ipc.gross_value;
    const matsSite = ipc.materials_on_site || 0;
    const vop = ipc.vop_amount || 0;

    const html = `<!DOCTYPE html><html><head><title>IPC No. ${ipc.ipc_no} — ${p?.name}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#333}h1{font-size:18px;text-align:center;margin:0}h2{font-size:14px;text-align:center;margin:4px 0 16px;color:#666}.header-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:11px;margin-bottom:16px;padding:10px;border:1px solid #ccc}.header-grid b{min-width:120px;display:inline-block}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#2a2a2a;color:#fff;padding:6px 8px;font-size:10px;text-align:left;border:1px solid #444}td{padding:4px 8px;border:1px solid #ddd}.summary-table{max-width:500px;margin-left:auto}.summary-table td{padding:6px 10px;font-size:12px}.summary-table .total{font-weight:700;font-size:14px;border-top:2px solid #333}.sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;margin-top:40px;font-size:11px}.sign-box{border-top:1px solid #333;padding-top:6px;margin-top:50px}@media print{body{margin:10mm}@page{size:landscape;margin:10mm}}</style></head><body>
    <h1>INTERIM PAYMENT CERTIFICATE No. ${ipc.ipc_no}</h1>
    <h2>${p?.name || 'Project'}</h2>
    <div class="header-grid"><div><b>Employer:</b> ${p?.employer || 'KeNHA'}</div><div><b>Contract No:</b> ${p?.contract_no || '—'}</div><div><b>Contractor:</b> ${p?.contractor_name || '—'}</div><div><b>FIDIC Edition:</b> ${p?.fidic_edition || '—'}</div><div><b>Period:</b> ${ipc.period_from} to ${ipc.period_to}</div><div><b>Contract Sum:</b> KES ${N(contractSum)}</div><div><b>IPC Status:</b> ${ipc.status}</div><div><b>Date Prepared:</b> ${ipc.created_at?.split('T')[0]}</div></div>
    <h3 style="margin:16px 0 8px">DETAILED VALUATION</h3>
    <table><thead><tr><th>Item No.</th><th>Description</th><th>Unit</th><th>Rate (KES)</th><th>BoQ Qty</th><th>BoQ Amount</th><th>Prev. Qty</th><th>This Period</th><th>Cum. Qty</th><th>Cum. Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <h3 style="margin:16px 0 8px">SUMMARY</h3>
    <table class="summary-table">
      <tr><td>A. Value of Works Executed to Date</td><td style="text-align:right;font-weight:600">KES ${N(worksValue)}</td></tr>
      ${matsSite > 0 ? `<tr><td>B. Materials on Site</td><td style="text-align:right">KES ${N(matsSite)}</td></tr>` : ''}
      ${vop > 0 ? `<tr><td>C. Variation of Prices (VoP)</td><td style="text-align:right">KES ${N(vop)}</td></tr>` : ''}
      <tr style="font-weight:600"><td>&nbsp;&nbsp;&nbsp;Gross Value</td><td style="text-align:right">KES ${N(ipc.gross_value)}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #ccc"></td></tr>
      <tr><td>&nbsp;&nbsp;&nbsp;Less: Previous Certificates</td><td style="text-align:right">KES ${N(previousGross)}</td></tr>
      <tr style="font-weight:600"><td>&nbsp;&nbsp;&nbsp;Value This Period</td><td style="text-align:right">KES ${N(thisPeriodGross)}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #ccc"></td></tr>
      <tr><td>Less: Retention (${ipc.retention_pct}%)</td><td style="text-align:right;color:#c00">- KES ${N(ipc.retention_amount)}</td></tr>
      <tr><td>Less: Advance Payment Recovery</td><td style="text-align:right;color:#c00">- KES ${N(ipc.advance_recovery)}</td></tr>
      ${ipc.other_deductions > 0 ? `<tr><td>Less: Other Deductions</td><td style="text-align:right;color:#c00">- KES ${N(ipc.other_deductions)}</td></tr>` : ''}
      <tr><td colspan="2" style="border-top:1px solid #ccc"></td></tr>
      <tr class="total"><td>NET AMOUNT DUE THIS CERTIFICATE</td><td style="text-align:right">KES ${N(ipc.net_amount)}</td></tr>
    </table>
    ${ipc.notes ? `<div style="margin-top:16px;padding:8px;border:1px solid #ddd;font-size:11px"><b>Notes:</b> ${ipc.notes}</div>` : ''}
    <div class="sign-grid"><div><div><b>Prepared by (RE / QS):</b></div><div class="sign-box">Name: ${ipc.preparer?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.created_at?.split('T')[0] || '___'}</div></div><div><div><b>Checked by (Project Engineer):</b></div><div class="sign-box">Name: _______________<br>Signature: _______________<br>Date: _______________</div></div><div><div><b>Certified by (The Engineer):</b></div><div class="sign-box">Name: ${ipc.certifier?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.certified_date || '___'}</div></div></div>
    <div style="margin-top:30px;text-align:center;font-size:10px;color:#999">Generated by RoadSite Reports v15.7 — Road Project Management</div>
    </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  }

  const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const N = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const statusBadge = (s) => {
    const m = { Draft: 'muted', Submitted: 'accent', Certified: 'success', Paid: 'success', Disputed: 'danger' };
    return <span className={`badge badge-${m[s] || 'muted'}`}>{s}</span>;
  };

  // Derived values
  const contractSum = boqItems.reduce((s, i) => s + (i.boq_amount || 0), 0);
  const currentWorksValue = boqItems.reduce((s, i) => s + ((i.completed_quantity || 0) * (i.rate || 0)), 0);
  const lastIpc = ipcs.length > 0 ? ipcs[0] : null;
  const previousGross = lastIpc ? lastIpc.gross_value : 0;
  const thisPeriodValue = currentWorksValue - previousGross;
  const totalCertified = ipcs.filter(i => i.status === 'Certified' || i.status === 'Paid').reduce((s, i) => s + (i.net_amount || 0), 0);
  const totalPaid = ipcs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.net_amount || 0), 0);
  const outstanding = totalCertified - totalPaid;
  const progressPct = contractSum > 0 ? Math.min(100, (currentWorksValue / contractSum) * 100) : 0;

  // Late payment check — FIDIC Cl. 14.8: 56 days from submission
  function daysOverdue(ipc) {
    if (ipc.status === 'Paid' || ipc.status === 'Draft') return 0;
    const submitted = ipc.submitted_date || ipc.created_at?.split('T')[0];
    if (!submitted) return 0;
    const due = new Date(submitted);
    due.setDate(due.getDate() + 56);
    const diff = Math.floor((new Date() - due) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  return (
    <div>
      <div className="page-header">
        <div><h2>💰 Interim Payment Certificates</h2><div className="subtitle">FIDIC Cl. 14 — Auto-generated from BoQ valuations</div></div>
        {selectedProject && canManage && boqItems.length > 0 && (
          <button className="btn btn-primary" onClick={() => {
            setEditingIpc(null);
            const today = new Date().toISOString().split('T')[0];
            const lastDate = lastIpc?.period_to || projectData?.commencement_date || today;
            setGenForm({ ...genForm, period_from: lastDate, period_to: today });
            setShowGenerateModal(true);
          }}>+ Generate IPC</button>
        )}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedIpc(null); setTab('dashboard'); }} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && (
        <>
          <div className="tabs">
            <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>IPC History ({ipcs.length})</button>
            {selectedIpc && <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>IPC No. {selectedIpc.ipc_no}</button>}
          </div>

          {/* ── DASHBOARD TAB ── */}
          {tab === 'dashboard' && (
            <div>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Contract Sum', value: fmt(contractSum), color: '#6366f1' },
                  { label: 'Works Executed', value: fmt(currentWorksValue), color: '#3b82f6' },
                  { label: 'Total Certified', value: fmt(totalCertified), color: '#10b981' },
                  { label: 'Total Paid', value: fmt(totalPaid), color: '#059669' },
                  { label: 'Outstanding', value: fmt(outstanding), color: outstanding > 0 ? '#f59e0b' : '#10b981' },
                  { label: 'IPCs Issued', value: ipcs.length, color: '#8b5cf6' },
                ].map((kpi, i) => (
                  <div key={i} className="card" style={{ padding: 16, borderLeft: `3px solid ${kpi.color}` }}>
                    <div className="text-sm text-muted">{kpi.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>Financial Progress</span>
                  <span style={{ fontWeight: 700 }}>{progressPct.toFixed(1)}%</span>
                </div>
                <div style={{ background: 'var(--border)', borderRadius: 6, height: 14, overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(90deg, #3b82f6, #10b981)', width: `${progressPct}%`, height: '100%', borderRadius: 6, transition: 'width 0.5s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                  <span>Executed: {fmt(currentWorksValue)}</span>
                  <span>Contract: {fmt(contractSum)}</span>
                </div>
              </div>

              {/* Payment timeline */}
              {ipcs.length > 0 && (
                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Payment Timeline</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...ipcs].reverse().map(ipc => {
                      const overdue = daysOverdue(ipc);
                      const statusColors = { Draft: '#9ca3af', Submitted: '#3b82f6', Certified: '#10b981', Paid: '#059669', Disputed: '#ef4444' };
                      return (
                        <div key={ipc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-hover)', cursor: 'pointer' }} onClick={() => viewIpc(ipc)}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: statusColors[ipc.status], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{ipc.ipc_no}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{ipc.period_from} — {ipc.period_to}</div>
                            <div className="text-sm text-muted">Net: {fmt(ipc.net_amount)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {statusBadge(ipc.status)}
                            {overdue > 0 && <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>⚠ {overdue} days overdue</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {ipcs.length === 0 && boqItems.length > 0 && (
                <div className="card empty-state">
                  <div className="icon">💰</div>
                  <p>Ready to generate IPC No. 1</p>
                  <p className="text-sm text-muted">BoQ has {boqItems.length} items valued at {fmt(currentWorksValue)}</p>
                </div>
              )}
              {boqItems.length === 0 && (
                <div className="card empty-state">
                  <div className="icon">📋</div>
                  <p>Upload BoQ items first, then generate IPCs</p>
                </div>
              )}
            </div>
          )}

          {/* ── IPC LIST TAB ── */}
          {tab === 'list' && (
            ipcs.length === 0 ? (
              <div className="card empty-state"><div className="icon">💰</div><p>No IPCs generated yet</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>IPC</th><th>Period</th><th>Works Value</th><th>Gross</th><th>Deductions</th><th>Net Amount</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {ipcs.map(ipc => {
                      const totalDeductions = (ipc.retention_amount || 0) + (ipc.advance_recovery || 0) + (ipc.other_deductions || 0);
                      const overdue = daysOverdue(ipc);
                      return (
                        <tr key={ipc.id} style={{ cursor: 'pointer' }} onClick={() => viewIpc(ipc)}>
                          <td style={{ fontWeight: 700, fontSize: 16 }}>{ipc.ipc_no}</td>
                          <td className="text-mono text-sm">{ipc.period_from} — {ipc.period_to}</td>
                          <td className="text-mono text-sm">{fmt(ipc.works_value || ipc.gross_value)}</td>
                          <td className="text-mono">{fmt(ipc.gross_value)}</td>
                          <td className="text-mono text-sm" style={{ color: 'var(--danger)' }}>-{fmt(totalDeductions)}</td>
                          <td className="text-mono text-accent" style={{ fontWeight: 700 }}>{fmt(ipc.net_amount)}</td>
                          <td>
                            {statusBadge(ipc.status)}
                            {overdue > 0 && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6 }}>⚠ {overdue}d</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); viewIpc(ipc); }}>View</button>
                              {canManage && ipc.status === 'Draft' && (
                                <>
                                  <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); openEditIpc(ipc); }}>Edit</button>
                                  <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); updateIpcStatus(ipc.id, 'Submitted'); }}>Submit</button>
                                  <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); deleteIpc(ipc); }}>×</button>
                                </>
                              )}
                              {canManage && ipc.status === 'Submitted' && (
                                <button className="btn btn-sm btn-success" onClick={e => { e.stopPropagation(); updateIpcStatus(ipc.id, 'Certified'); }}>Certify</button>
                              )}
                              {canManage && ipc.status === 'Certified' && (
                                <button className="btn btn-sm btn-success" onClick={e => { e.stopPropagation(); updateIpcStatus(ipc.id, 'Paid'); }}>Mark Paid</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── IPC DETAIL TAB ── */}
          {tab === 'detail' && selectedIpc && (() => {
            const ipc = selectedIpc;
            const prevIpc = ipcs.find(i => i.ipc_no === ipc.ipc_no - 1);
            const prevGross = prevIpc ? prevIpc.gross_value : 0;
            const thisPeriod = ipc.gross_value - prevGross;
            const worksVal = ipc.works_value || ipc.gross_value;
            const matsSite = ipc.materials_on_site || 0;
            const vop = ipc.vop_amount || 0;
            const overdue = daysOverdue(ipc);

            return (
              <div>
                <div className="card" style={{ padding: 24, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>IPC No. {ipc.ipc_no} — {projectData?.name}</h3>
                      <div className="text-sm text-muted">Period: {ipc.period_from} to {ipc.period_to}</div>
                      {overdue > 0 && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginTop: 4 }}>⚠ Payment overdue by {overdue} days (FIDIC Cl. 14.8 — 56 days from submission)</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canManage && ipc.status === 'Draft' && <button className="btn btn-secondary" onClick={() => openEditIpc(ipc)}>✏️ Edit</button>}
                      <button className="btn btn-primary" onClick={printIPC}>🖨️ Print / PDF</button>
                      {statusBadge(ipc.status)}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={{ fontSize: 13 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                        <div><span className="text-muted">Employer:</span> {projectData?.employer}</div>
                        <div><span className="text-muted">Contract No:</span> {projectData?.contract_no || '—'}</div>
                        <div><span className="text-muted">Contractor:</span> {projectData?.contractor_name || '—'}</div>
                        <div><span className="text-muted">FIDIC:</span> {projectData?.fidic_edition || '—'}</div>
                        <div><span className="text-muted">Prepared by:</span> {ipc.preparer?.full_name || '—'}</div>
                        <div><span className="text-muted">Certified by:</span> {ipc.certifier?.full_name || '—'}</div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', fontSize: 13 }}>
                        <div>A. Value of Works Executed:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(worksVal)}</div>
                        {matsSite > 0 && <><div>B. Materials on Site:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(matsSite)}</div></>}
                        {vop > 0 && <><div>C. Variation of Prices:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(vop)}</div></>}
                        <div style={{ fontWeight: 600 }}>Gross Value to Date:</div><div className="text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(ipc.gross_value)}</div>
                        <div>Less: Previous Certificates:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(prevGross)}</div>
                        <div className="text-accent" style={{ fontWeight: 600 }}>This Period:</div><div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(thisPeriod)}</div>
                        <div style={{ borderTop: '1px solid var(--border)', gridColumn: 'span 2', margin: '4px 0' }} />
                        <div>Retention ({ipc.retention_pct}%):</div><div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(ipc.retention_amount)}</div>
                        <div>Advance Recovery:</div><div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(ipc.advance_recovery)}</div>
                        {ipc.other_deductions > 0 && <><div>Other Deductions:</div><div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(ipc.other_deductions)}</div></>}
                        <div style={{ borderTop: '2px solid var(--accent)', gridColumn: 'span 2', margin: '4px 0' }} />
                        <div style={{ fontWeight: 700, fontSize: 15 }}>NET AMOUNT DUE:</div>
                        <div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{fmt(ipc.net_amount)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bill-by-bill valuation */}
                <div className="card">
                  <div className="card-header"><h3>Detailed Valuation — Bill by Bill</h3></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Item</th><th>Description</th><th>Unit</th><th>Rate</th><th>BoQ Qty</th><th>Prev Qty</th><th>This Period</th><th>Cum Qty</th><th>Cum Amount</th></tr></thead>
                      <tbody>
                        {(() => {
                          const grouped = {};
                          boqItems.forEach(i => {
                            const secId = i.section_id || '_unsectioned';
                            if (!grouped[secId]) grouped[secId] = { section: i.section || { section_no: '-', section_title: 'Other Items' }, items: [] };
                            grouped[secId].items.push(i);
                          });
                          return Object.values(grouped).flatMap(({ section, items }) => {
                            let secTotal = 0;
                            const rows = items.map(item => {
                              const prevQty = item.previous_quantity || 0;
                              const currQty = item.completed_quantity || 0;
                              const thisQty = currQty - prevQty;
                              const cumAmt = currQty * (item.rate || 0);
                              secTotal += cumAmt;
                              return (
                                <tr key={item.id}>
                                  <td className="text-mono" style={{ fontSize: 11 }}>{item.item_no}</td>
                                  <td style={{ fontSize: 11, maxWidth: 180 }}>{item.description}</td>
                                  <td style={{ fontSize: 11, textAlign: 'center' }}>{item.unit}</td>
                                  <td className="text-mono" style={{ fontSize: 11, textAlign: 'right' }}>{N(item.rate)}</td>
                                  <td className="text-mono" style={{ fontSize: 11, textAlign: 'right' }}>{N(item.boq_quantity)}</td>
                                  <td className="text-mono" style={{ fontSize: 11, textAlign: 'right' }}>{N(prevQty)}</td>
                                  <td className="text-mono" style={{ fontSize: 11, textAlign: 'right', fontWeight: 600, color: thisQty > 0 ? 'var(--accent)' : 'inherit' }}>{N(thisQty)}</td>
                                  <td className="text-mono" style={{ fontSize: 11, textAlign: 'right' }}>{N(currQty)}</td>
                                  <td className="text-mono" style={{ fontSize: 11, textAlign: 'right', fontWeight: 600 }}>{N(cumAmt)}</td>
                                </tr>
                              );
                            });
                            return [
                              <tr key={`sec-${section.section_no}`} style={{ background: 'var(--bg-hover)' }}><td colSpan={9} style={{ fontWeight: 700, padding: '6px 8px' }}>{section.section_no}: {section.section_title}</td></tr>,
                              ...rows,
                              <tr key={`total-${section.section_no}`} style={{ borderTop: '1px solid var(--border)' }}><td colSpan={8} style={{ textAlign: 'right', fontWeight: 600, fontSize: 11 }}>Section Total:</td><td className="text-mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 11 }}>{N(secTotal)}</td></tr>
                            ];
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* ── GENERATE / EDIT IPC MODAL ── */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => { setShowGenerateModal(false); setEditingIpc(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <h3>{editingIpc ? `Edit IPC No. ${editingIpc.ipc_no}` : `Generate IPC No. ${(lastIpc?.ipc_no || 0) + 1}`}<button onClick={() => { setShowGenerateModal(false); setEditingIpc(null); }}>×</button></h3>

            <div style={{ background: 'var(--bg-hover)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px' }}>
                <div>Contract Sum:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(contractSum)}</div>
                <div>Current Works Value (from BoQ):</div><div className="text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(currentWorksValue)}</div>
                <div>Previous Certificate:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(previousGross)}</div>
                <div style={{ fontWeight: 600 }}>This Period Value:</div><div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(thisPeriodValue)}</div>
              </div>
            </div>

            <form onSubmit={generateIPC}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Period From *</label>
                  <input type="date" value={genForm.period_from} onChange={e => setGenForm({ ...genForm, period_from: e.target.value })} required /></div>
                <div className="form-group mb-16"><label>Period To *</label>
                  <input type="date" value={genForm.period_to} onChange={e => setGenForm({ ...genForm, period_to: e.target.value })} required /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Materials on Site (KES)</label>
                  <input type="number" step="0.01" value={genForm.materials_on_site} onChange={e => setGenForm({ ...genForm, materials_on_site: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Variation of Prices / VoP (KES)</label>
                  <input type="number" step="0.01" value={genForm.vop_amount} onChange={e => setGenForm({ ...genForm, vop_amount: e.target.value })} /></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Retention %</label>
                  <input type="number" step="0.5" value={genForm.retention_pct} onChange={e => setGenForm({ ...genForm, retention_pct: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Advance Recovery (KES)</label>
                  <input type="number" step="0.01" value={genForm.advance_recovery} onChange={e => setGenForm({ ...genForm, advance_recovery: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Other Deductions (KES)</label>
                  <input type="number" step="0.01" value={genForm.other_deductions} onChange={e => setGenForm({ ...genForm, other_deductions: e.target.value })} /></div>
              </div>
              <div className="form-group mb-16"><label>Notes</label>
                <textarea rows={2} value={genForm.notes} onChange={e => setGenForm({ ...genForm, notes: e.target.value })} placeholder="Any remarks for this certificate..." /></div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editingIpc ? '💾 Update IPC' : '💰 Generate IPC'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => { setShowGenerateModal(false); setEditingIpc(null); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
