import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ROLE_LEVELS } from '../lib/supabase';

const CIT_STATUSES = {
  draft: { label: 'Draft', color: '#9ca3af' },
  cit_review: { label: 'CIT Review', color: '#3b82f6' },
  cit_complete: { label: 'CIT Complete', color: '#8b5cf6' },
  determination_issued: { label: 'Determination Issued', color: '#059669' },
};

export default function CITAssessment({ claim, projectId, profile, showToast, onUpdate }) {
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('team');
  const [form, setForm] = useState({
    cit_members: [],
    assessment_date: new Date().toISOString().split('T')[0],
    contractor_eot_claimed: claim.eot_days_claimed || 0,
    contractor_cost_claimed: claim.cost_claimed || 0,
    contractor_particulars: '',
    event_analysis: [],
    findings: '',
    recommendation: '',
    cit_eot_recommended: 0,
    cit_cost_recommended: 0,
    recommendation_basis: '',
    engineer_determination: '',
    determination_date: '',
    determination_eot: 0,
    determination_cost: 0,
    determination_status: 'draft',
  });

  // New member form
  const [newMember, setNewMember] = useState({ name: '', role: '', organisation: '' });
  // New event form
  const [newEvent, setNewEvent] = useState({ date: '', event_description: '', contractor_position: '', cit_assessment: '', days_assessed: 0, cost_assessed: 0 });

  const isPlatformAdmin = profile?.is_platform_admin === true;
  const isEngineer = isPlatformAdmin || hasRole(profile?.role, 'engineer');
  const canDetermine = isEngineer;
  const canEdit = isPlatformAdmin || (ROLE_LEVELS[profile?.role] || 0) >= (ROLE_LEVELS['project_officer'] || 0);

  useEffect(() => { loadAssessment(); }, [claim.id]);

  async function loadAssessment() {
    const { data } = await supabase.from('cit_assessments')
      .select('*').eq('claim_id', claim.id).maybeSingle();
    if (data) {
      setAssessment(data);
      setForm({
        cit_members: data.cit_members || [],
        assessment_date: data.assessment_date || new Date().toISOString().split('T')[0],
        contractor_eot_claimed: data.contractor_eot_claimed || claim.eot_days_claimed || 0,
        contractor_cost_claimed: data.contractor_cost_claimed || claim.cost_claimed || 0,
        contractor_particulars: data.contractor_particulars || '',
        event_analysis: data.event_analysis || [],
        findings: data.findings || '',
        recommendation: data.recommendation || '',
        cit_eot_recommended: data.cit_eot_recommended || 0,
        cit_cost_recommended: data.cit_cost_recommended || 0,
        recommendation_basis: data.recommendation_basis || '',
        engineer_determination: data.engineer_determination || '',
        determination_date: data.determination_date || '',
        determination_eot: data.determination_eot || 0,
        determination_cost: data.determination_cost || 0,
        determination_status: data.determination_status || 'draft',
      });
    }
    setLoading(false);
  }

  async function initAssessment() {
    setSaving(true);
    const assessNum = `CIT-${claim.claim_number?.replace('CLM-', '') || '001'}`;
    const { data, error } = await supabase.from('cit_assessments').insert({
      claim_id: claim.id, project_id: projectId,
      assessment_number: assessNum,
      contractor_eot_claimed: claim.eot_days_claimed || 0,
      contractor_cost_claimed: claim.cost_claimed || 0,
      prepared_by: profile?.id,
      determination_status: 'draft',
      event_analysis: claim.trigger_data?.events?.map(ev => ({
        date: ev.event_date, event_description: ev.description,
        contractor_position: '', cit_assessment: '', days_assessed: 0, cost_assessed: 0,
      })) || [],
    }).select().single();
    if (error) { showToast(error.message, 'error'); setSaving(false); return; }
    await supabase.from('claims').update({ cit_status: 'draft', cit_assessment_id: data.id }).eq('id', claim.id);
    setAssessment(data);
    setForm(prev => ({ ...prev, event_analysis: data.event_analysis || [] }));
    showToast(`CIT Assessment ${assessNum} initiated`);
    setSaving(false);
    onUpdate?.();
  }

  async function saveAssessment() {
    if (!assessment) return;
    setSaving(true);
    const { error } = await supabase.from('cit_assessments').update({
      ...form, updated_at: new Date().toISOString(),
    }).eq('id', assessment.id);
    if (error) { showToast(error.message, 'error'); setSaving(false); return; }
    await supabase.from('claims').update({ cit_status: form.determination_status }).eq('id', claim.id);
    showToast('CIT Assessment saved');
    setSaving(false);
    onUpdate?.();
  }

  async function issueDetermination() {
    if (!window.confirm('Issue the Engineer\'s Determination? This will update the claim status and create a contract amendment if EOT/cost is awarded.')) return;
    setSaving(true);
    const detDate = form.determination_date || new Date().toISOString().split('T')[0];
    await supabase.from('cit_assessments').update({
      ...form, determination_date: detDate,
      determination_status: 'determination_issued',
      determined_by: profile?.id,
      updated_at: new Date().toISOString(),
    }).eq('id', assessment.id);

    // Update claim with awarded amounts
    const newClaimStatus = (form.determination_eot > 0 || form.determination_cost > 0) ? 'approved' :
      (form.determination_eot === 0 && form.determination_cost === 0 && (form.contractor_eot_claimed > 0 || form.contractor_cost_claimed > 0)) ? 'rejected' : 'approved';
    await supabase.from('claims').update({
      cit_status: 'determination_issued',
      status: newClaimStatus,
      eot_days_awarded: form.determination_eot,
      cost_awarded: form.determination_cost,
      determination_date: detDate,
    }).eq('id', claim.id);

    showToast(`Engineer's Determination issued — ${form.determination_eot} days EOT, KES ${Number(form.determination_cost).toLocaleString()} cost`);
    setSaving(false);
    onUpdate?.();
    loadAssessment();
  }

  function addMember() {
    if (!newMember.name.trim()) return;
    setForm(prev => ({ ...prev, cit_members: [...prev.cit_members, { ...newMember }] }));
    setNewMember({ name: '', role: '', organisation: '' });
  }

  function removeMember(idx) {
    setForm(prev => ({ ...prev, cit_members: prev.cit_members.filter((_, i) => i !== idx) }));
  }

  function addEvent() {
    if (!newEvent.date) return;
    setForm(prev => ({ ...prev, event_analysis: [...prev.event_analysis, { ...newEvent }] }));
    setNewEvent({ date: '', event_description: '', contractor_position: '', cit_assessment: '', days_assessed: 0, cost_assessed: 0 });
  }

  function removeEvent(idx) {
    setForm(prev => ({ ...prev, event_analysis: prev.event_analysis.filter((_, i) => i !== idx) }));
  }

  function updateEvent(idx, field, value) {
    setForm(prev => {
      const events = [...prev.event_analysis];
      events[idx] = { ...events[idx], [field]: value };
      return { ...prev, event_analysis: events };
    });
  }

  // Totals
  const totalDaysAssessed = form.event_analysis.reduce((s, e) => s + (parseFloat(e.days_assessed) || 0), 0);
  const totalCostAssessed = form.event_analysis.reduce((s, e) => s + (parseFloat(e.cost_assessed) || 0), 0);
  const fmt = (n) => 'KES ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function printCITReport() {
    const w = window.open('', '_blank');
    const m = form.cit_members.map(m => `<tr><td>${m.name}</td><td>${m.role}</td><td>${m.organisation}</td></tr>`).join('');
    const ev = form.event_analysis.map((e, i) => `<tr><td>${i + 1}</td><td>${e.date}</td><td>${e.event_description}</td><td>${e.contractor_position}</td><td>${e.cit_assessment}</td><td style="text-align:right">${e.days_assessed || 0}</td><td style="text-align:right">${Number(e.cost_assessed || 0).toLocaleString()}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>CIT Report — ${claim.claim_number}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:20mm;color:#333}h1{font-size:16px;text-align:center}h2{font-size:13px;margin:16px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#2a2a2a;color:#fff;padding:5px 8px;font-size:10px;text-align:left}td{padding:4px 8px;border:1px solid #ddd;font-size:10px}.summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0}.summary div{border:1px solid #ccc;padding:10px;text-align:center}.summary .label{font-size:9px;color:#666}.summary .value{font-size:16px;font-weight:700}@media print{@page{margin:15mm}}</style></head><body>
    <h1>CLAIMS INVESTIGATION TEAM (CIT) EVALUATION REPORT</h1>
    <h2>1. Claim Details</h2>
    <table><tr><td><b>Claim No:</b> ${claim.claim_number}</td><td><b>FIDIC Clause:</b> ${claim.fidic_clause}</td></tr><tr><td><b>Title:</b> ${claim.title}</td><td><b>Date:</b> ${form.assessment_date}</td></tr></table>
    <h2>2. CIT Members</h2>
    <table><thead><tr><th>Name</th><th>Role</th><th>Organisation</th></tr></thead><tbody>${m}</tbody></table>
    <h2>3. Contractor's Position</h2>
    <div class="summary"><div><div class="label">EOT Claimed</div><div class="value">${form.contractor_eot_claimed} days</div></div><div><div class="label">Cost Claimed</div><div class="value">KES ${Number(form.contractor_cost_claimed).toLocaleString()}</div></div><div><div class="label">Claim Type</div><div class="value">${claim.claim_type?.replace(/_/g, ' ').toUpperCase()}</div></div></div>
    <p>${form.contractor_particulars || '—'}</p>
    <h2>4. Event-by-Event Analysis</h2>
    <table><thead><tr><th>#</th><th>Date</th><th>Event</th><th>Contractor's Position</th><th>CIT Assessment</th><th>Days</th><th>Cost (KES)</th></tr></thead><tbody>${ev}
    <tr style="font-weight:700;border-top:2px solid #333"><td colspan="5" style="text-align:right">CIT TOTALS:</td><td style="text-align:right">${totalDaysAssessed}</td><td style="text-align:right">${Number(totalCostAssessed).toLocaleString()}</td></tr></tbody></table>
    <h2>5. CIT Findings</h2><p>${form.findings || '—'}</p>
    <h2>6. CIT Recommendation</h2>
    <div class="summary"><div><div class="label">EOT Recommended</div><div class="value" style="color:#1d4ed8">${form.cit_eot_recommended} days</div></div><div><div class="label">Cost Recommended</div><div class="value" style="color:#059669">KES ${Number(form.cit_cost_recommended).toLocaleString()}</div></div><div><div class="label">Basis</div><div class="value" style="font-size:10px">${form.recommendation_basis || '—'}</div></div></div>
    <p>${form.recommendation || '—'}</p>
    ${form.determination_status === 'determination_issued' ? `<h2>7. Engineer's Determination (FIDIC Cl. 3.5)</h2>
    <div class="summary"><div><div class="label">EOT Awarded</div><div class="value" style="color:#1d4ed8">${form.determination_eot} days</div></div><div><div class="label">Cost Awarded</div><div class="value" style="color:#059669">KES ${Number(form.determination_cost).toLocaleString()}</div></div><div><div class="label">Date</div><div class="value">${form.determination_date}</div></div></div>
    <p>${form.engineer_determination || '—'}</p>` : ''}
    <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:30px;font-size:10px"><div><b>Prepared by (CIT Chair):</b><div style="border-top:1px solid #333;margin-top:40px;padding-top:4px">Name: _______________<br>Signature: _______________<br>Date: _______________</div></div><div><b>Reviewed by (Project Engineer):</b><div style="border-top:1px solid #333;margin-top:40px;padding-top:4px">Name: _______________<br>Signature: _______________<br>Date: _______________</div></div><div><b>Determined by (The Engineer):</b><div style="border-top:1px solid #333;margin-top:40px;padding-top:4px">Name: _______________<br>Signature: _______________<br>Date: _______________</div></div></div>
    <div style="margin-top:20px;text-align:center;font-size:9px;color:#999">Generated by RoadSite Reports v15.8</div></body></html>`);
    w.document.close();
    w.onload = () => w.print();
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading CIT assessment...</div>;

  if (!assessment) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No CIT Assessment Yet</div>
        <div className="text-sm text-muted" style={{ marginBottom: 16 }}>
          Initiate a CIT Evaluation to assess this claim event-by-event, document findings, and prepare the Engineer's Determination.
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={initAssessment} disabled={saving}>
            {saving ? 'Creating...' : '📋 Initiate CIT Assessment'}
          </button>
        )}
      </div>
    );
  }

  const isFinalized = form.determination_status === 'determination_issued';
  const sections = [
    { id: 'team', label: 'CIT Team' },
    { id: 'contractor', label: "Contractor's Position" },
    { id: 'analysis', label: 'Event Analysis' },
    { id: 'findings', label: 'Findings & Recommendation' },
    { id: 'determination', label: "Engineer's Determination" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{assessment.assessment_number}</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>CIT Evaluation Report</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ background: CIT_STATUSES[form.determination_status]?.color, color: '#fff', padding: '3px 10px', borderRadius: 9999, fontSize: 10, fontWeight: 700 }}>
            {CIT_STATUSES[form.determination_status]?.label}
          </span>
          <button className="btn btn-sm btn-secondary" onClick={printCITReport}>🖨️ Print Report</button>
          {canEdit && !isFinalized && <button className="btn btn-sm btn-primary" onClick={saveAssessment} disabled={saving}>{saving ? 'Saving...' : '💾 Save'}</button>}
        </div>
      </div>

      {/* Claimed vs Recommended vs Awarded summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius)', padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#991b1b', fontWeight: 600 }}>CONTRACTOR CLAIMED</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{form.contractor_eot_claimed} days</div>
          <div style={{ fontSize: 11, color: '#991b1b' }}>{fmt(form.contractor_cost_claimed)}</div>
        </div>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius)', padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#1e40af', fontWeight: 600 }}>CIT RECOMMENDED</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb' }}>{form.cit_eot_recommended} days</div>
          <div style={{ fontSize: 11, color: '#1e40af' }}>{fmt(form.cit_cost_recommended)}</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 'var(--radius)', padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#166534', fontWeight: 600 }}>ENGINEER AWARDED</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>{form.determination_eot} days</div>
          <div style={{ fontSize: 11, color: '#166534' }}>{fmt(form.determination_cost)}</div>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 14, overflowX: 'auto', borderBottom: '2px solid var(--border)' }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: 'transparent', border: 'none',
            borderBottom: activeSection === s.id ? '3px solid var(--accent)' : '3px solid transparent',
            color: activeSection === s.id ? 'var(--accent)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── CIT TEAM ── */}
      {activeSection === 'team' && (
        <div>
          <div className="form-group mb-16">
            <label>Assessment Date</label>
            <input type="date" value={form.assessment_date} onChange={e => setForm({ ...form, assessment_date: e.target.value })} disabled={isFinalized} style={{ maxWidth: 200 }} />
          </div>
          {form.cit_members.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12, fontSize: 12 }}>
              <thead><tr><th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>Name</th><th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>Role</th><th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '2px solid var(--border)' }}>Organisation</th><th style={{ width: 40, borderBottom: '2px solid var(--border)' }}></th></tr></thead>
              <tbody>{form.cit_members.map((m, i) => (
                <tr key={i}><td style={{ padding: '5px 8px' }}>{m.name}</td><td style={{ padding: '5px 8px' }}>{m.role}</td><td style={{ padding: '5px 8px' }}>{m.organisation}</td>
                  <td>{!isFinalized && <button className="btn btn-sm btn-danger" onClick={() => removeMember(i)}>×</button>}</td></tr>
              ))}</tbody>
            </table>
          )}
          {!isFinalized && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}><label>Name</label>
                <input type="text" value={newMember.name} onChange={e => setNewMember({ ...newMember, name: e.target.value })} placeholder="Eng. John Doe" /></div>
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}><label>Role</label>
                <select value={newMember.role} onChange={e => setNewMember({ ...newMember, role: e.target.value })}>
                  <option value="">Select...</option>
                  <option value="CIT Chair">CIT Chair</option><option value="CIT Member">CIT Member</option>
                  <option value="Project Engineer">Project Engineer</option><option value="Quantity Surveyor">Quantity Surveyor</option>
                  <option value="Contracts Officer">Contracts Officer</option><option value="Resident Engineer">Resident Engineer</option>
                </select></div>
              <div className="form-group" style={{ flex: 1, minWidth: 140 }}><label>Organisation</label>
                <input type="text" value={newMember.organisation} onChange={e => setNewMember({ ...newMember, organisation: e.target.value })} placeholder="KeNHA" /></div>
              <button className="btn btn-secondary" onClick={addMember} style={{ height: 38 }}>+ Add</button>
            </div>
          )}
        </div>
      )}

      {/* ── CONTRACTOR'S POSITION ── */}
      {activeSection === 'contractor' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16"><label>EOT Days Claimed</label>
              <input type="number" value={form.contractor_eot_claimed} onChange={e => setForm({ ...form, contractor_eot_claimed: parseInt(e.target.value) || 0 })} disabled={isFinalized} /></div>
            <div className="form-group mb-16"><label>Cost Claimed (KES)</label>
              <input type="number" step="0.01" value={form.contractor_cost_claimed} onChange={e => setForm({ ...form, contractor_cost_claimed: parseFloat(e.target.value) || 0 })} disabled={isFinalized} /></div>
          </div>
          <div className="form-group mb-16"><label>Contractor's Particulars / Basis of Claim</label>
            <textarea rows={5} value={form.contractor_particulars} onChange={e => setForm({ ...form, contractor_particulars: e.target.value })} disabled={isFinalized}
              placeholder="Summarise the Contractor's position — events cited, methodology for calculating EOT/cost, FIDIC clauses relied upon, supporting documents referenced..." /></div>
        </div>
      )}

      {/* ── EVENT-BY-EVENT ANALYSIS ── */}
      {activeSection === 'analysis' && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Assess each claim event individually. For each event, record the Contractor's position and the CIT's independent assessment.
          </div>
          {form.event_analysis.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr>
                  {['#', 'Date', 'Event', "Contractor's Position", 'CIT Assessment', 'Days', 'Cost (KES)', ''].map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: i >= 5 ? 'right' : 'left', borderBottom: '2px solid var(--border)', fontSize: 10, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {form.event_analysis.map((ev, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 8px', fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="date" value={ev.date || ''} onChange={e => updateEvent(i, 'date', e.target.value)} disabled={isFinalized} style={{ fontSize: 10, width: 120 }} />
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="text" value={ev.event_description || ''} onChange={e => updateEvent(i, 'event_description', e.target.value)} disabled={isFinalized} style={{ fontSize: 10, width: '100%' }} placeholder="Describe event..." />
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="text" value={ev.contractor_position || ''} onChange={e => updateEvent(i, 'contractor_position', e.target.value)} disabled={isFinalized} style={{ fontSize: 10, width: '100%' }} placeholder="Contractor says..." />
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="text" value={ev.cit_assessment || ''} onChange={e => updateEvent(i, 'cit_assessment', e.target.value)} disabled={isFinalized} style={{ fontSize: 10, width: '100%' }} placeholder="CIT finds..." />
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" value={ev.days_assessed || ''} onChange={e => updateEvent(i, 'days_assessed', e.target.value)} disabled={isFinalized} style={{ fontSize: 10, width: 50, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '5px 8px' }}>
                        <input type="number" step="0.01" value={ev.cost_assessed || ''} onChange={e => updateEvent(i, 'cost_assessed', e.target.value)} disabled={isFinalized} style={{ fontSize: 10, width: 80, textAlign: 'right' }} />
                      </td>
                      <td>{!isFinalized && <button className="btn btn-sm btn-danger" onClick={() => removeEvent(i)} style={{ fontSize: 9 }}>×</button>}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: '2px solid var(--accent)' }}>
                    <td colSpan={5} style={{ padding: '6px 8px', textAlign: 'right' }}>CIT TOTALS:</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#2563eb' }}>{totalDaysAssessed}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#059669' }}>{Number(totalCostAssessed).toLocaleString()}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {!isFinalized && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
              <div className="form-group" style={{ width: 110 }}><label>Date</label>
                <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} style={{ fontSize: 11 }} /></div>
              <div className="form-group" style={{ flex: 1, minWidth: 150 }}><label>Event</label>
                <input type="text" value={newEvent.event_description} onChange={e => setNewEvent({ ...newEvent, event_description: e.target.value })} placeholder="Describe event" style={{ fontSize: 11 }} /></div>
              <div className="form-group" style={{ width: 60 }}><label>Days</label>
                <input type="number" value={newEvent.days_assessed} onChange={e => setNewEvent({ ...newEvent, days_assessed: e.target.value })} style={{ fontSize: 11, textAlign: 'right' }} /></div>
              <button className="btn btn-secondary" onClick={addEvent} style={{ height: 36 }}>+ Add Event</button>
            </div>
          )}
        </div>
      )}

      {/* ── FINDINGS & RECOMMENDATION ── */}
      {activeSection === 'findings' && (
        <div>
          <div className="form-group mb-16"><label>CIT Findings</label>
            <textarea rows={4} value={form.findings} onChange={e => setForm({ ...form, findings: e.target.value })} disabled={isFinalized}
              placeholder="Summarise the CIT's factual findings — what happened, what the records show, critical path impact, concurrent delays..." /></div>
          <div className="form-group mb-16"><label>CIT Recommendation</label>
            <textarea rows={4} value={form.recommendation} onChange={e => setForm({ ...form, recommendation: e.target.value })} disabled={isFinalized}
              placeholder="State the CIT's recommendation to the Engineer — how many days EOT, what cost if any, and on what basis..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16"><label>EOT Recommended (days)</label>
              <input type="number" value={form.cit_eot_recommended} onChange={e => setForm({ ...form, cit_eot_recommended: parseInt(e.target.value) || 0 })} disabled={isFinalized} /></div>
            <div className="form-group mb-16"><label>Cost Recommended (KES)</label>
              <input type="number" step="0.01" value={form.cit_cost_recommended} onChange={e => setForm({ ...form, cit_cost_recommended: parseFloat(e.target.value) || 0 })} disabled={isFinalized} /></div>
            <div className="form-group mb-16"><label>Recommendation Basis</label>
              <select value={form.recommendation_basis} onChange={e => setForm({ ...form, recommendation_basis: e.target.value })} disabled={isFinalized}>
                <option value="">Select...</option>
                <option value="Full award">Full award — claim fully substantiated</option>
                <option value="Partial award">Partial award — some events allowed</option>
                <option value="NIL recommendation">NIL recommendation — claim not substantiated</option>
                <option value="Further info needed">Further information needed</option>
              </select></div>
          </div>
        </div>
      )}

      {/* ── ENGINEER'S DETERMINATION ── */}
      {activeSection === 'determination' && (
        <div>
          {!canDetermine && (
            <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 'var(--radius)', padding: 12, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
              Only the Engineer (Director level and above) can issue the formal determination under FIDIC Cl. 3.5.
            </div>
          )}
          <div className="form-group mb-16"><label>Engineer's Determination</label>
            <textarea rows={4} value={form.engineer_determination} onChange={e => setForm({ ...form, engineer_determination: e.target.value })} disabled={isFinalized || !canDetermine}
              placeholder="The Engineer's formal determination — state what is awarded, on what basis, with reference to the CIT recommendation and FIDIC clause..." /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16"><label>EOT Awarded (days)</label>
              <input type="number" value={form.determination_eot} onChange={e => setForm({ ...form, determination_eot: parseInt(e.target.value) || 0 })} disabled={isFinalized || !canDetermine} /></div>
            <div className="form-group mb-16"><label>Cost Awarded (KES)</label>
              <input type="number" step="0.01" value={form.determination_cost} onChange={e => setForm({ ...form, determination_cost: parseFloat(e.target.value) || 0 })} disabled={isFinalized || !canDetermine} /></div>
            <div className="form-group mb-16"><label>Determination Date</label>
              <input type="date" value={form.determination_date} onChange={e => setForm({ ...form, determination_date: e.target.value })} disabled={isFinalized || !canDetermine} /></div>
          </div>
          {canDetermine && !isFinalized && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={saveAssessment} disabled={saving}>{saving ? 'Saving...' : '💾 Save Draft'}</button>
              <button className="btn btn-success" onClick={issueDetermination} disabled={saving} style={{ background: '#059669' }}>
                ✅ Issue Determination
              </button>
            </div>
          )}
          {isFinalized && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius)', padding: 12, marginTop: 12, fontSize: 12, color: '#166534' }}>
              ✅ Determination issued on {form.determination_date} — {form.determination_eot} days EOT, {fmt(form.determination_cost)} cost awarded.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
