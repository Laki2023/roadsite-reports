import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

export default function IPCPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [projectData, setProjectData] = useState(null);
  const [ipcs, setIpcs] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [boqSections, setBoqSections] = useState([]);
  const [tab, setTab] = useState('list');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedIpc, setSelectedIpc] = useState(null);
  const [genForm, setGenForm] = useState({
    period_from: '', period_to: '', retention_pct: 10,
    advance_recovery: 0, other_deductions: 0, notes: ''
  });
  const [saving, setSaving] = useState(false);
  const canManage = hasRole(profile?.role, 'engineer');

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

      // Calculate gross value from BoQ
      const grossValue = boqItems.reduce((s, i) => s + (i.value_to_date || 0), 0);
      const retentionPct = parseFloat(genForm.retention_pct) || 10;
      const retentionAmount = grossValue * (retentionPct / 100);
      const advanceRecovery = parseFloat(genForm.advance_recovery) || 0;
      const otherDeductions = parseFloat(genForm.other_deductions) || 0;
      const previousCertified = lastIpc ? lastIpc.gross_value - lastIpc.retention_amount - lastIpc.advance_recovery - lastIpc.other_deductions : 0;
      const netAmount = grossValue - retentionAmount - advanceRecovery - otherDeductions;

      // Save IPC
      const { data: ipc, error } = await supabase.from('ipc_certificates').insert({
        project_id: selectedProject, ipc_no: ipcNo,
        period_from: genForm.period_from, period_to: genForm.period_to,
        gross_value: grossValue, retention_pct: retentionPct,
        retention_amount: retentionAmount, advance_recovery: advanceRecovery,
        other_deductions: otherDeductions, net_amount: netAmount,
        prepared_by: profile.id, status: 'Draft', notes: genForm.notes,
      }).select().single();
      if (error) throw error;

      // Snapshot current quantities as previous for next IPC
      for (const item of boqItems) {
        await supabase.from('boq_items').update({ previous_quantity: item.completed_quantity }).eq('id', item.id);
      }

      showToast(`IPC No. ${ipcNo} generated — ${fmt(netAmount)} net`);
      setShowGenerateModal(false);
      setGenForm({ period_from: '', period_to: '', retention_pct: 10, advance_recovery: 0, other_deductions: 0, notes: '' });
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

  function viewIpc(ipc) {
    setSelectedIpc(ipc);
    setTab('detail');
  }

  function printIPC() {
    const printWindow = window.open('', '_blank');
    const ipc = selectedIpc;
    const p = projectData;
    const lastIpc = ipcs.find(i => i.ipc_no === ipc.ipc_no - 1);
    const previousGross = lastIpc ? lastIpc.gross_value : 0;
    const thisPeriodGross = ipc.gross_value - previousGross;

    // Group items by section
    const grouped = {};
    const unsectioned = [];
    boqItems.forEach(i => {
      if (i.section_id && i.section) {
        if (!grouped[i.section_id]) grouped[i.section_id] = { section: i.section, items: [] };
        grouped[i.section_id].items.push(i);
      } else {
        unsectioned.push(i);
      }
    });

    const allGroups = [...Object.values(grouped)];
    if (unsectioned.length > 0) allGroups.push({ section: { section_no: '-', section_title: 'Other Items' }, items: unsectioned });

    let itemRows = '';
    let runningBoqTotal = 0;
    let runningValueTotal = 0;

    allGroups.forEach(({ section, items }) => {
      itemRows += `<tr style="background:#f0f0f0;font-weight:700"><td colspan="10" style="padding:6px 8px">${section.section_no}: ${section.section_title}</td></tr>`;
      let secBoqTotal = 0, secValueTotal = 0;
      items.forEach(item => {
        const prevQty = item.previous_quantity || 0;
        const currQty = item.completed_quantity || 0;
        const thisQty = currQty - prevQty;
        const prevAmt = prevQty * item.rate;
        const thisAmt = thisQty * item.rate;
        const cumAmt = currQty * item.rate;
        secBoqTotal += item.boq_amount || 0;
        secValueTotal += cumAmt;
        itemRows += `<tr>
          <td style="font-size:10px">${item.item_no}</td>
          <td style="font-size:10px;max-width:180px">${item.description}</td>
          <td style="text-align:center;font-size:10px">${item.unit}</td>
          <td style="text-align:right;font-size:10px">${N(item.rate)}</td>
          <td style="text-align:right;font-size:10px">${N(item.boq_quantity)}</td>
          <td style="text-align:right;font-size:10px">${N(item.boq_amount)}</td>
          <td style="text-align:right;font-size:10px">${N(prevQty)}</td>
          <td style="text-align:right;font-size:10px;font-weight:600">${N(thisQty)}</td>
          <td style="text-align:right;font-size:10px">${N(currQty)}</td>
          <td style="text-align:right;font-size:10px;font-weight:600">${N(cumAmt)}</td>
        </tr>`;
      });
      runningBoqTotal += secBoqTotal;
      runningValueTotal += secValueTotal;
      itemRows += `<tr style="border-top:1px solid #999;font-weight:600"><td colspan="5" style="text-align:right;padding:4px 8px">Section Total:</td><td style="text-align:right">${N(secBoqTotal)}</td><td colspan="3"></td><td style="text-align:right">${N(secValueTotal)}</td></tr>`;
    });

    const html = `<!DOCTYPE html><html><head><title>IPC No. ${ipc.ipc_no} — ${p?.name}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#333}
      h1{font-size:18px;text-align:center;margin:0}
      h2{font-size:14px;text-align:center;margin:4px 0 16px;color:#666}
      .header-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:11px;margin-bottom:16px;padding:10px;border:1px solid #ccc}
      .header-grid b{min-width:120px;display:inline-block}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#2a2a2a;color:#fff;padding:6px 8px;font-size:10px;text-align:left;border:1px solid #444}
      td{padding:4px 8px;border:1px solid #ddd}
      .summary-table{max-width:500px;margin-left:auto}
      .summary-table td{padding:6px 10px;font-size:12px}
      .summary-table .total{font-weight:700;font-size:14px;border-top:2px solid #333}
      .sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;font-size:11px}
      .sign-box{border-top:1px solid #333;padding-top:6px;margin-top:50px}
      @media print{body{margin:10px}@page{size:landscape;margin:10mm}}
    </style></head><body>
    <h1>INTERIM PAYMENT CERTIFICATE No. ${ipc.ipc_no}</h1>
    <h2>${p?.name || 'Project'}</h2>
    <div class="header-grid">
      <div><b>Employer:</b> ${p?.employer || 'KeNHA'}</div>
      <div><b>Contract No:</b> ${p?.contract_no || '—'}</div>
      <div><b>Contractor:</b> ${p?.contractor_name || '—'}</div>
      <div><b>FIDIC Edition:</b> ${p?.fidic_edition || '—'}</div>
      <div><b>Period:</b> ${ipc.period_from} to ${ipc.period_to}</div>
      <div><b>Contract Sum:</b> KES ${N(boqItems.reduce((s,i) => s + (i.boq_amount||0), 0))}</div>
      <div><b>IPC Status:</b> ${ipc.status}</div>
      <div><b>Date Prepared:</b> ${ipc.created_at?.split('T')[0]}</div>
    </div>

    <h3 style="margin:16px 0 8px">DETAILED VALUATION</h3>
    <table>
      <thead><tr>
        <th>Item No.</th><th>Description</th><th>Unit</th><th>Rate (KES)</th>
        <th>BoQ Qty</th><th>BoQ Amount</th><th>Prev. Qty</th>
        <th>This Period</th><th>Cum. Qty</th><th>Cum. Amount</th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>

    <h3 style="margin:16px 0 8px">SUMMARY</h3>
    <table class="summary-table">
      <tr><td>A. Gross Value of Work Done to Date</td><td style="text-align:right;font-weight:600">KES ${N(ipc.gross_value)}</td></tr>
      <tr><td>&nbsp;&nbsp;&nbsp;Less: Previous Certificates</td><td style="text-align:right">KES ${N(previousGross)}</td></tr>
      <tr><td>&nbsp;&nbsp;&nbsp;<b>Value of Work This Period</b></td><td style="text-align:right;font-weight:600">KES ${N(thisPeriodGross)}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #ccc"></td></tr>
      <tr><td>B. Retention (${ipc.retention_pct}%)</td><td style="text-align:right;color:#c00">- KES ${N(ipc.retention_amount)}</td></tr>
      <tr><td>C. Advance Payment Recovery</td><td style="text-align:right;color:#c00">- KES ${N(ipc.advance_recovery)}</td></tr>
      <tr><td>D. Other Deductions</td><td style="text-align:right;color:#c00">- KES ${N(ipc.other_deductions)}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #ccc"></td></tr>
      <tr class="total"><td>NET AMOUNT DUE</td><td style="text-align:right">KES ${N(ipc.net_amount)}</td></tr>
    </table>

    ${ipc.notes ? `<div style="margin-top:16px;padding:8px;border:1px solid #ddd;font-size:11px"><b>Notes:</b> ${ipc.notes}</div>` : ''}

    <div class="sign-grid">
      <div>
        <div><b>Prepared by (Quantity Surveyor):</b></div>
        <div class="sign-box">Name: ${ipc.preparer?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.created_at?.split('T')[0] || '_______________'}</div>
      </div>
      <div>
        <div><b>Certified by (The Engineer):</b></div>
        <div class="sign-box">Name: ${ipc.certifier?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.certified_date || '_______________'}</div>
      </div>
    </div>

    <div style="margin-top:30px;text-align:center;font-size:10px;color:#999">
      Generated by RoadSite Reports v7.0 — Road Project Management
    </div>
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

  // Auto-calculate current values for the generate modal
  const currentGross = boqItems.reduce((s, i) => s + (i.value_to_date || 0), 0);
  const lastIpc = ipcs.length > 0 ? ipcs[0] : null;
  const previousGross = lastIpc ? lastIpc.gross_value : 0;
  const thisPeriodValue = currentGross - previousGross;

  return (
    <div>
      <div className="page-header">
        <div><h2>💰 Interim Payment Certificates</h2><div className="subtitle">Auto-generated from BoQ valuations</div></div>
        {selectedProject && canManage && boqItems.length > 0 && (
          <button className="btn btn-primary" onClick={() => {
            const today = new Date().toISOString().split('T')[0];
            const lastDate = lastIpc?.period_to || projectData?.commencement_date || today;
            setGenForm({ ...genForm, period_from: lastDate, period_to: today });
            setShowGenerateModal(true);
          }}>+ Generate IPC</button>
        )}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => { setSelectedProject(e.target.value); setSelectedIpc(null); setTab('list'); }} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && (
        <>
          <div className="tabs">
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>IPC History ({ipcs.length})</button>
            {selectedIpc && <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>IPC No. {selectedIpc.ipc_no}</button>}
          </div>

          {tab === 'list' && (
            ipcs.length === 0 ? (
              <div className="card empty-state">
                <div className="icon">💰</div>
                <p>No IPCs generated yet</p>
                {boqItems.length === 0 ? (
                  <p className="text-sm text-muted">Add BoQ items first, then generate IPCs automatically</p>
                ) : (
                  <p className="text-sm text-muted">BoQ has {boqItems.length} items valued at {fmt(currentGross)}. Ready to generate IPC No. 1.</p>
                )}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>IPC No.</th><th>Period</th><th>Gross Value</th><th>Retention</th><th>Deductions</th><th>Net Amount</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {ipcs.map(ipc => (
                      <tr key={ipc.id} style={{ cursor: 'pointer' }} onClick={() => viewIpc(ipc)}>
                        <td style={{ fontWeight: 700, fontSize: 16 }}>{ipc.ipc_no}</td>
                        <td className="text-mono text-sm">{ipc.period_from} — {ipc.period_to}</td>
                        <td className="text-mono">{fmt(ipc.gross_value)}</td>
                        <td className="text-mono text-sm" style={{ color: 'var(--danger)' }}>-{fmt(ipc.retention_amount)}</td>
                        <td className="text-mono text-sm" style={{ color: 'var(--danger)' }}>-{fmt((ipc.advance_recovery || 0) + (ipc.other_deductions || 0))}</td>
                        <td className="text-mono text-accent" style={{ fontWeight: 700 }}>{fmt(ipc.net_amount)}</td>
                        <td>{statusBadge(ipc.status)}</td>
                        <td>
                          <div className="btn-group">
                            <button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); viewIpc(ipc); }}>View</button>
                            {canManage && ipc.status === 'Draft' && (
                              <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); updateIpcStatus(ipc.id, 'Submitted'); }}>Submit</button>
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
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'detail' && selectedIpc && (() => {
            const ipc = selectedIpc;
            const prevIpc = ipcs.find(i => i.ipc_no === ipc.ipc_no - 1);
            const prevGross = prevIpc ? prevIpc.gross_value : 0;
            const thisPeriod = ipc.gross_value - prevGross;
            const contractSum = boqItems.reduce((s, i) => s + (i.boq_amount || 0), 0);

            return (
              <div>
                <div className="card" style={{ padding: 24, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ margin: 0 }}>IPC No. {ipc.ipc_no} — {projectData?.name}</h3>
                      <div className="text-sm text-muted">Period: {ipc.period_from} to {ipc.period_to}</div>
                    </div>
                    <div className="btn-group">
                      <button className="btn btn-primary" onClick={printIPC}>🖨️ Print / Download PDF</button>
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
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 16px', fontSize: 13 }}>
                        <div>Contract Sum:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(contractSum)}</div>
                        <div>Gross Value to Date:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmt(ipc.gross_value)}</div>
                        <div>This Period:</div><div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(thisPeriod)}</div>
                        <div style={{ borderTop: '1px solid var(--border)', gridColumn: 'span 2', margin: '4px 0' }} />
                        <div>Retention ({ipc.retention_pct}%):</div><div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(ipc.retention_amount)}</div>
                        <div>Advance Recovery:</div><div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(ipc.advance_recovery)}</div>
                        <div>Other Deductions:</div><div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(ipc.other_deductions)}</div>
                        <div style={{ borderTop: '2px solid var(--accent)', gridColumn: 'span 2', margin: '4px 0' }} />
                        <div style={{ fontWeight: 700, fontSize: 15 }}>NET AMOUNT DUE:</div>
                        <div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{fmt(ipc.net_amount)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* BoQ Items valuation */}
                <div className="card">
                  <div className="card-header"><h3>Detailed Valuation</h3></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Item</th><th>Description</th><th>Unit</th><th>Rate</th><th>BoQ Qty</th><th>Prev Qty</th><th>This Period</th><th>Cum Qty</th><th>Cum Amount</th></tr></thead>
                      <tbody>
                        {boqItems.map(item => {
                          const prevQty = item.previous_quantity || 0;
                          const currQty = item.completed_quantity || 0;
                          const thisQty = currQty - prevQty;
                          const cumAmt = currQty * item.rate;
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
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Generate IPC Modal */}
      {showGenerateModal && (
        <div className="modal-overlay" onClick={() => setShowGenerateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Generate IPC No. {(lastIpc?.ipc_no || 0) + 1}<button onClick={() => setShowGenerateModal(false)}>×</button></h3>

            <div style={{ background: 'var(--bg-hover)', padding: 14, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px' }}>
                <div>Current Gross Value (from BoQ):</div><div className="text-mono" style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(currentGross)}</div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Retention %</label>
                  <input type="number" step="0.5" value={genForm.retention_pct} onChange={e => setGenForm({ ...genForm, retention_pct: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Advance Recovery</label>
                  <input type="number" step="0.01" value={genForm.advance_recovery} onChange={e => setGenForm({ ...genForm, advance_recovery: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Other Deductions</label>
                  <input type="number" step="0.01" value={genForm.other_deductions} onChange={e => setGenForm({ ...genForm, other_deductions: e.target.value })} /></div>
              </div>
              <div className="form-group mb-16"><label>Notes</label>
                <textarea rows={2} value={genForm.notes} onChange={e => setGenForm({ ...genForm, notes: e.target.value })} placeholder="Any remarks for this certificate..." /></div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Generating...' : '💰 Generate IPC'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowGenerateModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
