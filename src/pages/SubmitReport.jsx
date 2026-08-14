import React, { useState, useEffect } from 'react';
import { supabase, hasRole, ROLE_LABELS, INSTRUCTION_TYPES } from '../lib/supabase';

const WEATHER = [
  { key: 'Sunny', icon: '☀️', color: '#f59e0b' },
  { key: 'Partly Cloudy', icon: '⛅', color: '#6b7280' },
  { key: 'Overcast', icon: '☁️', color: '#4b5563' },
  { key: 'Light Rain', icon: '🌦️', color: '#3b82f6' },
  { key: 'Heavy Rain', icon: '🌧️', color: '#1d4ed8' },
  { key: 'Stormy', icon: '⛈️', color: '#7c3aed' },
];

const ISSUE_SEVERITY = ['Low', 'Medium', 'High', 'Critical'];
const ISSUE_CATEGORIES = ['Safety', 'Quality', 'Environmental', 'Design', 'Access', 'Utility', 'Community', 'Other'];
const TEST_TYPES = ['MDD/CBR', 'DCP', 'Gradation', 'Atterberg Limits', 'Marshall Stability', 'Concrete Cube', 'Slump Test', 'Compaction', 'Deflection', 'IRI', 'Sand Equivalent', 'Bitumen Content', 'Other'];
const MATERIAL_TYPES = ['Cement', 'Bitumen', 'Aggregate', 'Sand', 'Steel', 'Fuel', 'Timber', 'Pipes', 'Geotextile', 'Paint', 'Other'];

const STEPS = [
  { num: 1, label: 'Project & Weather', icon: '🌤️', short: 'Weather' },
  { num: 2, label: 'Manpower & Labour', icon: '👷', short: 'Labour' },
  { num: 3, label: 'Works Progress', icon: '⛏️', short: 'Works' },
  { num: 4, label: 'Equipment', icon: '🚜', short: 'Equipment' },
  { num: 5, label: 'Quality & Materials', icon: '🧪', short: 'Quality' },
  { num: 6, label: 'Structures', icon: '🌉', short: 'Structures' },
  { num: 7, label: 'Issues & Instructions', icon: '⚠️', short: 'Issues' },
  { num: 8, label: 'Review & Submit', icon: '✅', short: 'Submit' },
];

