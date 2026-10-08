import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Cell, PieChart, Pie, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
  COLORS, fmt, fmtB, pct, daysBetween, fmtDate,
  getHealthGrade, ScoreRing, KPICard, ProgressRow, StatusBadge,
  LoadingSpinner, EmptyState, SectionHeader, Grid
} from '../components/SharedUI';

/* ══════════════════════════════════════════════════════════════
   MEGA DASHBOARD — Portfolio-Wide Analytics
   Cross-project comparison, trend analysis, and deep insights
   ══════════════════════════════════════════════════════════════ */

const TOOLTIP_STYLE = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 };

function MiniStat({ label, value, color, icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      {icon && <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>}
      <div style={{ fontSize: 18, fontWeight: 800, color: color || 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
    </div>
  );
}

export default function MegaDashboard({ profile, navigateTo, showToast }) {
  const [projects, setProjects] = useState([]);
  const [boqData, setBoqData] = useState([]);
  const [worksData, setWorksData] = useState([]);
  const [equipData, setEquipData] = useState([]);
  const [issueData, setIssueData] = useState([]);
  const [testData, setTestData] = useState([]);
  const [layerData, setLayerData] = useState([]);
  const [ipcData, setIpcData] = useState([]);
  const [reportCounts, setReportCounts] = useState({});
  const [lastReportMap, setLastReportMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('overview'); // overview | comparison | financial | quality | timeline
  const [sortBy, setSortBy] = useState('health'); // health | financial | physical | name
  const [filterRegion, setFilterRegion] = useState('all');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    try {
      const [projRes, boqRes, worksRes, eqRes, issRes, testRes, layerRes, ipcRes, repRes] = await Promise.all([
        supabase.from('projects').select('*').order('name').limit(200),
        supabase.from('boq_items').select('project_id, boq_amount, value_to_date, completed_quantity, boq_quantity').limit(5000),
        supabase.from('works_activities').select('project_id, activity_name, status, completed_quantity, planned_quantity').limit(5000),
        supabase.from('equipment_register').select('project_id, required_quantity, actual_on_site, is_key_equipment').limit(2000),
        supabase.from('site_issues').select('project_id, status, severity, created_at').limit(2000),
        supabase.from('quality_tests').select('project_id, result_status, test_type, test_date').limit(5000),
        supabase.from('pavement_layers').select('project_id, layer_type, layer_status').limit(2000),
        supabase.from('ipc_certificates').select('project_id, ipc_no, certified_amount, paid_amount, period_end').order('ipc_no').limit(1000),
        supabase.from('daily_reports').select('project_id, report_date').order('report_date', { ascending: false }).limit(2000),
      ]);

      const projs = projRes.data || [];
      setProjects(projs);
      setBoqData(boqRes.data || []);
      setWorksData(worksRes.data || []);
      setEquipData(eqRes.data || []);
      setIssueData(issRes.data || []);
      setTestData(testRes.data || []);
      setLayerData(layerRes.data || []);
      setIpcData(ipcRes.data || []);

      // Build report counts and last report map
      const rCounts = {};
      const lrMap = {};
      (repRes.data || []).forEach(r => {
        rCounts[r.project_id] = (rCounts[r.project_id] || 0) + 1;
        if (!lrMap[r.project_id]) lrMap[r.project_id] = r.report_date;
      });
      setReportCounts(rCounts);
      setLastReportMap(lrMap);
    } catch (err) {
      showToast('Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }

  // ── Compute per-project metrics ──
  const projectMetrics = useMemo(() => {
    return projects.map(p => {
      const projBoq = boqData.filter(b => b.project_id === p.id);
      const contractSum = projBoq.reduce((s, i) => s + (i.boq_amount || 0), 0);
      const valueDone = projBoq.reduce((s, i) => s + (i.value_to_date || 0), 0);
      const financialProgress = pct(valueDone, contractSum);

      const projWorks = worksData.filter(w => w.project_id === p.id);
      const completedWorks = projWorks.filter(w => w.status === 'Completed' || w.status === 'Approved').length;
      const physicalProgress = pct(completedWorks, projWorks.length);

      const projEquip = equipData.filter(e => e.project_id === p.id);
      const equipReq = projEquip.reduce((s, e) => s + (e.required_quantity || 0), 0);
      const equipOnSite = projEquip.reduce((s, e) => s + (e.actual_on_site || 0), 0);
      const equipUtil = pct(equipOnSite, equipReq);

      const projTests = testData.filter(t => t.project_id === p.id);
      const testsPassed = projTests.filter(t => t.result_status === 'Pass').length;
      const qualityScore = pct(testsPassed, projTests.length);

      const projIssues = issueData.filter(i => i.project_id === p.id);
      const openIssues = projIssues.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
      const criticalIssues = projIssues.filter(i => (i.status === 'Open' || i.status === 'In Progress') && i.severity === 'Critical').length;

      const projLayers = layerData.filter(l => l.project_id === p.id);
      const approvedLayers = projLayers.filter(l => l.layer_status === 'Approved').length;
      const layerProgress = pct(approvedLayers, projLayers.length);

      const projIPCs = ipcData.filter(i => i.project_id === p.id);
      const totalCertified = projIPCs.reduce((s, i) => s + (i.certified_amount || 0), 0);
      const totalPaid = projIPCs.reduce((s, i) => s + (i.paid_amount || 0), 0);
      const retentionHeld = totalCertified - totalPaid;

      const elapsed = p.start_date && p.end_date
        ? pct(daysBetween(p.start_date, new Date().toISOString().slice(0, 10)), daysBetween(p.start_date, p.end_date))
        : 0;
      const variance = physicalProgress - elapsed;

      const healthScore = Math.round(
        (physicalProgress * 0.3) + (financialProgress * 0.25) + (qualityScore * 0.25) +
        (equipUtil * 0.1) + ((100 - Math.min(openIssues * 5, 100)) * 0.1)
      );

      const daysSinceReport = lastReportMap[p.id]
        ? daysBetween(lastReportMap[p.id], new Date().toISOString().slice(0, 10))
        : 999;

      return {
        ...p, contractSum, valueDone, financialProgress, physicalProgress,
        equipUtil, qualityScore, openIssues, criticalIssues, healthScore,
        elapsed, variance, layerProgress, totalCertified, totalPaid, retentionHeld,
        reportCount: reportCounts[p.id] || 0, daysSinceReport,
        health: getHealthGrade(healthScore),
        completedWorks, totalWorks: projWorks.length,
        testsPassed, totalTests: projTests.length,
      };
    });
  }, [projects, boqData, worksData, equipData, issueData, testData, layerData, ipcData, lastReportMap, reportCounts]);

  // ── Filters & sorting ──
  const regions = useMemo(() => [...new Set(projects.map(p => p.region).filter(Boolean))], [projects]);
  const filtered = useMemo(() => {
    let list = filterRegion === 'all' ? projectMetrics : projectMetrics.filter(p => p.region === filterRegion);
    const sortFns = {
      health: (a, b) => b.healthScore - a.healthScore,
      financial: (a, b) => b.contractSum - a.contractSum,
      physical: (a, b) => b.physicalProgress - a.physicalProgress,
      name: (a, b) => (a.name || '').localeCompare(b.name || ''),
    };
    return [...list].sort(sortFns[sortBy] || sortFns.health);
  }, [projectMetrics, filterRegion, sortBy]);

  // ── Portfolio aggregates ──
  const portfolio = useMemo(() => {
    const totalContract = filtered.reduce((s, p) => s + p.contractSum, 0);
    const totalValueDone = filtered.reduce((s, p) => s + p.valueDone, 0);
    const totalCertified = filtered.reduce((s, p) => s + p.totalCertified, 0);
    const totalPaid = filtered.reduce((s, p) => s + p.totalPaid, 0);
    const avgHealth = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.healthScore, 0) / filtered.length) : 0;
    const avgPhysical = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.physicalProgress, 0) / filtered.length) : 0;
    const avgFinancial = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.financialProgress, 0) / filtered.length) : 0;
    const avgQuality = filtered.length ? Math.round(filtered.reduce((s, p) => s + p.qualityScore, 0) / filtered.length) : 0;
    const totalOpenIssues = filtered.reduce((s, p) => s + p.openIssues, 0);
    const totalCritical = filtered.reduce((s, p) => s + p.criticalIssues, 0);
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    filtered.forEach(p => { gradeDistribution[p.health.grade] = (gradeDistribution[p.health.grade] || 0) + 1; });
    const staleProjects = filtered.filter(p => p.daysSinceReport > 7).length;

    return {
      totalContract, totalValueDone, totalCertified, totalPaid,
      avgHealth, avgPhysical, avgFinancial, avgQuality,
      totalOpenIssues, totalCritical, gradeDistribution, staleProjects,
      projectCount: filtered.length,
      retention: totalCertified - totalPaid,
    };
  }, [filtered]);

  if (loading) return <LoadingSpinner message="Loading portfolio analytics..." />;
  if (projects.length === 0) return <EmptyState icon="📊" title="No Projects" message="Add projects to see portfolio analytics" />;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'comparison', label: 'Comparison', icon: '⚖️' },
    { key: 'financial', label: 'Financial', icon: '💰' },
    { key: 'quality', label: 'Quality & Safety', icon: '🧪' },
    { key: 'timeline', label: 'Timeline', icon: '📅' },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>📊 Portfolio Analytics</h2>
          <div className="subtitle">
            {portfolio.projectCount} project{portfolio.projectCount !== 1 ? 's' : ''} ·{' '}
            {fmtB(portfolio.totalContract)} total contract value ·{' '}
            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {regions.length > 1 && (
            <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12 }}>
              <option value="all">All Regions</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 12 }}>
            <option value="health">Sort: Health</option>
            <option value="financial">Sort: Contract Value</option>
            <option value="physical">Sort: Progress</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', borderBottom: '2px solid var(--border)', paddingBottom: 2 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setView(t.key)}
            style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: view === t.key ? '#e87b35' : 'transparent',
              color: view === t.key ? '#fff' : 'var(--text-muted)',
              borderRadius: '8px 8px 0 0', transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ════════ OVERVIEW TAB ════════ */}
      {view === 'overview' && (
        <div>
          {/* Portfolio KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <KPICard title="Portfolio Health" value={portfolio.avgHealth + '%'} icon="❤️"
              borderColor={getHealthGrade(portfolio.avgHealth).color}
              color={getHealthGrade(portfolio.avgHealth).color} />
            <KPICard title="Avg Physical" value={portfolio.avgPhysical + '%'} icon="📈" borderColor="#e87b35" />
            <KPICard title="Avg Financial" value={portfolio.avgFinancial + '%'} icon="💰" borderColor="#2563eb" />
            <KPICard title="Quality Score" value={portfolio.avgQuality + '%'} icon="🧪"
              borderColor={portfolio.avgQuality >= 80 ? '#10b981' : '#f59e0b'} />
            <KPICard title="Open Issues" value={portfolio.totalOpenIssues}
              subtitle={portfolio.totalCritical > 0 ? `${portfolio.totalCritical} critical` : 'None critical'}
              icon="⚠" borderColor={portfolio.totalCritical > 0 ? '#ef4444' : '#10b981'} />
            <KPICard title="Stale Projects" value={portfolio.staleProjects}
              subtitle="7+ days no report" icon="📭"
              borderColor={portfolio.staleProjects > 0 ? '#f59e0b' : '#10b981'} />
          </div>

          {/* Health Distribution + Grade Rings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 16, fontSize: 15 }}>Health Distribution</h3>
              <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 12 }}>
                {Object.entries(portfolio.gradeDistribution).map(([grade, count]) => {
                  const g = getHealthGrade(grade === 'A' ? 90 : grade === 'B' ? 75 : grade === 'C' ? 60 : grade === 'D' ? 45 : 20);
                  return (
                    <div key={grade} style={{ textAlign: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: g.color + '20', border: `2px solid ${g.color}`, margin: '0 auto 4px' }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: g.color }}>{count}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{grade}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{g.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project Health Heatmap */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Project Health Heatmap</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                {filtered.map(p => (
                  <div key={p.id} onClick={() => navigateTo('project-dashboard', p)}
                    style={{
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: `linear-gradient(135deg, ${p.health.color}15, ${p.health.color}08)`,
                      border: `1px solid ${p.health.color}30`, transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 12px ${p.health.color}30`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: p.health.color }}>{p.health.grade}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 9, color: 'var(--text-muted)' }}>
                      <span>P:{p.physicalProgress}%</span>
                      <span>F:{p.financialProgress}%</span>
                      <span>Q:{p.qualityScore}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Financial Overview Bar */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>Contract Values vs Value Done</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={filtered.map(p => ({
                name: (p.name || '').length > 15 ? (p.name || '').substring(0, 15) + '...' : p.name,
                contract: p.contractSum, done: p.valueDone, certified: p.totalCertified
              })).filter(p => p.contract > 0)} margin={{ left: 10, right: 10, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => (v/1e6).toFixed(0) + 'M'} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="contract" fill="#4b5563" name="Contract Sum" radius={[3,3,0,0]} />
                <Bar dataKey="done" fill="#e87b35" name="Value Done" radius={[3,3,0,0]} />
                <Bar dataKey="certified" fill="#2563eb" name="Certified" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ════════ COMPARISON TAB ════════ */}
      {view === 'comparison' && (
        <div>
          {/* Radar Chart - Top 6 projects */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Multi-Dimensional Comparison (Top 6)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={[
                  { metric: 'Physical', ...Object.fromEntries(filtered.slice(0, 6).map((p, i) => [`p${i}`, p.physicalProgress])) },
                  { metric: 'Financial', ...Object.fromEntries(filtered.slice(0, 6).map((p, i) => [`p${i}`, p.financialProgress])) },
                  { metric: 'Quality', ...Object.fromEntries(filtered.slice(0, 6).map((p, i) => [`p${i}`, p.qualityScore])) },
                  { metric: 'Equipment', ...Object.fromEntries(filtered.slice(0, 6).map((p, i) => [`p${i}`, p.equipUtil])) },
                  { metric: 'Health', ...Object.fromEntries(filtered.slice(0, 6).map((p, i) => [`p${i}`, p.healthScore])) },
                ]}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
                  {filtered.slice(0, 6).map((p, i) => (
                    <Radar key={p.id} name={(p.name || '').substring(0, 15)} dataKey={`p${i}`}
                      stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Scatter: Physical vs Financial */}
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Physical vs Financial Progress</h3>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
                Projects above the diagonal line have physical progress ahead of financial
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ left: 0, right: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="financial" name="Financial %" tick={{ fontSize: 10 }} domain={[0, 100]}
                    label={{ value: 'Financial %', fontSize: 10, position: 'bottom' }} />
                  <YAxis dataKey="physical" name="Physical %" tick={{ fontSize: 10 }} domain={[0, 100]}
                    label={{ value: 'Physical %', fontSize: 10, angle: -90, position: 'insideLeft' }} />
                  <ZAxis dataKey="size" range={[60, 400]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => [v + '%', name]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} />
                  <Scatter data={filtered.map(p => ({
                    financial: p.financialProgress, physical: p.physicalProgress,
                    name: p.name, size: Math.max(p.contractSum / 1e6, 10),
                    fill: p.health.color
                  }))} fill="#e87b35">
                    {filtered.map((p, i) => (
                      <Cell key={p.id} fill={p.health.color} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h3>Project Comparison Matrix</h3>
            </div>
            <div className="table-wrap">
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1 }}>Project</th>
                    <th>Grade</th>
                    <th>Physical %</th>
                    <th>Financial %</th>
                    <th>Quality %</th>
                    <th>Equip %</th>
                    <th>Contract Value</th>
                    <th>Value Done</th>
                    <th>Certified</th>
                    <th>Open Issues</th>
                    <th>Variance</th>
                    <th>Last Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigateTo('project-dashboard', p)}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </td>
                      <td><span style={{ fontWeight: 800, color: p.health.color, fontSize: 16 }}>{p.health.grade}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${p.physicalProgress}%`, background: '#e87b35', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 600 }}>{p.physicalProgress}%</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${p.financialProgress}%`, background: '#2563eb', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontWeight: 600 }}>{p.financialProgress}%</span>
                        </div>
                      </td>
                      <td style={{ color: p.qualityScore >= 80 ? '#10b981' : p.qualityScore >= 60 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                        {p.qualityScore}%
                      </td>
                      <td>{p.equipUtil}%</td>
                      <td style={{ fontWeight: 500 }}>{fmtB(p.contractSum)}</td>
                      <td>{fmtB(p.valueDone)}</td>
                      <td>{fmtB(p.totalCertified)}</td>
                      <td>
                        {p.openIssues > 0 ? (
                          <span style={{ color: p.criticalIssues > 0 ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                            {p.openIssues}{p.criticalIssues > 0 ? ` (${p.criticalIssues}🔴)` : ''}
                          </span>
                        ) : <span style={{ color: '#10b981' }}>✓</span>}
                      </td>
                      <td style={{ color: p.variance >= 0 ? '#10b981' : p.variance > -10 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                        {p.variance > 0 ? '+' : ''}{p.variance}%
                      </td>
                      <td style={{ color: p.daysSinceReport <= 2 ? '#10b981' : p.daysSinceReport <= 7 ? '#f59e0b' : '#ef4444', fontSize: 11 }}>
                        {p.daysSinceReport > 900 ? 'Never' : p.daysSinceReport === 0 ? 'Today' : `${p.daysSinceReport}d ago`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════ FINANCIAL TAB ════════ */}
      {view === 'financial' && (
        <div>
          {/* Financial KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
            <KPICard title="Total Contract Value" value={fmtB(portfolio.totalContract)} icon="📋" borderColor="#4b5563" />
            <KPICard title="Total Value Done" value={fmtB(portfolio.totalValueDone)}
              subtitle={`${pct(portfolio.totalValueDone, portfolio.totalContract)}% of contracts`}
              icon="📈" borderColor="#e87b35" />
            <KPICard title="Total Certified" value={fmtB(portfolio.totalCertified)} icon="✅" borderColor="#2563eb" />
            <KPICard title="Total Paid" value={fmtB(portfolio.totalPaid)}
              subtitle={portfolio.retention > 0 ? `${fmtB(portfolio.retention)} retention held` : 'No retention'}
              icon="💳" borderColor="#10b981" />
          </div>

          {/* Payment flow waterfall */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>Payment Pipeline by Project</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filtered.map(p => ({
                name: (p.name || '').length > 12 ? (p.name || '').substring(0, 12) + '...' : p.name,
                valueDone: p.valueDone, certified: p.totalCertified, paid: p.totalPaid,
                uncertified: Math.max(p.valueDone - p.totalCertified, 0),
                unpaid: Math.max(p.totalCertified - p.totalPaid, 0),
              })).filter(p => p.valueDone > 0)} margin={{ left: 10, right: 10, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => (v/1e6).toFixed(0) + 'M'} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="paid" stackId="a" fill="#10b981" name="Paid" />
                <Bar dataKey="unpaid" stackId="a" fill="#f59e0b" name="Certified (Unpaid)" />
                <Bar dataKey="uncertified" stackId="a" fill="#ef4444" name="Done (Uncertified)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Certification Progress per project */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>Certification Progress</h3>
            {filtered.filter(p => p.contractSum > 0).map(p => (
              <div key={p.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span className="text-muted">{fmtB(p.totalCertified)} / {fmtB(p.contractSum)}</span>
                </div>
                <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ height: '100%', width: `${pct(p.totalPaid, p.contractSum)}%`, background: '#10b981', position: 'absolute' }} />
                  <div style={{ height: '100%', width: `${pct(p.totalCertified, p.contractSum)}%`, background: '#2563eb40', position: 'absolute' }} />
                  <div style={{ height: '100%', width: `${p.financialProgress}%`, background: '#e87b3530', position: 'absolute' }} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#10b981', borderRadius: 2 }} /> Paid</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#2563eb40', borderRadius: 2 }} /> Certified</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: '#e87b3530', borderRadius: 2 }} /> Value Done</span>
            </div>
          </div>
        </div>
      )}

      {/* ════════ QUALITY & SAFETY TAB ════════ */}
      {view === 'quality' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            <KPICard title="Portfolio Quality" value={portfolio.avgQuality + '%'} icon="🧪"
              borderColor={portfolio.avgQuality >= 80 ? '#10b981' : '#f59e0b'} />
            <KPICard title="Total Tests" value={testData.length} icon="📋" borderColor="#2563eb"
              subtitle={`${testData.filter(t => t.result_status === 'Pass').length} passed`} />
            <KPICard title="Open Issues" value={portfolio.totalOpenIssues} icon="⚠️"
              borderColor={portfolio.totalOpenIssues > 0 ? '#ef4444' : '#10b981'} />
            <KPICard title="Critical Issues" value={portfolio.totalCritical} icon="🔴"
              borderColor={portfolio.totalCritical > 0 ? '#ef4444' : '#10b981'} />
          </div>

          {/* Quality scores by project */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Quality Score by Project</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={filtered.map(p => ({
                  name: (p.name || '').length > 12 ? (p.name || '').substring(0, 12) + '...' : p.name,
                  quality: p.qualityScore, tests: p.totalTests
                })).filter(d => d.tests > 0)} margin={{ left: 0, right: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [name === 'quality' ? v + '%' : v, name === 'quality' ? 'Pass Rate' : 'Total Tests']} />
                  {/* Reference line at 80% */}
                  <Bar dataKey="quality" name="Quality %" radius={[3,3,0,0]}>
                    {filtered.filter(p => p.totalTests > 0).map((p, i) => (
                      <Cell key={p.id} fill={p.qualityScore >= 80 ? '#10b981' : p.qualityScore >= 60 ? '#f59e0b' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginBottom: 12, fontSize: 15 }}>Issues by Project</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={filtered.map(p => ({
                  name: (p.name || '').length > 12 ? (p.name || '').substring(0, 12) + '...' : p.name,
                  open: p.openIssues, critical: p.criticalIssues
                })).filter(d => d.open > 0)} margin={{ left: 0, right: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="open" fill="#f59e0b" name="Open Issues" radius={[3,3,0,0]} />
                  <Bar dataKey="critical" fill="#ef4444" name="Critical" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ════════ TIMELINE TAB ════════ */}
      {view === 'timeline' && (
        <div>
          {/* Project timeline Gantt-like view */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16, fontSize: 15 }}>Project Timelines</h3>
            <div style={{ overflowX: 'auto' }}>
              {filtered.filter(p => p.start_date && p.end_date).length === 0 ? (
                <EmptyState icon="📅" title="No Timeline Data" message="Projects need start and end dates to display timelines" />
              ) : (
                (() => {
                  const projs = filtered.filter(p => p.start_date && p.end_date);
                  const minDate = new Date(Math.min(...projs.map(p => new Date(p.start_date).getTime())));
                  const maxDate = new Date(Math.max(...projs.map(p => new Date(p.end_date).getTime())));
                  const totalDays = daysBetween(minDate.toISOString(), maxDate.toISOString()) || 1;
                  const today = new Date();
                  const todayPct = ((today - minDate) / (maxDate - minDate)) * 100;

                  return (
                    <div style={{ position: 'relative', minWidth: 600 }}>
                      {/* Today line */}
                      {todayPct > 0 && todayPct < 100 && (
                        <div style={{ position: 'absolute', left: `calc(180px + ${todayPct}% * 0.72)`, top: 0, bottom: 0,
                          width: 2, background: '#ef4444', zIndex: 2, opacity: 0.6 }}>
                          <div style={{ position: 'absolute', top: -16, left: -14, fontSize: 9, color: '#ef4444', fontWeight: 700 }}>Today</div>
                        </div>
                      )}
                      {projs.map(p => {
                        const startPct = ((new Date(p.start_date) - minDate) / (maxDate - minDate)) * 100;
                        const widthPct = ((new Date(p.end_date) - new Date(p.start_date)) / (maxDate - minDate)) * 100;
                        return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, height: 32 }}>
                            <div style={{ width: 170, fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                              {p.name}
                            </div>
                            <div style={{ flex: 1, position: 'relative', height: 24, background: 'var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                              <div style={{
                                position: 'absolute', left: `${startPct}%`, width: `${widthPct}%`,
                                height: '100%', borderRadius: 6, overflow: 'hidden',
                                background: `linear-gradient(90deg, ${p.health.color}40, ${p.health.color}20)`,
                                border: `1px solid ${p.health.color}60`,
                              }}>
                                {/* Progress fill */}
                                <div style={{
                                  height: '100%', width: `${p.physicalProgress}%`,
                                  background: p.health.color, opacity: 0.6, borderRadius: 6,
                                }} />
                              </div>
                              {/* Labels */}
                              <div style={{ position: 'absolute', left: `${startPct}%`, top: '50%', transform: 'translateY(-50%)',
                                fontSize: 9, fontWeight: 700, color: 'var(--text)', paddingLeft: 4, whiteSpace: 'nowrap' }}>
                                {p.physicalProgress}% · {p.health.grade}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Date axis */}
                      <div style={{ display: 'flex', marginLeft: 170, justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 8 }}>
                        <span>{fmtDate(minDate.toISOString())}</span>
                        <span>{fmtDate(maxDate.toISOString())}</span>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Reporting frequency */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>Reporting Activity</h3>
            <div style={{ display: 'grid', gap: 10 }}>
              {filtered.map(p => {
                const dColor = p.daysSinceReport <= 2 ? '#10b981' : p.daysSinceReport <= 7 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                    background: dColor + '08', borderRadius: 8, border: `1px solid ${dColor}20` }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.reportCount} reports</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: dColor }}>
                      {p.daysSinceReport > 900 ? 'Never reported' : p.daysSinceReport === 0 ? 'Today' : `${p.daysSinceReport}d ago`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
