import React, { useState, useEffect, useMemo } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const PARTIES = {
  client: '🏛️ Client',
  engineer: '📐 Engineer',
  project_manager: '👔 Project Manager',
  engineer_rep: '👷 Engineer Representative',
  contractor: '🏗️ Contractor',
};
const PARTY_COLORS = {
  client: '#2563eb',
  engineer: '#6366f1',
  project_manager: '#0891b2',
  engineer_rep: '#059669',
  contractor: '#e87b35',
};
const STATUS_COLORS = { active: '#059669', replaced: '#6366f1', demobilised: '#64748b', absent: '#dc2626' };
const CONSENT_COLORS = { 'n/a': '#64748b', pending: '#f59e0b', consented: '#059669', rejected: '#dc2626' };

const COMMON_POSITIONS = {
  client: [
    'Director General','Deputy Director General','Director of Roads',
    'Regional Manager','Project Coordinator','Procurement Officer',
    'Project Accountant','Environmental Officer (Client)',
  ],
  engineer: [
    'Team Leader / Principal Engineer','Deputy Team Leader',
    'Highway / Pavement Engineer','Structural Engineer',
    'Claims / Contract Specialist','Quantity Surveyor (HQ)',
    'Bridge Engineer','Geotechnical Engineer',
  ],
  project_manager: [
    'Project Manager','Deputy Project Manager','Project Engineer',
    'Assistant Project Engineer','Project Accountant',
  ],
  engineer_rep: [
    'Resident Engineer (RE)','Assistant Resident Engineer',
    'Inspector of Works (Roads)','Inspector of Works (Structures)',
    'Materials / Geotechnical Engineer','Surveyor','Quantity Surveyor',
    'Environmental Specialist','Social / RAP Specialist',
    'Road Safety Specialist','Laboratory Technician',
    'Survey Assistant / Chainman','Office Administrator',
  ],
  contractor: [
    'Site Agent / Construction Manager','Deputy Site Agent',
    'Project Manager (Contractor)','General Foreman',
    'Materials Engineer','Chief Surveyor','Plant Manager',
    'Quality Assurance / QC Manager','Safety / OHS Officer',
    'Environmental Officer','Camp Manager / Admin',
    'Quantity Surveyor','Accountant / Finance Officer',
    'Laboratory Technician','Store Keeper','Section Engineer',
  ],
};

