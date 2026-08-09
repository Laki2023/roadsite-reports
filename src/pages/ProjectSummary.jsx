import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const COLORS = ['#e87b35','#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2'];
const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString() : '—';
const fmtB = (n) => {
  if (!n) return '—';
  if (n >= 1e9) return 'KES ' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return 'KES ' + (n/1e6).toFixed(1) + 'M';
  return fmt(n);
};

function ProgressRing({ percent, size = 80, color = '#e87b35', label }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
        <div style={{ fontSize: size * 0.22, fontWeight: 800, color }}>{percent.toFixed(0)}%</div>
        {label && <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: -2 }}>{label}</div>}
      </div>
    </div>
  );
}

function HealthGrade({ score }) {
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  const color = score >= 75 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 56, fontWeight: 900, color, lineHeight: 1 }}>{grade}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Health Score: {score.toFixed(0)}/100</div>
    </div>
  );
}

export default function ProjectSummary({ projectId, onBack, profile }) {
  const [p, setP] = useState(null);
  const [boq, setBoq] = useState([]);
  const [works, setWorks] = useState([]);
  const [equip, setEquip] = useState([]);
  const [structs, setStructs] = useState([]);
  const [issues, setIssues] = useState([]);
  const [layers, setLayers] = useState([]);
  const [tests, setTests] = useState([]);
  const [ipcs, setIpcs] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAll(); }, [projectId]);

  async function loadAll() {
    const [proj, boqR, worksR, eqR, strR, issR, layR, testR, ipcR, emR] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('boq_items').select('*, section:section_id(section_no, section_title)').eq('project_id', projectId),
      supabase.from('works_activities').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('equipment_register').select('*').eq('project_id', projectId),
      supabase.from('structures').select('*').eq('project_id', projectId).order('chainage'),
      supabase.from('site_issues').select('*').eq('project_id', projectId),
      supabase.from('pavement_layers').select('*').eq('project_id', projectId).order('start_chainage'),
      supabase.from('quality_tests').select('*').eq('project_id', projectId),
      supabase.from('ipc_certificates').select('*').eq('project_id', projectId).order('ipc_no'),
      supabase.from('site_emergencies').select('*').eq('project_id', projectId),
    ]);
    setP(proj.data); setBoq(boqR.data||[]); setWorks(worksR.data||[]); setEquip(eqR.data||[]);
    setStructs(strR.data||[]); setIssues(issR.data||[]); setLayers(layR.data||[]);
    setTests(testR.data||[]); setIpcs(ipcR.data||[]); setEmergencies(emR.data||[]);
    setLoading(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading executive summary...</div>;
  if (!p) return <div>Project not found</div>;

  // ── CALCULATIONS ──
  const contractSum = boq.reduce((s, i) => s + (i.boq_amount || 0), 0) || p.contract_sum || 0;
  const valueDone = boq.reduce((s, i) => s + (i.value_to_date || 0), 0);
  const financialPct = contractSum > 0 ? (valueDone / contractSum) * 100 : 0;
  const roadLength = p.end_chainage && p.start_chainage ? p.end_chainage - p.start_chainage : 0;
  const costPerKm = roadLength > 0 ? contractSum / roadLength : 0;
  const valueDonePerKm = roadLength > 0 ? valueDone / roadLength : 0;

  // Schedule
  const startDate = p.commencement_date ? new Date(p.commencement_date) : null;
  const endDate = p.original_completion_date ? new Date(p.original_completion_date) : null;
  const today = new Date();
  const totalDays = startDate && endDate ? (endDate - startDate) / 86400000 : 0;
  const elapsedDays = startDate ? Math.max(0, (today - startDate) / 86400000) : 0;
  const remainingDays = endDate ? Math.max(0, (endDate - today) / 86400000) : 0;
  const schedulePct = totalDays > 0 ? Math.min(100, (elapsedDays / totalDays) * 100) : 0;
  const isDelayed = financialPct < schedulePct - 10;

  // Works
  const totalActivities = works.length;
  const completedActs = works.filter(w => w.status === 'Completed' || w.status === 'Approved').length;
  const worksPct = totalActivities > 0 ? (completedActs / totalActivities) * 100 : 0;

  // Equipment
  const eqRequired = equip.reduce((s, e) => s + (e.required_quantity || 0), 0);
  const eqOnSite = equip.reduce((s, e) => s + (e.actual_on_site || 0), 0);
  const eqPct = eqRequired > 0 ? (eqOnSite / eqRequired) * 100 : 100;

  // Structures
  const structsDone = structs.filter(s => s.overall_status === 'Completed' || s.overall_status === 'Approved').length;
  const structsPct = structs.length > 0 ? (structsDone / structs.length) * 100 : 100;

  // Quality
  const testsPassed = tests.filter(t => t.result_status === 'Pass').length;
  const testsFailed = tests.filter(t => t.result_status === 'Fail').length;
  const qualityPct = tests.length > 0 ? (testsPassed / tests.length) * 100 : 100;

  // Issues
  const openIssues = issues.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
  const criticalIssues = issues.filter(i => i.severity === 'Critical' && i.status !== 'Closed').length;

  // Health Score (weighted average)
  const healthScore = (financialPct * 0.25) + (worksPct * 0.25) + (qualityPct * 0.2) + (eqPct * 0.15) + (structsPct * 0.15);

  // Pavement layer progress
  const layerTypes = ['Subgrade','Improved Subgrade','Sub-base','Base','Prime Coat','Tack Coat','Binder Course','Wearing Course'];
  const layerSummary = layerTypes.map(lt => {
    const matching = layers.filter(l => l.layer_type === lt);
    const approved = matching.filter(l => l.layer_status === 'Approved').length;
    const total = matching.length;
    const layerTests = tests.filter(t => matching.some(l => l.id === t.layer_id));
    const passed = layerTests.filter(t => t.result_status === 'Pass').length;
    return { name: lt, total, approved, testsPassed: passed, testsTotal: layerTests.length };
  }).filter(l => l.total > 0);

  // Works by category for chart
  const worksByCategory = {};
  works.forEach(w => {
    if (!worksByCategory[w.category]) worksByCategory[w.category] = { planned: 0, done: 0 };
    worksByCategory[w.category].planned++;
    if (w.status === 'Completed' || w.status === 'Approved') worksByCategory[w.category].done++;
  });
  const worksCatChart = Object.entries(worksByCategory).map(([name, d]) => ({ name, planned: d.planned, completed: d.done }));

  // Financial by IPC trend
  const ipcTrend = ipcs.map(i => ({ name: `IPC ${i.ipc_no}`, gross: i.gross_value, net: i.net_amount }));

  // Structure type breakdown
  const structTypes = {};
  structs.forEach(s => { structTypes[s.structure_type] = (structTypes[s.structure_type] || 0) + 1; });
  const structChart = Object.entries(structTypes).map(([name, value]) => ({ name, value }));

  const layerColors = {
    'Subgrade': '#8B6914', 'Improved Subgrade': '#A0823B', 'Sub-base': '#C4956A',
    'Base': '#D4A574', 'Prime Coat': '#2a2a2a', 'Tack Coat': '#1a1a1a',
    'Binder Course': '#3d3d3d', 'Wearing Course': '#555555',
  };

  return (
    <div>
      <button className="btn btn-sm btn-secondary mb-16" onClick={onBack}>← Back to Dashboard</button>

      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, marginBottom: 20, padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{p.name}</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {p.contract_no && <span className="text-mono">{p.contract_no} · </span>}
            {p.contractor_name} · {p.category} · {p.fidic_edition}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 20px', fontSize: 12, marginTop: 12 }}>
            <div><span className="text-muted">Employer:</span> <strong>{p.employer}</strong></div>
            <div><span className="text-muted">Road Length:</span> <strong>{roadLength.toFixed(1)} km</strong></div>
            <div><span className="text-muted">Road Class:</span> <strong>{p.road_class || '—'}</strong></div>
            <div><span className="text-muted">Region:</span> <strong>{p.region}{p.county ? ` / ${p.county}` : ''}</strong></div>
            <div><span className="text-muted">Chainage:</span> <strong className="text-mono">{p.start_chainage}–{p.end_chainage} km</strong></div>
            <div><span className="text-muted">Phase:</span> <span className="badge badge-accent">{p.current_phase}</span></div>
          </div>
        </div>
        <HealthGrade score={healthScore} />
      </div>

      {/* ═══ KPI STRIP ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Contract Sum', value: fmtB(contractSum), color: '#4b5563' },
          { label: 'Value Done', value: fmtB(valueDone), sub: `${financialPct.toFixed(1)}%`, color: '#e87b35' },
          { label: 'Cost/km', value: fmtB(costPerKm), color: '#2563eb' },
          { label: 'Time Elapsed', value: `${schedulePct.toFixed(0)}%`, sub: `${Math.round(remainingDays)} days left`, color: isDelayed ? '#dc2626' : '#16a34a' },
          { label: 'Quality', value: `${qualityPct.toFixed(0)}%`, sub: `${testsPassed}/${tests.length} pass`, color: qualityPct >= 80 ? '#16a34a' : '#dc2626' },
          { label: 'Issues', value: openIssues, sub: criticalIssues > 0 ? `${criticalIssues} critical` : 'No critical', color: criticalIssues > 0 ? '#dc2626' : '#16a34a' },
        ].map((kpi, i) => (
          <div key={i} className="stat-card" style={{ textAlign: 'center', borderTop: `3px solid ${kpi.color}`, padding: '12px 8px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, margin: '4px 0' }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {/* ═══ PROGRESS RINGS ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '16px 0', marginBottom: 20, background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <ProgressRing percent={financialPct} color="#e87b35" label="Financial" />
        <ProgressRing percent={worksPct} color="#2563eb" label="Works" />
        <ProgressRing percent={schedulePct} color={isDelayed ? '#dc2626' : '#16a34a'} label="Schedule" />
        <ProgressRing percent={eqPct} color="#7c3aed" label="Equipment" />
        <ProgressRing percent={structsPct} color="#0891b2" label="Structures" />
        <ProgressRing percent={qualityPct} color={qualityPct >= 80 ? '#16a34a' : '#dc2626'} label="Quality" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* ═══ WORKS PROGRESS BY CATEGORY ═══ */}
        {worksCatChart.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Works Progress by Category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={worksCatChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="planned" fill="#4b5563" name="Total" radius={[2,2,0,0]} />
                <Bar dataKey="completed" fill="#e87b35" name="Done" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ═══ PAVEMENT LAYERS ═══ */}
        {layerSummary.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pavement Layer Status & Tests</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {layerSummary.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: layerColors[l.name] || '#666' }} />
                  <span style={{ fontSize: 11, minWidth: 100, fontWeight: 500 }}>{l.name}</span>
                  <div className="progress-bar" style={{ flex: 1, height: 8 }}>
                    <div className="fill green" style={{ width: `${l.total > 0 ? (l.approved/l.total)*100 : 0}%` }} />
                  </div>
                  <span style={{ fontSize: 10, minWidth: 35, textAlign: 'right' }}>{l.approved}/{l.total}</span>
                  <span style={{ fontSize: 10, color: l.testsTotal > 0 && l.testsPassed === l.testsTotal ? '#16a34a' : l.testsTotal > 0 ? '#d97706' : 'var(--text-muted)', minWidth: 50 }}>
                    {l.testsTotal > 0 ? `✓${l.testsPassed}/${l.testsTotal}` : 'No tests'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STRUCTURES ═══ */}
        {structs.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Structures ({structs.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                {structChart.length > 0 && (
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={structChart} cx="50%" cy="50%" outerRadius={55} dataKey="value" label={({ name, value }) => `${value}`} labelLine={false} style={{ fontSize: 9 }}>
                        {structChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                {structs.slice(0, 6).map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, minWidth: 45 }}>{s.structure_ref}</span>
                    <div className="progress-bar" style={{ flex: 1, height: 6 }}>
                      <div className={`fill ${s.percent_complete >= 80 ? 'green' : s.percent_complete >= 40 ? 'orange' : 'red'}`}
                        style={{ width: `${s.percent_complete || 0}%` }} />
                    </div>
                    <span style={{ fontSize: 9, minWidth: 25 }}>{s.percent_complete||0}%</span>
                  </div>
                ))}
                {structs.length > 6 && <div className="text-muted">+{structs.length - 6} more</div>}
              </div>
            </div>
          </div>
        )}

        {/* ═══ FINANCIAL SUMMARY ═══ */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Financial Summary</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', fontSize: 12 }}>
            <div>Contract Sum:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmtB(contractSum)}</div>
            <div>Value of Work Done:</div><div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 700 }}>{fmtB(valueDone)}</div>
            <div>Remaining:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmtB(contractSum - valueDone)}</div>
            <div style={{ borderTop: '1px solid var(--border)', gridColumn: 'span 2', margin: '4px 0' }} />
            <div>Cost per km:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmtB(costPerKm)}</div>
            <div>Value done per km:</div><div className="text-mono" style={{ textAlign: 'right' }}>{fmtB(valueDonePerKm)}</div>
            <div>IPCs Issued:</div><div style={{ textAlign: 'right' }}>{ipcs.length}</div>
            <div>Last IPC Net:</div><div className="text-mono" style={{ textAlign: 'right' }}>{ipcs.length > 0 ? fmtB(ipcs[ipcs.length-1].net_amount) : '—'}</div>
          </div>
          {ipcTrend.length > 0 && (
            <ResponsiveContainer width="100%" height={100} style={{ marginTop: 10 }}>
              <BarChart data={ipcTrend}>
                <Bar dataKey="net" fill="#e87b35" radius={[2,2,0,0]} />
                <Tooltip contentStyle={{ fontSize: 10 }} formatter={v => fmtB(v)} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ═══ SCHEDULE TIMELINE ═══ */}
      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Project Timeline</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 11, minWidth: 80 }}>{p.commencement_date || '—'}</span>
          <div style={{ flex: 1, position: 'relative', height: 24, background: 'var(--bg-hover)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${schedulePct}%`, background: 'rgba(107,114,128,0.3)', borderRadius: 12 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, financialPct)}%`, background: isDelayed ? 'rgba(220,38,38,0.6)' : 'rgba(22,163,74,0.6)', borderRadius: 12 }} />
            <div style={{ position: 'absolute', left: `${schedulePct}%`, top: -4, bottom: -4, width: 2, background: '#fff' }} />
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontSize: 10, fontWeight: 700, color: '#fff' }}>
              {isDelayed ? `⚠ Physical ${financialPct.toFixed(0)}% vs Time ${schedulePct.toFixed(0)}%` : `On Track — ${financialPct.toFixed(0)}% complete`}
            </span>
          </div>
          <span style={{ fontSize: 11, minWidth: 80, textAlign: 'right' }}>{p.original_completion_date || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
          <span>Commenced</span>
          <span>{Math.round(elapsedDays)} days elapsed · {Math.round(remainingDays)} days remaining</span>
          <span>Completion</span>
        </div>
      </div>

      {/* ═══ IMPACT & VALUE FOR MONEY ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Project Impact</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 12 }}>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#e87b35' }}>{roadLength.toFixed(1)}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>Kilometres of Road</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb' }}>{structs.length}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>Structures</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{equip.length}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>Equipment Deployed</div>
            </div>
            <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed' }}>{tests.length}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>Quality Tests Run</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Key Observations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
            {isDelayed && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#dc2626' }}>⚠</span>
                <span>Project is <strong>behind schedule</strong> — physical progress ({financialPct.toFixed(0)}%) lags time elapsed ({schedulePct.toFixed(0)}%)</span>
              </div>
            )}
            {!isDelayed && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#16a34a' }}>✅</span>
                <span>Project is <strong>on track</strong> — progress aligned with schedule</span>
              </div>
            )}
            {qualityPct < 80 && tests.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#dc2626' }}>⚠</span>
                <span>Quality concern — only {qualityPct.toFixed(0)}% test pass rate ({testsFailed} failures)</span>
              </div>
            )}
            {qualityPct >= 80 && tests.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#16a34a' }}>✅</span>
                <span>Quality is good — {qualityPct.toFixed(0)}% pass rate across {tests.length} tests</span>
              </div>
            )}
            {eqPct < 80 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#d97706' }}>⚠</span>
                <span>Equipment shortfall — only {eqOnSite} of {eqRequired} required items on site ({eqPct.toFixed(0)}%)</span>
              </div>
            )}
            {criticalIssues > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#dc2626' }}>🔴</span>
                <span>{criticalIssues} critical issue{criticalIssues > 1 ? 's' : ''} requiring immediate attention</span>
              </div>
            )}
            {openIssues === 0 && <div style={{ display: 'flex', gap: 8 }}><span>✅</span><span>No open issues</span></div>}
            {emergencies.filter(e => e.status !== 'Resolved').length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span>🚨</span>
                <span style={{ color: '#dc2626', fontWeight: 700 }}>{emergencies.filter(e => e.status !== 'Resolved').length} active emergency</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', padding: '12px 0' }}>
        RoadSite Reports v7.0 — Road Project Management · Generated {new Date().toLocaleDateString()} · {p.employer}
      </div>
    </div>
  );
}
