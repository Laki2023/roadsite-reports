import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';

export default function BoQPage({ profile, showToast }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [sections, setSections] = useState([]);
  const [items, setItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tab, setTab] = useState('items');
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [sectionForm, setSectionForm] = useState({ section_no: '', section_title: '', sort_order: 0 });
  const [itemForm, setItemForm] = useState({ section_id: '', item_no: '', description: '', unit: 'm³', boq_quantity: '', rate: '', payment_type: 'Re-measurement', linked_activity_id: '', notes: '' });
  const [bulkText, setBulkText] = useState('');
  const [bulkSection, setBulkSection] = useState('');
  const [saving, setSaving] = useState(false);
  const canManage = hasRole(profile?.role, 're');

  useEffect(() => { supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects(data || [])); }, []);
  useEffect(() => { if (selectedProject) loadData(); }, [selectedProject]);

  async function loadData() {
    const [secRes, itemRes, actRes] = await Promise.all([
      supabase.from('boq_sections').select('*').eq('project_id', selectedProject).order('sort_order'),
      supabase.from('boq_items').select('*, section:section_id(section_no, section_title), activity:linked_activity_id(activity_name, activity_code)')
        .eq('project_id', selectedProject).order('sort_order'),
      supabase.from('works_activities').select('id, activity_name, activity_code').eq('project_id', selectedProject).order('sort_order'),
    ]);
    setSections(secRes.data || []);
    setItems(itemRes.data || []);
    setActivities(actRes.data || []);
  }

  async function addSection(e) {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('boq_sections').insert({ ...sectionForm, project_id: selectedProject, sort_order: parseInt(sectionForm.sort_order) || 0 });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Section added'); setShowAddSection(false);
    setSectionForm({ section_no: '', section_title: '', sort_order: 0 }); loadData();
  }

  async function addItem(e) {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('boq_items').insert({
      ...itemForm, project_id: selectedProject,
      boq_quantity: parseFloat(itemForm.boq_quantity) || 0,
      rate: parseFloat(itemForm.rate) || 0,
      section_id: itemForm.section_id || null,
      linked_activity_id: itemForm.linked_activity_id || null,
      sort_order: items.length + 1,
    });
    setSaving(false);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Item added'); setShowAddItem(false);
    setItemForm({ section_id: '', item_no: '', description: '', unit: 'm³', boq_quantity: '', rate: '', payment_type: 'Re-measurement', linked_activity_id: '', notes: '' }); loadData();
  }

  async function handleBulkImport(e) {
    e.preventDefault(); setSaving(true);
    try {
      const lines = bulkText.trim().split('\n').filter(l => l.trim());
      let count = 0;
      for (const line of lines) {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length < 4) continue;
        const [item_no, description, unit, qty, rate] = parts;
        if (!item_no || !description) continue;
        await supabase.from('boq_items').insert({
          project_id: selectedProject,
          section_id: bulkSection || null,
          item_no, description,
          unit: unit || 'LS',
          boq_quantity: parseFloat(qty) || 0,
          rate: parseFloat(rate?.replace(/,/g, '')) || 0,
          payment_type: 'Re-measurement',
          sort_order: items.length + count + 1,
        });
        count++;
      }
      showToast(`${count} items imported`);
      setShowBulkImport(false); setBulkText(''); loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally { setSaving(false); }
  }

  async function updateCompletedQty(itemId, qty) {
    await supabase.from('boq_items').update({ completed_quantity: parseFloat(qty) || 0 }).eq('id', itemId);
    loadData();
  }

  async function syncFromActivities() {
    let synced = 0;
    for (const item of items) {
      if (!item.linked_activity_id) continue;
      const { data: act } = await supabase.from('works_activities').select('completed_quantity').eq('id', item.linked_activity_id).single();
      if (act) {
        await supabase.from('boq_items').update({ completed_quantity: act.completed_quantity || 0 }).eq('id', item.id);
        synced++;
      }
    }
    showToast(`${synced} items synced from Works Activities`);
    loadData();
  }

  async function deleteItem(id) {
    await supabase.from('boq_items').delete().eq('id', id);
    showToast('Item removed'); loadData();
  }

  // Financial summaries
  const contractSum = items.reduce((s, i) => s + (i.boq_amount || 0), 0);
  const valueToDate = items.reduce((s, i) => s + (i.value_to_date || 0), 0);
  const remaining = contractSum - valueToDate;
  const overMeasured = items.filter(i => i.completed_quantity > i.boq_quantity && i.boq_quantity > 0);
  const variationItems = items.filter(i => {
    if (!i.boq_quantity || i.boq_quantity === 0) return false;
    const pct = ((i.completed_quantity - i.boq_quantity) / i.boq_quantity) * 100;
    return Math.abs(pct) > 25;
  });

  // Group items by section
  const grouped = {};
  const unsectioned = [];
  items.forEach(i => {
    if (i.section_id && i.section) {
      const key = i.section_id;
      if (!grouped[key]) grouped[key] = { section: i.section, items: [] };
      grouped[key].items.push(i);
    } else {
      unsectioned.push(i);
    }
  });

  const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  return (
    <div>
      <div className="page-header">
        <div><h2>📋 Bill of Quantities</h2><div className="subtitle">Contract items, valuation & financial progress</div></div>
        {selectedProject && canManage && (
          <div className="btn-group">
            <button className="btn btn-primary" onClick={() => setShowAddItem(true)}>+ Add Item</button>
            <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>📥 Bulk Import</button>
          </div>
        )}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {selectedProject && items.length > 0 && (
        <>
          {/* Financial Summary */}
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-label">Contract Sum</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{fmt(contractSum)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Value to Date</div>
              <div className="stat-value text-accent" style={{ fontSize: 16 }}>{fmt(valueToDate)}</div>
              <div className="progress-bar mt-16" style={{ height: 6 }}>
                <div className="fill green" style={{ width: `${contractSum > 0 ? (valueToDate / contractSum) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Remaining</div>
              <div className="stat-value" style={{ fontSize: 16 }}>{fmt(remaining)}</div>
            </div>
            <div className="stat-card" style={{ borderColor: variationItems.length > 0 ? 'var(--danger)' : 'var(--border)' }}>
              <div className="stat-label">Variation Flags (±25%)</div>
              <div className="stat-value" style={{ color: variationItems.length > 0 ? 'var(--danger)' : 'inherit' }}>{variationItems.length}</div>
            </div>
          </div>

          <div className="tabs">
            <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>BoQ Items ({items.length})</button>
            <button className={tab === 'sections' ? 'active' : ''} onClick={() => setTab('sections')}>Sections ({sections.length})</button>
            <button className={tab === 'variations' ? 'active' : ''} onClick={() => setTab('variations')}>Variations ({variationItems.length})</button>
            <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Summary</button>
          </div>

          {tab === 'items' && (
            <div>
              {canManage && items.some(i => i.linked_activity_id) && (
                <div style={{ marginBottom: 12 }}>
                  <button className="btn btn-sm btn-secondary" onClick={syncFromActivities}>🔄 Sync Quantities from Works Activities</button>
                </div>
              )}
              {Object.entries(grouped).map(([secId, { section, items: secItems }]) => (
                <div key={secId} className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header">
                    <h3>{section.section_no}: {section.section_title}</h3>
                    <span className="text-mono text-sm">{fmt(secItems.reduce((s, i) => s + (i.boq_amount || 0), 0))}</span>
                  </div>
                  {renderItemsTable(secItems)}
                </div>
              ))}
              {unsectioned.length > 0 && (
                <div className="card">
                  <div className="card-header"><h3>Unsectioned Items</h3></div>
                  {renderItemsTable(unsectioned)}
                </div>
              )}
            </div>
          )}

          {tab === 'sections' && (
            <div>
              {canManage && (
                <button className="btn btn-primary btn-sm mb-16" onClick={() => setShowAddSection(true)}>+ Add Section</button>
              )}
              <div className="table-wrap">
                <table>
                  <thead><tr><th>No.</th><th>Title</th><th>Items</th><th>BoQ Amount</th><th>Value to Date</th></tr></thead>
                  <tbody>
                    {sections.map(s => {
                      const secItems = items.filter(i => i.section_id === s.id);
                      return (
                        <tr key={s.id}>
                          <td className="text-mono" style={{ fontWeight: 600 }}>{s.section_no}</td>
                          <td style={{ fontWeight: 500 }}>{s.section_title}</td>
                          <td>{secItems.length}</td>
                          <td className="text-mono">{fmt(secItems.reduce((sum, i) => sum + (i.boq_amount || 0), 0))}</td>
                          <td className="text-mono text-accent">{fmt(secItems.reduce((sum, i) => sum + (i.value_to_date || 0), 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'variations' && (
            <div>
              {variationItems.length === 0 ? (
                <div className="card empty-state"><div className="icon">✓</div><p>No items exceeding ±25% of BoQ quantities</p></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Item</th><th>Description</th><th>BoQ Qty</th><th>Actual Qty</th><th>Variance</th><th>Financial Impact</th></tr></thead>
                    <tbody>
                      {variationItems.map(i => {
                        const variance = i.completed_quantity - i.boq_quantity;
                        const pct = ((variance) / i.boq_quantity * 100).toFixed(1);
                        const impact = variance * i.rate;
                        return (
                          <tr key={i.id}>
                            <td className="text-mono" style={{ fontWeight: 600 }}>{i.item_no}</td>
                            <td>{i.description}</td>
                            <td className="text-mono">{i.boq_quantity} {i.unit}</td>
                            <td className="text-mono" style={{ fontWeight: 600 }}>{i.completed_quantity} {i.unit}</td>
                            <td><span className={`badge badge-${variance > 0 ? 'warning' : 'danger'}`}>{variance > 0 ? '+' : ''}{pct}%</span></td>
                            <td className="text-mono" style={{ color: impact > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(impact)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'summary' && (
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ marginBottom: 16 }}>Financial Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px 24px', fontSize: 14 }}>
                <div style={{ fontWeight: 500 }}>Original Contract Sum</div>
                <div className="text-mono" style={{ textAlign: 'right' }}>{fmt(contractSum)}</div>
                <div style={{ fontWeight: 500 }}>Value of Work Done to Date</div>
                <div className="text-mono text-accent" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(valueToDate)}</div>
                <div style={{ fontWeight: 500 }}>Financial Progress</div>
                <div className="text-mono" style={{ textAlign: 'right' }}>{contractSum > 0 ? ((valueToDate / contractSum) * 100).toFixed(1) : 0}%</div>
                <div style={{ fontWeight: 500 }}>Remaining Value</div>
                <div className="text-mono" style={{ textAlign: 'right' }}>{fmt(remaining)}</div>
                <div style={{ borderTop: '2px solid var(--border)', gridColumn: 'span 2', margin: '8px 0' }} />
                <div style={{ fontWeight: 500 }}>Items Over-measured ({'>'}25%)</div>
                <div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>{overMeasured.length} items</div>
                <div style={{ fontWeight: 500 }}>Variation Value (over BoQ)</div>
                <div className="text-mono" style={{ textAlign: 'right', color: 'var(--danger)' }}>
                  {fmt(overMeasured.reduce((s, i) => s + ((i.completed_quantity - i.boq_quantity) * i.rate), 0))}
                </div>
                <div style={{ fontWeight: 500 }}>Total BoQ Items</div>
                <div className="text-mono" style={{ textAlign: 'right' }}>{items.length}</div>
                <div style={{ fontWeight: 500 }}>Items with Progress</div>
                <div className="text-mono" style={{ textAlign: 'right' }}>{items.filter(i => i.completed_quantity > 0).length}</div>
              </div>
            </div>
          )}
        </>
      )}

      {selectedProject && items.length === 0 && (
        <div className="card empty-state">
          <div className="icon">📋</div>
          <p>No BoQ items for this project</p>
          <div className="text-sm text-muted" style={{ marginBottom: 16 }}>Start by adding sections, then import items from your contract BoQ</div>
          {canManage && (
            <div className="btn-group">
              <button className="btn btn-primary" onClick={() => setShowAddSection(true)}>+ Add Section</button>
              <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>📥 Bulk Import</button>
            </div>
          )}
        </div>
      )}

      {/* Add Section Modal */}
      {showAddSection && (
        <div className="modal-overlay" onClick={() => setShowAddSection(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3>Add BoQ Section<button onClick={() => setShowAddSection(false)}>×</button></h3>
            <form onSubmit={addSection}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Section No. *</label>
                  <input value={sectionForm.section_no} onChange={e => setSectionForm({ ...sectionForm, section_no: e.target.value })} required placeholder="5000" /></div>
                <div className="form-group mb-16"><label>Title *</label>
                  <input value={sectionForm.section_title} onChange={e => setSectionForm({ ...sectionForm, section_title: e.target.value })} required placeholder="Pavement Layers" /></div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Section'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowAddSection(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddItem && (
        <div className="modal-overlay" onClick={() => setShowAddItem(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Add BoQ Item<button onClick={() => setShowAddItem(false)}>×</button></h3>
            <form onSubmit={addItem}>
              <div className="form-group mb-16"><label>Section</label>
                <select value={itemForm.section_id} onChange={e => setItemForm({ ...itemForm, section_id: e.target.value })}>
                  <option value="">Unsectioned</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.section_no}: {s.section_title}</option>)}
                </select></div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Item No. *</label>
                  <input value={itemForm.item_no} onChange={e => setItemForm({ ...itemForm, item_no: e.target.value })} required placeholder="5/01/a" /></div>
                <div className="form-group mb-16"><label>Description *</label>
                  <input value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} required placeholder="Provide, spread and compact sub-base material" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Unit *</label>
                  <input value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} required placeholder="m³" /></div>
                <div className="form-group mb-16"><label>BoQ Quantity *</label>
                  <input type="number" step="0.001" value={itemForm.boq_quantity} onChange={e => setItemForm({ ...itemForm, boq_quantity: e.target.value })} required /></div>
                <div className="form-group mb-16"><label>Rate (KES) *</label>
                  <input type="number" step="0.01" value={itemForm.rate} onChange={e => setItemForm({ ...itemForm, rate: e.target.value })} required /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group mb-16"><label>Payment Type</label>
                  <select value={itemForm.payment_type} onChange={e => setItemForm({ ...itemForm, payment_type: e.target.value })}>
                    {['Re-measurement','Lump Sum','Provisional Sum','Prime Cost','Daywork','Percentage','Time-based'].map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div className="form-group mb-16"><label>Link to Activity</label>
                  <select value={itemForm.linked_activity_id} onChange={e => setItemForm({ ...itemForm, linked_activity_id: e.target.value })}>
                    <option value="">No link (manual valuation)</option>
                    {activities.map(a => <option key={a.id} value={a.id}>[{a.activity_code}] {a.activity_name}</option>)}
                  </select></div>
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Item'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowAddItem(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="modal-overlay" onClick={() => setShowBulkImport(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <h3>📥 Bulk Import from Excel<button onClick={() => setShowBulkImport(false)}>×</button></h3>
            <div style={{ background: 'var(--bg-hover)', padding: 12, borderRadius: 'var(--radius)', fontSize: 12, marginBottom: 16 }}>
              <strong>Instructions:</strong> Open your BoQ Excel file. Select the columns in this order: <strong>Item No | Description | Unit | Quantity | Rate</strong>. Copy the rows (Ctrl+C) and paste below (Ctrl+V). Each row becomes one BoQ item. Tabs separate the columns.
            </div>
            <form onSubmit={handleBulkImport}>
              <div className="form-group mb-16"><label>Assign to Section</label>
                <select value={bulkSection} onChange={e => setBulkSection(e.target.value)}>
                  <option value="">Unsectioned</option>
                  {sections.map(s => <option key={s.id} value={s.id}>{s.section_no}: {s.section_title}</option>)}
                </select></div>
              <div className="form-group mb-16"><label>Paste BoQ data (tab-separated) *</label>
                <textarea rows={12} value={bulkText} onChange={e => setBulkText(e.target.value)} required
                  placeholder={"5/01/a\tProvide sub-base material\tm³\t12500\t3450\n5/02/a\tProvide base course material\tm³\t8000\t4200\n6/01\tPrime coat MC30\tlitre\t45000\t85"} style={{ fontFamily: 'monospace', fontSize: 12 }} /></div>
              <div className="text-sm text-muted mb-16">
                {bulkText.trim() ? `${bulkText.trim().split('\n').length} rows detected` : 'Paste your data above'}
              </div>
              <div className="btn-group">
                <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Importing...' : '📥 Import Items'}</button>
                <button className="btn btn-secondary" type="button" onClick={() => setShowBulkImport(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  function renderItemsTable(tableItems) {
    return (
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Description</th><th>Unit</th><th>BoQ Qty</th><th>Rate</th><th>BoQ Amount</th><th>Done</th><th>Value</th><th>%</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {tableItems.map(i => {
              const pct = i.boq_quantity > 0 ? Math.min(100, (i.completed_quantity / i.boq_quantity) * 100) : 0;
              const over = i.completed_quantity > i.boq_quantity && i.boq_quantity > 0;
              return (
                <tr key={i.id} style={{ background: over ? 'rgba(220,38,38,0.05)' : 'transparent' }}>
                  <td className="text-mono" style={{ fontWeight: 600, fontSize: 12 }}>{i.item_no}</td>
                  <td style={{ fontSize: 12, maxWidth: 200 }}>
                    {i.description}
                    {i.activity && <div className="text-muted" style={{ fontSize: 10 }}>→ {i.activity.activity_code}</div>}
                  </td>
                  <td className="text-mono" style={{ fontSize: 12 }}>{i.unit}</td>
                  <td className="text-mono" style={{ fontSize: 12 }}>{Number(i.boq_quantity).toLocaleString()}</td>
                  <td className="text-mono" style={{ fontSize: 12 }}>{Number(i.rate).toLocaleString()}</td>
                  <td className="text-mono" style={{ fontSize: 12 }}>{Number(i.boq_amount || 0).toLocaleString()}</td>
                  <td>
                    {canManage && !i.linked_activity_id ? (
                      <input type="number" step="0.001" value={i.completed_quantity || ''} style={{ width: 80, padding: '3px 6px', fontSize: 11 }}
                        onChange={e => updateCompletedQty(i.id, e.target.value)} />
                    ) : (
                      <span className="text-mono" style={{ fontSize: 12, fontWeight: 600 }}>{Number(i.completed_quantity || 0).toLocaleString()}</span>
                    )}
                  </td>
                  <td className="text-mono text-accent" style={{ fontSize: 12, fontWeight: 600 }}>{Number(i.value_to_date || 0).toLocaleString()}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 60 }}>
                      <div className="progress-bar" style={{ flex: 1, height: 4 }}>
                        <div className={`fill ${pct >= 80 ? 'green' : pct >= 40 ? 'orange' : 'red'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span style={{ fontSize: 10 }}>{pct.toFixed(0)}</span>
                    </div>
                  </td>
                  {canManage && <td><button className="btn btn-sm btn-danger" onClick={() => deleteItem(i.id)} style={{ fontSize: 10, padding: '2px 6px' }}>×</button></td>}
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>Section Total:</td>
              <td className="text-mono">{Number(tableItems.reduce((s, i) => s + (i.boq_amount || 0), 0)).toLocaleString()}</td>
              <td></td>
              <td className="text-mono text-accent">{Number(tableItems.reduce((s, i) => s + (i.value_to_date || 0), 0)).toLocaleString()}</td>
              <td colSpan={canManage ? 2 : 1}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
}
