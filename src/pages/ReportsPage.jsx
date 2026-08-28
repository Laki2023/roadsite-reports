import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ReportsPage({ profile, showToast, selectedProject: propProject }) {
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [filterProject, setFilterProject] = useState(propProject?.id || 'all');
  const [filterDate, setFilterDate] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function handleDeleteReport(reportId, e) {
    e.stopPropagation();
    if (!window.confirm('Delete this report and all linked data? This cannot be undone.')) return;
    setDeleting(reportId);
    try {
      // Delete child records first (some may not exist — ignore errors)
      await supabase.from('works_progress').delete().eq('daily_report_id', reportId);
      await supabase.from('daily_labour').delete().eq('daily_report_id', reportId);
      // Delete the report itself (cascades to other FK-linked tables)
      const { error } = await supabase.from('daily_reports').delete().eq('id', reportId);
      if (error) throw error;
      showToast('Report deleted');
      setExpanded(null);
      load();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => { load(); }, []);

  async function load() {
    const [repRes, projRes] = await Promise.all([
      supabase.from('daily_reports')
        .select('*, projects(name, category), profiles:submitted_by(full_name)')
        .order('report_date', { ascending: false }).limit(100),
      supabase.from('projects').select('id, name'),
    ]);
    const reportsData = repRes.data || [];

    // Fetch linked works_progress entries for each report
    const reportIds = reportsData.map(r => r.id).filter(Boolean);
    let progressMap = {};
    if (reportIds.length > 0) {
      const { data: progressData } = await supabase.from('works_progress')
        .select('id, daily_report_id, activity_id, quantity, start_chainage, end_chainage, notes')
        .in('daily_report_id', reportIds);
      if (progressData) {
        progressData.forEach(p => {
          if (!progressMap[p.daily_report_id]) progressMap[p.daily_report_id] = [];
          progressMap[p.daily_report_id].push(p);
        });
      }
    }

    // Attach linked activities to each report
    const enriched = reportsData.map(r => ({
      ...r,
      linkedActivities: progressMap[r.id] || [],
    }));

    setReports(enriched);
    setProjects(projRes.data || []);
  }

  const filtered = reports.filter(r => {
    if (filterProject !== 'all' && r.project_id !== filterProject) return false;
    if (filterDate && r.report_date !== filterDate) return false;
    return true;
  });

  function exportCSV() {
    const headers = ['Date', 'Project', 'Weather', 'Work Done', 'Progress %', 'Labour', 'Activities', 'Challenges', 'Urgent'];
    const rows = filtered.map(r => [
      r.report_date, r.projects?.name, r.weather,
      `"${(r.work_done || '').replace(/"/g, '""')}"`,
      r.progress_pct || 0,
      (r.contractor_labour_skilled || 0) + (r.contractor_labour_unskilled || 0) + (r.subcontractor_labour || 0),
      r.linkedActivities?.length || 0,
      `"${(r.challenges || '').replace(/"/g, '""')}"`,
      (r.urgent_flag || r.is_urgent) ? 'YES' : '',
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
              <th>Labour</th><th>Activities</th><th>Progress</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const totalLabour = (r.contractor_labour_skilled || 0) + (r.contractor_labour_unskilled || 0) + (r.subcontractor_labour || 0);
              const actCount = r.linkedActivities?.length || 0;
              const totalQty = r.linkedActivities?.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0), 0) || 0;
              return (
                <React.Fragment key={r.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td className="text-mono text-sm">{r.report_date}</td>
                    <td>{r.projects?.name || '—'}</td>
                    <td className="text-sm">{r.profiles?.full_name || '—'}</td>
                    <td>{r.weather || '—'}</td>
                    <td className="text-mono">{totalLabour}</td>
                    <td>
                      {actCount > 0 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ background: '#6366f120', color: '#6366f1', padding: '2px 8px',
                            borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{actCount}</span>
                          {totalQty > 0 && (
                            <span className="text-muted text-sm" style={{ fontSize: 10 }}>
                              {totalQty.toFixed(2)} Km
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted">{'—'}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-8" style={{ alignItems: 'center' }}>
                        <div className="progress-bar" style={{ width: 50 }}>
                          <div className={`fill ${(r.progress_pct || 0) >= 80 ? 'green' : (r.progress_pct || 0) >= 40 ? 'orange' : 'red'}`}
                            style={{ width: `${r.progress_pct || 0}%` }} />
                        </div>
                        <span className="text-mono text-sm">{r.progress_pct || 0}%</span>
                      </div>
                    </td>
                    <td>{r.urgent_flag && <span className="badge badge-danger">Urgent</span>}</td>
                    <td className="text-muted text-sm">{expanded === r.id ? '▲' : '▼'}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td colSpan={9} style={{ background: 'var(--bg-surface)', padding: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 13 }}>
                          <div>
                            <strong className="text-muted">Work Done:</strong>
                            <p style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.work_done || '—'}</p>
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
                          {r.max_temp_c && <div><span className="text-muted">Temp:</span> {r.min_temp_c}{'°'}C {'–'} {r.max_temp_c}{'°'}C</div>}
                          {r.working_hours && <div><span className="text-muted">Working Hours:</span> {r.working_hours}h</div>}
                          {r.non_working_reason && <div><span className="text-muted">Non-working:</span> {r.non_working_reason}</div>}
                          {r.urgent_details && (
                            <div className="full-width" style={{ gridColumn: '1/-1' }}>
                              <strong className="text-danger">Urgent:</strong>
                              <p style={{ marginTop: 4 }}>{r.urgent_details}</p>
                            </div>
                          )}

                          {/* Delete Report Button */}
                          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm"
                              style={{ background: '#ef4444', color: '#fff', fontSize: 11, padding: '4px 12px' }}
                              onClick={(e) => handleDeleteReport(r.id, e)}
                              disabled={deleting === r.id}
                            >
                              {deleting === r.id ? 'Deleting...' : '🗑 Delete Report'}
                            </button>
                          </div>

                          {/* Linked Works Activities */}
                          {actCount > 0 && (
                            <div style={{ gridColumn: '1/-1', marginTop: 4 }}>
                              <strong className="text-muted" style={{ display: 'block', marginBottom: 8 }}>
                                Linked Activities ({actCount})
                              </strong>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: 4,
                                fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Activity</div>
                                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Chainage</div>
                                <div style={{ fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Quantity</div>
                                {r.linkedActivities.map(a => (
                                  <React.Fragment key={a.id}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {(a.notes || '').split(' — ')[0].split(' [')[0] || 'Activity'}
                                    </div>
                                    <div className="text-muted">
                                      {a.start_chainage != null ? `${(a.start_chainage/1000).toFixed(1)}+${String(Math.round(a.start_chainage%1000)).padStart(3,'0')}` : '—'}
                                    </div>
                                    <div style={{ fontWeight: 600 }}>
                                      {a.quantity ? Number(a.quantity).toFixed(3) : '—'} Km
                                    </div>
                                  </React.Fragment>
                                ))}
                                <div style={{ gridColumn: '1/-1', borderTop: '2px solid var(--border)', paddingTop: 6,
                                  display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 4 }}>
                                  <span>Total</span>
                                  <span style={{ color: '#10b981' }}>{totalQty.toFixed(3)} Km</span>
                                </div>
                              </div>
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
          <div className="icon">{'☰'}</div>
          <p>No reports match your filters</p>
        </div>
      )}
    </div>
  );
}
