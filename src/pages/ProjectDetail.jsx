import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function ProjectDetail({ selectedProject, navigateTo }) {
  const [project, setProject] = useState(selectedProject);
  const [elements, setElements] = useState([]);
  const [layers, setLayers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [recentTests, setRecentTests] = useState([]);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (!selectedProject?.id) return;
    loadProject();
  }, [selectedProject]);

  async function loadProject() {
    const pid = selectedProject.id;
    const [elRes, layRes, assignRes, testRes] = await Promise.all([
      supabase.from('construction_elements').select('*').eq('project_id', pid).order('sort_order'),
      supabase.from('pavement_layers').select('*').eq('project_id', pid).order('start_chainage'),
      supabase.from('staff_assignments').select('*, profiles(full_name, designation, role)').eq('project_id', pid).eq('is_active', true),
      supabase.from('quality_tests').select('*').eq('project_id', pid).order('created_at', { ascending: false }).limit(10),
    ]);
    setElements(elRes.data || []);
    setLayers(layRes.data || []);
    setAssignments(assignRes.data || []);
    setRecentTests(testRes.data || []);
  }

  if (!selectedProject) return (
    <div className="card empty-state">
      <p>Select a project from the Projects page</p>
      <button className="btn btn-primary mt-16" onClick={() => navigateTo('projects')}>Go to Projects</button>
    </div>
  );

  const p = project;
  const totalWeight = elements.reduce((s, e) => s + (e.weight_pct || 0), 0);
  const weightedProgress = elements.reduce((s, e) => {
    if (!e.planned_quantity || e.planned_quantity === 0) return s;
    const pct = Math.min(100, (e.completed_quantity / e.planned_quantity) * 100);
    return s + (pct * (e.weight_pct || 0)) / 100;
  }, 0);

  const layerColors = {
    'Subgrade': '#8B6914', 'Improved Subgrade': '#A0823B', 'Sub-base': '#C4956A',
    'Base': '#D4A574', 'Prime Coat': '#2a2a2a', 'Tack Coat': '#1a1a1a',
    'Binder Course': '#3d3d3d', 'Wearing Course': '#555555',
    'Surface Dressing': '#4a4a4a', 'Seal Coat': '#333333',
  };

  const statusBadge = (s) => {
    const m = { 'Approved': 'success', 'Laid': 'info', 'Laying In Progress': 'accent',
      'Tested': 'info', 'Rejected': 'danger', 'Rework': 'warning', 'Not Started': 'muted' };
    return <span className={`badge badge-${m[s] || 'muted'}`}>{s}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-sm btn-secondary mb-16" onClick={() => navigateTo('projects')}>
            ← Back to Projects
          </button>
          <h2>{p.name}</h2>
          <div className="subtitle">
            {p.contract_no && <span className="text-mono">{p.contract_no}</span>}
            {p.contractor_name && <span> · {p.contractor_name}</span>}
          </div>
        </div>
      </div>

      <div className="tabs">
        {['overview', 'elements', 'layers', 'team'].map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Category</div>
              <div className="stat-value text-accent" style={{ fontSize: 20 }}>{p.category || 'Construction'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Phase</div>
              <div className="stat-value" style={{ fontSize: 20 }}>{p.current_phase || '—'}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Weighted Progress</div>
              <div className="stat-value text-accent">{weightedProgress.toFixed(1)}%</div>
              <div className="progress-bar mt-16" style={{ height: 10 }}>
                <div className={`fill ${weightedProgress >= 75 ? 'green' : weightedProgress >= 40 ? 'orange' : 'red'}`}
                  style={{ width: `${weightedProgress}%` }} />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">FIDIC Edition</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{p.fidic_edition || '—'}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Contract Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13 }}>
                <div><span className="text-muted">Employer:</span> {p.employer}</div>
                <div><span className="text-muted">Road Class:</span> {p.road_class || '—'}</div>
                <div><span className="text-muted">Chainage:</span> <span className="text-mono">
                  {p.start_chainage != null ? `${p.start_chainage} — ${p.end_chainage} km` : '—'}
                </span></div>
                <div><span className="text-muted">Length:</span> <span className="text-mono">
                  {p.start_chainage != null && p.end_chainage != null
                    ? `${(p.end_chainage - p.start_chainage).toFixed(3)} km` : '—'}
                </span></div>
                <div><span className="text-muted">Contract Sum:</span> {p.contract_sum ? `KES ${Number(p.contract_sum).toLocaleString()}` : '—'}</div>
                <div><span className="text-muted">County:</span> {p.county || '—'}</div>
                <div><span className="text-muted">Commenced:</span> {p.commencement_date || '—'}</div>
                <div><span className="text-muted">Completion:</span> {p.original_completion_date || '—'}</div>
              </div>
            </div>

            <div className="card">
              <h3 style={{ marginBottom: 12 }}>Team ({assignments.length})</h3>
              {assignments.length === 0 ? (
                <p className="text-muted text-sm">No staff assigned yet</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {assignments.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span>{a.profiles?.full_name}</span>
                      <span className="badge badge-muted">{a.role_on_project}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'elements' && (
        <div className="card">
          <div className="card-header">
            <h3>Construction Elements (Weighted Progress)</h3>
            <span className="text-mono text-sm">Total weight: {totalWeight.toFixed(1)}%</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Element</th><th>Code</th><th>Weight</th><th>Planned</th><th>Completed</th><th>Progress</th></tr>
              </thead>
              <tbody>
                {elements.map(el => {
                  const pct = el.planned_quantity > 0 ? Math.min(100, (el.completed_quantity / el.planned_quantity) * 100) : 0;
                  return (
                    <tr key={el.id}>
                      <td style={{ fontWeight: 500 }}>{el.element_name}</td>
                      <td className="text-mono">{el.element_code}</td>
                      <td className="text-mono">{el.weight_pct}%</td>
                      <td className="text-mono">{el.planned_quantity} {el.unit}</td>
                      <td className="text-mono">{el.completed_quantity} {el.unit}</td>
                      <td>
                        <div className="flex gap-8" style={{ alignItems: 'center', minWidth: 120 }}>
                          <div className="progress-bar" style={{ flex: 1 }}>
                            <div className={`fill ${pct >= 80 ? 'green' : pct >= 40 ? 'orange' : 'red'}`}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-mono text-sm" style={{ minWidth: 40 }}>{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'layers' && (
        <div className="card">
          <div className="card-header">
            <h3>Pavement Layer Stack</h3>
            <button className="btn btn-sm btn-primary" onClick={() => navigateTo('pavement', selectedProject)}>
              Manage Layers
            </button>
          </div>
          {layers.length === 0 ? (
            <div className="empty-state"><p>No pavement layers recorded yet</p></div>
          ) : (
            <div className="layer-stack">
              {[...layers].reverse().map(l => (
                <div key={l.id} className="layer-bar" style={{
                  background: layerColors[l.layer_type] || '#555',
                  color: '#fff',
                  minHeight: Math.max(36, (l.design_thickness_mm || 30) * 0.8),
                }}>
                  <span className="layer-name">{l.layer_type} — {l.material_type || 'TBD'}</span>
                  <span className="layer-info">{l.design_thickness_mm}mm | Ch.{l.start_chainage}–{l.end_chainage}</span>
                  <span style={{ marginLeft: 8 }}>{statusBadge(l.layer_status)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'team' && (
        <div className="card">
          <div className="card-header">
            <h3>Project Staff</h3>
            <button className="btn btn-sm btn-primary" onClick={() => navigateTo('staff')}>Manage Staff</button>
          </div>
          {assignments.length === 0 ? (
            <div className="empty-state"><p>No team members assigned</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Designation</th><th>Project Role</th><th>System Role</th></tr></thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 500 }}>{a.profiles?.full_name}</td>
                      <td>{a.profiles?.designation || '—'}</td>
                      <td><span className="badge badge-accent">{a.role_on_project}</span></td>
                      <td className="text-sm text-muted">{a.profiles?.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
