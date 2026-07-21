import { useState, useEffect } from 'react';
import { getReports, getMyReports, getProjects } from '../lib/supabase';
import jsPDF from 'jspdf';

const FIELDS = [
  { key: 'report_date', label: 'Date' },
  { key: 're_name', label: 'RE Name' },
  { key: 'project_name', label: 'Project' },
  { key: 'chainage', label: 'Chainage' },
  { key: 'status_label', label: 'Status' },
  { key: 'progress_pct', label: 'Progress %' },
  { key: 'work_done', label: 'Work Done' },
  { key: 'labour_count', label: 'Labour' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'weather', label: 'Weather' },
  { key: 'observations', label: 'Observations' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'is_urgent', label: 'Urgent Flag' },
  { key: 'urgent_description', label: 'Urgent Details' },
  { key: 'urgent_category', label: 'Urgent Category' },
  { key: 'tomorrow_plan', label: 'Plan for Tomorrow' },
];

function flattenReport(r) {
  return {
    report_date: r.report_date,
    re_name: r.profiles?.full_name || '',
    project_name: r.projects?.name || '',
    chainage: r.chainage || '',
    status_label: r.is_urgent ? 'URGENT' : r.status,
    progress_pct: r.progress_pct != null ? `${r.progress_pct}%` : '',
    work_done: r.work_done || '',
    labour_count: r.labour_count || '',
    equipment: r.equipment || '',
    weather: r.weather || '',
    observations: r.observations || '',
    challenges: r.challenges || '',
    is_urgent: r.is_urgent ? 'YES' : 'No',
    urgent_description: r.urgent_description || '',
    urgent_category: r.urgent_category || '',
    tomorrow_plan: r.tomorrow_plan || '',
  };
}

