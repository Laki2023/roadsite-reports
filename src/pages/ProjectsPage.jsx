import { useState, useEffect } from 'react';
import { getProjects } from '../lib/supabase';

export default function ProjectsPage({ profile }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProjects().then(({ data }) => {
      if (data) setProjects(data);
      setLoading(false);
    });
  }, []);

  const statusColor = (p) => {
    if (p.progress_pct >= 70) return 'prog-green';
    if (p.progress_pct >= 40) return 'prog-orange';
    return 'prog-red';
  };

  const statusBadge = (s) => {
    const map = { active: 'badge-on-track', completed: 'badge-reviewed', suspended: 'badge-attention' };
    return <span className={`badge ${map[s] || 'badge-pending'}`}>{s}</span>;
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading projects…</div>;

  return (
    <div>
      <div className="page-header">
        <div><h1>Projects</h1><p>{projects.length} active road projects</p></div>
      </div>

      {projects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗺</div>
          <p style={{ color: 'var(--gray-500)' }}>No projects yet. An administrator can add projects from the Admin Panel.</p>
        </div>
      ) : projects.map(p => (
        <div key={p.id} className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <h3 style={{ fontSize: 15, color: 'var(--asphalt)' }}>{p.name}</h3>
              {p.contract_number && (
                <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>Contract: {p.contract_number}</p>
              )}
              {p.profiles?.full_name && (
                <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>RE: {p.profiles.full_name}</p>
              )}
            </div>
            {statusBadge(p.status)}
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>Overall progress</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--asphalt)' }}>{p.progress_pct}%</span>
            </div>
            <div className="prog-bar">
              <div className={`prog-fill ${statusColor(p)}`} style={{ width: `${p.progress_pct}%` }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
            {p.start_date && (
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                Start: {new Date(p.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            {p.end_date && (
              <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                End: {new Date(p.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
