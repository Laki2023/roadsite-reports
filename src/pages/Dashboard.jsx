import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ROLE_LABELS } from '../lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, AreaChart, Area, RadialBarChart, RadialBar } from 'recharts';
import ProjectDashboard from './ProjectDashboard';

const COLORS = ['#e87b35','#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#6366f1'];
const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString() : '—';
const fmtB = (n) => {
  if (!n) return 'KES 0';
  if (n >= 1e9) return 'KES ' + (n/1e9).toFixed(2) + ' B';
  if (n >= 1e6) return 'KES ' + (n/1e6).toFixed(1) + ' M';
  return 'KES ' + Number(n).toLocaleString();
};
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;
const daysBetween = (a, b) => {
  if (!a || !b) return 0;
  return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
};

// Health grade calculator
function getHealthGrade(score) {
  if (score >= 85) return { grade: 'A', label: 'Excellent', color: '#10b981' };
  if (score >= 70) return { grade: 'B', label: 'Good', color: '#16a34a' };
  if (score >= 55) return { grade: 'C', label: 'Fair', color: '#f59e0b' };
  if (score >= 40) return { grade: 'D', label: 'At Risk', color: '#f97316' };
  return { grade: 'F', label: 'Critical', color: '#ef4444' };
}

// Score ring component
function ScoreRing({ value, max = 100, size = 72, stroke = 6, color, label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const progress = max > 0 ? (value / max) * circ : 0;
  const autoColor = color || (value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444');
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.3} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={autoColor} strokeWidth={stroke}
            strokeDasharray={`${progress} ${circ - progress}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <div style={{ fontSize: size * 0.22, fontWeight: 800, color: autoColor }}>{value}</div>
          {max !== 100 && <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>/{max}</div>}
        </div>
      </div>
      {label && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{label}</div>}
      {sublabel && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sublabel}</div>}
    </div>
  );
}

// KPI Card
function KPICard({ title, value, subtitle, icon, trend, trendLabel, color, onClick, borderColor }) {
  const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#6b7280';
  return (
    <div className="card" onClick={onClick}
      style={{ padding: '16px 18px', cursor: onClick ? 'pointer' : 'default', borderTop: `3px solid ${borderColor || '#e87b35'}`,
        transition: 'transform 0.15s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = '')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)', marginTop: 4 }}>{value}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {icon && <div style={{ fontSize: 28, opacity: 0.15, position: 'absolute', right: 14, top: 14 }}>{icon}</div>}
      </div>
      {trend != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: trendColor, fontWeight: 700 }}>{trend > 0 ? '▲' : trend < 0 ? '▼' : '●'} {Math.abs(trend)}%</span>
          {trendLabel && <span style={{ color: 'var(--text-muted)' }}>{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}

// Progress bar with label
function ProgressRow({ label, value, max = 100, color = '#e87b35' }) {
  const p = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{p.toFixed(0)}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3, transition: 'width 1s ease' }} />
      </div>
    </div>
  );
}

// Status badge
function StatusBadge({ status, size = 'sm' }) {
  const colors = {
    'On Track': '#10b981', 'Behind': '#f59e0b', 'Critical': '#ef4444', 'Ahead': '#2563eb',
    'Active': '#10b981', 'Completed': '#6b7280', 'Suspended': '#ef4444',
  };
  const c = colors[status] || '#6b7280';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999,
      fontSize: size === 'sm' ? 10 : 12, fontWeight: 700, background: c + '18', color: c, border: `1px solid ${c}40` }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {status}
    </span>
  );
}

export default function Dashboard({ profile, navigateTo, activeEmergencies = [] }) {
  const [stats, setStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [boqData, setBoqData] = useState([]);
  const [worksData, setWorksData] = useState([]);
  const [equipData, setEquipData] = useState([]);
  const [issueData, setIssueData] = useState([]);
  const [testData, setTestData] = useState([]);
  const [layerData, setLayerData] = useState([]);
  const [structData, setStructData] = useState([]);
  const [ipcData, setIpcData] = useState([]);
  const [approvalData, setApprovalData] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const isPlatformAdmin = profile.is_platform_admin === true;

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    const [projRes, repRes, boqRes, worksRes, eqRes, strRes, issRes, layerRes, testRes, ipcRes, aqRes] = await Promise.all([
      supabase.from('projects').select('*').order('name'),
      supabase.from('daily_reports').select('id, report_date, project_id, submitted_by, work_done, urgent_flag, projects(name)').order('report_date', { ascending: false }).limit(10),
      supabase.from('boq_items').select('project_id, boq_amount, value_to_date, completed_quantity, boq_quantity'),
      supabase.from('works_activities').select('project_id, activity_name, status, completed_quantity, planned_quantity'),
      supabase.from('equipment_register').select('project_id, required_quantity, actual_on_site, is_key_equipment'),
      supabase.from('structures').select('project_id, structure_type, overall_status, percent_complete'),
      supabase.from('site_issues').select('project_id, status, severity'),
      supabase.from('pavement_layers').select('project_id, layer_type, layer_status'),
      supabase.from('quality_tests').select('project_id, result_status'),
      supabase.from('ipc_certificates').select('project_id, ipc_no, certified_amount, paid_amount').order('ipc_no'),
      supabase.from('approval_queue').select('id, status, priority, current_approver_role').eq('status', 'pending'),
    ]);

    const projs = projRes.data || [];
    const boq = boqRes.data || [];
    const works = worksRes.data || [];
    const eq = eqRes.data || [];
    const str = strRes.data || [];
    const iss = issRes.data || [];
    const layers = layerRes.data || [];
    const tests = testRes.data || [];
    const ipcs = ipcRes.data || [];
    const approvals = aqRes.data || [];

    setProjects(projs);
    setRecentReports(repRes.data || []);
    setBoqData(boq);
    setWorksData(works);
    setEquipData(eq);
    setIssueData(iss);
    setTestData(tests);
    setLayerData(layers);
    setStructData(str);
    setIpcData(ipcs);
    setApprovalData(approvals);

    // Compute portfolio stats
    const totalContract = boq.reduce((s, i) => s + (i.boq_amount || 0), 0);
    const totalValueDone = boq.reduce((s, i) => s + (i.value_to_date || 0), 0);
    const totalActivities = works.length;
    const completedActivities = works.filter(w => w.status === 'Completed' || w.status === 'Approved').length;
    const totalEquipReq = eq.reduce((s, e) => s + (e.required_quantity || 0), 0);
    const totalEquipOnSite = eq.reduce((s, e) => s + (e.actual_on_site || 0), 0);
    const openIssues = iss.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
    const criticalIssues = iss.filter(i => (i.status === 'Open' || i.status === 'In Progress') && i.severity === 'Critical').length;
    const testsTotal = tests.length;
    const testsPassed = tests.filter(t => t.result_status === 'Pass').length;
    const totalCertified = ipcs.reduce((s, i) => s + (i.certified_amount || 0), 0);
    const totalPaid = ipcs.reduce((s, i) => s + (i.paid_amount || 0), 0);
    const physicalProgress = pct(completedActivities, totalActivities);
    const financialProgress = pct(totalValueDone, totalContract);
    const qualityScore = pct(testsPassed, testsTotal) || 0;
    const equipUtil = pct(totalEquipOnSite, totalEquipReq);

    // Project health = weighted average
    const healthScore = Math.round(
      (physicalProgress * 0.3) + (financialProgress * 0.25) + (qualityScore * 0.25) +
      (equipUtil * 0.1) + ((100 - Math.min(openIssues * 5, 100)) * 0.1)
    );

    // Time performance across all projects
    let avgTimePct = 0;
    let projCount = 0;
    projs.forEach(p => {
      if (p.start_date && p.end_date) {
        const total = daysBetween(p.start_date, p.end_date);
        const elapsed = daysBetween(p.start_date, new Date().toISOString().slice(0, 10));
        if (total > 0) { avgTimePct += pct(elapsed, total); projCount++; }
      }
    });
    const timePerformance = projCount > 0 ? Math.round(avgTimePct / projCount) : 0;
    const variance = physicalProgress - timePerformance;

    setStats({
      totalProjects: projs.length, totalContract, totalValueDone,
      totalActivities, completedActivities, totalEquipReq, totalEquipOnSite,
      openIssues, criticalIssues, testsTotal, testsPassed, totalCertified, totalPaid,
      physicalProgress, financialProgress, qualityScore, equipUtil,
      healthScore, timePerformance, variance, pendingApprovals: approvals.length,
    });
    setLoading(false);
  }

  async function loadProjectDetail(projectId) {
    setSelectedProjectId(projectId);
    setProjectDetail(true);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading dashboard...</div>;

  // Contractor's QS gets a limited view — just their assigned projects + link to Taking Off Sheet
  if (profile?.role === 'contractor_qs') {
    return (
      <div className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏗️</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Contractor Portal</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Submit your measurements for assigned projects</p>
        </div>

        {projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>No projects assigned yet. Contact your Resident Engineer for project access.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {projects.map(p => (
              <div key={p.id} onClick={() => navigateTo('taking-off')}
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, cursor: 'pointer',
                  transition: 'all 0.3s', position: 'relative', overflow: 'hidden' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px #e87b3520'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #e87b35, #f59e0b)' }} />
                <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {p.road_name || ''} {p.county ? `· ${p.county}` : ''} {p.contract_no ? `· ${p.contract_no}` : ''}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#e87b3520', color: '#e87b35' }}>📐 Open Taking Off Sheet →</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, padding: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          🔒 Your access is limited to measurement submissions only. Rates, payment certificates, and other contract data are restricted.
        </div>
      </div>
    );
  }

  if (selectedProjectId && projectDetail) {
    return <ProjectDashboard projectId={selectedProjectId} onBack={() => { setSelectedProjectId(null); setProjectDetail(null); }} profile={profile} navigateTo={navigateTo} />;
  }

  const health = getHealthGrade(stats.healthScore);
  const scheduleStatus = stats.variance >= 0 ? 'On Track' : stats.variance > -10 ? 'Behind' : 'Critical';

  // Works by activity for progress bars
  const worksByActivity = {};
  worksData.forEach(w => {
    const name = w.activity_name || 'Other';
    if (!worksByActivity[name]) worksByActivity[name] = { planned: 0, completed: 0 };
    worksByActivity[name].planned += w.planned_quantity || 0;
    worksByActivity[name].completed += w.completed_quantity || 0;
  });
  const activityProgress = Object.entries(worksByActivity)
    .map(([name, d]) => ({ name: name.length > 25 ? name.slice(0, 25) + '...' : name, pct: pct(d.completed, d.planned) }))
    .sort((a, b) => b.pct - a.pct).slice(0, 10);

  // Works status distribution
  const statusCounts = {};
  worksData.forEach(w => { statusCounts[w.status || 'Unknown'] = (statusCounts[w.status || 'Unknown'] || 0) + 1; });
  const worksSummary = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // Issue severity distribution
  const sevCounts = {};
  issueData.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').forEach(i => {
    sevCounts[i.severity || 'Unknown'] = (sevCounts[i.severity || 'Unknown'] || 0) + 1;
  });
  const issueSeverity = Object.entries(sevCounts).map(([name, value]) => ({ name, value }));

  // Project financial comparison
  const projFinancial = projects.map(p => {
    const projBoq = boqData.filter(b => b.project_id === p.id);
    const cv = projBoq.reduce((s, i) => s + (i.boq_amount || 0), 0);
    const vd = projBoq.reduce((s, i) => s + (i.value_to_date || 0), 0);
    return { name: p.name?.length > 18 ? p.name.substring(0, 18) + '...' : p.name, contractSum: cv, valueDone: vd };
  }).filter(p => p.contractSum > 0);

  // S-Curve data (monthly placeholder — enhance with real monthly data later)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const currentMonth = new Date().getMonth();
  const sCurveData = months.slice(0, currentMonth + 1).map((m, i) => {
    const planned = Math.round((i + 1) / 12 * 100);
    const actual = Math.round(stats.physicalProgress * ((i + 1) / (currentMonth + 1)));
    return { month: m, planned, actual };
  });

  // Early warnings
  const warnings = [];
  if (stats.variance < -10) warnings.push({ type: 'critical', msg: 'Physical progress significantly behind schedule' });
  if (stats.criticalIssues > 0) warnings.push({ type: 'critical', msg: `${stats.criticalIssues} critical issue${stats.criticalIssues > 1 ? 's' : ''} unresolved` });
  if (stats.equipUtil < 70 && stats.totalEquipReq > 0) warnings.push({ type: 'warning', msg: `Equipment utilization at ${stats.equipUtil}% — below target` });
  if (stats.qualityScore < 80 && stats.testsTotal > 0) warnings.push({ type: 'warning', msg: `Quality pass rate at ${stats.qualityScore}% — needs attention` });
  if (stats.pendingApprovals > 5) warnings.push({ type: 'info', msg: `${stats.pendingApprovals} items pending approval` });
  if (stats.financialProgress > stats.physicalProgress + 15) warnings.push({ type: 'warning', msg: 'Financial progress ahead of physical — possible overpayment risk' });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>
            {isPlatformAdmin ? '🔒 Platform' : ''} Dashboard
          </h2>
          <div className="subtitle">Welcome back, {profile.full_name} · {isPlatformAdmin ? 'Platform Admin' : ROLE_LABELS[profile.role]}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {stats.pendingApprovals > 0 && (
            <button className="btn btn-sm" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}
              onClick={() => navigateTo('approvals')}>
              ⏳ {stats.pendingApprovals} Pending Approval{stats.pendingApprovals > 1 ? 's' : ''}
            </button>
          )}
          <span className="text-sm text-muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Emergency Alerts */}
      {activeEmergencies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {activeEmergencies.map(em => (
            <div key={em.id} className="dashboard-emergency-card" onClick={() => navigateTo('emergency')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28, animation: em.status === 'Reported' ? 'emergencyPulse 0.8s ease-in-out infinite' : 'none' }}>🚨</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{em.emergency_type}</div>
                  <div style={{ fontSize: 13, opacity: 0.9 }}>{em.projects?.name}{em.chainage ? ` — Ch. ${em.chainage}` : ''}</div>
                </div>
                <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: 4 }}>{em.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════ TOP KPI ROW ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KPICard title="Active Projects" value={stats.totalProjects} icon="📊"
          borderColor="#e87b35" onClick={() => navigateTo('projects')} />
        <KPICard title="Physical Progress" value={`${stats.physicalProgress}%`}
          trend={stats.variance} trendLabel="vs schedule" icon="📈"
          borderColor={stats.variance >= 0 ? '#10b981' : '#ef4444'}
          color={stats.variance >= 0 ? '#10b981' : '#ef4444'} />
        <KPICard title="Financial Progress" value={`${stats.financialProgress}%`}
          subtitle={`${fmtB(stats.totalValueDone)} of ${fmtB(stats.totalContract)}`}
          icon="💰" borderColor="#2563eb" />
        <KPICard title="Time Elapsed" value={`${stats.timePerformance}%`}
          subtitle={scheduleStatus} icon="⏱"
          borderColor={scheduleStatus === 'On Track' ? '#10b981' : '#f59e0b'}
          color={scheduleStatus === 'On Track' ? '#10b981' : scheduleStatus === 'Behind' ? '#f59e0b' : '#ef4444'} />
        <KPICard title="Open Issues" value={stats.openIssues}
          subtitle={stats.criticalIssues > 0 ? `${stats.criticalIssues} critical` : 'All manageable'}
          icon="⚠" borderColor={stats.openIssues > 0 ? '#ef4444' : '#10b981'}
          color={stats.criticalIssues > 0 ? '#ef4444' : stats.openIssues > 0 ? '#f59e0b' : '#10b981'}
          onClick={() => navigateTo('issues')} />
      </div>

      {/* ══════ SCORES ROW ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <ScoreRing value={stats.healthScore} size={80} color={health.color} />
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: health.color }}>{health.grade}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Project Health</div>
          <StatusBadge status={health.label} />
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <ScoreRing value={stats.qualityScore} size={80} />
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Quality Score</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stats.testsPassed}/{stats.testsTotal} tests passed</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <ScoreRing value={stats.equipUtil} size={80} />
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>Equipment Util.</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{stats.totalEquipOnSite}/{stats.totalEquipReq} on site</div>
        </div>
        <div className="card" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#2563eb' }}>{fmtB(stats.totalCertified)}</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Certified</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtB(stats.totalPaid)} paid</div>
        </div>
      </div>

      {/* ══════ EARLY WARNING ══════ */}
      {warnings.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 20, borderLeft: '4px solid #f59e0b' }}>
          <h3 style={{ marginBottom: 10, fontSize: 14 }}>⚡ Early Warning System</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                padding: '6px 10px', borderRadius: 'var(--radius)',
                background: w.type === 'critical' ? '#fef2f2' : w.type === 'warning' ? '#fffbeb' : '#eff6ff' }}>
                <span>{w.type === 'critical' ? '🔴' : w.type === 'warning' ? '🟡' : '🔵'}</span>
                <span style={{ color: w.type === 'critical' ? '#dc2626' : w.type === 'warning' ? '#d97706' : '#2563eb' }}>{w.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════ CHARTS ROW 1: S-Curve + Activities ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 20 }}>
        {/* S-Curve */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Progress Curve (S-Curve)</h3>
            <StatusBadge status={scheduleStatus} />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={sCurveData} margin={{ left: 0, right: 10, top: 5 }}>
              <defs>
                <linearGradient id="gradPlanned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6b7280" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6b7280" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e87b35" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#e87b35" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} domain={[0, 100]} tickFormatter={v => v + '%'} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={v => v + '%'} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="planned" stroke="#6b7280" strokeWidth={2} fill="url(#gradPlanned)" name="Planned" dot={false} />
              <Area type="monotone" dataKey="actual" stroke="#e87b35" strokeWidth={2.5} fill="url(#gradActual)" name="Actual" dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, padding: '0 8px' }}>
            <span>Planned: <strong>{stats.timePerformance}%</strong></span>
            <span>Actual: <strong>{stats.physicalProgress}%</strong></span>
            <span style={{ color: stats.variance >= 0 ? '#10b981' : '#ef4444' }}>
              Variance: <strong>{stats.variance > 0 ? '+' : ''}{stats.variance}%</strong>
            </span>
          </div>
        </div>

        {/* Major Activities Progress */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Major Activities Progress</h3>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {activityProgress.length > 0 ? activityProgress.map((a, i) => (
              <ProgressRow key={i} label={a.name} value={a.pct}
                color={a.pct >= 80 ? '#10b981' : a.pct >= 40 ? '#e87b35' : '#ef4444'} />
            )) : (
              <div className="text-sm text-muted" style={{ textAlign: 'center', padding: 40 }}>No activities data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* ══════ CHARTS ROW 2: Financial + Works Status + Issues ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Financial Progress */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Financial Progress by Project</h3>
          {projFinancial.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={projFinancial} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => (v/1e6).toFixed(0) + 'M'} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="contractSum" fill="#4b5563" name="Contract Sum" radius={[3,3,0,0]} />
                <Bar dataKey="valueDone" fill="#e87b35" name="Value Done" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-muted" style={{ textAlign: 'center', padding: 60 }}>No financial data yet</div>}
        </div>

        {/* Works Status Pie */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Works Status</h3>
          {worksSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={worksSummary} cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value"
                  label={({ name, value }) => `${value}`} labelLine={false} style={{ fontSize: 10 }}>
                  {worksSummary.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-muted" style={{ textAlign: 'center', padding: 60 }}>No works data</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {worksSummary.map((w, i) => (
              <span key={w.name} style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                {w.name} ({w.value})
              </span>
            ))}
          </div>
        </div>

        {/* Issues / No Issues */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginBottom: 12 }}>Issues by Severity</h3>
          {issueSeverity.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={issueSeverity} cx="50%" cy="50%" outerRadius={65} innerRadius={30} dataKey="value" style={{ fontSize: 10 }}>
                    {issueSeverity.map((entry) => (
                      <Cell key={entry.name} fill={entry.name === 'Critical' ? '#dc2626' : entry.name === 'High' ? '#d97706' : entry.name === 'Medium' ? '#2563eb' : '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                {issueSeverity.map(s => (
                  <span key={s.name} style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2,
                      background: s.name === 'Critical' ? '#dc2626' : s.name === 'High' ? '#d97706' : s.name === 'Medium' ? '#2563eb' : '#6b7280' }} />
                    {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 180 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700 }}>No Open Issues</div>
              <div className="text-sm text-muted">All clear</div>
            </div>
          )}
        </div>
      </div>

      {/* ══════ PROJECT CARDS ══════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Projects — Click to explore</h3>
        <button className="btn btn-sm btn-secondary" onClick={() => navigateTo('projects')}>View All →</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {projects.map(p => {
          const projBoq = boqData.filter(b => b.project_id === p.id);
          const cv = projBoq.reduce((s, i) => s + (i.boq_amount || 0), 0);
          const vd = projBoq.reduce((s, i) => s + (i.value_to_date || 0), 0);
          const fp = pct(vd, cv);
          const projWorks = worksData.filter(w => w.project_id === p.id);
          const pp = pct(projWorks.filter(w => w.status === 'Completed' || w.status === 'Approved').length, projWorks.length);
          const projIssues = issueData.filter(i => i.project_id === p.id && (i.status === 'Open' || i.status === 'In Progress')).length;
          const projHealth = Math.round((pp * 0.4) + (fp * 0.35) + ((100 - Math.min(projIssues * 10, 100)) * 0.25));
          const h = getHealthGrade(projHealth);
          const elapsed = p.start_date && p.end_date ? pct(daysBetween(p.start_date, new Date().toISOString().slice(0,10)), daysBetween(p.start_date, p.end_date)) : 0;

          return (
            <div key={p.id} className="card" style={{ padding: 0, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s', overflow: 'hidden' }}
              onClick={() => loadProjectDetail(p.id)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
              {/* Color bar */}
              <div style={{ height: 4, background: `linear-gradient(90deg, ${h.color} ${pp}%, var(--border) ${pp}%)` }} />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{p.name}</div>
                    <div className="text-sm text-muted">{p.contractor_name || '—'} · {p.contract_no || ''}</div>
                  </div>
                  <div style={{ textAlign: 'center', marginLeft: 12 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: h.color }}>{h.grade}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{h.label}</div>
                  </div>
                </div>

                {/* Mini stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{pp}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Physical</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{fp}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Financial</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{elapsed}%</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Time</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: projIssues > 0 ? '#ef4444' : '#10b981' }}>{projIssues}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Issues</div>
                  </div>
                </div>

                {/* Progress bars */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                    <span className="text-muted">Physical</span><span style={{ fontWeight: 600 }}>{pp}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pp}%`, background: '#e87b35', borderRadius: 2 }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                    <span className="text-muted">Financial</span><span style={{ fontWeight: 600 }}>{fp}%</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${fp}%`, background: '#2563eb', borderRadius: 2 }} />
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span className="badge badge-muted" style={{ fontSize: 9 }}>{p.category || 'Construction'}</span>
                  <span className="text-sm text-muted">{p.region || ''}{p.county ? `, ${p.county}` : ''}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ══════ RECENT REPORTS ══════ */}
      {recentReports.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Recent Reports</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => navigateTo('reports')}>View All →</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Project</th><th>Description</th></tr></thead>
              <tbody>
                {recentReports.map(r => (
                  <tr key={r.id}>
                    <td className="text-mono" style={{ fontSize: 12 }}>{r.report_date}</td>
                    <td style={{ fontSize: 12 }}>{r.projects?.name}</td>
                    <td style={{ fontSize: 12, maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.urgent_flag && <span style={{ color: 'var(--danger)', marginRight: 4 }}>🚨</span>}
                      {r.work_done}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
