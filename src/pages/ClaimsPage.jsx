import React, { useState, useEffect, useMemo } from 'react';
import { supabase, hasRole, ROLE_LEVELS } from '../lib/supabase';
import { detectClaimTriggers, createClaimFromTrigger, sendClaimNotifications } from '../lib/claimsEngine';
import CITAssessment from '../components/CITAssessment';

const TYPE_LABELS = { eot: '⏱️ EOT', cost: '💰 Cost', eot_and_cost: '⏱️💰 EOT & Cost', interest: '🏦 Interest', variation: '🔄 Variation', force_majeure: '🌪️ Force Majeure' };
const STATUS_COLORS = {
  detected: '#f59e0b', notified: '#6366f1', under_preparation: '#0284c7', submitted: '#8b5cf6',
  under_review: '#e87b35', additional_info: '#f59e0b', partially_approved: '#059669',
  approved: '#059669', rejected: '#dc2626', withdrawn: '#94a3b8', time_barred: '#dc2626',
};
const PRIORITY_COLORS = { low: '#64748b', medium: '#f59e0b', high: '#e87b35', critical: '#dc2626' };

export default function ClaimsPage({ profile, showToast, selectedProject: contextProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(contextProject?.id || '');
  const [claims, setClaims] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('register');
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState([]);
  const [scanMonth, setScanMonth] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 7);
  });
  const [showClaimDetail, setShowClaimDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('overview');

  // Access control
  const isPlatformAdmin = profile?.is_platform_admin === true;
  const canSeeCIT = isPlatformAdmin || (ROLE_LEVELS[profile?.role] || 0) >= (ROLE_LEVELS['project_officer'] || 0);

  useEffect(() => { loadProjects(); loadClauses(); loadNotifications(); }, []);
  useEffect(() => { if (selectedProject) loadClaims(); }, [selectedProject]);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id, name').order('name');
    setProjects(data || []);
  }

  async function loadClaims() {
    const { data } = await supabase.from('claims')
      .select('*, prepared:prepared_by(full_name)')
      .eq('project_id', selectedProject)
      .order('created_at', { ascending: false });
    setClaims(data || []);
  }

  async function loadClauses() {
    const { data } = await supabase.from('fidic_claim_clauses').select('*').order('clause_ref');
    setClauses(data || []);
  }

  async function loadNotifications() {
    const { data } = await supabase.from('claim_notifications')
      .select('*, claim:claim_id(title, claim_number, fidic_clause)')
      .eq('recipient_id', profile?.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications(data || []);
  }

  async function handleScan() {
    if (!selectedProject) return;
    setScanning(true);
    setScanResults([]);
    try {
      const results = await detectClaimTriggers(selectedProject, scanMonth);
      setScanResults(results);
      if (results.length === 0) showToast?.('✅ No claim triggers detected for this month');
      else showToast?.(`🚨 ${results.length} potential claim trigger(s) detected`);
    } catch (err) {
      showToast?.('Error scanning: ' + err.message);
    }
    setScanning(false);
  }

  async function handleCreateClaim(trigger) {
    try {
      const claim = await createClaimFromTrigger(trigger, selectedProject, profile?.id);
      showToast?.(`✅ Claim ${claim.claim_number} created and notifications sent`);
      setScanResults(prev => prev.filter(r => r.rule_id !== trigger.rule_id));
      loadClaims();
      loadNotifications();
    } catch (err) {
      showToast?.('Error: ' + err.message);
    }
  }

  async function updateClaimStatus(claimId, newStatus) {
    const { error } = await supabase.from('claims').update({ status: newStatus }).eq('id', claimId);
    if (error) { showToast?.('Error: ' + error.message); return; }

    const claim = claims.find(c => c.id === claimId);
    if (claim && ['submitted', 'approved', 'rejected'].includes(newStatus)) {
      await sendClaimNotifications(claim, selectedProject, newStatus === 'submitted' ? 'claim_submitted' : 'claim_decided');
    }

    // Auto-create contract amendment when claim is approved
    if (claim && newStatus === 'approved' && (claim.eot_days_claimed > 0 || claim.cost_claimed > 0)) {
      const { data: lastAmend } = await supabase.from('contract_amendments')
        .select('amendment_number').eq('project_id', selectedProject)
        .order('amendment_number', { ascending: false }).limit(1).maybeSingle();

      const { data: project } = await supabase.from('projects')
        .select('revised_completion_date, original_completion_date, end_date, revised_contract_sum, original_contract_sum, contract_sum')
        .eq('id', selectedProject).single();

      const prevEnd = project?.revised_completion_date || project?.original_completion_date || project?.end_date;
      const prevSum = project?.revised_contract_sum || project?.original_contract_sum || project?.contract_sum || 0;
      const newEnd = claim.eot_days_claimed > 0 && prevEnd
        ? new Date(new Date(prevEnd).getTime() + claim.eot_days_claimed * 86400000).toISOString().split('T')[0]
        : null;
      const newSum = claim.cost_claimed > 0 ? prevSum + claim.cost_claimed : null;

      await supabase.from('contract_amendments').insert({
        project_id: selectedProject,
        amendment_number: (lastAmend?.amendment_number || 0) + 1,
        amendment_type: claim.claim_type === 'eot' ? 'eot_award' : claim.claim_type === 'interest' ? 'price_adjustment' : 'eot_award',
        title: `${claim.claim_number}: ${claim.title}`,
        fidic_clause: claim.fidic_clause,
        eot_days: claim.eot_days_claimed || 0,
        cost_increase: claim.cost_claimed || 0,
        previous_completion_date: prevEnd,
        new_completion_date: newEnd,
        previous_contract_sum: prevSum,
        new_contract_sum: newSum,
        approved_by: profile?.id,
      });
    }

    showToast?.(`✅ Claim status updated to ${newStatus.replace(/_/g, ' ')}`);
    loadClaims();
  }

  async function markNotifRead(id) {
    await supabase.from('claim_notifications').update({ is_read: true }).eq('id', id);
    loadNotifications();
  }

  // ── Stats ──
  const stats = useMemo(() => {
    const active = claims.filter(c => !['approved', 'rejected', 'withdrawn', 'time_barred'].includes(c.status));
    const totalEOT = claims.reduce((s, c) => s + (c.eot_days_claimed || 0), 0);
    const totalCost = claims.reduce((s, c) => s + (c.cost_claimed || 0), 0);
    const timeBars = claims.filter(c => c.is_time_barred).length;
    return { total: claims.length, active: active.length, totalEOT, totalCost, timeBars };
  }, [claims]);

  const tabs = [
    { id: 'register', label: `📋 Claims Register (${claims.length})` },
    { id: 'scan', label: '🔍 Auto-Detect' },
    { id: 'notifications', label: `🔔 Alerts (${notifications.length})` },
    { id: 'clauses', label: '📖 FIDIC Clauses' },
  ];

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>⚖️ Claims Management</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>FIDIC-aligned auto-detection, tracking, and notification chain</p>
        </div>
        {notifications.length > 0 && (
          <div style={{ background: '#dc2626', color: '#fff', padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
            🔔 {notifications.length} unread alert{notifications.length > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Project Selector */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="select">
          <option value="">Select Project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && (
        <>
          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 14 }}>
            {[
              { icon: '📋', label: 'Total Claims', value: stats.total, color: '#e87b35' },
              { icon: '🔄', label: 'Active', value: stats.active, color: '#0284c7' },
              { icon: '⏱️', label: 'EOT Claimed', value: `${stats.totalEOT}d`, color: '#6366f1' },
              { icon: '💰', label: 'Cost Claimed', value: `KES ${(stats.totalCost / 1000000).toFixed(1)}M`, color: '#059669' },
              { icon: '🔴', label: 'Time-Barred', value: stats.timeBars, color: stats.timeBars > 0 ? '#dc2626' : '#059669' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16 }}>{s.icon}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 14, overflowX: 'auto', borderBottom: '2px solid var(--border)' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? '3px solid var(--accent)' : '3px solid transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}>{tab.label}</button>
            ))}
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>

            {/* CLAIMS REGISTER */}
            {activeTab === 'register' && (
              <div>
                {claims.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>⚖️</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>No claims registered yet</div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>Go to the "🔍 Auto-Detect" tab to scan for claim triggers from your daily reports.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>{['Claim No.', 'Title', 'Type', 'FIDIC', 'Priority', 'EOT', 'Cost', 'Status', 'Actions'].map((h, i) => (
                          <th key={i} style={{ background: 'var(--accent)', color: '#fff', padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {claims.map((c, ri) => (
                          <tr key={c.id} style={{ background: ri % 2 ? 'var(--bg-hover)' : 'transparent', cursor: 'pointer' }}
                            onClick={() => setShowClaimDetail(c)}>
                            <td style={{ padding: '6px 8px', fontWeight: 700 }}>{c.claim_number}</td>
                            <td style={{ padding: '6px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</td>
                            <td style={{ padding: '6px 8px' }}>{TYPE_LABELS[c.claim_type] || c.claim_type}</td>
                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 10 }}>{c.fidic_clause}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ background: PRIORITY_COLORS[c.priority], color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>{c.priority}</span>
                            </td>
                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{c.eot_days_claimed || '—'}d</td>
                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{c.cost_claimed ? `KES ${Number(c.cost_claimed).toLocaleString()}` : '—'}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ background: STATUS_COLORS[c.status] || '#64748b', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>{c.status?.replace(/_/g, ' ')}</span>
                            </td>
                            <td style={{ padding: '6px 8px' }} onClick={e => e.stopPropagation()}>
                              <select value={c.status} onChange={e => updateClaimStatus(c.id, e.target.value)}
                                style={{ fontSize: 10, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 3, background: 'var(--bg-card)' }}>
                                {['detected','notified','under_preparation','submitted','under_review','additional_info','partially_approved','approved','rejected','withdrawn'].map(s => (
                                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* AUTO-DETECT */}
            {activeTab === 'scan' && (
              <div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Scan Month</label>
                    <input type="month" value={scanMonth} onChange={e => setScanMonth(e.target.value)} className="select" style={{ width: 180 }} />
                  </div>
                  <button className="btn btn-primary" onClick={handleScan} disabled={scanning} style={{ height: 38 }}>
                    {scanning ? '⏳ Scanning daily reports...' : '🔍 Scan for Claim Triggers'}
                  </button>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
                  The system scans your daily reports, payment certificates, site instructions, and issues for events that may trigger contractual claims under FIDIC 1999 Red Book. Detected triggers are shown below for your review before creating formal claims.
                </div>

                {scanResults.length === 0 && !scanning && (
                  <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>🔍</div>
                    <div style={{ fontSize: 12 }}>Select a month and click "Scan" to detect claim triggers</div>
                  </div>
                )}

                {scanResults.map((r, i) => (
                  <div key={i} style={{
                    border: `1px solid ${PRIORITY_COLORS[r.priority]}33`,
                    borderLeft: `4px solid ${PRIORITY_COLORS[r.priority]}`,
                    borderRadius: 'var(--radius)', padding: 16, marginBottom: 12,
                    background: 'var(--bg-card)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                          {TYPE_LABELS[r.claim_type]} {r.title}
                        </div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 3 }}>{r.fidic_clause}</span>
                          <span style={{ background: PRIORITY_COLORS[r.priority], color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{r.priority}</span>
                          {r.eot_days_claimed && <span>⏱️ {r.eot_days_claimed} days</span>}
                          {r.cost_claimed && <span>💰 KES {Number(r.cost_claimed).toLocaleString()}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{r.description}</div>
                        {r.events?.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                            <strong>Supporting evidence ({r.events.length} records):</strong>
                            <div style={{ maxHeight: 80, overflowY: 'auto', marginTop: 4 }}>
                              {r.events.slice(0, 5).map((ev, j) => (
                                <div key={j} style={{ padding: '2px 0' }}>• {ev.event_date}: {ev.description}</div>
                              ))}
                              {r.events.length > 5 && <div>... and {r.events.length - 5} more</div>}
                            </div>
                          </div>
                        )}
                      </div>
                      <button className="btn btn-primary" onClick={() => handleCreateClaim(r)} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                        ⚖️ Create Claim
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div>
                {notifications.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 30, marginBottom: 8 }}>🔔</div>
                    <div>No unread claim notifications</div>
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: '1px solid var(--border)',
                    background: n.is_urgent ? 'rgba(220,38,38,0.05)' : 'transparent',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                        {n.claim?.claim_number} · {new Date(n.created_at).toLocaleDateString('en-KE')}
                        {n.is_urgent && <span style={{ color: '#dc2626', fontWeight: 700, marginLeft: 8 }}>URGENT</span>}
                      </div>
                    </div>
                    <button onClick={() => markNotifRead(n.id)} style={{ border: 'none', background: 'var(--bg-hover)', padding: '4px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }}>
                      ✓ Read
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* FIDIC CLAUSES */}
            {activeTab === 'clauses' && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Reference: FIDIC 1999 Red Book clauses commonly used as basis for claims.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                    <thead>
                      <tr>{['Clause', 'Title', 'Claim Type', 'Typical Trigger', 'Notice Required'].map((h, i) => (
                        <th key={i} style={{ background: 'var(--accent)', color: '#fff', padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 9 }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {clauses.map((c, ri) => (
                        <tr key={c.id} style={{ background: ri % 2 ? 'var(--bg-hover)' : 'transparent' }}>
                          <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontWeight: 700 }}>{c.clause_ref}</td>
                          <td style={{ padding: '5px 8px', fontWeight: 500 }}>{c.clause_title}</td>
                          <td style={{ padding: '5px 8px' }}>{TYPE_LABELS[c.claim_type] || c.claim_type || '—'}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{c.typical_trigger || '—'}</td>
                          <td style={{ padding: '5px 8px' }}>{c.notice_required ? `✅ ${c.notice_period_days}d` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!selectedProject && (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>⚖️</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Claims Management</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Select a project to view claims, scan for triggers, or manage notifications</div>
        </div>
      )}

      {/* CLAIM DETAIL MODAL */}
      {showClaimDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { setShowClaimDetail(null); setDetailTab('overview'); }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 750, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{showClaimDetail.claim_number}</div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: '4px 0' }}>{showClaimDetail.title}</h3>
                <div style={{ display: 'flex', gap: 6, fontSize: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', background: 'var(--bg-hover)', padding: '1px 6px', borderRadius: 3 }}>{showClaimDetail.fidic_clause}</span>
                  <span style={{ background: STATUS_COLORS[showClaimDetail.status], color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{showClaimDetail.status?.replace(/_/g, ' ')}</span>
                  <span style={{ background: PRIORITY_COLORS[showClaimDetail.priority], color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>{showClaimDetail.priority}</span>
                  {showClaimDetail.cit_status && showClaimDetail.cit_status !== 'pending' && (
                    <span style={{ background: '#8b5cf6', color: '#fff', padding: '1px 6px', borderRadius: 3, fontWeight: 700 }}>CIT: {showClaimDetail.cit_status.replace(/_/g, ' ')}</span>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowClaimDetail(null); setDetailTab('overview'); }} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Detail tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 14, borderBottom: '2px solid var(--border)' }}>
              <button onClick={() => setDetailTab('overview')} style={{
                padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none',
                borderBottom: detailTab === 'overview' ? '3px solid var(--accent)' : '3px solid transparent',
                color: detailTab === 'overview' ? 'var(--accent)' : 'var(--text-muted)',
              }}>Overview</button>
              {canSeeCIT && (
                <button onClick={() => setDetailTab('cit')} style={{
                  padding: '7px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none',
                  borderBottom: detailTab === 'cit' ? '3px solid #8b5cf6' : '3px solid transparent',
                  color: detailTab === 'cit' ? '#8b5cf6' : 'var(--text-muted)',
                }}>📋 CIT Assessment</button>
              )}
            </div>

            {/* OVERVIEW TAB */}
            {detailTab === 'overview' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: 'var(--bg-hover)', padding: 10, borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>EOT Claimed</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#6366f1' }}>{showClaimDetail.eot_days_claimed || 0} days</div>
                    {showClaimDetail.eot_days_awarded > 0 && <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>Awarded: {showClaimDetail.eot_days_awarded} days</div>}
                  </div>
                  <div style={{ background: 'var(--bg-hover)', padding: 10, borderRadius: 'var(--radius)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Cost Claimed</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>KES {Number(showClaimDetail.cost_claimed || 0).toLocaleString()}</div>
                    {showClaimDetail.cost_awarded > 0 && <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>Awarded: KES {Number(showClaimDetail.cost_awarded).toLocaleString()}</div>}
                  </div>
                </div>

                <div style={{ fontSize: 12, marginBottom: 12 }}>
                  <strong>Description:</strong>
                  <div style={{ color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.6 }}>{showClaimDetail.description || '—'}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, marginBottom: 12 }}>
                  <div><strong>Event Start:</strong> {showClaimDetail.event_start_date || '—'}</div>
                  <div><strong>Event End:</strong> {showClaimDetail.event_end_date || '—'}</div>
                  <div><strong>Notice Date:</strong> {showClaimDetail.notice_date || <span style={{ color: '#f59e0b' }}>Not yet issued</span>}</div>
                  <div><strong>Notice Deadline:</strong> {showClaimDetail.notice_deadline || '—'}</div>
                  {showClaimDetail.determination_date && <div><strong>Determination Date:</strong> {showClaimDetail.determination_date}</div>}
                </div>

                {showClaimDetail.is_time_barred && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 10, borderRadius: 'var(--radius)', marginBottom: 12, fontSize: 11, color: '#dc2626', fontWeight: 700 }}>
                    ⚠️ TIME-BARRED: 28-day notice was not issued within the required period under Cl. 20.1
                  </div>
                )}

                {showClaimDetail.auto_detected && (
                  <div style={{ background: 'var(--bg-hover)', padding: 8, borderRadius: 'var(--radius)', fontSize: 10, color: 'var(--text-muted)' }}>
                    🤖 Auto-detected by rule: {showClaimDetail.detection_rule}
                  </div>
                )}
              </>
            )}

            {/* CIT ASSESSMENT TAB */}
            {detailTab === 'cit' && canSeeCIT && (
              <CITAssessment
                claim={showClaimDetail}
                projectId={selectedProject}
                profile={profile}
                showToast={showToast}
                onUpdate={() => { loadClaims(); loadNotifications(); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