export default function KeyPersonnelPage({ profile, showToast, selectedProject: contextProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(contextProject?.id || '');
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [showAttendance, setShowAttendance] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState({});

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (selectedProject) loadPersonnel(); }, [selectedProject]);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id, name').order('name');
    setProjects(data || []);
  }

  async function loadPersonnel() {
    setLoading(true);
    const { data } = await supabase.from('key_personnel')
      .select('*')
      .eq('project_id', selectedProject)
      .order('party').order('position_title');
    setPersonnel(data || []);
    setLoading(false);
  }

  async function savePersonnel(formData) {
    const payload = { ...formData, project_id: selectedProject };
    ['replacement_for','date_mobilised','date_demobilised','replacement_consent_date'].forEach(k => {
      if (!payload[k]) payload[k] = null;
    });

    let error;
    if (editItem?.id) {
      ({ error } = await supabase.from('key_personnel').update(payload).eq('id', editItem.id));
    } else {
      ({ error } = await supabase.from('key_personnel').insert(payload));
    }
    if (error) { showToast?.('Error: ' + error.message); return; }
    showToast?.(`✅ Personnel ${editItem?.id ? 'updated' : 'added'}`);
    setShowEditor(false);
    setEditItem(null);
    loadPersonnel();
  }

  async function deletePersonnel(id) {
    if (!window.confirm('Remove this personnel record?')) return;
    // Delete related attendance records first
    await supabase.from('personnel_attendance').delete().eq('personnel_id', id);
    const { error } = await supabase.from('key_personnel').delete().eq('id', id);
    if (error) {
      showToast?.('❌ Delete failed: ' + error.message);
      console.error('Delete error:', error);
      return;
    }
    showToast?.('🗑️ Removed');
    loadPersonnel();
  }

  async function updateConsent(id, status) {
    await supabase.from('key_personnel').update({
      replacement_consent_status: status,
      replacement_consent_date: status === 'consented' ? new Date().toISOString().split('T')[0] : null,
    }).eq('id', id);
    showToast?.(`✅ Consent ${status}`);
    loadPersonnel();
  }

  // Attendance
  async function loadAttendance() {
    const { data } = await supabase.from('personnel_attendance')
      .select('*')
      .eq('project_id', selectedProject)
      .eq('attendance_date', attendanceDate);
    const map = {};
    (data || []).forEach(a => { map[a.personnel_id] = a; });
    setAttendance(map);
  }

  async function toggleAttendance(personnelId, present) {
    const existing = attendance[personnelId];
    if (existing) {
      await supabase.from('personnel_attendance').update({ is_present: present }).eq('id', existing.id);
    } else {
      await supabase.from('personnel_attendance').insert({
        project_id: selectedProject,
        personnel_id: personnelId,
        attendance_date: attendanceDate,
        is_present: present,
        recorded_by: profile?.id,
      });
    }
    loadAttendance();
  }

  useEffect(() => { if (showAttendance && selectedProject) loadAttendance(); }, [showAttendance, attendanceDate]);

  // Stats
  const stats = useMemo(() => {
    const active = personnel.filter(p => p.status === 'active');
    const byParty = {};
    Object.keys(PARTIES).forEach(p => { byParty[p] = active.filter(x => x.party === p).length; });
    const pendingConsent = personnel.filter(p => p.replacement_consent_status === 'pending').length;
    const onSite = active.filter(p => p.is_on_site).length;
    return { total: personnel.length, active: active.length, byParty, pendingConsent, onSite };
  }, [personnel]);

  const filtered = activeTab === 'all' ? personnel : personnel.filter(p => p.party === activeTab);

  const emptyItem = {
    name: '', party: 'contractor', position_title: '', qualifications: '',
    years_experience: '', nationality: 'Kenyan', id_number: '', phone: '', email: '',
    date_mobilised: '', is_on_site: true, status: 'active',
    replacement_consent_status: 'n/a', fidic_clause: 'Cl. 6.9', notes: '',
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>👥 Key Personnel</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Client · Engineer · Project Manager · Engineer Rep · Contractor · FIDIC Cl. 6.9</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectedProject && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowAttendance(!showAttendance)} style={{ fontSize: 11 }}>
                {showAttendance ? '📋 Personnel List' : '📅 Daily Attendance'}
              </button>
              <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowEditor(true); }} style={{ fontSize: 11 }}>
                + Add Personnel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Project Selector */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="select">
          <option value="">Select Project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && !loading && (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 14 }}>
            <KPI icon="👥" label="Total" value={stats.total} color="#e87b35" />
            <KPI icon="🏛️" label="Client" value={stats.byParty.client || 0} color={PARTY_COLORS.client} />
            <KPI icon="📐" label="Engineer" value={stats.byParty.engineer || 0} color={PARTY_COLORS.engineer} />
            <KPI icon="👔" label="Project Mgr" value={stats.byParty.project_manager || 0} color={PARTY_COLORS.project_manager} />
            <KPI icon="👷" label="Eng. Rep" value={stats.byParty.engineer_rep || 0} color={PARTY_COLORS.engineer_rep} />
            <KPI icon="🏗️" label="Contractor" value={stats.byParty.contractor || 0} color={PARTY_COLORS.contractor} />
            <KPI icon="✅" label="On Site" value={stats.onSite} color="#059669" />
            <KPI icon="⏳" label="Pending" value={stats.pendingConsent} color={stats.pendingConsent > 0 ? '#f59e0b' : '#059669'} />
          </div>

          {/* Attendance View */}
          {showAttendance ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📅 Daily Attendance</h3>
                <input type="date" value={attendanceDate} onChange={e => setAttendanceDate(e.target.value)} className="select" style={{ width: 160 }} />
              </div>
              {personnel.filter(p => p.status === 'active').map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: PARTY_COLORS[p.party] }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.position_title} · {PARTIES[p.party]}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => toggleAttendance(p.id, true)} style={{
                      padding: '4px 12px', fontSize: 10, fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: attendance[p.id]?.is_present === true ? '#059669' : 'var(--bg-hover)',
                      color: attendance[p.id]?.is_present === true ? '#fff' : 'var(--text-muted)',
                    }}>Present</button>
                    <button onClick={() => toggleAttendance(p.id, false)} style={{
                      padding: '4px 12px', fontSize: 10, fontWeight: 700, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: attendance[p.id]?.is_present === false ? '#dc2626' : 'var(--bg-hover)',
                      color: attendance[p.id]?.is_present === false ? '#fff' : 'var(--text-muted)',
                    }}>Absent</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {/* Party Filter Tabs */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 14, overflowX: 'auto', borderBottom: '2px solid var(--border)' }}>
                <TabBtn label="All" count={personnel.length} active={activeTab === 'all'} onClick={() => setActiveTab('all')} />
                {Object.entries(PARTIES).map(([key, label]) => (
                  <TabBtn key={key} label={label} count={personnel.filter(p => p.party === key).length} active={activeTab === key} onClick={() => setActiveTab(key)} />
                ))}
              </div>

              {/* Personnel Table */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                {filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>No personnel records yet</div>
                    <div style={{ fontSize: 11, marginTop: 6 }}>Click "+ Add Personnel" to register key staff</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>{['', 'Name', 'Position', 'Party', 'Qualifications', 'Exp', 'On Site', 'Status', 'Consent', 'Actions'].map((h, i) => (
                          <th key={i} style={{ background: 'var(--accent)', color: '#fff', padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {filtered.map((p, ri) => (
                          <tr key={p.id} style={{ background: ri % 2 ? 'var(--bg-hover)' : 'transparent' }}>
                            <td style={{ padding: '6px 8px' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: PARTY_COLORS[p.party] }} />
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                              {p.name}
                              {p.phone && <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{p.phone}</div>}
                            </td>
                            <td style={{ padding: '6px 8px' }}>{p.position_title || '—'}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ background: PARTY_COLORS[p.party] + '20', color: PARTY_COLORS[p.party], padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                                {PARTIES[p.party]}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', fontSize: 10, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.qualifications || '—'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.years_experience || '—'}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>{p.is_on_site ? '✅' : '❌'}</td>
                            <td style={{ padding: '6px 8px' }}>
                              <span style={{ background: STATUS_COLORS[p.status], color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                                {p.status}
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              {p.replacement_consent_status !== 'n/a' ? (
                                <span style={{ background: CONSENT_COLORS[p.replacement_consent_status], color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                                  {p.replacement_consent_status}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <button onClick={() => { setEditItem(p); setShowEditor(true); }}
                                  style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-hover)', cursor: 'pointer', color: 'var(--accent)' }}
                                  title="Edit">✏️ Edit</button>
                                {p.party === 'contractor' && p.replacement_consent_status === 'pending' && hasRole(profile?.role, 'resident_engineer') && (
                                  <>
                                    <button onClick={() => updateConsent(p.id, 'consented')} style={{ padding: '3px 6px', fontSize: 10, border: '1px solid #059669', borderRadius: 4, background: 'rgba(5,150,105,0.1)', cursor: 'pointer', color: '#059669' }} title="Consent">✅</button>
                                    <button onClick={() => updateConsent(p.id, 'rejected')} style={{ padding: '3px 6px', fontSize: 10, border: '1px solid #dc2626', borderRadius: 4, background: 'rgba(220,38,38,0.1)', cursor: 'pointer', color: '#dc2626' }} title="Reject">❌</button>
                                  </>
                                )}
                                <button onClick={() => deletePersonnel(p.id)}
                                  style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, border: 'none', borderRadius: 4, background: '#ef4444', cursor: 'pointer', color: '#fff' }}
                                  title="Delete">🗑️ Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {!selectedProject && (
        <Empty icon="👥" title="Key Personnel" subtitle="Select a project to manage Contractor & Engineer staff" />
      )}

      {/* EDITOR MODAL */}
      {showEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { setShowEditor(false); setEditItem(null); }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 550, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>{editItem?.id ? '✏️ Edit' : '+ Add'} Personnel</h3>
            <PersonnelForm initial={editItem || emptyItem} personnel={personnel} onSave={savePersonnel} onCancel={() => { setShowEditor(false); setEditItem(null); }}
              onDelete={editItem?.id ? () => { deletePersonnel(editItem.id); setShowEditor(false); setEditItem(null); } : null} />
          </div>
        </div>
      )}
    </div>
  );
}

function PersonnelForm({ initial, personnel, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm({ ...form, [k]: v });
  const fs = { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-card)' };
  const ls = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3, display: 'block' };
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 };

  return (
    <div>
      <div style={row}>
        <div><label style={ls}>Full Name *</label><input value={form.name || ''} onChange={e => set('name', e.target.value)} style={fs} placeholder="e.g. John Kamau" /></div>
        <div>
          <label style={ls}>Party *</label>
          <select value={form.party} onChange={e => set('party', e.target.value)} style={fs}>
            {Object.entries(PARTIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div style={row}>
        <div>
          <label style={ls}>Position / Title</label>
          <select value={form.position_title || ''} onChange={e => set('position_title', e.target.value)} style={fs}>
            <option value="">Select or type below...</option>
            {(COMMON_POSITIONS[form.party] || []).map(p => <option key={p}>{p}</option>)}
          </select>
          <input value={form.position_title || ''} onChange={e => set('position_title', e.target.value)} style={{ ...fs, marginTop: 4 }} placeholder="Or type custom position" />
        </div>
        <div><label style={ls}>Nationality</label><input value={form.nationality || ''} onChange={e => set('nationality', e.target.value)} style={fs} /></div>
      </div>
      <div style={{ marginBottom: 10 }}><label style={ls}>Qualifications</label><input value={form.qualifications || ''} onChange={e => set('qualifications', e.target.value)} style={fs} placeholder="e.g. BSc Civil Engineering, KERRA Reg." /></div>
      <div style={row}>
        <div><label style={ls}>Years Experience</label><input type="number" value={form.years_experience || ''} onChange={e => set('years_experience', e.target.value)} style={fs} /></div>
        <div><label style={ls}>ID / Passport No.</label><input value={form.id_number || ''} onChange={e => set('id_number', e.target.value)} style={fs} /></div>
      </div>
      <div style={row}>
        <div><label style={ls}>Phone</label><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} style={fs} placeholder="+254..." /></div>
        <div><label style={ls}>Email</label><input value={form.email || ''} onChange={e => set('email', e.target.value)} style={fs} /></div>
      </div>
      <div style={row}>
        <div><label style={ls}>Date Mobilised</label><input type="date" value={form.date_mobilised || ''} onChange={e => set('date_mobilised', e.target.value)} style={fs} /></div>
        <div><label style={ls}>Date Demobilised</label><input type="date" value={form.date_demobilised || ''} onChange={e => set('date_demobilised', e.target.value)} style={fs} /></div>
      </div>
      <div style={row}>
        <div>
          <label style={ls}>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} style={fs}>
            <option value="active">Active</option><option value="replaced">Replaced</option>
            <option value="demobilised">Demobilised</option><option value="absent">Absent</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 18 }}>
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={form.is_on_site || false} onChange={e => set('is_on_site', e.target.checked)} /> On Site
          </label>
        </div>
      </div>
      {form.party === 'contractor' && (
        <div style={row}>
          <div>
            <label style={ls}>Replacement Consent</label>
            <select value={form.replacement_consent_status} onChange={e => set('replacement_consent_status', e.target.value)} style={fs}>
              <option value="n/a">N/A</option><option value="pending">Pending</option>
              <option value="consented">Consented</option><option value="rejected">Rejected</option>
            </select>
          </div>
          <div><label style={ls}>FIDIC Clause</label><input value={form.fidic_clause || ''} onChange={e => set('fidic_clause', e.target.value)} style={fs} /></div>
        </div>
      )}
      <div style={{ marginBottom: 14 }}><label style={ls}>Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} style={{ ...fs, height: 50, resize: 'vertical' }} /></div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
        {onDelete ? (
          <button onClick={onDelete}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 'var(--radius)',
              background: '#ef4444', color: '#fff', cursor: 'pointer' }}>
            🗑️ Delete Personnel
          </button>
        ) : <div />}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { if (form.name) onSave(form); }}>💾 {initial?.id ? 'Update' : 'Add'}</button>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon, label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function TabBtn({ label, count, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      background: 'transparent', border: 'none',
      borderBottom: active ? '3px solid var(--accent)' : '3px solid transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap',
    }}>{label} ({count})</button>
  );
}

function Empty({ icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <div style={{ fontSize: 50, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ fontSize: 12, marginTop: 8 }}>{subtitle}</div>
    </div>
  );
}
