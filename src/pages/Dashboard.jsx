import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import ProjectSummary from './ProjectSummary';

const COLORS = ['#e87b35','#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#6366f1'];
const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString() : '—';

export default function Dashboard({ profile, navigateTo, activeEmergencies = [] }) {
  const [stats, setStats] = useState({});
  const [projects, setProjects] = useState([]);
  const [recentReports, setRecentReports] = useState([]);
  const [boqSummary, setBoqSummary] = useState([]);
  const [worksSummary, setWorksSummary] = useState([]);
  const [equipmentStats, setEquipmentStats] = useState([]);
  const [structureStats, setStructureStats] = useState([]);
  const [issueStats, setIssueStats] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    const [projRes, repRes, boqRes, worksRes, eqRes, strRes, issRes, layerRes, testRes] = await Promise.all([
      supabase.from('projects').select('*').order('name'),
      supabase.from('daily_reports').select('id, report_date, project_id, user_id, work_description, urgent_flag, projects(name), profiles:user_id(full_name)').order('report_date', { ascending: false }).limit(10),
      supabase.from('boq_items').select('project_id, boq_amount, value_to_date, completed_quantity, boq_quantity'),
      supabase.from('works_activities').select('project_id, status, completed_quantity, planned_quantity'),
      supabase.from('equipment_register').select('project_id, required_quantity, actual_on_site, is_key_equipment'),
      supabase.from('structures').select('project_id, structure_type, overall_status, percent_complete'),
      supabase.from('site_issues').select('project_id, status, severity'),
      supabase.from('pavement_layers').select('project_id, layer_type, layer_status'),
      supabase.from('quality_tests').select('project_id, result_status'),
    ]);

    const projs = projRes.data || [];
    setProjects(projs);
    setRecentReports(repRes.data || []);

    // Aggregate stats
    const boqData = boqRes.data || [];
    const worksData = worksRes.data || [];
    const eqData = eqRes.data || [];
    const strData = strRes.data || [];
    const issData = issRes.data || [];
    const layerData = layerRes.data || [];
    const testData = testRes.data || [];

    const totalContractValue = boqData.reduce((s, i) => s + (i.boq_amount || 0), 0);
    const totalValueDone = boqData.reduce((s, i) => s + (i.value_to_date || 0), 0);
    const totalActivities = worksData.length;
    const completedActivities = worksData.filter(w => w.status === 'Completed' || w.status === 'Approved').length;
    const totalEquipReq = eqData.reduce((s, e) => s + (e.required_quantity || 0), 0);
    const totalEquipOnSite = eqData.reduce((s, e) => s + (e.actual_on_site || 0), 0);
    const totalStructures = strData.length;
    const completedStructures = strData.filter(s => s.overall_status === 'Completed' || s.overall_status === 'Approved').length;
    const openIssues = issData.filter(i => i.status === 'Open' || i.status === 'In Progress').length;
    const testsTotal = testData.length;
    const testsPassed = testData.filter(t => t.result_status === 'Pass').length;

    setStats({
      totalProjects: projs.length, totalContractValue, totalValueDone,
      totalActivities, completedActivities, totalEquipReq, totalEquipOnSite,
      totalStructures, completedStructures, openIssues, testsTotal, testsPassed,
      totalReports: (repRes.data || []).length,
    });

    // Project-level financial data for chart
    const projFinancial = projs.map(p => {
      const projBoq = boqData.filter(b => b.project_id === p.id);
      return {
        name: p.name?.length > 20 ? p.name.substring(0, 20) + '...' : p.name,
        contractSum: projBoq.reduce((s, i) => s + (i.boq_amount || 0), 0),
        valueDone: projBoq.reduce((s, i) => s + (i.value_to_date || 0), 0),
      };
    }).filter(p => p.contractSum > 0);
    setBoqSummary(projFinancial);

    // Works status distribution
    const statusCounts = {};
    worksData.forEach(w => { statusCounts[w.status] = (statusCounts[w.status] || 0) + 1; });
    setWorksSummary(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

    // Equipment compliance per project
    const eqByProject = {};
    eqData.forEach(e => {
      if (!eqByProject[e.project_id]) eqByProject[e.project_id] = { required: 0, onSite: 0 };
      eqByProject[e.project_id].required += e.required_quantity || 0;
      eqByProject[e.project_id].onSite += e.actual_on_site || 0;
    });
    setEquipmentStats(Object.entries(eqByProject).map(([pid, d]) => ({
      name: projs.find(p => p.id === pid)?.name?.substring(0, 15) || '?',
      required: d.required, onSite: d.onSite,
      compliance: d.required > 0 ? Math.round((d.onSite / d.required) * 100) : 0,
    })));

    // Structure types
    const typeCounts = {};
    strData.forEach(s => { typeCounts[s.structure_type] = (typeCounts[s.structure_type] || 0) + 1; });
    setStructureStats(Object.entries(typeCounts).map(([name, value]) => ({ name, value })));

    // Issue severity
    const sevCounts = {};
    issData.filter(i => i.status !== 'Closed' && i.status !== 'Resolved').forEach(i => { sevCounts[i.severity] = (sevCounts[i.severity] || 0) + 1; });
    setIssueStats(Object.entries(sevCounts).map(([name, value]) => ({ name, value })));

    setLoading(false);
  }

  async function loadProjectDetail(projectId) {
    setSelectedProjectId(projectId);
    const [proj, boq, works, equip, structs, issues, layers, tests, ipcs] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('boq_items').select('*, section:section_id(section_no, section_title)').eq('project_id', projectId),
      supabase.from('works_activities').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('equipment_register').select('*').eq('project_id', projectId),
      supabase.from('structures').select('*').eq('project_id', projectId),
      supabase.from('site_issues').select('*').eq('project_id', projectId),
      supabase.from('pavement_layers').select('*').eq('project_id', projectId),
      supabase.from('quality_tests').select('*').eq('project_id', projectId),
      supabase.from('ipc_certificates').select('*').eq('project_id', projectId).order('ipc_no'),
    ]);
    setProjectDetail({
      project: proj.data,
      boq: boq.data || [], works: works.data || [], equip: equip.data || [],
      structs: structs.data || [], issues: issues.data || [],
      layers: layers.data || [], tests: tests.data || [], ipcs: ipcs.data || [],
    });
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>Loading dashboard...</div>;

  // Project detail view - use Executive Summary
  if (selectedProjectId && projectDetail) {
    return <ProjectSummary projectId={selectedProjectId} onBack={() => { setSelectedProjectId(null); setProjectDetail(null); }} profile={profile} />;
  }

  // Main Dashboard
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <div className="subtitle">Welcome back, {profile.full_name}</div>
        </div>
      </div>

      {/* Emergency Alerts */}
      {activeEmergencies.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
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

      {/* Top KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="stat-card" style={{ cursor: 'pointer', borderTop: '3px solid #e87b35' }} onClick={() => navigateTo('projects')}>
          <div className="stat-label">Active Projects</div>
          <div className="stat-value text-accent">{stats.totalProjects}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid #2563eb' }}>
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{fmt(stats.totalContractValue)}</div>
          <div className="text-sm text-muted">{fmt(stats.totalValueDone)} done</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer', borderTop: '3px solid #16a34a' }} onClick={() => navigateTo('works')}>
          <div className="stat-label">Works Activities</div>
          <div className="stat-value">{stats.completedActivities}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/{stats.totalActivities}</span></div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer', borderTop: stats.openIssues > 0 ? '3px solid #dc2626' : '3px solid #16a34a' }} onClick={() => navigateTo('issues')}>
          <div className="stat-label">Open Issues</div>
          <div className="stat-value" style={{ color: stats.openIssues > 0 ? 'var(--danger)' : 'var(--success)' }}>{stats.openIssues}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Financial Progress */}
        {boqSummary.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Financial Progress by Project</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={boqSummary} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickFormatter={v => (v/1000000).toFixed(0) + 'M'} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={v => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="contractSum" fill="#4b5563" name="Contract Sum" radius={[2,2,0,0]} />
                <Bar dataKey="valueDone" fill="#e87b35" name="Value Done" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Works Status Pie */}
        {worksSummary.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Works Status</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={worksSummary} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} style={{ fontSize: 10 }}>
                  {worksSummary.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Issues by Severity */}
        {issueStats.length > 0 ? (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Issues by Severity</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={issueStats} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false} style={{ fontSize: 10 }}>
                  {issueStats.map((entry, i) => <Cell key={i} fill={entry.name === 'Critical' ? '#dc2626' : entry.name === 'High' ? '#d97706' : entry.name === 'Medium' ? '#2563eb' : '#6b7280'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <h3>No Open Issues</h3>
            <div className="text-sm text-muted">All clear</div>
          </div>
        )}
      </div>

      {/* Project Cards */}
      <h3 style={{ marginBottom: 12 }}>Projects — Click to explore</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
        {projects.map(p => {
          const projBoq = boqSummary.find(b => b.name?.startsWith(p.name?.substring(0, 20)));
          const pct = projBoq && projBoq.contractSum > 0 ? (projBoq.valueDone / projBoq.contractSum) * 100 : 0;
          return (
            <div key={p.id} className="card" style={{ padding: 16, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onClick={() => loadProjectDetail(p.id)}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                  <div className="text-sm text-muted">{p.contractor_name || '—'}</div>
                </div>
                <span className="badge badge-accent">{p.category}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{ position: 'relative', width: 56, height: 56 }}>
                  <svg viewBox="0 0 36 36" style={{ width: 56, height: 56, transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e87b35" strokeWidth="3"
                      strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                  </svg>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 11, fontWeight: 700 }}>{pct.toFixed(0)}%</div>
                </div>
                <div style={{ flex: 1, fontSize: 12 }}>
                  <div><span className="text-muted">Phase:</span> {p.current_phase}</div>
                  <div><span className="text-muted">Contract:</span> {p.contract_no || '—'}</div>
                  <div><span className="text-muted">Region:</span> {p.region || '—'}</div>
                </div>
              </div>
              <div className="progress-bar" style={{ height: 4 }}>
                <div className={`fill ${pct >= 80 ? 'green' : pct >= 40 ? 'orange' : 'red'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Reports */}
      {recentReports.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><h3>Recent Reports</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Project</th><th>By</th><th>Description</th><th></th></tr></thead>
              <tbody>
                {recentReports.map(r => (
                  <tr key={r.id}>
                    <td className="text-mono" style={{ fontSize: 12 }}>{r.report_date}</td>
                    <td style={{ fontSize: 12 }}>{r.projects?.name}</td>
                    <td className="text-sm">{r.profiles?.full_name}</td>
                    <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.urgent_flag && <span style={{ color: 'var(--danger)', marginRight: 4 }}>🚨</span>}
                      {r.work_description}
                    </td>
                    <td><button className="btn btn-sm btn-secondary" onClick={() => navigateTo('reports')}>View</button></td>
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
