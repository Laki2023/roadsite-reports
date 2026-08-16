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
  const [showSignModal, setShowSignModal] = useState(null); // { ipc, stage }
  const [signDate, setSignDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
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
      supabase.from('ipc_certificates').select(`*,
        preparer:prepared_by(full_name),
        certifier:certified_by(full_name),
        re_checker:re_checked_by(full_name),
        pe_reviewer:pe_reviewed_by(full_name),
        eng_certifier:engineer_certified_by(full_name)
      `).eq('project_id', selectedProject).order('ipc_no', { ascending: true }),
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
      const lastIpc = ipcs.length > 0 ? ipcs[ipcs.length - 1] : null;
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
        net_amount: netAmount, certified_amount: netAmount,
        prepared_by: profile.id, status: 'Draft', notes: genForm.notes,
      };

      if (editingIpc) {
        const { error } = await supabase.from('ipc_certificates').update(payload).eq('id', editingIpc.id);
        if (error) throw error;
        showToast(`IPC No. ${editingIpc.ipc_no} updated — ${fmt(netAmount)} net`);
      } else {
        const { error } = await supabase.from('ipc_certificates').insert(payload).select().single();
        if (error) throw error;
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

  // ── FIDIC Signature Chain ──
  // Draft → Contractor Submits → RE Checks → PE Reviews → Engineer Certifies → Employer Pays
  async function signIpc(ipc, stage) {
    const updates = {};
    const today = signDate || new Date().toISOString().split('T')[0];

    if (stage === 'contractor_submit') {
      updates.contractor_submitted_date = today;
      updates.contractor_submitted_by = profile.full_name || profile.email;
      updates.status = 'Submitted';
    } else if (stage === 're_check') {
      updates.re_checked_date = today;
      updates.re_checked_by = profile.id;
      updates.status = 'RE Checked';
    } else if (stage === 'pe_review') {
      updates.pe_reviewed_date = today;
      updates.pe_reviewed_by = profile.id;
      updates.status = 'PE Reviewed';
    } else if (stage === 'engineer_certify') {
      updates.engineer_certified_date = today;
      updates.engineer_certified_by = profile.id;
      updates.certified_by = profile.id;
      updates.certified_date = today;
      updates.certified_amount = parseFloat(paidAmount) || ipc.net_amount;
      updates.status = 'Certified';
    } else if (stage === 'mark_paid') {
      updates.paid_date = today;
      updates.paid_amount = parseFloat(paidAmount) || ipc.certified_amount || ipc.net_amount;
      updates.payment_ref = paymentRef || null;
      updates.status = 'Paid';
    }

    const { error } = await supabase.from('ipc_certificates').update(updates).eq('id', ipc.id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(`IPC No. ${ipc.ipc_no} — ${stage.replace('_', ' ')} recorded`);
    setShowSignModal(null); setPaidAmount(''); setPaymentRef('');
    setSignDate(new Date().toISOString().split('T')[0]);
    loadData();
  }

  async function deleteIpc(ipc) {
    if (!window.confirm(`Delete Draft IPC No. ${ipc.ipc_no}? This cannot be undone.`)) return;
    await supabase.from('ipc_certificates').delete().eq('id', ipc.id);
    showToast('Draft IPC deleted'); setSelectedIpc(null); setTab('dashboard'); loadData();
  }

  function openEditIpc(ipc) {
    setEditingIpc(ipc);
    setGenForm({ period_from: ipc.period_from || '', period_to: ipc.period_to || '', retention_pct: ipc.retention_pct || 10,
      advance_recovery: ipc.advance_recovery || 0, materials_on_site: ipc.materials_on_site || 0,
      vop_amount: ipc.vop_amount || 0, other_deductions: ipc.other_deductions || 0, notes: ipc.notes || '' });
    setShowGenerateModal(true);
  }
  function viewIpc(ipc) { setSelectedIpc(ipc); setTab('detail'); }

  // ── Print / PDF ──
  function printIPC() {
    const printWindow = window.open('', '_blank');
    const ipc = selectedIpc; const p = projectData;
    const prevIpc = ipcs.find(i => i.ipc_no === ipc.ipc_no - 1);
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
        const prevQty = item.previous_quantity || 0; const currQty = item.completed_quantity || 0;
        const thisQty = currQty - prevQty; const cumAmt = currQty * (item.rate || 0); secTotal += cumAmt;
        itemRows += `<tr><td style="font-size:10px">${item.item_no}</td><td style="font-size:10px;max-width:180px">${item.description}</td><td style="text-align:center;font-size:10px">${item.unit}</td><td style="text-align:right;font-size:10px">${N(item.rate)}</td><td style="text-align:right;font-size:10px">${N(item.boq_quantity)}</td><td style="text-align:right;font-size:10px">${N(item.boq_amount)}</td><td style="text-align:right;font-size:10px">${N(prevQty)}</td><td style="text-align:right;font-size:10px;font-weight:600">${N(thisQty)}</td><td style="text-align:right;font-size:10px">${N(currQty)}</td><td style="text-align:right;font-size:10px;font-weight:600">${N(cumAmt)}</td></tr>`;
      });
      itemRows += `<tr style="border-top:1px solid #999;font-weight:600"><td colspan="5" style="text-align:right;padding:4px 8px">Section Total:</td><td></td><td colspan="3"></td><td style="text-align:right">${N(secTotal)}</td></tr>`;
    });
    const contractSum = boqItems.reduce((s, i) => s + (i.boq_amount || 0), 0);
    const worksValue = ipc.works_value || ipc.gross_value;
    const matsSite = ipc.materials_on_site || 0; const vop = ipc.vop_amount || 0;

    const html = `<!DOCTYPE html><html><head><title>IPC No. ${ipc.ipc_no} — ${p?.name}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px;color:#333}h1{font-size:18px;text-align:center;margin:0}h2{font-size:14px;text-align:center;margin:4px 0 16px;color:#666}.header-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:11px;margin-bottom:16px;padding:10px;border:1px solid #ccc}.header-grid b{min-width:120px;display:inline-block}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#2a2a2a;color:#fff;padding:6px 8px;font-size:10px;text-align:left;border:1px solid #444}td{padding:4px 8px;border:1px solid #ddd}.summary-table{max-width:500px;margin-left:auto}.summary-table td{padding:6px 10px;font-size:12px}.summary-table .total{font-weight:700;font-size:14px;border-top:2px solid #333}.sign-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px;margin-top:40px;font-size:10px}.sign-box{border-top:1px solid #333;padding-top:6px;margin-top:50px}@media print{body{margin:10mm}@page{size:landscape;margin:10mm}}</style></head><body>
    <h1>INTERIM PAYMENT CERTIFICATE No. ${ipc.ipc_no}</h1><h2>${p?.name || 'Project'}</h2>
    <div class="header-grid"><div><b>Employer:</b> ${p?.employer || 'KeNHA'}</div><div><b>Contract No:</b> ${p?.contract_no || '—'}</div><div><b>Contractor:</b> ${p?.contractor_name || '—'}</div><div><b>FIDIC Edition:</b> ${p?.fidic_edition || '—'}</div><div><b>Period:</b> ${ipc.period_from} to ${ipc.period_to}</div><div><b>Contract Sum:</b> KES ${N(contractSum)}</div><div><b>IPC Status:</b> ${ipc.status}</div><div><b>Date Prepared:</b> ${ipc.created_at?.split('T')[0]}</div></div>
    <h3 style="margin:16px 0 8px">DETAILED VALUATION</h3>
    <table><thead><tr><th>Item No.</th><th>Description</th><th>Unit</th><th>Rate (KES)</th><th>BoQ Qty</th><th>BoQ Amount</th><th>Prev. Qty</th><th>This Period</th><th>Cum. Qty</th><th>Cum. Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
    <h3 style="margin:16px 0 8px">SUMMARY</h3>
    <table class="summary-table">
      <tr><td>A. Value of Works Executed to Date</td><td style="text-align:right;font-weight:600">KES ${N(worksValue)}</td></tr>
      ${matsSite > 0 ? `<tr><td>B. Materials on Site</td><td style="text-align:right">KES ${N(matsSite)}</td></tr>` : ''}
      ${vop > 0 ? `<tr><td>C. Variation of Prices (VoP)</td><td style="text-align:right">KES ${N(vop)}</td></tr>` : ''}
      <tr style="font-weight:600"><td>&nbsp;&nbsp;&nbsp;Gross Value</td><td style="text-align:right">KES ${N(ipc.gross_value)}</td></tr>
      <tr><td>&nbsp;&nbsp;&nbsp;Less: Previous Certificates</td><td style="text-align:right">KES ${N(previousGross)}</td></tr>
      <tr style="font-weight:600"><td>&nbsp;&nbsp;&nbsp;Value This Period</td><td style="text-align:right">KES ${N(thisPeriodGross)}</td></tr>
      <tr><td>Less: Retention (${ipc.retention_pct}%)</td><td style="text-align:right;color:#c00">- KES ${N(ipc.retention_amount)}</td></tr>
      <tr><td>Less: Advance Payment Recovery</td><td style="text-align:right;color:#c00">- KES ${N(ipc.advance_recovery)}</td></tr>
      ${ipc.other_deductions > 0 ? `<tr><td>Less: Other Deductions</td><td style="text-align:right;color:#c00">- KES ${N(ipc.other_deductions)}</td></tr>` : ''}
      <tr class="total"><td>NET AMOUNT DUE THIS CERTIFICATE</td><td style="text-align:right">KES ${N(ipc.net_amount)}</td></tr>
    </table>
    <div class="sign-grid">
      <div><div><b>Contractor:</b></div><div class="sign-box">Name: ${ipc.contractor_submitted_by || '_______________'}<br>Signature: _______________<br>Date: ${ipc.contractor_submitted_date || '___'}</div></div>
      <div><div><b>Checked by (RE):</b></div><div class="sign-box">Name: ${ipc.re_checker?.full_name || ipc.preparer?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.re_checked_date || ipc.created_at?.split('T')[0] || '___'}</div></div>
      <div><div><b>Reviewed (PE):</b></div><div class="sign-box">Name: ${ipc.pe_reviewer?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.pe_reviewed_date || '___'}</div></div>
      <div><div><b>Certified (Engineer):</b></div><div class="sign-box">Name: ${ipc.eng_certifier?.full_name || ipc.certifier?.full_name || '_______________'}<br>Signature: _______________<br>Date: ${ipc.engineer_certified_date || ipc.certified_date || '___'}</div></div>
    </div>
    <div style="margin-top:30px;text-align:center;font-size:10px;color:#999">Generated by RoadSite Reports v15.9 — Road Project Management</div>
    </body></html>`;
    printWindow.document.write(html); printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  }

  const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const N = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const statusBadge = (s) => {
    const m = { Draft: 'muted', Submitted: 'accent', 'RE Checked': 'accent', 'PE Reviewed': 'accent', Certified: 'success', Paid: 'success', Disputed: 'danger' };
    return <span className={`badge badge-${m[s] || 'muted'}`}>{s}</span>;
  };

  // ── Derived values ──
  const contractSum = boqItems.reduce((s, i) => s + (i.boq_amount || 0), 0);
  const originalContractSum = projectData?.original_contract_sum || projectData?.contract_sum || contractSum;
  const revisedContractSum = projectData?.revised_contract_sum || originalContractSum;
  const currentWorksValue = boqItems.reduce((s, i) => s + ((i.completed_quantity || 0) * (i.rate || 0)), 0);
  const lastIpc = ipcs.length > 0 ? ipcs[ipcs.length - 1] : null;
  const previousGross = lastIpc ? lastIpc.gross_value : 0;
  const thisPeriodValue = currentWorksValue - previousGross;
  const totalCertified = ipcs.filter(i => ['Certified', 'Paid'].includes(i.status)).reduce((s, i) => s + (i.certified_amount || i.net_amount || 0), 0);
  const totalPaid = ipcs.filter(i => i.status === 'Paid').reduce((s, i) => s + (i.paid_amount || i.certified_amount || i.net_amount || 0), 0);
  const outstanding = totalCertified - totalPaid;
  const totalRetention = ipcs.reduce((s, i) => s + (i.retention_amount || 0), 0);
  const progressPct = contractSum > 0 ? Math.min(100, (currentWorksValue / contractSum) * 100) : 0;

  // Late payment — FIDIC Cl. 14.8: 56 days
  function daysOverdue(ipc) {
    if (ipc.status === 'Paid' || ipc.status === 'Draft') return 0;
    const submitted = ipc.contractor_submitted_date || ipc.submitted_date || ipc.created_at?.split('T')[0];
    if (!submitted) return 0;
    const due = new Date(submitted); due.setDate(due.getDate() + 56);
    return Math.max(0, Math.floor((new Date() - due) / 86400000));
  }
  function daysBetween(d1, d2) { if (!d1 || !d2) return null; return Math.floor((new Date(d2) - new Date(d1)) / 86400000); }

  return (
    <div>
      <div className="page-header">
        <div><h2>💰 Interim Payment Certificates</h2><div className="subtitle">FIDIC Cl. 14 — Full IPC Lifecycle Tracking</div></div>
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
            <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Financial Summary</button>
            <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>IPC Register ({ipcs.length})</button>
            <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>IPC Details</button>
            {selectedIpc && <button className={tab === 'detail' ? 'active' : ''} onClick={() => setTab('detail')}>IPC No. {selectedIpc.ipc_no}</button>}
          </div>

          {/* ══════ FINANCIAL SUMMARY TAB ══════ */}
          {tab === 'dashboard' && (
            <div>
              {/* Auto-Generated Financial Position */}
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>📊 Contract Financial Position <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— auto-generated from BoQ & IPCs</span></h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Original Contract Sum', value: fmt(originalContractSum), icon: '📋', color: '#6366f1' },
                    { label: 'Revised Contract Sum', value: fmt(revisedContractSum), icon: '📝', color: revisedContractSum !== originalContractSum ? '#f59e0b' : '#6366f1' },
                    { label: 'Value of Works Done', value: fmt(currentWorksValue), icon: '⛏️', color: '#3b82f6' },
                    { label: 'Total Certified', value: fmt(totalCertified), icon: '✅', color: '#10b981' },
                    { label: 'Total Paid', value: fmt(totalPaid), icon: '💵', color: '#059669' },
                    { label: 'Outstanding (Unpaid)', value: fmt(outstanding), icon: '⏳', color: outstanding > 0 ? '#ef4444' : '#10b981' },
                    { label: 'Retention Held', value: fmt(totalRetention), icon: '🔒', color: '#8b5cf6' },
                    { label: 'Financial Progress', value: `${progressPct.toFixed(1)}%`, icon: '📈', color: '#3b82f6' },
                  ].map((kpi, i) => (
                    <div key={i} style={{ padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border)', borderLeft: `4px solid ${kpi.color}`, background: 'var(--bg-card)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kpi.label}</span>
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{kpi.value}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bars */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Physical Progress (Works Done / Contract Sum)</span>
                      <span style={{ fontWeight: 700 }}>{progressPct.toFixed(1)}%</span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #3b82f6, #10b981)', width: `${progressPct}%`, height: '100%', borderRadius: 6, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Payment Progress (Paid / Certified)</span>
                      <span style={{ fontWeight: 700 }}>{totalCertified > 0 ? ((totalPaid / totalCertified) * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div style={{ background: 'var(--border)', borderRadius: 6, height: 12, overflow: 'hidden' }}>
                      <div style={{ background: 'linear-gradient(90deg, #059669, #10b981)', width: `${totalCertified > 0 ? (totalPaid / totalCertified) * 100 : 0}%`, height: '100%', borderRadius: 6 }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment timeline */}
              {ipcs.length > 0 && (
                <div className="card" style={{ padding: 16 }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Payment Timeline</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ipcs.map(ipc => {
                      const overdue = daysOverdue(ipc);
                      const statusColors = { Draft: '#9ca3af', Submitted: '#3b82f6', 'RE Checked': '#6366f1', 'PE Reviewed': '#8b5cf6', Certified: '#10b981', Paid: '#059669', Disputed: '#ef4444' };
                      return (
                        <div key={ipc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-hover)', cursor: 'pointer' }} onClick={() => viewIpc(ipc)}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: statusColors[ipc.status] || '#9ca3af', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{ipc.ipc_no}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{ipc.period_from} — {ipc.period_to}</div>
                            <div className="text-sm text-muted">Net: {fmt(ipc.net_amount)}{ipc.paid_amount ? ` • Paid: ${fmt(ipc.paid_amount)}` : ''}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {statusBadge(ipc.status)}
                            {overdue > 0 && <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>⚠ {overdue}d overdue</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {ipcs.length === 0 && boqItems.length > 0 && (
                <div className="card empty-state"><div className="icon">💰</div><p>Ready to generate IPC No. 1</p><p className="text-sm text-muted">BoQ has {boqItems.length} items valued at {fmt(currentWorksValue)}</p></div>
              )}
              {boqItems.length === 0 && (
                <div className="card empty-state"><div className="icon">📋</div><p>Upload BoQ items first, then generate IPCs</p></div>
              )}
            </div>
          )}

          {/* ══════ IPC REGISTER TAB — Full Lifecycle Tracker ══════ */}
          {tab === 'register' && (
            <div>
              <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>📋 IPC Register — Signature Chain & Payment Tracking</h3>
                <p className="text-sm text-muted" style={{ margin: 0 }}>FIDIC Cl. 14.3–14.8 lifecycle: Contractor Application → RE Check → PE Review → Engineer Certification → Payment</p>
              </div>

              {ipcs.length === 0 ? (
                <div className="card empty-state"><div className="icon">💰</div><p>No IPCs generated yet</p></div>
              ) : (
                <div className="table-wrap">
                  <table style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>IPC</th>
                        <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Period</th>
                        <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Net Amount</th>
                        <th colSpan={2} style={{ textAlign: 'center', background: '#eef2ff', color: '#4338ca' }}>Contractor</th>
                        <th colSpan={2} style={{ textAlign: 'center', background: '#ecfdf5', color: '#065f46' }}>RE Check</th>
                        <th colSpan={2} style={{ textAlign: 'center', background: '#fef3c7', color: '#92400e' }}>PE Review</th>
                        <th colSpan={2} style={{ textAlign: 'center', background: '#dcfce7', color: '#166534' }}>Engineer Certify</th>
                        <th colSpan={3} style={{ textAlign: 'center', background: '#f0fdf4', color: '#15803d' }}>Payment</th>
                        <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Status</th>
                        <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>Actions</th>
                      </tr>
                      <tr>
                        <th style={{ fontSize: 9, background: '#eef2ff' }}>By</th><th style={{ fontSize: 9, background: '#eef2ff' }}>Date</th>
                        <th style={{ fontSize: 9, background: '#ecfdf5' }}>By</th><th style={{ fontSize: 9, background: '#ecfdf5' }}>Date</th>
                        <th style={{ fontSize: 9, background: '#fef3c7' }}>By</th><th style={{ fontSize: 9, background: '#fef3c7' }}>Date</th>
                        <th style={{ fontSize: 9, background: '#dcfce7' }}>By</th><th style={{ fontSize: 9, background: '#dcfce7' }}>Date</th>
                        <th style={{ fontSize: 9, background: '#f0fdf4' }}>Amount</th><th style={{ fontSize: 9, background: '#f0fdf4' }}>Date</th><th style={{ fontSize: 9, background: '#f0fdf4' }}>Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ipcs.map(ipc => {
                        const overdue = daysOverdue(ipc);
                        const certDays = daysBetween(ipc.contractor_submitted_date, ipc.engineer_certified_date || ipc.certified_date);
                        const payDays = daysBetween(ipc.contractor_submitted_date, ipc.paid_date);
                        return (
                          <tr key={ipc.id} style={{ cursor: 'pointer' }} onClick={() => viewIpc(ipc)}>
                            <td style={{ fontWeight: 700, fontSize: 14, textAlign: 'center' }}>{ipc.ipc_no}</td>
                            <td className="text-mono" style={{ whiteSpace: 'nowrap' }}>{ipc.period_from}<br/>{ipc.period_to}</td>
                            <td className="text-mono" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{fmt(ipc.net_amount)}</td>
                            {/* Contractor */}
                            <td style={{ fontSize: 10 }}>{ipc.contractor_submitted_by || '—'}</td>
                            <td className="text-mono" style={{ fontSize: 10 }}>{ipc.contractor_submitted_date || '—'}</td>
                            {/* RE */}
                            <td style={{ fontSize: 10 }}>{ipc.re_checker?.full_name || ipc.preparer?.full_name || '—'}</td>
                            <td className="text-mono" style={{ fontSize: 10 }}>{ipc.re_checked_date || ipc.created_at?.split('T')[0] || '—'}</td>
                            {/* PE */}
                            <td style={{ fontSize: 10 }}>{ipc.pe_reviewer?.full_name || '—'}</td>
                            <td className="text-mono" style={{ fontSize: 10 }}>{ipc.pe_reviewed_date || '—'}</td>
                            {/* Engineer */}
                            <td style={{ fontSize: 10 }}>{ipc.eng_certifier?.full_name || ipc.certifier?.full_name || '—'}</td>
                            <td className="text-mono" style={{ fontSize: 10 }}>{ipc.engineer_certified_date || ipc.certified_date || '—'}</td>
                            {/* Payment */}
                            <td className="text-mono" style={{ fontSize: 10, fontWeight: 600, color: ipc.paid_amount ? '#059669' : 'inherit' }}>{ipc.paid_amount ? fmt(ipc.paid_amount) : '—'}</td>
                            <td className="text-mono" style={{ fontSize: 10 }}>{ipc.paid_date || '—'}</td>
                            <td style={{ fontSize: 10 }}>{ipc.payment_ref || '—'}</td>
                            {/* Status */}
                            <td>
                              {statusBadge(ipc.status)}
                              {overdue > 0 && <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 600 }}>⚠ {overdue}d</div>}
                              {payDays != null && ipc.status === 'Paid' && <div style={{ fontSize: 9, color: payDays > 56 ? '#ef4444' : '#10b981' }}>{payDays}d total</div>}
                            </td>
                            {/* Actions */}
                            <td onClick={e => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                {canManage && ipc.status === 'Draft' && (
                                  <>
                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => { setShowSignModal({ ipc, stage: 'contractor_submit' }); setSignDate(new Date().toISOString().split('T')[0]); }}>Submit</button>
                                    <button className="btn btn-sm btn-secondary" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => openEditIpc(ipc)}>Edit</button>
                                    <button className="btn btn-sm btn-danger" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => deleteIpc(ipc)}>×</button>
                                  </>
                                )}
                                {canManage && ipc.status === 'Submitted' && (
                                  <button className="btn btn-sm btn-accent" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => { setShowSignModal({ ipc, stage: 're_check' }); setSignDate(new Date().toISOString().split('T')[0]); }}>RE Check</button>
                                )}
                                {canManage && ipc.status === 'RE Checked' && (
                                  <button className="btn btn-sm btn-accent" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => { setShowSignModal({ ipc, stage: 'pe_review' }); setSignDate(new Date().toISOString().split('T')[0]); }}>PE Review</button>
                                )}
                                {canManage && ipc.status === 'PE Reviewed' && (
                                  <button className="btn btn-sm btn-success" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => { setShowSignModal({ ipc, stage: 'engineer_certify' }); setSignDate(new Date().toISOString().split('T')[0]); setPaidAmount(ipc.net_amount); }}>Certify</button>
                                )}
                                {canManage && ipc.status === 'Certified' && (
                                  <button className="btn btn-sm btn-success" style={{ fontSize: 9, padding: '2px 6px' }} onClick={() => { setShowSignModal({ ipc, stage: 'mark_paid' }); setSignDate(new Date().toISOString().split('T')[0]); setPaidAmount(ipc.certified_amount || ipc.net_amount); }}>Paid</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Totals row */}
                      <tr style={{ fontWeight: 700, borderTop: '2px solid var(--accent)', background: 'var(--bg-hover)' }}>
                        <td colSpan={2}>TOTAL ({ipcs.length} IPCs)</td>
                        <td className="text-mono">{fmt(ipcs.reduce((s, i) => s + (i.net_amount || 0), 0))}</td>
                        <td colSpan={8}></td>
                        <td className="text-mono" style={{ color: '#059669' }}>{fmt(totalPaid)}</td>
                        <td colSpan={4}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════ IPC LIST TAB (simple) ══════ */}
          {tab === 'list' && (
            ipcs.length === 0 ? (
              <div className="card empty-state"><div className="icon">💰</div><p>No IPCs generated yet</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>IPC</th><th>Period</th><th>Works Value</th><th>Gross</th><th>Deductions</th><th>Net Amount</th><th>Certified</th><th>Paid</th><th>Status</th><th></th></tr></thead>
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
                          <td className="text-mono" style={{ color: '#10b981' }}>{ipc.certified_amount ? fmt(ipc.certified_amount) : '—'}</td>
                          <td className="text-mono" style={{ color: '#059669', fontWeight: 600 }}>{ipc.paid_amount ? fmt(ipc.paid_amount) : '—'}</td>
                          <td>
                            {statusBadge(ipc.status)}
                            {overdue > 0 && <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6 }}>⚠ {overdue}d</span>}
                          </td>
                          <td><button className="btn btn-sm btn-primary" onClick={e => { e.stopPropagation(); viewIpc(ipc); }}>View</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ══════ IPC DETAIL TAB ══════ */}
          {tab === 'detail' && selectedIpc && (() => {
            const ipc = selectedIpc;
            const prevIpc = ipcs.find(i => i.ipc_no === ipc.ipc_no - 1);
            const prevGross = prevIpc ? prevIpc.gross_value : 0;
            const thisPeriod = ipc.gross_value - prevGross;
            const worksVal = ipc.works_value || ipc.gross_value;
            const matsSite = ipc.materials_on_site || 0; const vop = ipc.vop_amount || 0;
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

                  {/* Signature Chain Card */}
                  <div style={{ background: 'var(--bg-hover)', padding: 16, borderRadius: 'var(--radius)', marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 13 }}>📝 Signature Chain — IPC Lifecycle</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                      {[
                        { label: 'Contractor Submitted', name: ipc.contractor_submitted_by, date: ipc.contractor_submitted_date, color: '#4338ca', done: !!ipc.contractor_submitted_date },
                        { label: 'RE Checked', name: ipc.re_checker?.full_name || ipc.preparer?.full_name, date: ipc.re_checked_date || ipc.created_at?.split('T')[0], color: '#0891b2', done: !!ipc.re_checked_date || !!ipc.created_at },
                        { label: 'PE Reviewed', name: ipc.pe_reviewer?.full_name, date: ipc.pe_reviewed_date, color: '#ca8a04', done: !!ipc.pe_reviewed_date },
                        { label: 'Engineer Certified', name: ipc.eng_certifier?.full_name || ipc.certifier?.full_name, date: ipc.engineer_certified_date || ipc.certified_date, color: '#16a34a', done: !!(ipc.engineer_certified_date || ipc.certified_date) },
                        { label: 'Employer Paid', name: ipc.paid_amount ? fmt(ipc.paid_amount) : null, date: ipc.paid_date, color: '#059669', done: !!ipc.paid_date, extra: ipc.payment_ref ? `Ref: ${ipc.payment_ref}` : null },
                      ].map((step, i) => (
                        <div key={i} style={{ padding: 10, borderRadius: 'var(--radius)', border: `1.5px solid ${step.done ? step.color : 'var(--border)'}`, background: step.done ? step.color + '10' : 'transparent', opacity: step.done ? 1 : 0.5 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: step.done ? step.color : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            {step.done ? '✅ ' : '⬜ '}{step.label}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>{step.name || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{step.date || 'Pending'}</div>
                          {step.extra && <div style={{ fontSize: 10, color: step.color }}>{step.extra}</div>}
                        </div>
                      ))}
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
                        {ipc.certified_amount && ipc.certified_amount !== ipc.net_amount && (
                          <><div style={{ color: '#10b981' }}>Certified Amount:</div><div className="text-mono" style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(ipc.certified_amount)}</div></>
                        )}
                        {ipc.paid_amount && (
                          <><div style={{ color: '#059669' }}>Paid Amount:</div><div className="text-mono" style={{ textAlign: 'right', color: '#059669', fontWeight: 700 }}>{fmt(ipc.paid_amount)}</div></>
                        )}
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
                              const prevQty = item.previous_quantity || 0; const currQty = item.completed_quantity || 0;
                              const thisQty = currQty - prevQty; const cumAmt = currQty * (item.rate || 0); secTotal += cumAmt;
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
                <div className="form-group mb-16"><label>Period From *</label><input type="date" value={genForm.period_from} onChange={e => setGenForm({ ...genForm, period_from: e.target.value })} required /></div>
                <div className="form-group mb-16"><label>Period To *</label><input type="date" value={genForm.period_to} onChange={e => setGenForm({ ...genForm, period_to: e.target.value })} required /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Materials on Site (KES)</label><input type="number" step="0.01" value={genForm.materials_on_site} onChange={e => setGenForm({ ...genForm, materials_on_site: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Variation of Prices / VoP (KES)</label><input type="number" step="0.01" value={genForm.vop_amount} onChange={e => setGenForm({ ...genForm, vop_amount: e.target.value })} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Retention %</label><input type="number" step="0.5" value={genForm.retention_pct} onChange={e => setGenForm({ ...genForm, retention_pct: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Advance Recovery (KES)</label><input type="number" step="0.01" value={genForm.advance_recovery} onChange={e => setGenForm({ ...genForm, advance_recovery: e.target.value })} /></div>
                <div className="form-group mb-16"><label>Other Deductions (KES)</label><input type="number" step="0.01" value={genForm.other_deductions} onChange={e => setGenForm({ ...genForm, other_deductions: e.target.value })} /></div>
              </div>
              <div className="form-group mb-16"><label>Notes</label><textarea rows={2} value={genForm.notes} onChange={e => setGenForm({ ...genForm, notes: e.target.value })} placeholder="Any remarks for this certificate..." /></div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : editingIpc ? '💾 Update IPC' : '💰 Generate IPC'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => { setShowGenerateModal(false); setEditingIpc(null); }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SIGN / APPROVE MODAL ── */}
      {showSignModal && (
        <div className="modal-overlay" onClick={() => setShowSignModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3>
              {showSignModal.stage === 'contractor_submit' && '📝 Contractor Submission'}
              {showSignModal.stage === 're_check' && '✅ RE Check & Preparation'}
              {showSignModal.stage === 'pe_review' && '📋 Project Engineer Review'}
              {showSignModal.stage === 'engineer_certify' && '🏛️ Engineer Certification (FIDIC Cl. 14.6)'}
              {showSignModal.stage === 'mark_paid' && '💵 Record Payment'}
              <button onClick={() => setShowSignModal(null)}>×</button>
            </h3>

            <div style={{ background: 'var(--bg-hover)', padding: 12, borderRadius: 'var(--radius)', marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>IPC No. {showSignModal.ipc.ipc_no}</div>
              <div className="text-muted">Net Amount: {fmt(showSignModal.ipc.net_amount)}</div>
            </div>

            <div className="form-group mb-16">
              <label>Date</label>
              <input type="date" value={signDate} onChange={e => setSignDate(e.target.value)} />
            </div>

            {showSignModal.stage === 'engineer_certify' && (
              <div className="form-group mb-16">
                <label>Certified Amount (KES) — may differ from net if Engineer adjusts</label>
                <input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
              </div>
            )}

            {showSignModal.stage === 'mark_paid' && (
              <>
                <div className="form-group mb-16">
                  <label>Paid Amount (KES)</label>
                  <input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
                </div>
                <div className="form-group mb-16">
                  <label>Payment Reference / Cheque No.</label>
                  <input type="text" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="e.g. EFT-2026-0045" />
                </div>
              </>
            )}

            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => signIpc(showSignModal.ipc, showSignModal.stage)}>
                {showSignModal.stage === 'mark_paid' ? '💵 Record Payment' : '✅ Confirm'}
              </button>
              <button className="btn btn-secondary" onClick={() => setShowSignModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
