import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

export default function Dashboard({ profile, navigateTo }) {
  const [stats, setStats] = useState({
    projects: 0, activeProjects: 0, reports: 0, reportsToday: 0,
    urgentReports: 0, openIssues: 0, testsPending: 0, testsFailed: 0,
    layersInProgress: 0, staffCount: 0,
  });
  const [recentReports, setRecentReports] = useState([]);
  const [recentIssues, setRecentIssues] = useState([]);
  const [projectBreakdown, setProjectBreakdown] = useState([]);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    const today = new Date().toISOString().split('T')[0];

    const [projRes, repRes, repTodayRes, urgentRes, issueRes, testPendRes, testFailRes, layerRes, staffRes] = await Promise.all([
      supabase.from('projects').select('id, name, status, category, current_phase', { count: 'exact' }),
      supabase.from('daily_reports').select('id', { count: 'exact' }),
      supabase.from('daily_reports').select('id', { count: 'exact' }).eq('report_date', today),
      supabase.from('daily_reports').select('id', { count: 'exact' }).eq('urgent_flag', true).eq('urgent_resolved', false),
      supabase.from('site_issues').select('id, title, severity, project_id, status', { count: 'exact' }).eq('status', 'Open'),
      supabase.from('quality_tests').select('id', { count: 'exact' }).eq('result_status', 'Pending'),
      supabase.from('quality_tests').select('id', { count: 'exact' }).eq('result_status', 'Fail'),
      supabase.from('pavement_layers').select('id', { count: 'exact' }).eq('layer_status', 'Laying In Progress'),
      supabase.from('profiles').select('id', { count: 'exact' }).neq('role', 'pending'),
    ]);

    const activeCount = projRes.data?.filter(p => p.status === 'active' || p.current_phase === 'Construction').length || 0;

    setStats({
      projects: projRes.count || 0,
      activeProjects: activeCount,
      reports: repRes.count || 0,
      reportsToday: repTodayRes.count || 0,
      urgentReports: urgentRes.count || 0,
      openIssues: issueRes.count || 0,
      testsPending: testPendRes.count || 0,
      testsFailed: testFailRes.count || 0,
      layersInProgress: layerRes.count || 0,
      staffCount: staffRes.count || 0,
    });

    // Category breakdown
    if (projRes.data) {
      const cats = {};
      projRes.data.forEach(p => {
        const c = p.category || 'Construction';
        cats[c] = (cats[c] || 0) + 1;
      });
      setProjectBreakdown(Object.entries(cats));
    }

    setRecentIssues((issueRes.data || []).slice(0, 5));

    // Recent reports
    const { data: rr } = await supabase.from('daily_reports')
      .select('id, report_date, project_id, weather, progress_pct, urgent_flag, projects(name)')
      .order('created_at', { ascending: false }).limit(6);
    setRecentReports(rr || []);
  }

  const sevColor = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'muted' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <div className="subtitle">Welcome back, {profile.full_name.split(' ')[0]}</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigateTo('projects')}>
          <div className="stat-label">Active Projects</div>
          <div className="stat-value text-accent">{stats.activeProjects}</div>
          <div className="stat-sub">{stats.projects} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Reports Today</div>
          <div className="stat-value">{stats.reportsToday}</div>
          <div className="stat-sub">{stats.reports} total reports</div>
        </div>
        {stats.urgentReports > 0 && (
          <div className="stat-card" style={{ borderColor: 'var(--danger)' }}>
            <div className="stat-label">Urgent Alerts</div>
            <div className="stat-value text-danger">{stats.urgentReports}</div>
            <div className="stat-sub">Require engineer attention</div>
          </div>
        )}
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigateTo('issues')}>
          <div className="stat-label">Open Issues</div>
          <div className="stat-value" style={{ color: stats.openIssues > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {stats.openIssues}
          </div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigateTo('quality')}>
          <div className="stat-label">Tests Pending</div>
          <div className="stat-value">{stats.testsPending}</div>
          <div className="stat-sub">{stats.testsFailed > 0 && <span className="text-danger">{stats.testsFailed} failed</span>}</div>
        </div>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigateTo('pavement')}>
          <div className="stat-label">Layers In Progress</div>
          <div className="stat-value text-accent">{stats.layersInProgress}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent Reports */}
        <div className="card">
          <div className="card-header">
            <h3>Recent Reports</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => navigateTo('reports')}>View all</button>
          </div>
          {recentReports.length === 0 ? (
            <div className="empty-state"><p>No reports yet</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Project</th><th>Weather</th><th>Progress</th><th></th></tr>
                </thead>
                <tbody>
                  {recentReports.map(r => (
                    <tr key={r.id}>
                      <td className="text-mono text-sm">{r.report_date}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.projects?.name || '—'}
                      </td>
                      <td>{r.weather}</td>
                      <td>
                        <div className="flex gap-8" style={{ alignItems: 'center' }}>
                          <div className="progress-bar" style={{ width: 60 }}>
                            <div className={`fill ${r.progress_pct >= 80 ? 'green' : r.progress_pct >= 40 ? 'orange' : 'red'}`}
                              style={{ width: `${r.progress_pct}%` }} />
                          </div>
                          <span className="text-mono text-sm">{r.progress_pct}%</span>
                        </div>
                      </td>
                      <td>{r.urgent_flag && <span className="badge badge-danger">Urgent</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Open Issues */}
        <div className="card">
          <div className="card-header">
            <h3>Open Issues</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => navigateTo('issues')}>View all</button>
          </div>
          {recentIssues.length === 0 ? (
            <div className="empty-state"><p>No open issues — looking good</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentIssues.map(iss => (
                <div key={iss.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)'
                }}>
                  <span className={`badge badge-${sevColor[iss.severity] || 'muted'}`}>{iss.severity}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{iss.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Project Category Breakdown */}
      {projectBreakdown.length > 0 && (
        <div className="card mt-24">
          <div className="card-header"><h3>Projects by Category</h3></div>
          <div style={{ display: 'flex', gap: 24 }}>
            {projectBreakdown.map(([cat, count]) => (
              <div key={cat} style={{ textAlign: 'center' }}>
                <div className="text-mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{count}</div>
                <div className="text-sm text-muted">{cat}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