export default function ReportsPage({ currentUser, profile }) {
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list');
  const [filters, setFilters] = useState({ projectId: '', status: '', dateFrom: '', dateTo: '', urgent: '' });
  const [checkedFields, setCheckedFields] = useState(FIELDS.map(f => f.key));
  const [toast, setToast] = useState('');

  const isAdmin = profile?.role === 'admin' || profile?.role === 'engineer';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: r }, { data: p }] = await Promise.all([
      isAdmin ? getReports({}) : getMyReports(currentUser.id),
      getProjects()
    ]);
    if (r) setReports(r);
    if (p) setProjects(p);
    setLoading(false);
  };

  const filtered = reports.filter(r => {
    if (filters.projectId && r.project_id !== filters.projectId) return false;
    if (filters.status === 'urgent' && !r.is_urgent) return false;
    if (filters.status === 'on-track' && r.is_urgent) return false;
    if (filters.urgent === 'yes' && !r.is_urgent) return false;
    if (filters.dateFrom && r.report_date < filters.dateFrom) return false;
    if (filters.dateTo && r.report_date > filters.dateTo) return false;
    return true;
  });

  const toggleField = (key) => {
    setCheckedFields(f => f.includes(key) ? f.filter(k => k !== key) : [...f, key]);
  };

  const downloadCSV = () => {
    const rows = filtered.map(r => {
      const flat = flattenReport(r);
      return checkedFields.map(k => `"${String(flat[k] || '').replace(/"/g, '""')}"`).join(',');
    });
    const header = checkedFields.map(k => FIELDS.find(f => f.key === k)?.label || k).join(',');
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RoadSite_Reports_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast(`CSV downloaded — ${filtered.length} reports`);
    setTimeout(() => setToast(''), 3000);
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = margin;

    doc.setFillColor(28, 31, 38);
    doc.rect(0, 0, pw, 24, 'F');
    doc.setTextColor(245, 197, 24);
    doc.setFontSize(14); doc.setFont(undefined, 'bold');
    doc.text('RoadSite — Daily Field Reports', margin, 15);
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}   |   ${filtered.length} reports`, pw - margin, 15, { align: 'right' });
    y = 32;

    filtered.forEach((r, ri) => {
      if (ri > 0) {
        if (y > 260) { doc.addPage(); y = margin; }
        doc.setDrawColor(220, 220, 220); doc.line(margin, y, pw - margin, y); y += 6;
      }
      if (y > 250) { doc.addPage(); y = margin; }

      const color = r.is_urgent ? [153, 27, 27] : [22, 101, 52];
      doc.setFillColor(...color);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9); doc.setFont(undefined, 'bold');
      doc.roundedRect(margin, y - 4, pw - margin * 2, 10, 2, 2, 'F');
      doc.text(
        `${r.projects?.name || 'Unknown'}  |  RE: ${r.profiles?.full_name || ''}  |  ${r.is_urgent ? 'URGENT' : 'On track'}  |  ${r.progress_pct ?? '—'}% complete`,
        margin + 3, y + 2
      );
      y += 13;

      const flat = flattenReport(r);
      const skipKeys = ['re_name', 'project_name', 'status_label', 'progress_pct'];
      checkedFields.filter(k => !skipKeys.includes(k)).forEach(k => {
        const val = String(flat[k] || '').trim();
        if (!val || val === 'No') return;
        if (y > 270) { doc.addPage(); y = margin; }
        const label = FIELDS.find(f => f.key === k)?.label || k;
        doc.setFontSize(7.5); doc.setFont(undefined, 'bold'); doc.setTextColor(100, 100, 100);
        doc.text(label + ':', margin, y);
        doc.setFont(undefined, 'normal'); doc.setTextColor(30, 30, 30);
        const lines = doc.splitTextToSize(val, pw - margin * 2 - 36);
        doc.text(lines, margin + 36, y);
        y += Math.max(5, lines.length * 4.5);
      });
      y += 4;
    });

    for (let i = 1; i <= doc.internal.getNumberOfPages(); i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${doc.internal.getNumberOfPages()} — RoadSite Field Report System`, pw / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
    }

    doc.save(`RoadSite_Reports_${new Date().toISOString().split('T')[0]}.pdf`);
    setToast(`PDF downloaded — ${filtered.length} reports`);
    setTimeout(() => setToast(''), 3000);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading reports…</div>;

  return (
    <div>
      {toast && <div className="toast success">{toast}</div>}

      <div className="page-header">
        <div><h1>Reports</h1><p>{filtered.length} reports{isAdmin ? ' across all projects' : ' submitted by you'}</p></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['list', 'Report list'], ['export', 'Export data']].map(([key, label]) => (
          <button key={key} className={`btn ${tab === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Project</label>
            <select value={filters.projectId} onChange={e => setFilters(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All statuses</option>
              <option value="urgent">Urgent only</option>
              <option value="on-track">Non-urgent only</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From date</label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To date</label>
            <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>
        </div>
      </div>

      {tab === 'list' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {isAdmin && <th>RE</th>}
                  <th>Project</th>
                  <th>Chainage</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: 30 }}>No reports match your filters.</td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.report_date}</td>
                    {isAdmin && <td style={{ fontSize: 12 }}>{r.profiles?.full_name}</td>}
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.projects?.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--gray-500)' }}>{r.chainage}</td>
                    <td>
                      {r.is_urgent
                        ? <span className="badge badge-urgent">Urgent</span>
                        : <span className={`badge ${r.status === 'actioned' ? 'badge-actioned' : r.status === 'reviewed' ? 'badge-reviewed' : 'badge-submitted'}`}>{r.status}</span>
                      }
                    </td>
                    <td style={{ fontSize: 12 }}>{r.progress_pct != null ? `${r.progress_pct}%` : '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                      {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div>
          <div className="card">
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>Select fields to export</strong>
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 14 }}>{checkedFields.length} of {FIELDS.length} fields selected</p>
            <div className="field-checks">
              {FIELDS.map(f => (
                <label key={f.key} className="field-chk">
                  <input type="checkbox" checked={checkedFields.includes(f.key)} onChange={() => toggleField(f.key)} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div className="card card-sm" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--gray-600)' }}>
              Exporting <strong>{filtered.length}</strong> reports with <strong>{checkedFields.length}</strong> fields.
              Adjust filters above to narrow the selection.
            </p>
          </div>

          <div className="export-grid">
            <button className="export-btn-card exp-csv-card" onClick={downloadCSV}>
              <div className="eb-icon">📊</div>
              <strong>Download CSV</strong>
              <span>Excel / Google Sheets</span>
            </button>
            <button className="export-btn-card exp-pdf-card" onClick={downloadPDF}>
              <div className="eb-icon">📄</div>
              <strong>Download PDF</strong>
              <span>Print-ready report</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
