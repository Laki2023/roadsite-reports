import { useState, useEffect } from 'react';
import { getProjects, submitReport } from '../lib/supabase';

export default function SubmitReport({ currentUser, profile, onNavigate }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    project_id: '',
    report_date: new Date().toISOString().split('T')[0],
    chainage: '',
    work_done: '',
    labour_count: '',
    equipment: '',
    weather: '',
    progress_pct: '',
    observations: '',
    challenges: '',
    is_urgent: false,
    urgent_description: '',
    urgent_category: '',
    tomorrow_plan: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    getProjects().then(({ data }) => {
      if (data) setProjects(data);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.project_id) return setError('Please select a project.');
    if (!form.work_done.trim()) return setError('Please describe the work carried out today.');
    if (form.is_urgent && !form.urgent_description.trim()) return setError('Please describe the urgent issue requiring engineer action.');

    setSaving(true);
    const payload = {
      ...form,
      submitted_by: currentUser.id,
      labour_count: parseInt(form.labour_count) || 0,
      progress_pct: form.progress_pct ? parseInt(form.progress_pct) : null,
    };

    const { error: err } = await submitReport(payload);
    if (err) {
      setError(err.message || 'Failed to submit report. Please try again.');
      setSaving(false);
      return;
    }
    setDone(true);
    setSaving(false);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>Loading…</div>;

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Report submitted</h2>
        <p style={{ color: 'var(--gray-500)', fontSize: 14, marginBottom: 24 }}>
          {form.is_urgent
            ? 'Your urgent report has been flagged. The engineer will be notified immediately.'
            : 'Your daily report has been recorded successfully.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-yellow" onClick={() => { setDone(false); setForm(f => ({ ...f, work_done: '', challenges: '', observations: '', tomorrow_plan: '', urgent_description: '', is_urgent: false })); }}>
            Submit another
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('dashboard')}>Go to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Daily site report</h1>
          <p>RE: {profile?.full_name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <p className="sec-label" style={{ marginTop: 0 }}>Project & location</p>
          <div className="form-row">
            <div className="form-group">
              <label>Project *</label>
              <select value={form.project_id} onChange={e => set('project_id', e.target.value)} required>
                <option value="">Select project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.contract_number ? ` (${p.contract_number})` : ''}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Report date</label>
              <input type="date" value={form.report_date} onChange={e => set('report_date', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Chainage / location on site</label>
            <input type="text" placeholder="e.g. 14+200 to 14+600" value={form.chainage} onChange={e => set('chainage', e.target.value)} />
          </div>
        </div>

        <div className="card">
          <p className="sec-label" style={{ marginTop: 0 }}>Work & resources</p>
          <div className="form-group">
            <label>Work carried out today *</label>
            <textarea
              placeholder="Describe all activities — earthworks, paving, drainage, structures, culverts, etc."
              value={form.work_done}
              onChange={e => set('work_done', e.target.value)}
              style={{ minHeight: 100 }}
              required
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Labour on site (no. of workers)</label>
              <input type="number" placeholder="e.g. 28" min="0" value={form.labour_count} onChange={e => set('labour_count', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Equipment on site</label>
              <input type="text" placeholder="e.g. 2 rollers, 1 grader, 1 bowser" value={form.equipment} onChange={e => set('equipment', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Weather conditions</label>
              <select value={form.weather} onChange={e => set('weather', e.target.value)}>
                <option value="">Select…</option>
                <option>Clear / Sunny</option>
                <option>Cloudy</option>
                <option>Light rain</option>
                <option>Heavy rain — work stopped</option>
                <option>Very hot</option>
                <option>Windy</option>
              </select>
            </div>
            <div className="form-group">
              <label>Overall project progress (%)</label>
              <input type="number" placeholder="e.g. 65" min="0" max="100" value={form.progress_pct} onChange={e => set('progress_pct', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <p className="sec-label" style={{ marginTop: 0 }}>Site observations</p>
          <div className="form-group">
            <label>Quality observations & test results</label>
            <textarea
              placeholder="Material test results, quality issues, inspection findings, specification compliance…"
              value={form.observations}
              onChange={e => set('observations', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Challenges (non-urgent)</label>
            <textarea
              placeholder="Supply delays, access issues, subcontractor problems, weather impacts, community concerns…"
              value={form.challenges}
              onChange={e => set('challenges', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Plan for tomorrow</label>
            <textarea
              placeholder="Activities planned for the next working day…"
              value={form.tomorrow_plan}
              onChange={e => set('tomorrow_plan', e.target.value)}
            />
          </div>
        </div>

        <div className="card" style={{ borderLeft: form.is_urgent ? '3px solid var(--red)' : '1px solid var(--gray-200)', background: form.is_urgent ? '#FEF2F2' : '#fff' }}>
          <p className="sec-label" style={{ marginTop: 0 }}>Urgent issues</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: form.is_urgent ? 16 : 0 }}>
            <input
              type="checkbox"
              checked={form.is_urgent}
              onChange={e => set('is_urgent', e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--red)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 14, fontWeight: 500, color: form.is_urgent ? '#991B1B' : 'var(--gray-700)' }}>
              ⚠ Flag as urgent — requires engineer intervention
            </span>
          </label>

          {form.is_urgent && (
            <>
              <div className="form-group">
                <label>Describe the urgent issue *</label>
                <textarea
                  placeholder="Describe exactly what happened, what action has been taken, and what you need the engineer to do…"
                  value={form.urgent_description}
                  onChange={e => set('urgent_description', e.target.value)}
                  style={{ borderColor: '#FECACA', minHeight: 100 }}
                />
              </div>
              <div className="form-group">
                <label>Urgency category</label>
                <select value={form.urgent_category} onChange={e => set('urgent_category', e.target.value)}>
                  <option value="">Select category…</option>
                  <option>Structural / safety concern</option>
                  <option>Equipment breakdown — no replacement</option>
                  <option>Material failure / substandard supply</option>
                  <option>Environmental / community issue</option>
                  <option>Design discrepancy on site</option>
                  <option>Contractor dispute</option>
                  <option>Health & safety incident</option>
                  <option>Other</option>
                </select>
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          className={`btn btn-full ${form.is_urgent ? 'btn-danger' : 'btn-primary'}`}
          type="submit"
          disabled={saving}
          style={{ padding: 14, fontSize: 15 }}
        >
          {saving ? 'Submitting…' : form.is_urgent ? '⚠ Submit urgent report' : 'Submit daily report'}
        </button>
      </form>
    </div>
  );
}
