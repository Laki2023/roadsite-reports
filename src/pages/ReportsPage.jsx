import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ReportsPage({ profile, showToast, selectedProject: propProject }) {
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState(propProject?.id || 'all');
  const [filterDate, setFilterDate] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [repRes, projRes] = await Promise.all([
      supabase.from('daily_reports')
        .select('*, projects(name, category), profiles:submitted_by(full_name), submitter:user_id(full_name)')
        .order('report_date', { ascending: false }).limit(100),
      supabase.from('projects').select('id, name'),
    ]);
    setReports(repRes.data || []);
    setProjects(projRes.data || []);
  }

  const filtered = reports.filter(r => {
    if (filterProject !== 'all' && r.project_id !== filterProject) return false;
    if (filterDate && r.report_date !== filterDate) return false;
    return true;
  });

  function exportCSV() {
    const headers = ['Date', 'Project', 'Weather', 'Work Done', 'Progress %', 'Labour', 'Challenges', 'Urgent'];
    const rows = filtered.map(r => [
      r.report_date, r.projects?.name, r.weather || r.weather_conditions,
      `"${(r.work_done || r.work_description || '').replace(/"/g, '""')}"`,
      r.progress_pct || r.progress_percentage || 0,
      (r.contractor_labour_skilled || 0) + (r.contractor_labour_unskilled || 0) + (r.subcontractor_labour || 0),
      `"${(r.challenges || '').replace(/"/g, '""')}"`,
      r.urgent_flag ? 'YES' : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `roadsite-reports-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('CSV exported');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Daily Reports</h2>
          <div className="subtitle">{filtered.length} reports</div>
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}>Export CSV</button>
      </div>

      <div className="filter-bar">
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="all">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        {filterDate && <button className="btn btn-sm btn-secondary" onClick={() => setFilterDate('')}>Clear</button>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Project</th><th>Submitted By</th><th>Weather</th>
              <th>Labour</th><th>Progress</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const totalLabour = (r.contractor_labour_skilled || 0) + (r.contractor_labour_unskilled || 0) + (r.subcontractor_labour || 0);
              return (
                <React.Fragment key={r.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="text-mono text-sm">{r.report_date}</td>
                    <td>{r.projects?.name || '—'}</td>
                    <td className="text-sm">{r.profiles?.full_name || r.submitter?.full_name || '—'}</td>
                    <td>{r.weather || r.weather_conditions || '—'}</td>
                    <td className="text-mono">{totalLabour}</td>
                    <td>
                      <div className="flex gap-8" style={{ alignItems: 'center' }}>
                        <div className="progress-bar" style={{ width: 50 }}>
                          <div className={`fill ${(r.progress_pct || r.progress_percentage || 0) >= 80 ? 'green' : (r.progress_pct || r.progress_percentage || 0) >= 40 ? 'orange' : 'red'}`}
                            style={{ width: `${r.progress_pct || r.progress_percentage || 0}%` }} />
                        </div>
                        <span className="text-mono text-sm">{r.progress_pct || r.progress_percentage || 0}%</span>
                      </div>
                    </td>
                    <td>{r.urgent_flag && <span className="badge badge-danger">Urgent</span>}</td>
                    <td className="text-muted text-sm">{expanded === r.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--bg-surface)', padding: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13 }}>
                          <div>
                            <strong className="text-muted">Work Done:</strong>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.work_done || r.work_description || '—'}</p>
                          </div>
                          <div>
                            <strong className="text-muted">Challenges:</strong>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.challenges || '—'}</p>
                          </div>
                          <div>
                            <strong className="text-muted">Quality Observations:</strong>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.quality_observations || '—'}</p>
                          </div>
                          <div>
                            <strong className="text-muted">Instructions Issued:</strong>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.instructions_issued || '—'}</p>
                          </div>
                          {r.rainfall_mm && <div><span className="text-muted">Rainfall:</span> {r.rainfall_mm}mm</div>}
                          {r.max_temp_c && <div><span className="text-muted">Temp:</span> {r.min_temp_c}°C – {r.max_temp_c}°C</div>}
                          {r.working_hours && <div><span className="text-muted">Working Hours:</span> {r.working_hours}h</div>}
                          {r.non_working_reason && <div><span className="text-muted">Non-working:</span> {r.non_working_reason}</div>}
                          {r.urgent_details && (
                            <div className="full-width" style={{ gridColumn: '1/-1' }}>
                              <strong className="text-danger">Urgent:</strong>
                              <p style={{ marginTop: 4 }}>{r.urgent_details}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="card empty-state mt-16">
          <div className="icon">☰</div>
          <p>No reports match your filters</p>
        </div>
      )}
    </div>
  );
}