function SectionCard({ title, icon, children, count, color = 'var(--accent)' }) {
  return (
    <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
        <span style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{icon}</span> {title}
        </span>
        {count != null && (
          <span style={{ background: color, color: '#fff', fontSize: 10, fontWeight: 800,
            padding: '2px 8px', borderRadius: 9999, minWidth: 20, textAlign: 'center' }}>{count}</span>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function EntryRow({ children, onRemove }) {
  return (
    <div style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--bg-hover)', borderRadius: 'var(--radius)',
      border: '1px solid var(--border)', position: 'relative' }}>
      {onRemove && (
        <button onClick={onRemove} style={{ position: 'absolute', top: 6, right: 8, background: 'none',
          border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>×</button>
      )}
      {children}
    </div>
  );
}

function AddButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ width: '100%', padding: '10px', border: '2px dashed var(--border)',
      borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      transition: 'all 0.2s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
      <span style={{ fontSize: 18 }}>+</span> {label}
    </button>
  );
}

export default function SubmitReport({ profile, showToast, navigateTo, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || null);
  const [activities, setActivities] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [structures, setStructures] = useState([]);
  const [layers, setLayers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const isPlatformAdmin = profile.is_platform_admin === true;
  const isRE = hasRole(profile.role, 'resident_engineer') || isPlatformAdmin;

  // ── Form State ──
  const [form, setForm] = useState({
    report_date: new Date().toISOString().split('T')[0],
    weather_conditions: 'Sunny', max_temp_c: '', min_temp_c: '', rainfall_mm: '',
    working_hours: 8, non_working_reason: '', is_working_day: true,
    contractor_labour_skilled: 0, contractor_labour_unskilled: 0, subcontractor_labour: 0,
    supervisor_count: 0, work_description: '', quality_observations: '', challenges: '',
    instructions_issued: '', visitors: '', urgent_flag: false, safety_incidents: '',
  });

  const [worksEntries, setWorksEntries] = useState([]);
  const [equipEntries, setEquipEntries] = useState([]);
  const [structEntries, setStructEntries] = useState([]);
  const [testEntries, setTestEntries] = useState([]);
  const [issueEntries, setIssueEntries] = useState([]);
  const [instructionEntries, setInstructionEntries] = useState([]);
  const [materialEntries, setMaterialEntries] = useState([]);

  // ── Data Loading ──
  useEffect(() => {
    supabase.from('projects').select('id, name, category').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    Promise.all([
      supabase.from('works_activities').select('id, activity_name, activity_code, category, unit, planned_quantity, completed_quantity').eq('project_id', selectedProject).order('sort_order'),
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

  // ── Entry Helpers ──
  function addWork() { setWorksEntries([...worksEntries, { activity_id: '', start_chainage: '', end_chainage: '', side: 'Both', quantity: '', notes: '' }]); }
  function addEquip() { setEquipEntries([...equipEntries, { equipment_id: '', status: 'Operational', hours_worked: 0, notes: '' }]); }
  function addStruct() { setStructEntries([...structEntries, { structure_id: '', stage: '', status: 'In Progress', concrete_volume_m3: '', rebar_kg: '', notes: '' }]); }
  function addTest() { setTestEntries([...testEntries, { test_type: 'Compaction', location: '', chainage: '', sample_id: '', result_value: '', spec_limit: '', result_status: 'Pending', notes: '' }]); }
  function addIssue() { setIssueEntries([...issueEntries, { title: '', category: 'Quality', severity: 'Medium', description: '', action_required: '' }]); }
  function addInstruction() { setInstructionEntries([...instructionEntries, { instruction_type: 'site_instruction', subject: '', description: '', chainage: '', response_required: false }]); }
  function addMaterial() { setMaterialEntries([...materialEntries, { material_type: 'Cement', description: '', quantity: '', unit: 'Tonnes', source: '', delivery_note: '' }]); }

  function updateEntry(setter, list, i, field, val) { const copy = [...list]; copy[i][field] = val; setter(copy); }
  function removeEntry(setter, list, i) { setter(list.filter((_, idx) => idx !== i)); }

  // ── Completeness ──
  const stepComplete = [
    selectedProject && form.report_date && form.weather_conditions, // Step 1
    true, // Step 2 always ok
    true, // Step 3
    true, // Step 4
    true, // Step 5
    true, // Step 6
    true, // Step 7
    true, // Step 8
  ];
  const totalEntries = worksEntries.length + equipEntries.length + structEntries.length + testEntries.length + issueEntries.length + instructionEntries.length + materialEntries.length;

  // ── Submit ──
  async function handleSubmit() {
    if (!selectedProject) { showToast('Select a project first', 'error'); return; }
    setSaving(true);

    try {
      // 1. Daily Report
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

      // 2. Works Progress
      for (const w of worksEntries) {
        if (!w.activity_id || !w.quantity) continue;
        await supabase.from('works_progress').insert({
          project_id: selectedProject, activity_id: w.activity_id,
          work_date: form.report_date, start_chainage: parseFloat(w.start_chainage) || 0,
          end_chainage: parseFloat(w.end_chainage) || 0, side: w.side,
          quantity: parseFloat(w.quantity) || 0, notes: w.notes, reported_by: profile.id,
        });
      }

      // 3. Equipment Status
      for (const eq of equipEntries) {
        if (!eq.equipment_id) continue;
        await supabase.from('equipment_daily_status').upsert({
          equipment_id: eq.equipment_id, project_id: selectedProject,
          status_date: form.report_date, status: eq.status,
          hours_worked: parseFloat(eq.hours_worked) || 0,
          notes: eq.notes, reported_by: profile.id,
        }, { onConflict: 'equipment_id,status_date' });
      }

      // 4. Structures
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

      // 5. Quality Tests
      for (const t of testEntries) {
        if (!t.test_type) continue;
        await supabase.from('quality_tests').insert({
          project_id: selectedProject, test_type: t.test_type,
          test_date: form.report_date, location: t.location || null,
          chainage: t.chainage || null, sample_id: t.sample_id || null,
          result_value: t.result_value || null, spec_limit: t.spec_limit || null,
          result_status: t.result_status, notes: t.notes || null,
          tested_by: profile.id,
        });
      }

      // 6. Site Issues
      for (const iss of issueEntries) {
        if (!iss.title) continue;
        await supabase.from('site_issues').insert({
          project_id: selectedProject, title: iss.title,
          category: iss.category, severity: iss.severity,
          description: iss.description || null, action_required: iss.action_required || null,
          status: 'Open', reported_by: profile.id, reported_date: form.report_date,
        });
      }

      // 7. Site Instructions (RE and above only)
      for (const instr of instructionEntries) {
        if (!instr.subject) continue;
        const { count } = await supabase.from('site_instructions')
          .select('id', { count: 'exact', head: true }).eq('project_id', selectedProject);
        await supabase.from('site_instructions').insert({
          project_id: selectedProject, instruction_no: `SI-${String((count || 0) + 1).padStart(4, '0')}`,
          instruction_type: instr.instruction_type, subject: instr.subject,
          description: instr.description || null, chainage_from: instr.chainage || null,
          issued_by: profile.id, issued_by_role: profile.role,
          response_required: instr.response_required, status: 'issued',
        });
      }

      // 8. Materials Received
      for (const m of materialEntries) {
        if (!m.material_type || !m.quantity) continue;
        await supabase.from('project_materials').insert({
          project_id: selectedProject, material_type: m.material_type,
          description: m.description || null, quantity: parseFloat(m.quantity) || 0,
          unit: m.unit, source: m.source || null, delivery_note: m.delivery_note || null,
          received_date: form.report_date, received_by: profile.id,
        });
      }

      setSubmitted(true);
      showToast('✅ Report submitted — all data auto-synced!');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Success Screen ──
  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
        <h2 style={{ marginBottom: 8 }}>Report Submitted Successfully!</h2>
        <p className="text-muted" style={{ marginBottom: 8 }}>All data has been auto-synced to the respective modules.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24, fontSize: 13 }}>
          {worksEntries.length > 0 && <span className="badge badge-accent">⛏️ {worksEntries.length} activities logged</span>}
          {equipEntries.length > 0 && <span className="badge badge-accent">🚜 {equipEntries.length} equipment updated</span>}
          {testEntries.length > 0 && <span className="badge badge-accent">🧪 {testEntries.length} tests recorded</span>}
          {structEntries.length > 0 && <span className="badge badge-accent">🌉 {structEntries.length} structures updated</span>}
          {issueEntries.length > 0 && <span className="badge badge-accent">⚠️ {issueEntries.length} issues raised</span>}
          {instructionEntries.length > 0 && <span className="badge badge-accent">📋 {instructionEntries.length} instructions issued</span>}
          {materialEntries.length > 0 && <span className="badge badge-accent">📦 {materialEntries.length} materials received</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => { setSubmitted(false); setStep(1); setWorksEntries([]); setEquipEntries([]); setStructEntries([]); setTestEntries([]); setIssueEntries([]); setInstructionEntries([]); setMaterialEntries([]); }}>
            📝 Submit Another Report
          </button>
          <button className="btn btn-secondary" onClick={() => navigateTo('dashboard')}>📊 Go to Dashboard</button>
        </div>
      </div>
    );
  }

  const projName = projects.find(p => p.id === selectedProject)?.name;
  const totalLabour = (parseInt(form.contractor_labour_skilled)||0) + (parseInt(form.contractor_labour_unskilled)||0) + (parseInt(form.subcontractor_labour)||0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2>📝 Daily Site Report</h2>
          <div className="subtitle">
            {projName ? `${projName} — ` : ''}{form.report_date} · Step {step} of {STEPS.length}
            {totalEntries > 0 && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>({totalEntries} entries)</span>}
          </div>
        </div>
        {form.urgent_flag && (
          <span style={{ background: '#ef4444', color: '#fff', padding: '6px 14px', borderRadius: 9999, fontWeight: 700, fontSize: 12, animation: 'pulse 1.5s infinite' }}>
            🚨 URGENT
          </span>
        )}
      </div>

      {/* Step Navigator */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {STEPS.map((s, i) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          const hasData = [null, null, null, worksEntries.length, equipEntries.length, testEntries.length + materialEntries.length, structEntries.length, issueEntries.length + instructionEntries.length][i];
          return (
            <div key={s.num} onClick={() => { if (selectedProject || s.num === 1) setStep(s.num); }}
              style={{ flex: 1, minWidth: 80, textAlign: 'center', cursor: selectedProject || s.num === 1 ? 'pointer' : 'not-allowed', padding: '8px 4px',
                background: isActive ? 'var(--accent)' : isDone ? 'rgba(232,123,53,0.15)' : 'var(--bg-card)',
                borderRadius: 'var(--radius)', transition: 'all 0.2s', border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)',
                opacity: (!selectedProject && s.num > 1) ? 0.4 : 1 }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{isDone ? '✓' : s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? '#fff' : isDone ? 'var(--accent)' : 'var(--text-muted)' }}>
                {s.short}
              </div>
              {hasData > 0 && (
                <div style={{ fontSize: 9, fontWeight: 800, color: isActive ? '#fff' : 'var(--accent)', marginTop: 2 }}>{hasData}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* ══════ STEP 1: PROJECT & WEATHER ══════ */}
      {step === 1 && (
        <SectionCard title="Project & Weather" icon="🌤️">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>Project *</label>
              <select value={selectedProject || ''} onChange={e => setSelectedProject(e.target.value)} required
                style={{ fontSize: 14, fontWeight: 600 }}>
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group mb-16">
              <label>Report Date *</label>
              <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })}
                style={{ fontSize: 14, fontWeight: 600 }} />
            </div>
          </div>

          <div className="form-group mb-16">
            <label>Weather Conditions</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {WEATHER.map(w => (
                <button key={w.key} type="button" onClick={() => setForm({ ...form, weather_conditions: w.key })}
                  style={{ padding: '10px 14px', borderRadius: 'var(--radius)', border: form.weather_conditions === w.key ? `2px solid ${w.color}` : '2px solid var(--border)',
                    background: form.weather_conditions === w.key ? w.color + '20' : 'var(--bg-card)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: form.weather_conditions === w.key ? 700 : 400, transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 20 }}>{w.icon}</span> {w.key}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>🌡️ Max Temp (°C)</label>
              <input type="number" value={form.max_temp_c} onChange={e => setForm({ ...form, max_temp_c: e.target.value })} placeholder="e.g. 28" />
            </div>
            <div className="form-group mb-16">
              <label>🌡️ Min Temp (°C)</label>
              <input type="number" value={form.min_temp_c} onChange={e => setForm({ ...form, min_temp_c: e.target.value })} placeholder="e.g. 15" />
            </div>
            <div className="form-group mb-16">
              <label>🌧️ Rainfall (mm)</label>
              <input type="number" value={form.rainfall_mm} onChange={e => setForm({ ...form, rainfall_mm: e.target.value })} placeholder="0" />
            </div>
            <div className="form-group mb-16">
              <label>⏱️ Working Hours</label>
              <input type="number" value={form.working_hours} onChange={e => setForm({ ...form, working_hours: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!form.is_working_day} onChange={e => setForm({ ...form, is_working_day: !e.target.checked })} />
              <span>Non-Working Day</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: '#ef4444' }}>
              <input type="checkbox" checked={form.urgent_flag} onChange={e => setForm({ ...form, urgent_flag: e.target.checked })} />
              <span style={{ fontWeight: 600 }}>🚨 Mark as Urgent</span>
            </label>
          </div>
          {!form.is_working_day && (
            <div className="form-group mb-16" style={{ marginTop: 12 }}>
              <label>Reason for Non-Working Day</label>
              <input type="text" value={form.non_working_reason} onChange={e => setForm({ ...form, non_working_reason: e.target.value })}
                placeholder="e.g. Heavy rain, Public holiday, Sunday" />
            </div>
          )}
        </SectionCard>
      )}

      {/* ══════ STEP 2: LABOUR ══════ */}
      {step === 2 && (
        <SectionCard title="Manpower & Labour" icon="👷" count={totalLabour} color={totalLabour > 0 ? '#10b981' : '#6b7280'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { key: 'contractor_labour_skilled', label: 'Skilled Labour', icon: '🔧' },
              { key: 'contractor_labour_unskilled', label: 'Unskilled Labour', icon: '👷' },
              { key: 'subcontractor_labour', label: 'Subcontractor', icon: '🏗️' },
              { key: 'supervisor_count', label: 'Supervisors', icon: '📋' },
            ].map(f => (
              <div key={f.key} style={{ textAlign: 'center', padding: 14, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{f.icon}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{f.label}</div>
                <input type="number" min="0" value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  style={{ width: 70, textAlign: 'center', fontSize: 20, fontWeight: 800, padding: '6px 8px', border: '2px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)' }} />
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 14 }}>
            Total on Site: <strong style={{ fontSize: 20, color: 'var(--accent)' }}>{totalLabour + (parseInt(form.supervisor_count)||0)}</strong>
          </div>
        </SectionCard>
      )}

      {/* ══════ STEP 3: WORKS PROGRESS ══════ */}
      {step === 3 && (
        <SectionCard title="Works Progress" icon="⛏️" count={worksEntries.length}>
          {worksEntries.map((w, i) => {
            const act = activities.find(a => a.id === w.activity_id);
            return (
              <EntryRow key={i} onRemove={() => removeEntry(setWorksEntries, worksEntries, i)}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <select value={w.activity_id} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'activity_id', e.target.value)} style={{ fontSize: 12 }}>
                    <option value="">Select activity...</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.activity_code ? `${a.activity_code} — ` : ''}{a.activity_name}</option>)}
                  </select>
                  <input type="number" placeholder={`Qty (${act?.unit || 'units'})`} value={w.quantity} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'quantity', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Ch. From" value={w.start_chainage} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'start_chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Ch. To" value={w.end_chainage} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'end_chainage', e.target.value)} style={{ fontSize: 12 }} />
                </div>
                <input type="text" placeholder="Notes (optional)" value={w.notes} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'notes', e.target.value)} style={{ fontSize: 12, width: '100%' }} />
                {act && act.planned_quantity > 0 && (
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                    Progress: {act.completed_quantity || 0} / {act.planned_quantity} {act.unit} ({Math.round(((act.completed_quantity || 0) / act.planned_quantity) * 100)}%)
                  </div>
                )}
              </EntryRow>
            );
          })}
          <AddButton label="Add Activity Progress" onClick={addWork} />
        </SectionCard>
      )}

      {/* ══════ STEP 4: EQUIPMENT ══════ */}
      {step === 4 && (
        <SectionCard title="Equipment Status" icon="🚜" count={equipEntries.length}>
          {equipEntries.map((eq, i) => (
            <EntryRow key={i} onRemove={() => removeEntry(setEquipEntries, equipEntries, i)}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                <select value={eq.equipment_id} onChange={e => updateEntry(setEquipEntries, equipEntries, i, 'equipment_id', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Select equipment...</option>
                  {equipment.map(e => <option key={e.id} value={e.id}>{e.equipment_name} ({e.equipment_type})</option>)}
                </select>
                <select value={eq.status} onChange={e => updateEntry(setEquipEntries, equipEntries, i, 'status', e.target.value)} style={{ fontSize: 12 }}>
                  {['Operational', 'Idle', 'Breakdown', 'Maintenance', 'Off Site'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" placeholder="Hours worked" value={eq.hours_worked} onChange={e => updateEntry(setEquipEntries, equipEntries, i, 'hours_worked', e.target.value)} style={{ fontSize: 12 }} />
              </div>
            </EntryRow>
          ))}
          <AddButton label="Add Equipment Entry" onClick={addEquip} />
        </SectionCard>
      )}

      {/* ══════ STEP 5: QUALITY & MATERIALS ══════ */}
      {step === 5 && (
        <>
          <SectionCard title="Quality Tests" icon="🧪" count={testEntries.length}>
            {testEntries.map((t, i) => (
              <EntryRow key={i} onRemove={() => removeEntry(setTestEntries, testEntries, i)}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <select value={t.test_type} onChange={e => updateEntry(setTestEntries, testEntries, i, 'test_type', e.target.value)} style={{ fontSize: 12 }}>
                    {TEST_TYPES.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                  </select>
                  <input type="text" placeholder="Location / Layer" value={t.location} onChange={e => updateEntry(setTestEntries, testEntries, i, 'location', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Chainage" value={t.chainage} onChange={e => updateEntry(setTestEntries, testEntries, i, 'chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Sample ID" value={t.sample_id} onChange={e => updateEntry(setTestEntries, testEntries, i, 'sample_id', e.target.value)} style={{ fontSize: 12 }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input type="text" placeholder="Result Value" value={t.result_value} onChange={e => updateEntry(setTestEntries, testEntries, i, 'result_value', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Spec Limit" value={t.spec_limit} onChange={e => updateEntry(setTestEntries, testEntries, i, 'spec_limit', e.target.value)} style={{ fontSize: 12 }} />
                  <select value={t.result_status} onChange={e => updateEntry(setTestEntries, testEntries, i, 'result_status', e.target.value)} style={{ fontSize: 12 }}>
                    {['Pending', 'Pass', 'Fail', 'Marginal'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </EntryRow>
            ))}
            <AddButton label="Add Quality Test" onClick={addTest} />
          </SectionCard>

          <SectionCard title="Materials Received" icon="📦" count={materialEntries.length}>
            {materialEntries.map((m, i) => (
              <EntryRow key={i} onRemove={() => removeEntry(setMaterialEntries, materialEntries, i)}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <select value={m.material_type} onChange={e => updateEntry(setMaterialEntries, materialEntries, i, 'material_type', e.target.value)} style={{ fontSize: 12 }}>
                    {MATERIAL_TYPES.map(mt => <option key={mt} value={mt}>{mt}</option>)}
                  </select>
                  <input type="number" placeholder="Quantity" value={m.quantity} onChange={e => updateEntry(setMaterialEntries, materialEntries, i, 'quantity', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Unit" value={m.unit} onChange={e => updateEntry(setMaterialEntries, materialEntries, i, 'unit', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Source / Supplier" value={m.source} onChange={e => updateEntry(setMaterialEntries, materialEntries, i, 'source', e.target.value)} style={{ fontSize: 12 }} />
                </div>
              </EntryRow>
            ))}
            <AddButton label="Add Material Received" onClick={addMaterial} />
          </SectionCard>
        </>
      )}

      {/* ══════ STEP 6: STRUCTURES ══════ */}
      {step === 6 && (
        <SectionCard title="Structures Progress" icon="🌉" count={structEntries.length}>
          {structEntries.map((s, i) => (
            <EntryRow key={i} onRemove={() => removeEntry(setStructEntries, structEntries, i)}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <select value={s.structure_id} onChange={e => updateEntry(setStructEntries, structEntries, i, 'structure_id', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Select structure...</option>
                  {structures.map(st => <option key={st.id} value={st.id}>{st.structure_ref} — {st.structure_type} (Ch. {st.chainage})</option>)}
                </select>
                <input type="text" placeholder="Stage (e.g. Foundation)" value={s.stage} onChange={e => updateEntry(setStructEntries, structEntries, i, 'stage', e.target.value)} style={{ fontSize: 12 }} />
                <select value={s.status} onChange={e => updateEntry(setStructEntries, structEntries, i, 'status', e.target.value)} style={{ fontSize: 12 }}>
                  {['Not Started', 'In Progress', 'Completed', 'On Hold'].map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                <input type="number" placeholder="Concrete (m³)" value={s.concrete_volume_m3} onChange={e => updateEntry(setStructEntries, structEntries, i, 'concrete_volume_m3', e.target.value)} style={{ fontSize: 12 }} />
                <input type="number" placeholder="Rebar (kg)" value={s.rebar_kg} onChange={e => updateEntry(setStructEntries, structEntries, i, 'rebar_kg', e.target.value)} style={{ fontSize: 12 }} />
                <input type="text" placeholder="Notes" value={s.notes} onChange={e => updateEntry(setStructEntries, structEntries, i, 'notes', e.target.value)} style={{ fontSize: 12 }} />
              </div>
            </EntryRow>
          ))}
          <AddButton label="Add Structure Progress" onClick={addStruct} />
        </SectionCard>
      )}

      {/* ══════ STEP 7: ISSUES & INSTRUCTIONS ══════ */}
      {step === 7 && (
        <>
          <SectionCard title="Site Issues" icon="⚠️" count={issueEntries.length} color="#ef4444">
            {issueEntries.map((iss, i) => (
              <EntryRow key={i} onRemove={() => removeEntry(setIssueEntries, issueEntries, i)}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input type="text" placeholder="Issue title *" value={iss.title} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'title', e.target.value)} style={{ fontSize: 12, fontWeight: 600 }} />
                  <select value={iss.category} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'category', e.target.value)} style={{ fontSize: 12 }}>
                    {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={iss.severity} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'severity', e.target.value)}
                    style={{ fontSize: 12, color: iss.severity === 'Critical' ? '#ef4444' : iss.severity === 'High' ? '#f59e0b' : 'inherit', fontWeight: 600 }}>
                    {ISSUE_SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <textarea rows={2} placeholder="Description..." value={iss.description} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'description', e.target.value)} style={{ fontSize: 12, width: '100%' }} />
              </EntryRow>
            ))}
            <AddButton label="Report Issue" onClick={addIssue} />
          </SectionCard>

          {isRE && (
            <SectionCard title="Site Instructions" icon="📋" count={instructionEntries.length} color="#2563eb">
              {instructionEntries.map((instr, i) => (
                <EntryRow key={i} onRemove={() => removeEntry(setInstructionEntries, instructionEntries, i)}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 8 }}>
                    <select value={instr.instruction_type} onChange={e => updateEntry(setInstructionEntries, instructionEntries, i, 'instruction_type', e.target.value)} style={{ fontSize: 12 }}>
                      {INSTRUCTION_TYPES.filter(t => isPlatformAdmin || hasRole(profile.role, t.minRole)).map(t => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                    </select>
                    <input type="text" placeholder="Subject *" value={instr.subject} onChange={e => updateEntry(setInstructionEntries, instructionEntries, i, 'subject', e.target.value)} style={{ fontSize: 12, fontWeight: 600 }} />
                  </div>
                  <textarea rows={2} placeholder="Instruction details..." value={instr.description} onChange={e => updateEntry(setInstructionEntries, instructionEntries, i, 'description', e.target.value)} style={{ fontSize: 12, width: '100%' }} />
                </EntryRow>
              ))}
              <AddButton label="Issue Instruction" onClick={addInstruction} />
            </SectionCard>
          )}
        </>
      )}

      {/* ══════ STEP 8: REVIEW & SUBMIT ══════ */}
      {step === 8 && (
        <div>
          <SectionCard title="General Observations" icon="📝">
            <div className="form-group mb-16">
              <label>Work Description / Summary</label>
              <textarea rows={3} value={form.work_description} onChange={e => setForm({ ...form, work_description: e.target.value })}
                placeholder="Summarise today's work activities..." style={{ fontSize: 13 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group mb-16">
                <label>Quality Observations</label>
                <textarea rows={2} value={form.quality_observations} onChange={e => setForm({ ...form, quality_observations: e.target.value })}
                  placeholder="Any quality concerns..." style={{ fontSize: 13 }} />
              </div>
              <div className="form-group mb-16">
                <label>Challenges / Delays</label>
                <textarea rows={2} value={form.challenges} onChange={e => setForm({ ...form, challenges: e.target.value })}
                  placeholder="Any challenges encountered..." style={{ fontSize: 13 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group mb-16">
                <label>Safety Incidents</label>
                <textarea rows={2} value={form.safety_incidents} onChange={e => setForm({ ...form, safety_incidents: e.target.value })}
                  placeholder="Any safety incidents (or 'Nil')..." style={{ fontSize: 13 }} />
              </div>
              <div className="form-group mb-16">
                <label>Visitors to Site</label>
                <textarea rows={2} value={form.visitors} onChange={e => setForm({ ...form, visitors: e.target.value })}
                  placeholder="Names and purpose of visit..." style={{ fontSize: 13 }} />
              </div>
            </div>
          </SectionCard>

          {/* Summary */}
          <SectionCard title="Report Summary" icon="✅">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { icon: '🌤️', label: 'Weather', value: form.weather_conditions },
                { icon: '👷', label: 'Labour', value: totalLabour, color: totalLabour > 0 ? '#10b981' : '#ef4444' },
                { icon: '⛏️', label: 'Activities', value: worksEntries.length },
                { icon: '🚜', label: 'Equipment', value: equipEntries.length },
                { icon: '🧪', label: 'Tests', value: testEntries.length },
                { icon: '🌉', label: 'Structures', value: structEntries.length },
                { icon: '📦', label: 'Materials', value: materialEntries.length },
                { icon: '⚠️', label: 'Issues', value: issueEntries.length, color: issueEntries.length > 0 ? '#ef4444' : '#10b981' },
                { icon: '📋', label: 'Instructions', value: instructionEntries.length },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: 20 }}>{s.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color || 'var(--text)' }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            <button onClick={handleSubmit} disabled={saving || !selectedProject}
              style={{ width: '100%', padding: '14px', fontSize: 16, fontWeight: 800, borderRadius: 'var(--radius)',
                background: saving ? '#93c5fd' : 'var(--accent)', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {saving ? '⏳ Submitting Report...' : '✅ Submit Daily Report'}
            </button>
          </SectionCard>
        </div>
      )}

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
          ← Previous
        </button>
        <span className="text-sm text-muted" style={{ alignSelf: 'center' }}>Step {step} of {STEPS.length}</span>
        {step < STEPS.length ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={step === 1 && !selectedProject}>
            Next →
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !selectedProject}>
            {saving ? 'Submitting...' : '✅ Submit Report'}
          </button>
        )}
      </div>
    </div>
  );
}
