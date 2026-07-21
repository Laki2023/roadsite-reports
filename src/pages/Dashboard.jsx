import { useState, useEffect } from 'react';
import { getReports, getProjects, updateReportStatus } from '../lib/supabase';

function Toast({ msg, type = 'success', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast ${type}`}>{msg}</div>;
}

export default function Dashboard({ currentUser, profile, onNavigate }) {
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'engineer';
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const filters = isAdmin ? { dateFrom: today } : { userId: currentUser.id, dateFrom: today };
    const [{ data: r }, { data: p }] = await Promise.all([
      getReports(filters),
      getProjects()
    ]);
    if (r) setReports(r);
    if (p) setProjects(p);
    setLoading(false);
  };

  const urgentReports = reports.filter(r => r.is_urgent && r.status !== 'actioned');
  const totalToday = reports.length;
  const onTrack = reports.filter(r => !r.is_urgent).length;

  const handleAcknowledge = async (reportId) => {
    const { error } = await updateReportStatus(reportId, {
      status: 'actioned',
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString()
    });
    if (!error) {
      setReports(rs => rs.map(r => r.id === reportId ? { ...r, status: 'actioned' } : r));
      setToast({ msg: 'Report acknowledged and marked as actioned.' });
    }
  };

  const statusBadge = (report) => {
    if (report.is_urgent) return <span className="badge badge-urgent">Urgent</span>;
    if (report.progress_pct >= 70) return <span className="badge badge-on-track">On track</span>;
    return <span className="badge badge-attention">Attention</span>;
  };

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading reports…</div>
  );

  if (selected) {
    const r = selected;
    return (
      <div>
        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)} style={{ marginBottom: 16 }}>
          ← Back to dashboard
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 18 }}>{r.projects?.name}</h2>
            <p style={{ color: 'var(--gray-500)', fontSize: 13, marginTop: 3 }}>
              RE: {r.profiles?.full_name} · Ch. {r.chainage} · {r.report_date}
            </p>
          </div>
          {statusBadge(r)}
        </div>

        {r.is_urgent && (
          <div className="alert-urgent" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#991B1B', fontSize: 13, marginBottom: 5 }}>
              ⚠ Urgent — engineer action required
            </div>
            <p style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6 }}>{r.urgent_description}</p>
            <p style={{ fontSize: 12, color: '#B91C1C', marginTop: 6 }}>Category: {r.urgent_category}</p>
            {isAdmin && r.status !== 'actioned' && (
              <button
                className="btn btn-danger btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => handleAcknowledge(r.id)}
              >
                Acknowledge & mark actioned
              </button>
            )}
          </div>
        )}

        {[
          ['Work carried out', r.work_done],
          ['Quality observations', r.observations],
          ['Challenges', r.challenges],
          ['Plan for tomorrow', r.tomorrow_plan],
        ].map(([label, val]) => val && (
          <div key={label} className="card card-sm" style={{ marginBottom: 10 }}>
            <p className="sec-label" style={{ marginTop: 0 }}>{label}</p>
            <p style={{ fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.7 }}>{val}</p>
          </div>
        ))}

        <div className="card card-sm">
          <p className="sec-label" style={{ marginTop: 0 }}>Site resources</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              ['👷', `${r.labour_count} workers`],
              ['🚜', r.equipment],
              ['🌤', r.weather],
              ['📊', `${r.progress_pct}% complete`],
            ].map(([icon, val]) => val && (
              <span key={val} style={{ background: 'var(--gray-100)', borderRadius: 999, padding: '4px 12px', fontSize: 12, color: 'var(--gray-700)' }}>
                {icon} {val}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        {profile?.role === 're' && (
          <button className="btn btn-yellow" onClick={() => onNavigate('submit')}>
            + Submit today's report
          </button>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="sc-val">{totalToday}</div>
          <div className="sc-label">Reports today</div>
        </div>
        <div className="stat-card">
          <div className="sc-val" style={{ color: 'var(--red)' }}>{urgentReports.length}</div>
          <div className="sc-label">Urgent issues</div>
        </div>
        <div className="stat-card">
          <div className="sc-val" style={{ color: 'var(--green)' }}>{onTrack}</div>
          <div className="sc-label">On schedule</div>
        </div>
        <div className="stat-card">
          <div className="sc-val">{projects.length}</div>
          <div className="sc-label">Active projects</div>
        </div>
      </div>

      {urgentReports.length > 0 && (
        <>
          <p className="sec-label">🚨 Urgent — action required</p>
          {urgentReports.map(r => (
            <div key={r.id} className="alert-urgent" style={{ cursor: 'pointer' }} onClick={() => setSelected(r)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#991B1B', fontSize: 13 }}>{r.projects?.name}</div>
                  <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 2 }}>RE: {r.profiles?.full_name} · Ch. {r.chainage} · {r.urgent_category}</div>
                </div>
                <span className="badge badge-urgent">Urgent</span>
              </div>
              <p style={{ fontSize: 13, color: '#7F1D1D', marginTop: 8, lineHeight: 1.6 }}>
                {r.urgent_description?.slice(0, 160)}{r.urgent_description?.length > 160 ? '…' : ''}
              </p>
              <div style={{ fontSize: 12, color: '#DC2626', marginTop: 6 }}>Submitted at {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Click to view & action</div>
            </div>
          ))}
        </>
      )}

      <p className="sec-label">Today's field reports</p>
      {reports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <p style={{ color: 'var(--gray-500)' }}>No reports submitted today yet.</p>
          {profile?.role === 're' && (
            <button className="btn btn-yellow" style={{ marginTop: 14 }} onClick={() => onNavigate('submit')}>
              Submit today's report
            </button>
          )}
        </div>
      ) : reports.map(r => (
        <div
          key={r.id}
          className={`report-card${r.is_urgent ? ' urgent' : ''}`}
          onClick={() => setSelected(r)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{r.projects?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>RE: {r.profiles?.full_name} · Ch. {r.chainage}</div>
            </div>
            {statusBadge(r)}
          </div>
          <p style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>
            {r.work_done?.slice(0, 120)}{r.work_done?.length > 120 ? '…' : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
              {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className={`badge ${r.status === 'actioned' ? 'badge-actioned' : r.status === 'reviewed' ? 'badge-reviewed' : 'badge-submitted'}`} style={{ marginLeft: 'auto', fontSize: 10 }}>
              {r.status}
            </span>
            {r.progress_pct != null && (
              <span className="badge badge-on-track" style={{ fontSize: 10 }}>{r.progress_pct}% complete</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
