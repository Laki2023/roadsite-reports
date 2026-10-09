import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const fmt = n => 'KES ' + Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 });

const fmtShort = n => {
  const v = Number(n || 0);
  if (v >= 1e9) return 'KES ' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return 'KES ' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return 'KES ' + (v / 1e3).toFixed(0) + 'K';
  return fmt(v);
};

const pct = (a, b) => b ? ((a / b) * 100).toFixed(1) + '%' : '0%';

const TABS = ['Cash Flow', 'Final Account Estimate', 'Burn Rate'];

const VO_STATUSES = ['Proposed', 'Pending', 'Approved', 'Rejected'];

export default function FinancialForecastPage({ profile, showToast, navigateTo, selectedProject }) {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [ipcs, setIpcs] = useState([]);
  const [variationOrders, setVariationOrders] = useState([]);
  const [eotApps, setEotApps] = useState([]);
  const [showVOModal, setShowVOModal] = useState(false);
  const [editingVO, setEditingVO] = useState(null);
  const [voForm, setVoForm] = useState({ vo_no: '', title: '', description: '', amount: '', status: 'Proposed', fidic_clause: '' });
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (selectedProject?.id) loadData();
  }, [selectedProject]);

  async function loadData() {
    setLoading(true);
    try {
      const [projRes, ipcRes, voRes, eotRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', selectedProject.id).single(),
        supabase.from('ipc_certificates').select('*').eq('project_id', selectedProject.id).order('ipc_no', { ascending: true }),
        supabase.from('variation_orders').select('*').eq('project_id', selectedProject.id).order('vo_no', { ascending: true }),
        supabase.from('eot_applications').select('*').eq('project_id', selectedProject.id),
      ]);
      if (projRes.error) throw projRes.error;
      setProject(projRes.data);
      setIpcs(ipcRes.data || []);
      setVariationOrders(voRes.data || []);
      setEotApps(eotRes.data || []);
    } catch (err) {
      showToast('Failed to load financial data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // ---- Computed values ----
  const contractSum = project?.contract_sum || 0;
  const totalCertified = ipcs.reduce((s, c) => s + (c.certified_amount || 0), 0);
  const totalPaid = ipcs.reduce((s, c) => s + (c.paid_amount || 0), 0);
  const outstanding = totalCertified - totalPaid;
  const financialProgress = contractSum ? ((totalCertified / contractSum) * 100).toFixed(1) : 0;

  const approvedVOs = variationOrders.filter(v => v.status === 'Approved');
  const pendingVOs = variationOrders.filter(v => v.status === 'Pending' || v.status === 'Proposed');
  const approvedVOSum = approvedVOs.reduce((s, v) => s + (v.amount || 0), 0);
  const pendingVOSum = pendingVOs.reduce((s, v) => s + (v.amount || 0), 0);
  const approvedEoTCost = eotApps.reduce((s, e) => s + (e.cost_awarded || 0), 0);
  const pendingClaims = eotApps.filter(e => !['Granted', 'Rejected'].includes(e.status) && (e.cost_claimed || 0) > 0);
  const pendingClaimsSum = pendingClaims.reduce((s, e) => s + (e.cost_claimed || 0), 0);
  const estimatedFinalAccount = contractSum + approvedVOSum + pendingVOSum + approvedEoTCost + pendingClaimsSum;
  const remainingToCertify = estimatedFinalAccount - totalCertified;

  // ---- VO CRUD ----
  function openVOModal(vo) {
    if (vo) {
      setEditingVO(vo);
      setVoForm({ vo_no: vo.vo_no || '', title: vo.title || '', description: vo.description || '', amount: vo.amount || '', status: vo.status || 'Proposed', fidic_clause: vo.fidic_clause || '' });
    } else {
      setEditingVO(null);
      const nextNo = variationOrders.length > 0 ? Math.max(...variationOrders.map(v => Number(v.vo_no) || 0)) + 1 : 1;
      setVoForm({ vo_no: String(nextNo), title: '', description: '', amount: '', status: 'Proposed', fidic_clause: '' });
    }
    setShowVOModal(true);
  }

  async function saveVO(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        project_id: selectedProject.id,
        vo_no: voForm.vo_no,
        title: voForm.title,
        description: voForm.description,
        amount: parseFloat(voForm.amount) || 0,
        status: voForm.status,
        fidic_clause: voForm.fidic_clause,
        approved_date: voForm.status === 'Approved' ? new Date().toISOString().split('T')[0] : null,
      };
      if (editingVO) {
        const { error } = await supabase.from('variation_orders').update(payload).eq('id', editingVO.id);
        if (error) throw error;
        showToast('Variation Order updated', 'success');
      } else {
        const { error } = await supabase.from('variation_orders').insert(payload);
        if (error) throw error;
        showToast('Variation Order created', 'success');
      }
      setShowVOModal(false);
      loadData();
    } catch (err) {
      showToast('Error saving VO: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ---- Guard ----
  if (!selectedProject) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>Financial Forecast & Cash Flow</h2>
        <p>Please select a project to view financial forecasts.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <p>Loading financial data...</p>
      </div>
    );
  }

  // ---- Styles ----
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius, 8px)', padding: 20, marginBottom: 16 };
  const kpiCard = { ...card, flex: '1 1 180px', minWidth: 160, textAlign: 'center' };
  const kpiLabel = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' };
  const kpiValue = { fontSize: 20, fontWeight: 700, color: 'var(--text)' };
  const tabBtn = (active) => ({
    padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
    background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-muted)',
    borderRadius: '6px 6px 0 0', transition: 'all 0.2s',
  });
  const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' };
  const td = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' };
  const tdRight = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const btnPrimary = { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius, 6px)', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
  const btnSecondary = { ...btnPrimary, background: 'var(--border)', color: 'var(--text)' };
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };
  const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
  const modalContent = { background: 'var(--card)', borderRadius: 'var(--radius, 8px)', padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto' };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h2 style={{ color: 'var(--text)', marginBottom: 4 }}>Financial Forecast & Cash Flow</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
        {project?.name || selectedProject.name || 'Project'} — FIDIC Financial Analysis
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {TABS.map((t, i) => (
          <button key={t} style={tabBtn(tab === i)} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && <CashFlowTab project={project} ipcs={ipcs} eotApps={eotApps} contractSum={contractSum} totalCertified={totalCertified} totalPaid={totalPaid} outstanding={outstanding} financialProgress={financialProgress} tooltip={tooltip} setTooltip={setTooltip} svgRef={svgRef} />}
      {tab === 1 && <FinalAccountTab project={project} contractSum={contractSum} approvedVOSum={approvedVOSum} pendingVOSum={pendingVOSum} approvedEoTCost={approvedEoTCost} pendingClaimsSum={pendingClaimsSum} estimatedFinalAccount={estimatedFinalAccount} totalCertified={totalCertified} remainingToCertify={remainingToCertify} variationOrders={variationOrders} openVOModal={openVOModal} card={card} th={th} td={td} tdRight={tdRight} btnPrimary={btnPrimary} />}
      {tab === 2 && <BurnRateTab project={project} ipcs={ipcs} contractSum={contractSum} totalCertified={totalCertified} estimatedFinalAccount={estimatedFinalAccount} remainingToCertify={remainingToCertify} eotApps={eotApps} card={card} th={th} td={td} tdRight={tdRight} />}

      {/* VO Modal */}
      {showVOModal && (
        <div style={modalOverlay} onClick={() => setShowVOModal(false)}>
          <div style={modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: 'var(--text)', marginBottom: 16 }}>{editingVO ? 'Edit' : 'Add'} Variation Order</h3>
            <form onSubmit={saveVO}>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>VO Number</label>
                    <input style={inputStyle} value={voForm.vo_no} onChange={e => setVoForm({ ...voForm, vo_no: e.target.value })} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select style={inputStyle} value={voForm.status} onChange={e => setVoForm({ ...voForm, status: e.target.value })}>
                      {VO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Title</label>
                  <input style={inputStyle} value={voForm.title} onChange={e => setVoForm({ ...voForm, title: e.target.value })} required />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={voForm.description} onChange={e => setVoForm({ ...voForm, description: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Amount (KES)</label>
                    <input style={inputStyle} type="number" step="0.01" value={voForm.amount} onChange={e => setVoForm({ ...voForm, amount: e.target.value })} required />
                  </div>
                  <div>
                    <label style={labelStyle}>FIDIC Clause</label>
                    <input style={inputStyle} value={voForm.fidic_clause} onChange={e => setVoForm({ ...voForm, fidic_clause: e.target.value })} placeholder="e.g., 13.1" />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button type="button" style={btnSecondary} onClick={() => setShowVOModal(false)}>Cancel</button>
                <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Saving...' : editingVO ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// TAB 1 — Cash Flow S-Curve
// ======================================================================
function CashFlowTab({ project, ipcs, eotApps, contractSum, totalCertified, totalPaid, outstanding, financialProgress, tooltip, setTooltip, svgRef }) {
  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius, 8px)', padding: 20, marginBottom: 16 };
  const kpiCard = { ...card, flex: '1 1 180px', minWidth: 160, textAlign: 'center' };
  const kpiLabel = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' };
  const kpiValue = { fontSize: 20, fontWeight: 700, color: 'var(--text)' };

  // Build timeline
  const startDate = project?.start_date ? new Date(project.start_date) : new Date();
  let endDate = project?.end_date ? new Date(project.end_date) : new Date(startDate.getTime() + 365 * 86400000);

  // Extend for EoT
  const eotExtensions = eotApps.filter(e => e.status === 'Granted' || e.days_awarded > 0);
  const totalExtDays = eotExtensions.reduce((s, e) => s + (e.days_awarded || 0), 0);
  if (totalExtDays > 0) {
    endDate = new Date(endDate.getTime() + totalExtDays * 86400000);
  }

  // Generate month labels
  const months = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);
  while (cur <= last) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }

  const totalMonths = months.length || 1;
  const today = new Date();

  // S-curve planned values (simple S-curve using sigmoid)
  const plannedCurve = months.map((m, i) => {
    const t = (i + 1) / totalMonths;
    // Sigmoid S-curve: slower at start & end, faster in middle
    const s = 1 / (1 + Math.exp(-10 * (t - 0.5)));
    return contractSum * s;
  });

  // Actual certified cumulative by month
  const certifiedByMonth = months.map(m => {
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    return ipcs.filter(c => new Date(c.period_end || c.contractor_submitted_date) <= monthEnd)
      .reduce((s, c) => s + (c.certified_amount || 0), 0);
  });

  // Actual paid cumulative by month
  const paidByMonth = months.map(m => {
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    return ipcs.filter(c => {
      const payDate = c.payment_due_date || c.period_end;
      return payDate && new Date(payDate) <= monthEnd;
    }).reduce((s, c) => s + (c.paid_amount || 0), 0);
  });

  // SVG dimensions
  const W = 900, H = 400;
  const pad = { top: 30, right: 40, bottom: 60, left: 90 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const maxVal = Math.max(contractSum, ...certifiedByMonth, ...paidByMonth, ...plannedCurve) * 1.1 || 1;

  const x = (i) => pad.left + (i / (totalMonths - 1 || 1)) * chartW;
  const y = (v) => pad.top + chartH - (v / maxVal) * chartH;

  const plannedPoints = plannedCurve.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const certifiedPoints = certifiedByMonth.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const paidPoints = paidByMonth.map((v, i) => `${x(i)},${y(v)}`).join(' ');

  // Today marker
  const todayIdx = months.findIndex(m => m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth());
  const todayX = todayIdx >= 0 ? x(todayIdx) : null;

  // Y-axis ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks + 1 }, (_, i) => (maxVal / yTicks) * i);

  // Month labels (show every N months)
  const labelInterval = totalMonths > 24 ? 3 : totalMonths > 12 ? 2 : 1;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function handleMouseMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const scale = W / rect.width;
    const adjMx = mx * scale;

    if (adjMx < pad.left || adjMx > W - pad.right) { setTooltip(null); return; }

    const idx = Math.round(((adjMx - pad.left) / chartW) * (totalMonths - 1));
    if (idx < 0 || idx >= totalMonths) { setTooltip(null); return; }

    const m = months[idx];
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      month: monthNames[m.getMonth()] + ' ' + m.getFullYear(),
      planned: plannedCurve[idx],
      certified: certifiedByMonth[idx],
      paid: paidByMonth[idx],
    });
  }

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={kpiCard}>
          <div style={kpiLabel}>Contract Sum</div>
          <div style={kpiValue}>{fmtShort(contractSum)}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Total Certified</div>
          <div style={{ ...kpiValue, color: '#22c55e' }}>{fmtShort(totalCertified)}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Total Paid</div>
          <div style={{ ...kpiValue, color: '#f59e0b' }}>{fmtShort(totalPaid)}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Outstanding</div>
          <div style={{ ...kpiValue, color: outstanding > 0 ? '#ef4444' : '#22c55e' }}>{fmtShort(outstanding)}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Financial Progress</div>
          <div style={kpiValue}>{financialProgress}%</div>
        </div>
      </div>

      {/* S-Curve Chart */}
      <div style={{ ...card, position: 'relative', overflow: 'hidden' }}>
        <h3 style={{ color: 'var(--text)', marginBottom: 12, fontSize: 15 }}>Cash Flow S-Curve</h3>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,3" /></svg>
            Planned
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#22c55e" strokeWidth="2" /></svg>
            Actual Certified
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <svg width="24" height="3"><line x1="0" y1="1.5" x2="24" y2="1.5" stroke="#f59e0b" strokeWidth="2" /></svg>
            Actual Paid
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', minWidth: 600, maxWidth: W, height: 'auto' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTooltip(null)}
          >
            {/* Grid lines */}
            {yTickVals.map((v, i) => (
              <g key={i}>
                <line x1={pad.left} y1={y(v)} x2={W - pad.right} y2={y(v)} stroke="var(--border)" strokeWidth="0.5" />
                <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmtShort(v)}</text>
              </g>
            ))}

            {/* X-axis labels */}
            {months.map((m, i) => i % labelInterval === 0 ? (
              <g key={i}>
                <line x1={x(i)} y1={pad.top} x2={x(i)} y2={pad.top + chartH} stroke="var(--border)" strokeWidth="0.3" />
                <text x={x(i)} y={H - pad.bottom + 16} textAnchor="middle" fontSize="9" fill="var(--text-muted)" transform={`rotate(-45, ${x(i)}, ${H - pad.bottom + 16})`}>
                  {monthNames[m.getMonth()] + ' ' + String(m.getFullYear()).slice(2)}
                </text>
              </g>
            ) : null)}

            {/* Axes */}
            <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + chartH} stroke="var(--text-muted)" strokeWidth="1" />
            <line x1={pad.left} y1={pad.top + chartH} x2={W - pad.right} y2={pad.top + chartH} stroke="var(--text-muted)" strokeWidth="1" />

            {/* Planned curve (dashed blue) */}
            {totalMonths > 1 && <polyline points={plannedPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,4" />}

            {/* Certified curve (solid green) */}
            {certifiedByMonth.some(v => v > 0) && (
              <>
                <polyline points={certifiedPoints} fill="none" stroke="#22c55e" strokeWidth="2.5" />
                {certifiedByMonth.map((v, i) => v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#22c55e" /> : null)}
              </>
            )}

            {/* Paid curve (solid amber) */}
            {paidByMonth.some(v => v > 0) && (
              <>
                <polyline points={paidPoints} fill="none" stroke="#f59e0b" strokeWidth="2.5" />
                {paidByMonth.map((v, i) => v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#f59e0b" /> : null)}
              </>
            )}

            {/* Today marker */}
            {todayX && (
              <g>
                <line x1={todayX} y1={pad.top} x2={todayX} y2={pad.top + chartH} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,3" />
                <text x={todayX} y={pad.top - 6} textAnchor="middle" fontSize="10" fill="#ef4444" fontWeight="600">Today</text>
              </g>
            )}

            {/* Axis labels */}
            <text x={pad.left + chartW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--text-muted)">Project Duration (Months)</text>
            <text x={14} y={pad.top + chartH / 2} textAnchor="middle" fontSize="11" fill="var(--text-muted)" transform={`rotate(-90, 14, ${pad.top + chartH / 2})`}>Cumulative Amount (KES)</text>
          </svg>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 10,
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', pointerEvents: 'none', zIndex: 10, fontSize: 12, minWidth: 180,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>{tooltip.month}</div>
            <div style={{ color: '#3b82f6' }}>Planned: {fmt(Math.round(tooltip.planned))}</div>
            <div style={{ color: '#22c55e' }}>Certified: {fmt(Math.round(tooltip.certified))}</div>
            <div style={{ color: '#f59e0b' }}>Paid: {fmt(Math.round(tooltip.paid))}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// TAB 2 — Final Account Estimate
// ======================================================================
function FinalAccountTab({ project, contractSum, approvedVOSum, pendingVOSum, approvedEoTCost, pendingClaimsSum, estimatedFinalAccount, totalCertified, remainingToCertify, variationOrders, openVOModal, card, th, td, tdRight, btnPrimary }) {
  const lines = [
    { label: 'Original Contract Sum', amount: contractSum, bold: true },
    { label: '+ Approved Variation Orders', amount: approvedVOSum },
    { label: '+ Pending Variation Orders', amount: pendingVOSum, muted: true },
    { label: '+ Approved EoT Cost Claims', amount: approvedEoTCost },
    { label: '+ Pending Claims', amount: pendingClaimsSum, muted: true },
    { label: 'Estimated Final Account', amount: estimatedFinalAccount, bold: true, accent: true },
    { label: '- Certified to Date', amount: totalCertified },
    { label: 'Remaining to Certify', amount: remainingToCertify, bold: true },
  ];

  // Visual comparison bar
  const maxBar = Math.max(contractSum, estimatedFinalAccount) || 1;

  const statusColor = (s) => {
    switch (s) {
      case 'Approved': return '#22c55e';
      case 'Pending': case 'Proposed': return '#f59e0b';
      case 'Rejected': return '#ef4444';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div>
      {/* Breakdown Table */}
      <div style={card}>
        <h3 style={{ color: 'var(--text)', marginBottom: 16, fontSize: 15 }}>Projected Final Account</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount (KES)</th>
              <th style={{ ...th, textAlign: 'right' }}>% of Contract</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} style={line.accent ? { background: 'rgba(59,130,246,0.08)' } : {}}>
                <td style={{ ...td, fontWeight: line.bold ? 700 : 400, color: line.muted ? 'var(--text-muted)' : 'var(--text)' }}>
                  {line.label}
                </td>
                <td style={{ ...tdRight, fontWeight: line.bold ? 700 : 400, color: line.accent ? 'var(--accent)' : line.muted ? 'var(--text-muted)' : 'var(--text)' }}>
                  {fmt(line.amount)}
                </td>
                <td style={{ ...tdRight, color: 'var(--text-muted)' }}>
                  {pct(line.amount, contractSum)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Visual Comparison */}
      <div style={card}>
        <h3 style={{ color: 'var(--text)', marginBottom: 16, fontSize: 15 }}>Original vs Estimated Final Account</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>Original Contract</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{fmtShort(contractSum)}</span>
            </div>
            <div style={{ height: 28, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(contractSum / maxBar) * 100}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 0.5s' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>Estimated Final Account</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: estimatedFinalAccount > contractSum ? '#f59e0b' : '#22c55e' }}>{fmtShort(estimatedFinalAccount)}</span>
            </div>
            <div style={{ height: 28, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(estimatedFinalAccount / maxBar) * 100}%`, background: estimatedFinalAccount > contractSum ? '#f59e0b' : '#22c55e', borderRadius: 4, transition: 'width 0.5s' }} />
            </div>
          </div>
          {estimatedFinalAccount > contractSum && (
            <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, textAlign: 'right' }}>
              +{pct(estimatedFinalAccount - contractSum, contractSum)} over original contract
            </div>
          )}
        </div>
      </div>

      {/* Variation Orders Table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--text)', fontSize: 15, margin: 0 }}>Variation Orders</h3>
          <button style={btnPrimary} onClick={() => openVOModal(null)}>+ Add VO</button>
        </div>
        {variationOrders.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No variation orders recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={th}>VO No</th>
                  <th style={th}>Title</th>
                  <th style={{ ...th, textAlign: 'right' }}>Amount (KES)</th>
                  <th style={th}>Status</th>
                  <th style={th}>FIDIC Clause</th>
                  <th style={th}>Date</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {variationOrders.map(vo => (
                  <tr key={vo.id}>
                    <td style={td}>{vo.vo_no}</td>
                    <td style={{ ...td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vo.title}</td>
                    <td style={tdRight}>{fmt(vo.amount)}</td>
                    <td style={td}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: statusColor(vo.status) + '18', color: statusColor(vo.status),
                      }}>
                        {vo.status}
                      </span>
                    </td>
                    <td style={td}>{vo.fidic_clause || '—'}</td>
                    <td style={td}>{vo.approved_date || vo.created_at?.split('T')[0] || '—'}</td>
                    <td style={td}>
                      <button style={{ ...btnPrimary, padding: '4px 10px', fontSize: 11 }} onClick={() => openVOModal(vo)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================================================================
// TAB 3 — Burn Rate Analysis
// ======================================================================
function BurnRateTab({ project, ipcs, contractSum, totalCertified, estimatedFinalAccount, remainingToCertify, eotApps, card, th, td, tdRight }) {
  const startDate = project?.start_date ? new Date(project.start_date) : new Date();
  let endDate = project?.end_date ? new Date(project.end_date) : new Date(startDate.getTime() + 365 * 86400000);

  // Extend for EoT
  const totalExtDays = eotApps.filter(e => e.status === 'Granted' || e.days_awarded > 0).reduce((s, e) => s + (e.days_awarded || 0), 0);
  if (totalExtDays > 0) endDate = new Date(endDate.getTime() + totalExtDays * 86400000);

  // Monthly breakdown from IPCs
  const monthlyData = [];
  const sortedIPCs = [...ipcs].sort((a, b) => new Date(a.period_end || a.contractor_submitted_date) - new Date(b.period_end || b.contractor_submitted_date));

  const monthMap = {};
  sortedIPCs.forEach(ipc => {
    const d = new Date(ipc.period_end || ipc.contractor_submitted_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthMap[key]) monthMap[key] = { month: key, certified: 0, cumulative: 0 };
    monthMap[key].certified += (ipc.certified_amount || 0);
  });

  const monthKeys = Object.keys(monthMap).sort();
  let cumul = 0;
  monthKeys.forEach(k => {
    cumul += monthMap[k].certified;
    monthMap[k].cumulative = cumul;
    monthlyData.push(monthMap[k]);
  });

  const avgBurnRate = monthlyData.length > 0
    ? monthlyData.reduce((s, m) => s + m.certified, 0) / monthlyData.length
    : 0;

  const projectedMonthsRemaining = avgBurnRate > 0 ? Math.ceil(remainingToCertify / avgBurnRate) : null;
  const today = new Date();
  const projectedCompletion = projectedMonthsRemaining
    ? new Date(today.getFullYear(), today.getMonth() + projectedMonthsRemaining, today.getDate())
    : null;

  // Traffic light
  let trafficLight = 'green';
  let trafficLabel = 'On Track';
  if (projectedCompletion) {
    const diffDays = (projectedCompletion - endDate) / 86400000;
    if (diffDays > 90) {
      trafficLight = 'red';
      trafficLabel = 'Exceeds Contract Period';
    } else if (diffDays > 0) {
      trafficLight = 'amber';
      trafficLabel = 'Within 3 Months of Overrun';
    }
  } else if (remainingToCertify > 0 && avgBurnRate === 0) {
    trafficLight = 'red';
    trafficLabel = 'No Spend Data';
  }

  const trafficColors = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };
  const maxMonthly = Math.max(...monthlyData.map(m => m.certified), 1);
  const remainingBudget = contractSum - totalCertified;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatMonth = (key) => {
    const [yr, mo] = key.split('-');
    return monthNames[parseInt(mo, 10) - 1] + ' ' + yr;
  };

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ ...card, flex: '1 1 200px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Avg Monthly Burn Rate</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{fmtShort(avgBurnRate)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>per month</div>
        </div>
        <div style={{ ...card, flex: '1 1 200px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Projected Months Remaining</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{projectedMonthsRemaining ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>months to complete</div>
        </div>
        <div style={{ ...card, flex: '1 1 200px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Projected Completion</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: trafficColors[trafficLight] }}>
            {projectedCompletion ? projectedCompletion.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            Contract end: {endDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div style={{ ...card, flex: '1 1 200px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Schedule Status</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            <span style={{
              display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
              background: trafficColors[trafficLight],
              boxShadow: `0 0 8px ${trafficColors[trafficLight]}60`,
            }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: trafficColors[trafficLight] }}>{trafficLabel}</span>
          </div>
        </div>
      </div>

      {/* Funding Adequacy */}
      <div style={card}>
        <h3 style={{ color: 'var(--text)', marginBottom: 12, fontSize: 15 }}>Funding Adequacy</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Contract Sum</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{fmt(contractSum)}</div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Total Certified</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#22c55e' }}>{fmt(totalCertified)}</div>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Remaining Budget</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: remainingBudget < 0 ? '#ef4444' : 'var(--text)' }}>{fmt(remainingBudget)}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 5, transition: 'width 0.5s',
            width: `${Math.min(100, (totalCertified / (contractSum || 1)) * 100)}%`,
            background: totalCertified > contractSum ? '#ef4444' : totalCertified > contractSum * 0.9 ? '#f59e0b' : '#22c55e',
          }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
          {((totalCertified / (contractSum || 1)) * 100).toFixed(1)}% of contract sum utilized
        </div>
      </div>

      {/* Monthly Burn Rate Table */}
      <div style={card}>
        <h3 style={{ color: 'var(--text)', marginBottom: 16, fontSize: 15 }}>Monthly Expenditure</h3>
        {monthlyData.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No IPC data available to calculate burn rate.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={th}>Month</th>
                  <th style={{ ...th, textAlign: 'right' }}>Certified This Month</th>
                  <th style={{ ...th, textAlign: 'right' }}>Cumulative</th>
                  <th style={{ ...th, width: '30%' }}>Monthly Burn</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((m, i) => (
                  <tr key={m.month}>
                    <td style={td}>{formatMonth(m.month)}</td>
                    <td style={tdRight}>{fmt(m.certified)}</td>
                    <td style={tdRight}>{fmt(m.cumulative)}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 18, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 3, transition: 'width 0.3s',
                            width: `${(m.certified / maxMonthly) * 100}%`,
                            background: m.certified >= avgBurnRate * 1.5 ? '#ef4444' : m.certified >= avgBurnRate ? '#f59e0b' : '#22c55e',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' }}>{fmtShort(m.certified)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {/* Average row */}
                <tr style={{ background: 'rgba(59,130,246,0.06)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>Average</td>
                  <td style={{ ...tdRight, fontWeight: 700 }}>{fmt(avgBurnRate)}</td>
                  <td style={tdRight}>—</td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 18, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${(avgBurnRate / maxMonthly) * 100}%`, background: '#3b82f6' }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{fmtShort(avgBurnRate)}</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
