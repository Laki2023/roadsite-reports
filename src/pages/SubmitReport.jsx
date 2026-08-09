import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const WEATHER_OPTIONS = ['Sunny','Partly Cloudy','Overcast','Light Rain','Heavy Rain','Stormy'];

export default function SubmitReport({ profile, showToast, navigateTo }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [activities, setActivities] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [structures, setStructures] = useState([]);
  const [layers, setLayers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);

  // Report form
  const [form, setForm] = useState({
    report_date: new Date().toISOString().split('T')[0],
    weather_conditions: 'Sunny', max_temp_c: '', min_temp_c: '', rainfall_mm: '',
    working_hours: 8, non_working_reason: '',
    contractor_labour_skilled: 0, contractor_labour_unskilled: 0, subcontractor_labour: 0,
    work_description: '', quality_observations: '', challenges: '',
    instructions_issued: '', visitors: '', urgent_flag: false,
  });

  // Works entries (activity progress)
  const [worksEntries, setWorksEntries] = useState([]);
  // Equipment entries (daily status)
  const [equipEntries, setEquipEntries] = useState([]);
  // Structure entries (stage progress)
  const [structEntries, setStructEntries] = useState([]);

  useEffect(() => {
    supabase.from('projects').select('id, name, category').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    Promise.all([
      supabase.from('works_activities').select('id, activity_name, activity_code, category, unit').eq('project_id', selectedProject).order('sort_order'),
      supabase.from('equipment_register').select('id, equipment_name, equipment_type').eq('project_id', selectedProject).order('equipment_type'),
      supabase.from('structures').select('id, structure_ref, structure_type, chainage').eq('project_id', selectedProject).order('chainage'),
      supabase.from('pavement_layers').select('id, layer_type, start_chainage, end_chainage, layer_status').eq('project_id', selectedProject),
    ]).then(([actRes, eqRes, strRes, layRes]) => {
      setActivities(actRes.data || []);
      setEquipment(eqRes.data || []);
      setStructures(strRes.data || []);
      setLayers(layRes.data || []);
    });
  }, [selectedProject]);

  function addWorksEntry() {
    setWorksEntries([...worksEntries, { activity_id: '', start_chainage: '', end_chainage: '', side: 'Both', quantity: '', notes: '' }]);
  }
  function updateWorksEntry(i, field, val) {
    const e = [...worksEntries]; e[i][field] = val; setWorksEntries(e);
  }
  function removeWorksEntry(i) { setWorksEntries(worksEntries.filter((_, idx) => idx !== i)); }

  function addEquipEntry() {
    setEquipEntries([...equipEntries, { equipment_id: '', status: 'Operational', hours_worked: 0, notes: '' }]);
  }
  function updateEquipEntry(i, field, val) {
    const e = [...equipEntries]; e[i][field] = val; setEquipEntries(e);
  }
  function removeEquipEntry(i) { setEquipEntries(equipEntries.filter((_, idx) => idx !== i)); }

  function addStructEntry() {
    setStructEntries([...structEntries, { structure_id: '', stage: '', status: 'In Progress', concrete_volume_m3: '', rebar_kg: '', notes: '' }]);
  }
  function updateStructEntry(i, field, val) {
    const e = [...structEntries]; e[i][field] = val; setStructEntries(e);
  }
  function removeStructEntry(i) { setStructEntries(structEntries.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedProject) { showToast('Please select a project', 'error'); return; }
    setSaving(true);

    try {
      // 1. Save the daily report
      const reportData = {
        project_id: selectedProject, user_id: profile.id, ...form,
        working_hours: parseFloat(form.working_hours) || 0,
        max_temp_c: form.max_temp_c ? parseFloat(form.max_temp_c) : null,
        min_temp_c: form.min_temp_c ? parseFloat(form.min_temp_c) : null,
        rainfall_mm: form.rainfall_mm ? parseFloat(form.rainfall_mm) : null,
        contractor_labour_skilled: parseInt(form.contractor_labour_skilled) || 0,
        contractor_labour_unskilled: parseInt(form.contractor_labour_unskilled) || 0,
        subcontractor_labour: parseInt(form.subcontractor_labour) || 0,
        progress_percentage: 0,
      };
      const { data: report, error: repErr } = await supabase.from('daily_reports').insert(reportData).select().single();
      if (repErr) throw repErr;

      // 2. Auto-sync works progress
      for (const w of worksEntries) {
        if (!w.activity_id || !w.quantity) continue;
        await supabase.from('works_progress').insert({
          project_id: selectedProject, activity_id: w.activity_id,
          work_date: form.report_date, start_chainage: parseFloat(w.start_chainage) || 0,
          end_chainage: parseFloat(w.end_chainage) || 0, side: w.side,
          quantity: parseFloat(w.quantity) || 0, notes: w.notes, reported_by: profile.id,
        });
        // Update activity completed quantity
        const act = activities.find(a => a.id === w.activity_id);
        if (act) {
          const { data: current } = await supabase.from('works_activities').select('completed_quantity').eq('id', w.activity_id).single();
          await supabase.from('works_activities').update({
            completed_quantity: (current?.completed_quantity || 0) + (parseFloat(w.quantity) || 0),
            status: 'In Progress',
          }).eq('id', w.activity_id);
        }
      }

      // 3. Auto-sync equipment status
      for (const eq of equipEntries) {
        if (!eq.equipment_id) continue;
        await supabase.from('equipment_daily_status').upsert({
          equipment_id: eq.equipment_id, project_id: selectedProject,
          status_date: form.report_date, status: eq.status,
          hours_worked: parseFloat(eq.hours_worked) || 0,
          notes: eq.notes, reported_by: profile.id,
        }, { onConflict: 'equipment_id,status_date' });
      }

      // 4. Auto-sync structure progress
      for (const s of structEntries) {
        if (!s.structure_id || !s.stage) continue;
        await supabase.from('structure_progress').insert({
          structure_id: s.structure_id, project_id: selectedProject,
          stage: s.stage, status: s.status, work_date: form.report_date,
          concrete_volume_m3: s.concrete_volume_m3 ? parseFloat(s.concrete_volume_m3) : null,
          rebar_kg: s.rebar_kg ? parseFloat(s.rebar_kg) : null,
          notes: s.notes, reported_by: profile.id,
        });
      }

      showToast('✅ Report submitted — all sections auto-updated!');
      // Reset
      setStep(1);
      setWorksEntries([]);
      setEquipEntries([]);
      setStructEntries([]);
      setForm({ ...form, work_description: '', quality_observations: '', challenges: '', instructions_issued: '', visitors: '', urgent_flag: false });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const totalSteps = 5;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Submit Daily Report</h2>
          <div className="subtitle">Step {step} of {totalSteps} — All data auto-syncs to Works, Equipment & Structures</div>
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {['Project & Weather','Labour & General','Works Progress','Equipment & Structures','Review & Submit'].map((label, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }} onClick={() => setStep(i + 1)}>
            <div style={{ height: 4, borderRadius: 2, background: step > i ? 'var(--accent)' : 'var(--border)', marginBottom: 6 }} />
            <span style={{ fontSize: 11, color: step === i + 1 ? 'var(--accent)' : 'var(--text-muted)', fontWeight: step === i + 1 ? 600 : 400 }}>{label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* STEP 1: Project & Weather */}
        {step === 1 && (
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Project & Weather</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Project *</label>
                <select value={selectedProject || ''} onChange={e => setSelectedProject(e.target.value)} required>
                  <option value="">Select project...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Date *</label>
                <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} required /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Weather</label>
                <select value={form.weather_conditions} onChange={e => setForm({ ...form, weather_conditions: e.target.value })}>
                  {WEATHER_OPTIONS.map(w => <option key={w}>{w}</option>)}</select></div>
              <div className="form-group"><label>Max Temp °C</label>
                <input type="number" value={form.max_temp_c} onChange={e => setForm({ ...form, max_temp_c: e.target.value })} /></div>
              <div className="form-group"><label>Min Temp °C</label>
                <input type="number" value={form.min_temp_c} onChange={e => setForm({ ...form, min_temp_c: e.target.value })} /></div>
              <div className="form-group"><label>Rainfall (mm)</label>
                <input type="number" step="0.1" value={form.rainfall_mm} onChange={e => setForm({ ...form, rainfall_mm: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Working Hours</label>
                <input type="number" step="0.5" value={form.working_hours} onChange={e => setForm({ ...form, working_hours: e.target.value })} /></div>
              <div className="form-group"><label>Non-Working Reason</label>
                <input value={form.non_working_reason} onChange={e => setForm({ ...form, non_working_reason: e.target.value })} placeholder="If not working, state reason" /></div>
            </div>
          </div>
        )}

        {/* STEP 2: Labour & General */}
        {step === 2 && (
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Labour & General</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Skilled Labour</label>
                <input type="number" min="0" value={form.contractor_labour_skilled} onChange={e => setForm({ ...form, contractor_labour_skilled: e.target.value })} /></div>
              <div className="form-group"><label>Unskilled Labour</label>
                <input type="number" min="0" value={form.contractor_labour_unskilled} onChange={e => setForm({ ...form, contractor_labour_unskilled: e.target.value })} /></div>
              <div className="form-group"><label>Subcontractor</label>
                <input type="number" min="0" value={form.subcontractor_labour} onChange={e => setForm({ ...form, subcontractor_labour: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Work Description *</label>
              <textarea rows={3} value={form.work_description} onChange={e => setForm({ ...form, work_description: e.target.value })} required
                placeholder="General description of works carried out today..." /></div>
            <div className="form-group"><label>Quality Observations</label>
              <textarea rows={2} value={form.quality_observations} onChange={e => setForm({ ...form, quality_observations: e.target.value })}
                placeholder="Any quality issues observed..." /></div>
            <div className="form-group"><label>Challenges</label>
              <textarea rows={2} value={form.challenges} onChange={e => setForm({ ...form, challenges: e.target.value })}
                placeholder="Issues, delays, obstacles..." /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group"><label>Instructions Issued</label>
                <textarea rows={2} value={form.instructions_issued} onChange={e => setForm({ ...form, instructions_issued: e.target.value })} /></div>
              <div className="form-group"><label>Visitors</label>
                <textarea rows={2} value={form.visitors} onChange={e => setForm({ ...form, visitors: e.target.value })} placeholder="Names and purpose" /></div>
            </div>
          </div>
        )}

        {/* STEP 3: Works Progress */}
        {step === 3 && (
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Works Progress</h3>
              <button type="button" className="btn btn-primary btn-sm" onClick={addWorksEntry} disabled={activities.length === 0}>
                + Add Activity
              </button>
            </div>
            {activities.length === 0 && (
              <div className="text-sm text-muted" style={{ padding: 16, textAlign: 'center' }}>
                No activities defined for this project. Go to Works Activities to generate them first.
              </div>
            )}
            {worksEntries.length === 0 && activities.length > 0 && (
              <div className="text-sm text-muted" style={{ padding: 16, textAlign: 'center' }}>
                Click "+ Add Activity" to log progress on works done today. This auto-updates the Works Activities module.
              </div>
            )}
            {worksEntries.map((w, i) => (
              <div key={i} style={{ padding: 16, background: 'var(--bg-hover)', borderRadius: 'var(--radius)', marginBottom: 12, position: 'relative' }}>
                <button type="button" onClick={() => removeWorksEntry(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>×</button>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8 }}>
                  <div className="form-group"><label className="text-sm">Activity</label>
                    <select value={w.activity_id} onChange={e => updateWorksEntry(i, 'activity_id', e.target.value)} style={{ fontSize: 12 }}>
                      <option value="">Select...</option>
                      {activities.map(a => <option key={a.id} value={a.id}>[{a.activity_code}] {a.activity_name}</option>)}
                    </select></div>
                  <div className="form-group"><label className="text-sm">From Ch.</label>
                    <input type="number" step="0.001" value={w.start_chainage} onChange={e => updateWorksEntry(i, 'start_chainage', e.target.value)} style={{ fontSize: 12 }} /></div>
                  <div className="form-group"><label className="text-sm">To Ch.</label>
                    <input type="number" step="0.001" value={w.end_chainage} onChange={e => updateWorksEntry(i, 'end_chainage', e.target.value)} style={{ fontSize: 12 }} /></div>
                  <div className="form-group"><label className="text-sm">Side</label>
                    <select value={w.side} onChange={e => updateWorksEntry(i, 'side', e.target.value)} style={{ fontSize: 12 }}>
                      {['Both','LHS','RHS','CL'].map(s => <option key={s}>{s}</option>)}</select></div>
                  <div className="form-group"><label className="text-sm">Qty ({activities.find(a => a.id === w.activity_id)?.unit || ''})</label>
                    <input type="number" step="0.001" value={w.quantity} onChange={e => updateWorksEntry(i, 'quantity', e.target.value)} style={{ fontSize: 12 }} /></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STEP 4: Equipment & Structures */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Equipment */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>⚙ Equipment Status</h3>
                <button type="button" className="btn btn-sm btn-primary" onClick={addEquipEntry} disabled={equipment.length === 0}>+ Add Equipment</button>
              </div>
              {equipEntries.length === 0 && (
                <div className="text-sm text-muted" style={{ padding: 12, textAlign: 'center' }}>
                  Log equipment status for today. Auto-syncs to Equipment Register.
                </div>
              )}
              {equipEntries.map((eq, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <div className="form-group"><label className="text-sm">Equipment</label>
                    <select value={eq.equipment_id} onChange={e => updateEquipEntry(i, 'equipment_id', e.target.value)} style={{ fontSize: 12 }}>
                      <option value="">Select...</option>
                      {equipment.map(e => <option key={e.id} value={e.id}>{e.equipment_name} ({e.equipment_type})</option>)}
                    </select></div>
                  <div className="form-group"><label className="text-sm">Status</label>
                    <select value={eq.status} onChange={e => updateEquipEntry(i, 'status', e.target.value)} style={{ fontSize: 12 }}>
                      {['Operational','Idle','Breakdown','Under Repair','Standby'].map(s => <option key={s}>{s}</option>)}</select></div>
                  <div className="form-group"><label className="text-sm">Hours</label>
                    <input type="number" step="0.5" value={eq.hours_worked} onChange={e => updateEquipEntry(i, 'hours_worked', e.target.value)} style={{ fontSize: 12 }} /></div>
                  <button type="button" onClick={() => removeEquipEntry(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16, marginBottom: 8 }}>×</button>
                </div>
              ))}
            </div>

            {/* Structures */}
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>🌉 Structure Works</h3>
                <button type="button" className="btn btn-sm btn-primary" onClick={addStructEntry} disabled={structures.length === 0}>+ Add Structure Work</button>
              </div>
              {structEntries.length === 0 && (
                <div className="text-sm text-muted" style={{ padding: 12, textAlign: 'center' }}>
                  Log structure stage progress. Auto-syncs to Structures module.
                </div>
              )}
              {structEntries.map((s, i) => (
                <div key={i} style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 'var(--radius)', marginBottom: 8, position: 'relative' }}>
                  <button type="button" onClick={() => removeStructEntry(i)} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}>×</button>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8 }}>
                    <div className="form-group"><label className="text-sm">Structure</label>
                      <select value={s.structure_id} onChange={e => updateStructEntry(i, 'structure_id', e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">Select...</option>
                        {structures.map(st => <option key={st.id} value={st.id}>{st.structure_ref} — {st.structure_type} (Ch.{st.chainage})</option>)}
                      </select></div>
                    <div className="form-group"><label className="text-sm">Stage</label>
                      <select value={s.stage} onChange={e => updateStructEntry(i, 'stage', e.target.value)} style={{ fontSize: 12 }}>
                        <option value="">Select stage...</option>
                        {['Setting Out','Excavation','Blinding','Foundation/Base Slab','Base Reinforcement','Base Concrete','Wall Formwork','Wall Reinforcement','Wall Concrete','Top Slab Formwork','Top Slab Reinforcement','Top Slab Concrete','Headwall','Wingwall','Apron','Backfilling','Scour Protection','Waterproofing','Gabion Basket Placement','Wire Mesh Installation','Stone Filling','Lacing/Tying','Masonry Work','Inspection','Other'].map(st => <option key={st}>{st}</option>)}
                      </select></div>
                    <div className="form-group"><label className="text-sm">Status</label>
                      <select value={s.status} onChange={e => updateStructEntry(i, 'status', e.target.value)} style={{ fontSize: 12 }}>
                        {['In Progress','Completed'].map(st => <option key={st}>{st}</option>)}</select></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                    <div className="form-group"><label className="text-sm">Concrete (m³)</label>
                      <input type="number" step="0.01" value={s.concrete_volume_m3} onChange={e => updateStructEntry(i, 'concrete_volume_m3', e.target.value)} style={{ fontSize: 12 }} /></div>
                    <div className="form-group"><label className="text-sm">Rebar (kg)</label>
                      <input type="number" step="0.01" value={s.rebar_kg} onChange={e => updateStructEntry(i, 'rebar_kg', e.target.value)} style={{ fontSize: 12 }} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: Review & Submit */}
        {step === 5 && (
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Review & Submit</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13, marginBottom: 20 }}>
              <div><span className="text-muted">Project:</span> <strong>{projects.find(p => p.id === selectedProject)?.name}</strong></div>
              <div><span className="text-muted">Date:</span> <strong>{form.report_date}</strong></div>
              <div><span className="text-muted">Weather:</span> {form.weather_conditions}</div>
              <div><span className="text-muted">Hours:</span> {form.working_hours}</div>
              <div><span className="text-muted">Labour:</span> {(parseInt(form.contractor_labour_skilled)||0) + (parseInt(form.contractor_labour_unskilled)||0) + (parseInt(form.subcontractor_labour)||0)} total</div>
              <div><span className="text-muted">Works entries:</span> <strong>{worksEntries.filter(w => w.activity_id).length}</strong> activities</div>
              <div><span className="text-muted">Equipment:</span> <strong>{equipEntries.filter(e => e.equipment_id).length}</strong> items</div>
              <div><span className="text-muted">Structures:</span> <strong>{structEntries.filter(s => s.structure_id).length}</strong> updates</div>
            </div>
            {form.work_description && (
              <div style={{ background: 'var(--bg-hover)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12 }}>
                <strong>Work Description:</strong> {form.work_description}
              </div>
            )}
            <div style={{ background: 'rgba(232,123,53,0.1)', padding: 12, borderRadius: 'var(--radius)', fontSize: 12, marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
              <strong>Auto-sync:</strong> On submit, this report will automatically update Works Activities progress, Equipment daily status, and Structure stage progress. The Road Engineering dashboards will reflect these changes immediately.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.urgent_flag} onChange={e => setForm({ ...form, urgent_flag: e.target.checked })} />
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>🚨 Flag as Urgent</span>
            </label>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
            ← Previous
          </button>
          {step < totalSteps ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next →
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 200 }}>
              {saving ? 'Submitting & Syncing...' : '✅ Submit Report'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
