import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

const CATEGORIES = { financial: '💰', technical: '🔧', contractual: '📜', quality: '🧪', safety: '🦺', environmental: '🌿', general: '📋' };
const CAT_COLORS = { financial: '#059669', technical: '#0284c7', contractual: '#8b5cf6', quality: '#e87b35', safety: '#dc2626', environmental: '#16a34a', general: '#64748b' };

const STANDARD_ITEMS = [
  { approval_item: 'IPC Certification', category: 'financial', fidic_clause: 'Cl. 14.6', re_limit: 5000000, pe_limit: 20000000, engineer_limit: null, response_days: 28 },
  { approval_item: 'Variation Order (Minor)', category: 'contractual', fidic_clause: 'Cl. 13.1', re_limit: 1000000, pe_limit: 5000000, engineer_limit: null, response_days: 14 },
  { approval_item: 'Variation Order (Major)', category: 'contractual', fidic_clause: 'Cl. 13.1', re_limit: null, pe_limit: null, engineer_limit: null, response_days: 28 },
  { approval_item: 'Material Source Approval', category: 'quality', fidic_clause: 'Cl. 6.10', re_limit: null, response_days: 14 },
  { approval_item: 'Mix Design Approval', category: 'quality', fidic_clause: 'Cl. 7.2', re_limit: null, response_days: 14 },
  { approval_item: 'Method Statement', category: 'technical', fidic_clause: 'Cl. 4.1', re_limit: null, response_days: 21 },
  { approval_item: 'Programme of Works', category: 'contractual', fidic_clause: 'Cl. 8.3', re_limit: null, pe_limit: null, engineer_limit: null, response_days: 21 },
  { approval_item: 'Key Personnel Replacement', category: 'contractual', fidic_clause: 'Cl. 6.9', re_limit: null, response_days: 14 },
  { approval_item: 'Subcontractor Approval', category: 'contractual', fidic_clause: 'Cl. 4.4', re_limit: null, response_days: 28 },
  { approval_item: 'Extension of Time', category: 'contractual', fidic_clause: 'Cl. 8.4', re_limit: null, pe_limit: null, engineer_limit: null, response_days: 42 },
  { approval_item: 'Cost Claim', category: 'financial', fidic_clause: 'Cl. 20.1', re_limit: null, pe_limit: null, engineer_limit: null, response_days: 42 },
  { approval_item: 'Taking Over Certificate', category: 'contractual', fidic_clause: 'Cl. 10.1', re_limit: null, pe_limit: null, engineer_limit: null, response_days: 28 },
  { approval_item: 'Safety Plan Approval', category: 'safety', fidic_clause: 'Cl. 6.7', re_limit: null, response_days: 14 },
  { approval_item: 'Environmental Permit', category: 'environmental', fidic_clause: 'Cl. 4.18', re_limit: null, response_days: 21 },
  { approval_item: 'Shop Drawings / Design', category: 'technical', fidic_clause: 'Cl. 5.2', re_limit: null, response_days: 21 },
  { approval_item: 'Daywork Rates', category: 'financial', fidic_clause: 'Cl. 13.6', re_limit: 500000, pe_limit: 2000000, response_days: 14 },
];

