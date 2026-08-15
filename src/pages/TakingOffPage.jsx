import React, { useState, useEffect, useMemo } from 'react';
import { supabase, hasRole } from '../lib/supabase';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const STATUS_CONFIG = {
  submitted: { label: 'Submitted', color: '#6366f1', bg: '#6366f120' },
  verified: { label: 'Verified', color: '#0891b2', bg: '#0891b220' },
  agreed: { label: 'Agreed', color: '#059669', bg: '#05966920' },
  disputed: { label: 'Disputed', color: '#ef4444', bg: '#ef444420' },
};

export default function TakingOffPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
  const [boqItems, setBoqItems] = useState([]);
  const [boqSections, setBoqSections] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [filterBill, setFilterBill] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const canManage = hasRole(profile?.role, 'resident_engineer') || profile?.is_platform_admin;

  const emptyForm = {
    boq_item_id: '', entry_date: new Date().toISOString().split('T')[0],
    location_description: '', start_chainage: '', end_chainage: '', side: 'Both',
    contractor_qty: '', engineer_qty: '', agreed_qty: '',
    unit: '', status: 'submitted', contractor_notes: '', engineer_notes: '', re_notes: '',
  };
  const [form, setForm] = useState({ ...emptyForm });
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => {
    if (selectedProject) loadData();
  }, [selectedProject]);

  async function loadData() {
    setLoading(true);
    const [entriesRes, boqRes, secRes] = await Promise.all([
      supabase.from('taking_off_entries').select('*').eq('project_id', selectedProject).order('entry_date', { ascending: false }),
      supabase.from('boq_items').select('*, section:section_id(section_no, section_title)').eq('project_id', selectedProject).order('sort_order'),
      supabase.from('boq_sections').select('*').eq('project_id', selectedProject).order('sort_order'),
    ]);
    setEntries(entriesRes.data || []);
    setBoqItems(boqRes.data || []);
    setBoqSections(secRes.data || []);
    setLoading(false);
  }

  async function saveEntry(e) {
    e?.preventDefault();
    if (!form.boq_item_id) { showToast('Select a BoQ item', 'error'); return; }

    const payload = {
      project_id: selectedProject,
      boq_item_id: form.boq_item_id,
      entry_date: form.entry_date,
      location_description: form.location_description || null,
      start_chainage: form.start_chainage ? parseFloat(form.start_chainage) : null,
      end_chainage: form.end_chainage ? parseFloat(form.end_chainage) : null,
      side: form.side || 'Both',
      contractor_qty: parseFloat(form.contractor_qty) || 0,
      engineer_qty: parseFloat(form.engineer_qty) || 0,
      agreed_qty: form.agreed_qty !== '' ? parseFloat(form.agreed_qty) : null,
      unit: form.unit || null,
      status: form.status || 'submitted',
      contractor_notes: form.contractor_notes || null,
      engineer_notes: form.engineer_notes || null,
      re_notes: form.re_notes || null,
      submitted_by: profile?.id,
    };

    if (form.status === 'verified') payload.verified_by = profile?.id;
    if (form.status === 'agreed') payload.agreed_by = profile?.id;

    let error;
    if (editEntry?.id) {
      ({ error } = await supabase.from('taking_off_entries').update(payload).eq('id', editEntry.id));
    } else {
      ({ error } = await supabase.from('taking_off_entries').insert(payload));
    }
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast(editEntry?.id ? '✅ Entry updated' : '✅ Entry added');
    setShowForm(false);
    setEditEntry(null);
    setForm({ ...emptyForm });
    loadData();
  }

  async function deleteEntry(id) {
    if (!window.confirm('Delete this measurement entry?')) return;
    const { error } = await supabase.from('taking_off_entries').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('🗑️ Deleted');
    loadData();
  }

  async function harmonise(id, agreedQty) {
    const { error } = await supabase.from('taking_off_entries').update({
      agreed_qty: parseFloat(agreedQty),
      status: 'agreed',
      agreed_by: profile?.id,
    }).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    showToast('✅ Harmonised');
    loadData();
  }

  // Stats
  const stats = useMemo(() => {
    const total = entries.length;
    const submitted = entries.filter(e => e.status === 'submitted').length;
    const verified = entries.filter(e => e.status === 'verified').length;
    const agreed = entries.filter(e => e.status === 'agreed').length;
    const disputed = entries.filter(e => e.status === 'disputed').length;
    const totalContractor = entries.reduce((s, e) => s + (e.contractor_qty || 0), 0);
    const totalEngineer = entries.reduce((s, e) => s + (e.engineer_qty || 0), 0);
    const totalAgreed = entries.filter(e => e.agreed_qty != null).reduce((s, e) => s + (e.agreed_qty || 0), 0);
    return { total, submitted, verified, agreed, disputed, totalContractor, totalEngineer, totalAgreed };
  }, [entries]);

  // Filter entries
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false;
      if (filterBill !== 'all') {
        const boq = boqItems.find(b => b.id === e.boq_item_id);
        if (!boq || boq.section_id !== filterBill) return false;
      }
      if (searchQuery) {
        const boq = boqItems.find(b => b.id === e.boq_item_id);
        const searchStr = `${boq?.item_no || ''} ${boq?.description || ''} ${e.location_description || ''}`.toLowerCase();
        if (!searchStr.includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [entries, filterStatus, filterBill, searchQuery, boqItems]);

  // Group BoQ items by section for the dropdown
  const groupedBoQ = useMemo(() => {
    const groups = {};
    boqItems.forEach(item => {
      const secKey = item.section?.section_no || 'Other';
      if (!groups[secKey]) groups[secKey] = { label: item.section ? `${item.section.section_no}: ${item.section.section_title}` : 'Other', items: [] };
      groups[secKey].items.push(item);
    });
    return groups;
  }, [boqItems]);

  const fmt = (n) => n != null ? Number(n).toLocaleString() : '—';

  const fs = { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-card)' };
  const ls = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3, display: 'block' };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📐 Taking Off Sheet</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Dual measurement · Contractor vs Engineer · RE harmonisation</p>
        </div>
        {selectedProject && (
          <button className="btn btn-primary" onClick={() => { setEditEntry(null); setForm({ ...emptyForm }); setShowForm(true); }}>
            + New Measurement
          </button>
        )}
      </div>

      {/* Project Selector */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="select" style={{ fontSize: 14 }}>
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && !loading && entries.length > 0 && (
        <>
          {/* ══════ KPI Cards ══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Total entries', value: stats.total, color: '#3b82f6', icon: '📐' },
              { label: 'Submitted', value: stats.submitted, color: '#6366f1', icon: '📝' },
              { label: 'Verified', value: stats.verified, color: '#0891b2', icon: '🔍' },
              { label: 'Agreed', value: stats.agreed, color: '#059669', icon: '✅' },
              { label: 'Disputed', value: stats.disputed, color: '#ef4444', icon: '⚠️' },
            ].map((kpi, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '14px 16px', position: 'relative', overflow: 'hidden',
                transition: 'all 0.3s', cursor: 'default',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${kpi.color}20`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, ${kpi.color}66)` }} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{kpi.icon} {kpi.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* ══════ Quantity Comparison ══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#e87b35', fontWeight: 600 }}>🏗️ Contractor total</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: '#e87b35', marginTop: 6 }}>{fmt(stats.totalContractor)}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>👷 Engineer total</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: '#059669', marginTop: 6 }}>{fmt(stats.totalEngineer)}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>✅ Agreed total</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: '#3b82f6', marginTop: 6 }}>{fmt(stats.totalAgreed)}</div>
            </div>
          </div>

          {/* ══════ Filters ══════ */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filterBill} onChange={e => setFilterBill(e.target.value)} style={{ ...fs, width: 200 }}>
              <option value="all">All bills</option>
              {boqSections.map(s => <option key={s.id} value={s.id}>{s.section_no}: {s.section_title}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...fs, width: 140 }}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="text" placeholder="🔍 Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...fs, width: 200 }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{filtered.length} entries</span>
          </div>

          {/* ══════ Entries Table ══════ */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    {['Date', 'BoQ Item', 'Location', 'Contractor', 'Engineer', 'Agreed', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 10px', textAlign: h === 'Contractor' || h === 'Engineer' || h === 'Agreed' ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, i) => {
                    const boq = boqItems.find(b => b.id === entry.boq_item_id);
                    const diff = entry.contractor_qty && entry.engineer_qty ? Math.abs(entry.contractor_qty - entry.engineer_qty) : 0;
                    const hasDiff = diff > 0;
                    const st = STATUS_CONFIG[entry.status] || STATUS_CONFIG.submitted;
                    return (
                      <tr key={entry.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: 500 }}>{entry.entry_date}</td>
                        <td style={{ padding: '10px', maxWidth: 220 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{boq?.item_no || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{boq?.description?.substring(0, 60) || '—'}</div>
                        </td>
                        <td style={{ padding: '10px', fontSize: 11 }}>
                          {entry.start_chainage ? `Ch. ${entry.start_chainage} – ${entry.end_chainage}` : entry.location_description || '—'}
                          {entry.side !== 'Both' && <span style={{ color: 'var(--text-muted)' }}> ({entry.side})</span>}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#e87b35' }}>{fmt(entry.contractor_qty)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#059669' }}>{fmt(entry.engineer_qty)}</td>
                        <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: entry.agreed_qty != null ? '#3b82f6' : 'var(--text-muted)' }}>
                          {entry.agreed_qty != null ? fmt(entry.agreed_qty) : '—'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600 }}>{st.label}</span>
                          {hasDiff && entry.status !== 'agreed' && (
                            <div style={{ fontSize: 9, color: '#ef4444', marginTop: 3 }}>Δ {fmt(diff)} {entry.unit}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => { setEditEntry(entry); setForm({ ...entry, contractor_qty: entry.contractor_qty || '', engineer_qty: entry.engineer_qty || '', agreed_qty: entry.agreed_qty ?? '' }); setShowForm(true); }}
                              style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-hover)', cursor: 'pointer', color: 'var(--accent)' }}>Edit</button>
                            {entry.status !== 'agreed' && canManage && entry.contractor_qty > 0 && entry.engineer_qty > 0 && (
                              <button onClick={() => {
                                const qty = prompt('Enter agreed quantity:', entry.engineer_qty);
                                if (qty !== null) harmonise(entry.id, qty);
                              }}
                                style={{ padding: '3px 8px', fontSize: 10, fontWeight: 600, border: 'none', borderRadius: 4, background: '#059669', cursor: 'pointer', color: '#fff' }}>Harmonise</button>
                            )}
                            <button onClick={() => deleteEntry(entry.id)}
                              style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, border: 'none', borderRadius: 4, background: '#ef4444', cursor: 'pointer', color: '#fff' }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                {entries.length === 0 ? 'No measurements yet — click "+ New Measurement" to start' : 'No entries match your filters'}
              </div>
            )}
          </div>
        </>
      )}

      {selectedProject && !loading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>📐</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>No measurements yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, marginBottom: 16 }}>Start recording Contractor and Engineer measurements against BoQ items</div>
          <button className="btn btn-primary" onClick={() => { setEditEntry(null); setForm({ ...emptyForm }); setShowForm(true); }}>+ New Measurement</button>
        </div>
      )}

      {!selectedProject && (
        <div style={{ textAlign: 'center', padding: 60, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>📐</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Taking Off Sheet</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Select a project to view and record measurements</div>
        </div>
      )}

      {/* ══════ MEASUREMENT FORM MODAL ══════ */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { setShowForm(false); setEditEntry(null); }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{editEntry?.id ? '✏️ Edit' : '📐 New'} Measurement</h3>

            {/* BoQ Item Selector — grouped by bill */}
            <div style={{ marginBottom: 12 }}>
              <label style={ls}>BoQ item *</label>
              <select value={form.boq_item_id} onChange={e => {
                const item = boqItems.find(b => b.id === e.target.value);
                set('boq_item_id', e.target.value);
                if (item) set('unit', item.unit);
              }} style={{ ...fs, fontSize: 13 }}>
                <option value="">— Select BoQ item —</option>
                {Object.entries(groupedBoQ).map(([secKey, group]) => (
                  <optgroup key={secKey} label={group.label}>
                    {group.items.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.item_no} — {item.description?.substring(0, 70)}{item.description?.length > 70 ? '...' : ''} ({item.unit})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {form.boq_item_id && (() => {
                const item = boqItems.find(b => b.id === form.boq_item_id);
                if (!item) return null;
                return (
                  <div style={{ marginTop: 6, padding: 10, background: 'var(--bg-hover)', borderRadius: 6, fontSize: 11 }}>
                    <div style={{ fontWeight: 600 }}>{item.item_no}: {item.description}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                      BoQ: {fmt(item.boq_quantity)} {item.unit} · Rate: KES {fmt(item.rate)} · Amount: KES {fmt(item.boq_amount)}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Date + Location */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={ls}>Date *</label><input type="date" value={form.entry_date} onChange={e => set('entry_date', e.target.value)} style={fs} /></div>
              <div><label style={ls}>Side</label>
                <select value={form.side} onChange={e => set('side', e.target.value)} style={fs}>
                  <option value="Both">Both</option><option value="LHS">LHS</option><option value="RHS">RHS</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={ls}>Chainage from</label><input type="text" placeholder="e.g. 12+000" value={form.start_chainage || ''} onChange={e => set('start_chainage', e.target.value)} style={fs} /></div>
              <div><label style={ls}>Chainage to</label><input type="text" placeholder="e.g. 12+800" value={form.end_chainage || ''} onChange={e => set('end_chainage', e.target.value)} style={fs} /></div>
              <div><label style={ls}>Location note</label><input type="text" placeholder="e.g. Near river crossing" value={form.location_description || ''} onChange={e => set('location_description', e.target.value)} style={fs} /></div>
            </div>

            {/* Dual Measurement */}
            <div style={{ marginBottom: 12, padding: 14, background: 'var(--bg-hover)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Measured quantities ({form.unit || boqItems.find(b => b.id === form.boq_item_id)?.unit || 'units'})</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ ...ls, color: '#e87b35' }}>🏗️ Contractor qty</label>
                  <input type="number" step="0.01" value={form.contractor_qty} onChange={e => set('contractor_qty', e.target.value)}
                    style={{ ...fs, borderColor: '#e87b35', fontWeight: 600 }} placeholder="0" />
                  <textarea placeholder="Contractor notes..." value={form.contractor_notes || ''} onChange={e => set('contractor_notes', e.target.value)}
                    style={{ ...fs, marginTop: 6, height: 50, resize: 'vertical', fontSize: 11 }} />
                </div>
                <div>
                  <label style={{ ...ls, color: '#059669' }}>👷 Engineer qty</label>
                  <input type="number" step="0.01" value={form.engineer_qty} onChange={e => set('engineer_qty', e.target.value)}
                    style={{ ...fs, borderColor: '#059669', fontWeight: 600 }} placeholder="0" />
                  <textarea placeholder="Engineer notes..." value={form.engineer_notes || ''} onChange={e => set('engineer_notes', e.target.value)}
                    style={{ ...fs, marginTop: 6, height: 50, resize: 'vertical', fontSize: 11 }} />
                </div>
                <div>
                  <label style={{ ...ls, color: '#3b82f6' }}>✅ Agreed qty</label>
                  <input type="number" step="0.01" value={form.agreed_qty} onChange={e => set('agreed_qty', e.target.value)}
                    style={{ ...fs, borderColor: '#3b82f6', fontWeight: 700 }} placeholder="—" />
                  <textarea placeholder="RE notes..." value={form.re_notes || ''} onChange={e => set('re_notes', e.target.value)}
                    style={{ ...fs, marginTop: 6, height: 50, resize: 'vertical', fontSize: 11 }} />
                </div>
              </div>
              {form.contractor_qty && form.engineer_qty && parseFloat(form.contractor_qty) !== parseFloat(form.engineer_qty) && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                  ⚠️ Difference: {Math.abs(parseFloat(form.contractor_qty) - parseFloat(form.engineer_qty)).toLocaleString()} {form.unit}
                </div>
              )}
            </div>

            {/* Status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={ls}>Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} style={fs}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label style={ls}>Unit</label>
                <input type="text" value={form.unit || ''} onChange={e => set('unit', e.target.value)} style={fs} placeholder="Auto from BoQ" />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {editEntry?.id ? (
                <button onClick={() => { deleteEntry(editEntry.id); setShowForm(false); setEditEntry(null); }}
                  style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 6, background: '#ef4444', color: '#fff', cursor: 'pointer' }}>
                  🗑️ Delete
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditEntry(null); }}>Cancel</button>
                <button className="btn btn-primary" onClick={saveEntry}>💾 {editEntry?.id ? 'Update' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
