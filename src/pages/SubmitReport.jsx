import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function SubmitReport({ profile, showToast }) {
  const [projects, setProjects] = useState([]);
  const [form, setForm] = useState({
    project_id: '', report_date: new Date().toISOString().split('T')[0],
    weather: 'Sunny', max_temp_c: '', min_temp_c: '', rainfall_mm: '',
    work_done: '', working_hours: '8', non_working_reason: '',
    contractor_labour_skilled: '', contractor_labour_unskilled: '', subcontractor_labour: '',
    equipment_summary: '', visitors_summary: '',
    progress_pct: '', quality_observations: '', challenges: '',
    instructions_issued: '',
    urgent_flag: false, urgent_details: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('projects').select('id, name, category').eq('status', 'active')
      .then(({ data }) => setProjects(data || []));
  }, []);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        project_id: form.project_id,
        report_date: form.report_date,
        weather: form.weather,
        max_temp_c: form.max_temp_c ? parseFloat(form.max_temp_c) : null,
        min_temp_c: form.min_temp_c ? parseFloat(form.min_temp_c) : null,
        rainfall_mm: form.rainfall_mm ? parseFloat(form.rainfall_mm) : null,
        work_done: form.work_done,
        working_hours: form.working_hours ? parseFloat(form.working_hours) : null,
        non_working_reason: form.non_working_reason || null,
        contractor_labour_skilled: parseInt(form.contractor_labour_skilled) || 0,
        contractor_labour_unskilled: parseInt(form.contractor_labour_unskilled) || 0,
        subcontractor_labour: parseInt(form.subcontractor_labour) || 0,
        labour_count: (parseInt(form.contractor_labour_skilled) || 0) +
          (parseInt(form.contractor_labour_unskilled) || 0) +
          (parseInt(form.subcontractor_labour) || 0),
        equipment_on_site: form.equipment_summary ? [{ summary: form.equipment_summary }] : [],
        visitors: form.visitors_summary ? [{ summary: form.visitors_summary }] : [],
        progress_pct: parseInt(form.progress_pct) || 0,
        quality_observations: form.quality_observations,
        challenges: form.challenges,
        instructions_issued: form.instructions_issued,
        urgent_flag: form.urgent_flag,
        urgent_details: form.urgent_details,
        submitted_by: profile.id,
      };
      const { error } = await supabase.from('daily_reports').insert(payload);
      if (error) throw error;
      showToast('Daily report submitted');
      setForm(f => ({
        ...f, work_done: '', quality_observations: '', challenges: '',
        instructions_issued: '', urgent_flag: false, urgent_details: '',
        equipment_summary: '', visitors_summary: '',
      }));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Submit Daily Report</h2>
          <div className="subtitle">RE/Inspector daily site report</div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card mb-16">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--accent)' }}>General Information</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Project *</label>
              <select value={form.project_id} onChange={e => set('project_id', e.target.value)} required>
                <option value="">Select project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} [{p.category}]</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Report Date *</label>
              <input type="date" value={form.report_date} onChange={e => set('report_date', e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Working Hours</label>
              <input type="number" step="0.5" value={form.working_hours} onChange={e => set('working_hours', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Non-working Reason (if applicable)</label>
              <input value={form.non_working_reason} onChange={e => set('non_working_reason', e.target.value)}
                placeholder="e.g. Rain stoppage, Public holiday" />
            </div>
          </div>
        </div>

        <div className="card mb-16">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--accent)' }}>Weather Conditions</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Weather *</label>
              <select value={form.weather} onChange={e => set('weather', e.target.value)}>
                {['Sunny','Cloudy','Light Rain','Heavy Rain','Overcast','Windy','Foggy'].map(w =>
                  <option key={w}>{w}</option>
                )}
              </select>
            </div>
            <div className="form-group">
              <label>Max Temp (°C)</label>
              <input type="number" step="0.1" value={form.max_temp_c} onChange={e => set('max_temp_c', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Min Temp (°C)</label>
              <input type="number" step="0.1" value={form.min_temp_c} onChange={e => set('min_temp_c', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Rainfall (mm)</label>
              <input type="number" step="0.1" value={form.rainfall_mm} onChange={e => set('rainfall_mm', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card mb-16">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--accent)' }}>Labour & Equipment</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Contractor Skilled Labour</label>
              <input type="number" value={form.contractor_labour_skilled} onChange={e => set('contractor_labour_skilled', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Contractor Unskilled Labour</label>
              <input type="number" value={form.contractor_labour_unskilled} onChange={e => set('contractor_labour_unskilled', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Subcontractor Labour</label>
              <input type="number" value={form.subcontractor_labour} onChange={e => set('subcontractor_labour', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label>Equipment on Site</label>
              <textarea value={form.equipment_summary} onChange={e => set('equipment_summary', e.target.value)}
                placeholder="e.g. 2× CAT 120G Graders, 1× Bomag BW219 Roller, 3× Tippers, 1× Water Bowser" rows={2} />
            </div>
          </div>
        </div>

        <div className="card mb-16">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--accent)' }}>Works & Progress</h3>
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Work Done Today *</label>
              <textarea value={form.work_done} onChange={e => set('work_done', e.target.value)} required
                placeholder="Describe all activities carried out today with chainages and quantities..." rows={4} />
            </div>
            <div className="form-group">
              <label>Overall Progress (%)</label>
              <input type="number" min="0" max="100" value={form.progress_pct}
                onChange={e => set('progress_pct', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label>Quality Observations</label>
              <textarea value={form.quality_observations} onChange={e => set('quality_observations', e.target.value)}
                placeholder="Material quality, compaction results, test outcomes..." rows={3} />
            </div>
            <div className="form-group full-width">
              <label>Challenges / Delays</label>
              <textarea value={form.challenges} onChange={e => set('challenges', e.target.value)}
                placeholder="Any obstacles, delays, or issues encountered..." rows={3} />
            </div>
            <div className="form-group full-width">
              <label>Instructions Issued to Contractor</label>
              <textarea value={form.instructions_issued} onChange={e => set('instructions_issued', e.target.value)}
                placeholder="Any verbal or written instructions given..." rows={2} />
            </div>
            <div className="form-group full-width">
              <label>Visitors</label>
              <textarea value={form.visitors_summary} onChange={e => set('visitors_summary', e.target.value)}
                placeholder="e.g. DG KeNHA site visit, Materials Engineer from HQ" rows={2} />
            </div>
          </div>
        </div>

        <div className="card mb-16">
          <h3 style={{ marginBottom: 16, fontSize: 14, color: 'var(--danger)' }}>Urgent Flag</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.urgent_flag}
                onChange={e => set('urgent_flag', e.target.checked)}
                style={{ width: 18, height: 18 }} />
              Flag this report for immediate Engineer attention
            </label>
          </div>
          {form.urgent_flag && (
            <div className="form-group mt-16">
              <label>Urgent Details *</label>
              <textarea value={form.urgent_details} onChange={e => set('urgent_details', e.target.value)}
                placeholder="Describe the urgent matter requiring immediate attention..." rows={3} required />
            </div>
          )}
        </div>

        <button className="btn btn-primary" type="submit" disabled={saving} style={{ padding: '12px 32px', fontSize: 14 }}>
          {saving ? 'Submitting...' : 'Submit Daily Report'}
        </button>
      </form>
    </div>
  );
}