export default function ApprovalsMatrixPage({ profile, showToast, selectedProject: contextProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(contextProject?.id || '');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filterCat, setFilterCat] = useState('all');

  useEffect(() => { loadProjects(); }, []);
  useEffect(() => { if (selectedProject) loadItems(); }, [selectedProject]);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id, name').order('name');
    setProjects(data || []);
  }

  async function loadItems() {
    setLoading(true);
    const { data } = await supabase.from('approvals_matrix')
      .select('*').eq('project_id', selectedProject).order('category').order('approval_item');
    setItems(data || []);
    setLoading(false);
  }

  async function seedStandard() {
    if (items.length > 0 && !window.confirm('This will add standard items not already present. Continue?')) return;
    const existing = new Set(items.map(i => i.approval_item));
    const toAdd = STANDARD_ITEMS.filter(s => !existing.has(s.approval_item)).map(s => ({
      ...s, project_id: selectedProject,
    }));
    if (toAdd.length === 0) { showToast?.('All standard items already exist'); return; }
    const { error } = await supabase.from('approvals_matrix').insert(toAdd);
    if (error) { showToast?.('Error: ' + error.message); return; }
    showToast?.(`✅ Added ${toAdd.length} standard approval items`);
    loadItems();
  }

  async function saveItem(formData) {
    const payload = { ...formData, project_id: selectedProject };
    ['inspector_limit', 're_limit', 'pe_limit', 'engineer_limit'].forEach(k => {
      payload[k] = payload[k] ? parseFloat(payload[k]) : null;
    });
    payload.response_days = parseInt(payload.response_days) || 14;

    let error;
    if (editItem?.id) {
      ({ error } = await supabase.from('approvals_matrix').update(payload).eq('id', editItem.id));
    } else {
      ({ error } = await supabase.from('approvals_matrix').insert(payload));
    }
    if (error) { showToast?.('Error: ' + error.message); return; }
    showToast?.(`✅ ${editItem?.id ? 'Updated' : 'Added'}`);
    setShowEditor(false);
    setEditItem(null);
    loadItems();
  }

  async function deleteItem(id) {
    if (!window.confirm('Delete this approval item?')) return;
    await supabase.from('approvals_matrix').delete().eq('id', id);
    loadItems();
  }

  const fmtLimit = v => v ? `KES ${Number(v).toLocaleString()}` : '—';
  const filtered = filterCat === 'all' ? items : items.filter(i => i.category === filterCat);

  const emptyItem = {
    approval_item: '', category: 'general', fidic_clause: '',
    inspector_limit: '', re_limit: '', pe_limit: '', engineer_limit: '',
    response_days: 14, notes: '',
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>✅ Approvals Matrix</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>FIDIC approval thresholds and authority levels</p>
        </div>
        {selectedProject && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={seedStandard} style={{ fontSize: 11 }}>⚡ Seed Standard Items</button>
            <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowEditor(true); }} style={{ fontSize: 11 }}>+ Add Item</button>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 14 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="select">
          <option value="">Select Project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && !loading && (
        <>
          {/* Category Filter */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setFilterCat('all')} style={{
              padding: '5px 12px', fontSize: 10, fontWeight: 700, border: '1px solid var(--border)',
              borderRadius: 4, cursor: 'pointer',
              background: filterCat === 'all' ? 'var(--accent)' : 'var(--bg-card)',
              color: filterCat === 'all' ? '#fff' : 'var(--text-muted)',
            }}>All ({items.length})</button>
            {Object.entries(CATEGORIES).map(([k, icon]) => {
              const count = items.filter(i => i.category === k).length;
              return (
                <button key={k} onClick={() => setFilterCat(k)} style={{
                  padding: '5px 12px', fontSize: 10, fontWeight: 700, border: '1px solid var(--border)',
                  borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize',
                  background: filterCat === k ? CAT_COLORS[k] : 'var(--bg-card)',
                  color: filterCat === k ? '#fff' : 'var(--text-muted)',
                }}>{icon} {k} ({count})</button>
              );
            })}
          </div>

          {/* Matrix Table */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>No approval items</div>
                <div style={{ fontSize: 11, marginTop: 6 }}>Click "⚡ Seed Standard Items" to populate with FIDIC-standard approvals</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>{['Category', 'Approval Item', 'FIDIC', 'Inspector', 'RE', 'PE', 'Engineer', 'Days', ''].map((h, i) => (
                      <th key={i} style={{ background: 'var(--accent)', color: '#fff', padding: '6px 8px', textAlign: i >= 3 && i <= 6 ? 'center' : 'left', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filtered.map((item, ri) => (
                      <tr key={item.id} style={{ background: ri % 2 ? 'var(--bg-hover)' : 'transparent' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ background: CAT_COLORS[item.category] + '20', color: CAT_COLORS[item.category], padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>
                            {CATEGORIES[item.category]} {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '6px 8px', fontWeight: 600 }}>{item.approval_item}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 10 }}>{item.fidic_clause || '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, background: item.inspector_limit ? '#059669' + '15' : 'transparent' }}>{fmtLimit(item.inspector_limit)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, background: item.re_limit ? '#0284c7' + '15' : 'transparent' }}>{fmtLimit(item.re_limit)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, background: item.pe_limit ? '#8b5cf6' + '15' : 'transparent' }}>{fmtLimit(item.pe_limit)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: 10, background: item.engineer_limit ? '#e87b35' + '15' : 'transparent' }}>{fmtLimit(item.engineer_limit)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>{item.response_days}d</td>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                          <button onClick={() => { setEditItem(item); setShowEditor(true); }} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                          <button onClick={() => deleteItem(item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>🗑</button>
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

      {!selectedProject && (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Approvals Matrix</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Select a project to view or configure approval thresholds</div>
        </div>
      )}

      {/* EDITOR MODAL */}
      {showEditor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => { setShowEditor(false); setEditItem(null); }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24, width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>{editItem?.id ? '✏️ Edit' : '+ Add'} Approval Item</h3>
            <ApprovalForm initial={editItem || emptyItem} onSave={saveItem} onCancel={() => { setShowEditor(false); setEditItem(null); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm({ ...form, [k]: v });
  const fs = { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-card)' };
  const ls = { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 3, display: 'block' };
  const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 };

  return (
    <div>
      <div style={{ marginBottom: 10 }}><label style={ls}>Approval Item *</label><input value={form.approval_item} onChange={e => set('approval_item', e.target.value)} style={fs} placeholder="e.g. Material Source Approval" /></div>
      <div style={row}>
        <div><label style={ls}>Category</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} style={fs}>
            {Object.entries(CATEGORIES).map(([k, icon]) => <option key={k} value={k}>{icon} {k}</option>)}
          </select>
        </div>
        <div><label style={ls}>FIDIC Clause</label><input value={form.fidic_clause || ''} onChange={e => set('fidic_clause', e.target.value)} style={fs} placeholder="e.g. Cl. 14.6" /></div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 4 }}>Authority Limits (KES) — leave blank for "Engineer's decision"</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div><label style={ls}>Inspector</label><input type="number" value={form.inspector_limit || ''} onChange={e => set('inspector_limit', e.target.value)} style={fs} /></div>
        <div><label style={ls}>RE</label><input type="number" value={form.re_limit || ''} onChange={e => set('re_limit', e.target.value)} style={fs} /></div>
        <div><label style={ls}>PE</label><input type="number" value={form.pe_limit || ''} onChange={e => set('pe_limit', e.target.value)} style={fs} /></div>
        <div><label style={ls}>Engineer</label><input type="number" value={form.engineer_limit || ''} onChange={e => set('engineer_limit', e.target.value)} style={fs} /></div>
      </div>
      <div style={row}>
        <div><label style={ls}>Response Days</label><input type="number" value={form.response_days || 14} onChange={e => set('response_days', e.target.value)} style={fs} /></div>
        <div />
      </div>
      <div style={{ marginBottom: 14 }}><label style={ls}>Notes</label><textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} style={{ ...fs, height: 50, resize: 'vertical' }} /></div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => { if (form.approval_item) onSave(form); }}>💾 {initial?.id ? 'Update' : 'Add'}</button>
      </div>
    </div>
  );
}
