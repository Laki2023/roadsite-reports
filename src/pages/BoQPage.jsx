import React, { useState, useEffect } from 'react';
import { supabase, hasRole } from '../lib/supabase';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Bill category mapping for Kenya Standard BoQ
function guessCategoryFromBill(sheetName) {
  const s = sheetName.toLowerCase();
  if (/prelim|general/i.test(s)) return 'Preliminary';
  if (/site\s*clear|topsoil/i.test(s)) return 'Site Clearance';
  if (/earth/i.test(s)) return 'Earthworks';
  if (/excav.*fill|filling.*struct/i.test(s)) return 'Structures';
  if (/culvert|drain/i.test(s)) return 'Drainage';
  if (/passage|traffic/i.test(s)) return 'Passage of Traffic';
  if (/natural\s*material|subbase/i.test(s)) return 'Pavement';
  if (/crush.*stone|base/i.test(s)) return 'Pavement';
  if (/lime|cement.*improv/i.test(s)) return 'Pavement';
  if (/lean\s*concrete|concrete\s*pave/i.test(s)) return 'Pavement';
  if (/bitum.*surface|surface\s*dress|seal/i.test(s)) return 'Surfacing';
  if (/bitum.*mix|asphalt/i.test(s)) return 'Surfacing';
  if (/concrete\s*work/i.test(s)) return 'Structures';
  if (/road\s*furniture|sign|guard|marker/i.test(s)) return 'Road Furniture';
  if (/bridge|misc.*bridge/i.test(s)) return 'Structures';
  if (/daywork/i.test(s)) return 'Dayworks';
  if (/hiv|aids|safety|environ/i.test(s)) return 'Preliminary';
  return 'Other';
}

export default function BoQPage({ profile, showToast, selectedProject: propProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject?.id || '');
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
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const canManage = hasRole(profile?.role, 'resident_engineer') || profile?.is_platform_admin;

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

  // ── Excel Upload Parser ──
  async function handleExcelUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const parsedSections = [];
      const parsedItems = [];
      let sortOrder = 0;

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rawRows.length < 3) continue;

        // Skip summary sheets entirely — they only contain bill totals
        if (/^summary/i.test(sheetName)) continue;

        // Find header row
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
          const rowStr = rawRows[r].map(c => String(c).toUpperCase()).join('|');
          if ((rowStr.includes('ITEM') || rowStr.includes('REF')) &&
              (rowStr.includes('DESCRIPTION') || rowStr.includes('PARTICULARS'))) {
            headerRowIdx = r;
            break;
          }
        }
        if (headerRowIdx < 0) continue;

        // Map columns
        const hdrs = rawRows[headerRowIdx].map(h => String(h).toUpperCase().trim());
        const colItem = hdrs.findIndex(h => h === 'ITEM' || h === 'ITEM NO' || h === 'ITEM NO.' || h === 'REF' || h === 'NO.');
        const colDesc = hdrs.findIndex(h => h.includes('DESCRIPTION') || h.includes('PARTICULARS'));
        const colUnit = hdrs.findIndex(h => h === 'UNIT' || h === 'UNITS');
        const colQty = hdrs.findIndex(h => h === 'QTY' || h.includes('QUANTITY'));
        const colRate = hdrs.findIndex(h => h.includes('RATE'));
        const colAmt = hdrs.findIndex(h => h.includes('AMOUNT') || (h.includes('TOTAL') && !h.includes('ITEM')));
        if (colDesc < 0) continue;

        // Extract bill number from sheet name
        const billMatch = sheetName.match(/bill\s*(\d+[a-zA-Z]?)/i);
        const billNo = billMatch ? billMatch[1] : sheetName.replace(/^bill\s*/i, '').split(' ')[0];
        const category = guessCategoryFromBill(sheetName);

        // Create section
        const sectionId = `temp_${parsedSections.length}`;
        parsedSections.push({
          _tempId: sectionId,
          section_no: `Bill ${billNo}`,
          section_title: sheetName.replace(/^bill\s*\d+[a-zA-Z]?\s*[-–—]\s*/i, '').trim() || sheetName,
          sort_order: parsedSections.length + 1,
          category,
        });

        // Parse data rows
        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          const itemNo = colItem >= 0 ? String(row[colItem] || '').trim() : '';
          const desc = colDesc >= 0 ? String(row[colDesc] || '').trim() : '';
          const unit = colUnit >= 0 ? String(row[colUnit] || '').trim() : '';
          const qty = colQty >= 0 ? parseFloat(String(row[colQty] || '').replace(/[,\s]/g, '')) || 0 : 0;
          const rate = colRate >= 0 ? parseFloat(String(row[colRate] || '').replace(/[,\s]/g, '')) || 0 : 0;
          const amount = colAmt >= 0 ? parseFloat(String(row[colAmt] || '').replace(/[,\s]/g, '')) || 0 : 0;

          if (!desc) continue;
          if (/bill\s*no\.?\s*\d.*total|carried.*forward|grand.*summary|^note:|^n\.b|^sub.*total$/i.test(desc)) continue;
          if (!itemNo && !qty && !amount && !unit) continue;

          if (itemNo || (unit && qty) || amount > 0) {
            sortOrder++;
            parsedItems.push({
              _sectionId: sectionId,
              item_no: itemNo,
              description: desc,
              unit: unit || 'LS',
              boq_quantity: qty,
              rate: rate,
              boq_amount: amount || (qty * rate) || 0,
              sort_order: sortOrder,
              category,
              _selected: true,
            });
          }
        }
      }

      if (parsedItems.length > 0) {
        setUploadPreview({ sections: parsedSections, items: parsedItems });
        showToast(`Parsed ${parsedItems.length} items across ${parsedSections.length} bills from ${file.name}`);
      } else {
        showToast('No BoQ items found in this file', 'error');
      }
    } catch (err) {
      showToast('Error reading file: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function confirmExcelImport() {
    if (!uploadPreview) return;
    setSaving(true);
    try {
      // First clear any existing data from a failed previous import
      await supabase.from('boq_items').delete().eq('project_id', selectedProject);
      await supabase.from('boq_sections').delete().eq('project_id', selectedProject);

      const sectionIdMap = {};

      // Create sections
      for (const sec of uploadPreview.sections) {
        const { data, error } = await supabase.from('boq_sections').insert({
          project_id: selectedProject,
          section_no: sec.section_no,
          section_title: sec.section_title,
          sort_order: sec.sort_order,
        }).select().single();
        if (error) throw new Error(`Section "${sec.section_no}": ${error.message}`);
        sectionIdMap[sec._tempId] = data.id;
      }

      // Batch insert items per section
      const selectedItems = uploadPreview.items.filter(i => i._selected);
      let imported = 0;

      for (const sec of uploadPreview.sections) {
        const secItems = selectedItems.filter(i => i._sectionId === sec._tempId);
        if (secItems.length === 0) continue;

        const payload = secItems.map(item => ({
          project_id: selectedProject,
          section_id: sectionIdMap[item._sectionId] || null,
          item_no: item.item_no || '',
          description: item.description || '',
          unit: item.unit || 'LS',
          boq_quantity: item.boq_quantity || 0,
          rate: item.rate || 0,
          boq_amount: item.boq_amount || 0,
          payment_type: 'Re-measurement',
          sort_order: item.sort_order || 0,
        }));

        const { error } = await supabase.from('boq_items').insert(payload);
        if (error) throw new Error(`${sec.section_no} items: ${error.message}`);
        imported += secItems.length;
      }

      showToast(`✅ Imported ${uploadPreview.sections.length} bills, ${imported} items`);
      setUploadPreview(null);
      loadData();
    } catch (err) {
      showToast('Import error: ' + err.message, 'error');
      loadData(); // Reload to show whatever was saved
    } finally {
      setSaving(false);
    }
  }

  // Financial summaries with VoP, Contingencies, VAT
  const contractSum = items.reduce((s, i) => s + (i.boq_amount || 0), 0);
  const vopPct = 15; // Will come from project settings later
  const contingenciesPct = 10;
  const vatPct = 16;
  const vopAmount = contractSum * (vopPct / 100);
  const contingenciesAmount = contractSum * (contingenciesPct / 100);
  const subTotal2 = contractSum + vopAmount + contingenciesAmount;
  const vatAmount = subTotal2 * (vatPct / 100);
  const grandTotal = subTotal2 + vatAmount;
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
            <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              📊 Upload BoQ Excel
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelUpload} disabled={uploading} />
            </label>
            <button className="btn btn-secondary" onClick={() => setShowAddItem(true)}>+ Add Item</button>
            {items.length > 0 && (
              <button className="btn btn-secondary" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={async () => {
                if (!window.confirm(`Delete all ${items.length} BoQ items and ${sections.length} sections for this project?`)) return;
                await supabase.from('boq_items').delete().eq('project_id', selectedProject);
                await supabase.from('boq_sections').delete().eq('project_id', selectedProject);
                showToast('🗑️ All BoQ data cleared');
                loadData();
              }}>🗑️ Clear All BoQ</button>
            )}
          </div>
        )}
      </div>

      <div className="form-group mb-16" style={{ maxWidth: 400 }}>
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} style={{ fontSize: 14 }}>
          <option value="">Select a project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Excel Upload Preview */}
      {uploadPreview && (
        <div style={{ marginBottom: 16, padding: 20, background: 'var(--bg-accent)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>📊 BoQ Excel — {uploadPreview.items.length} items across {uploadPreview.sections.length} bills</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                Total: KES {uploadPreview.items.filter(i => i._selected).reduce((s, i) => s + (i.boq_amount || 0), 0).toLocaleString()}
              </div>
            </div>
            <button onClick={() => setUploadPreview(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-secondary)' }}>×</button>
          </div>

          {/* Bills summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>
            {uploadPreview.sections.map(sec => {
              const secItems = uploadPreview.items.filter(i => i._sectionId === sec._tempId);
              const secTotal = secItems.reduce((s, i) => s + (i.boq_amount || 0), 0);
              return (
                <div key={sec._tempId} style={{ padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{sec.section_no}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sec.section_title}</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>{secItems.length} items · KES {secTotal.toLocaleString()}</div>
                </div>
              );
            })}
          </div>

          {/* Items preview table */}
          <div style={{ maxHeight: 350, overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface-2)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-1)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Bill</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Item</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Description</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Unit</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Qty</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Rate</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500, fontSize: 11, color: 'var(--text-secondary)' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {uploadPreview.items.map((item, i) => {
                  const sec = uploadPreview.sections.find(s => s._tempId === item._sectionId);
                  return (
                    <tr key={i} style={{ borderBottom: '0.5px solid var(--border)', opacity: item._selected ? 1 : 0.4 }}>
                      <td style={{ padding: '4px 8px', color: 'var(--text-accent)', fontWeight: 500 }}>{sec?.section_no?.replace('Bill ', '')}</td>
                      <td style={{ padding: '4px 8px' }}>{item.item_no}</td>
                      <td style={{ padding: '4px 8px', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.description}>{item.description}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.unit}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.boq_quantity?.toLocaleString()}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.rate?.toLocaleString()}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>{item.boq_amount?.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={confirmExcelImport} disabled={saving} style={{ fontSize: 14 }}>
              {saving ? '⏳ Importing...' : `✅ Import ${uploadPreview.items.filter(i => i._selected).length} items`}
            </button>
            <button className="btn btn-secondary" onClick={() => setUploadPreview(null)}>Cancel</button>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
            🔒 File processed in your browser only — never uploaded or stored on the server.
          </div>
        </div>
      )}

      {selectedProject && items.length > 0 && (() => {
        const BILL_COLORS = ['#3b82f6', '#059669', '#e87b35', '#8b5cf6', '#ec4899', '#0891b2', '#f59e0b', '#6366f1', '#ef4444', '#14b8a6',
          '#a855f7', '#f97316', '#06b6d4', '#84cc16', '#e11d48', '#7c3aed', '#10b981', '#f43f5e', '#0ea5e9', '#d946ef'];
        
        // Chart data
        const billChartData = Object.entries(grouped).map(([secId, { section, items: secItems }], i) => ({
          name: section.section_no?.replace('Bill ', 'B') || `S${i}`,
          fullName: `${section.section_no}: ${section.section_title}`,
          value: secItems.reduce((s, it) => s + (it.boq_amount || 0), 0),
          items: secItems.length,
          color: BILL_COLORS[i % BILL_COLORS.length],
        })).filter(d => d.value > 0);

        const top5 = [...billChartData].sort((a, b) => b.value - a.value).slice(0, 5);
        
        // Filter items by search
        const filteredGrouped = {};
        Object.entries(grouped).forEach(([secId, { section, items: secItems }]) => {
          if (searchQuery) {
            const filtered = secItems.filter(i => 
              (i.item_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
              (i.description || '').toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (filtered.length > 0) filteredGrouped[secId] = { section, items: filtered };
          } else {
            filteredGrouped[secId] = { section, items: secItems };
          }
        });

        return (
        <>
          {/* ══════ DASHBOARD ROW 1: KPI Cards ══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'BoQ items', value: items.length, sub: `${sections.length} bills`, color: '#3b82f6', icon: '📋' },
              { label: 'Sub-total', value: `${(contractSum / 1e6).toFixed(1)}M`, sub: `KES ${contractSum.toLocaleString()}`, color: '#6366f1', icon: '💰' },
              { label: '+ VoP + Cont', value: `${(subTotal2 / 1e6).toFixed(1)}M`, sub: `+${vopPct}% +${contingenciesPct}%`, color: '#0891b2', icon: '📊' },
              { label: 'Total + VAT', value: `${(grandTotal / 1e6).toFixed(1)}M`, sub: `+${vatPct}% VAT`, color: '#059669', icon: '🏦' },
              ...(valueToDate > 0 ? [{ label: 'Certified', value: `${(valueToDate / 1e6).toFixed(1)}M`, sub: `${contractSum > 0 ? Math.round((valueToDate / contractSum) * 100) : 0}% progress`, color: '#f59e0b', icon: '✅' }] : []),
            ].map((kpi, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '16px 18px', position: 'relative', overflow: 'hidden',
                transition: 'all 0.3s', cursor: 'default',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${kpi.color}20`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${kpi.color}, ${kpi.color}66)` }} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{kpi.icon} {kpi.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color, fontFamily: 'monospace' }}>{kpi.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* ══════ DASHBOARD ROW 2: Charts ══════ */}
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12, marginBottom: 16 }}>
            {/* Pie Chart — Bill Distribution */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Bill distribution</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={billChartData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {billChartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => 'KES ' + Number(v).toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{billChartData.length} bills with amounts</div>
            </div>

            {/* Bar Chart — Top 5 Bills */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top 5 bills by value</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={top5} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tickFormatter={v => (v / 1e6).toFixed(0) + 'M'} style={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={35} style={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => 'KES ' + Number(v).toLocaleString()} labelFormatter={(l) => top5.find(d => d.name === l)?.fullName || l} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {top5.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ══════ DASHBOARD ROW 3: Contract Breakdown ══════ */}
          <div style={{ marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>💰 Contract financial breakdown</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 24px', fontSize: 13 }}>
              <div>(A) Sub-total (Works)</div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>{fmt(contractSum)}</div>
              <div style={{ color: 'var(--text-muted)', paddingLeft: 16 }}>(B) Add {vopPct}% Variation of Price</div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(vopAmount)}</div>
              <div style={{ color: 'var(--text-muted)', paddingLeft: 16 }}>(C) Add {contingenciesPct}% Contingencies</div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(contingenciesAmount)}</div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 500 }}>(D) Sub-total (A+B+C)</div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, textAlign: 'right', fontFamily: 'monospace', fontWeight: 500 }}>{fmt(subTotal2)}</div>
              <div style={{ color: 'var(--text-muted)', paddingLeft: 16 }}>(E) Add {vatPct}% VAT</div>
              <div style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{fmt(vatAmount)}</div>
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 6, fontWeight: 600 }}>Total contract sum</div>
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 6, textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#059669' }}>{fmt(grandTotal)}</div>
            </div>
          </div>

          {/* ══════ SEARCH + TABS ══════ */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div className="tabs" style={{ margin: 0 }}>
              <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>Bills ({sections.length})</button>
              <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Summary</button>
              <button className={tab === 'variations' ? 'active' : ''} onClick={() => setTab('variations')}>Variations ({variationItems.length})</button>
            </div>
            {tab === 'items' && (
              <input type="text" placeholder="🔍 Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)', width: 220 }} />
            )}
          </div>

          {/* ══════ BILLS — Premium Cards ══════ */}
          {tab === 'items' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {Object.entries(filteredGrouped).map(([secId, { section, items: secItems }], idx) => {
                const secTotal = secItems.reduce((s, i) => s + (i.boq_amount || 0), 0);
                const secValueToDate = secItems.reduce((s, i) => s + (i.value_to_date || 0), 0);
                const isExpanded = expandedSections[secId];
                const progress = secTotal > 0 ? Math.round((secValueToDate / secTotal) * 100) : 0;
                const pctOfTotal = contractSum > 0 ? ((secTotal / contractSum) * 100).toFixed(1) : 0;
                const chartItem = billChartData.find(d => d.fullName?.includes(section.section_title));
                const clr = chartItem?.color || BILL_COLORS[idx % BILL_COLORS.length];

                return (
                  <div key={secId} style={{ gridColumn: isExpanded ? '1 / -1' : undefined }}>
                    <div onClick={() => setExpandedSections(prev => ({ ...prev, [secId]: !prev[secId] }))}
                      className="boq-bill-card"
                      style={{
                        position: 'relative', overflow: 'hidden', cursor: 'pointer',
                        background: 'var(--bg-card)', borderRadius: isExpanded ? '12px 12px 0 0' : '12px',
                        border: `1px solid ${isExpanded ? clr : 'var(--border)'}`,
                        padding: '16px 18px',
                        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                        transform: isExpanded ? 'scale(1)' : 'scale(1)',
                        boxShadow: isExpanded ? `0 4px 20px ${clr}22` : '0 1px 3px rgba(0,0,0,0.08)',
                      }}
                      onMouseEnter={e => { if (!isExpanded) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = `0 8px 25px ${clr}30`; }}}
                      onMouseLeave={e => { if (!isExpanded) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}}>
                      
                      {/* Top gradient accent */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4,
                        background: `linear-gradient(90deg, ${clr}, ${clr}88)` }} />

                      {/* Bill number badge */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: `${clr}18`, color: clr, fontSize: 14, fontWeight: 700, flexShrink: 0,
                          border: `1.5px solid ${clr}40`,
                        }}>
                          {section.section_no?.replace('Bill ', 'B') || `#${idx+1}`}
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{section.section_title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span>{secItems.length} items</span>
                            <span>·</span>
                            <span>{pctOfTotal}% of contract</span>
                            {progress > 0 && <><span>·</span><span style={{ color: '#059669' }}>{progress}% done</span></>}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: clr }}>
                            {(secTotal / 1e6).toFixed(1)}M
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            KES {secTotal.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ marginTop: 12, height: 5, borderRadius: 3, background: `${clr}15`, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.max(pctOfTotal, 2)}%`, height: '100%', borderRadius: 3,
                          background: `linear-gradient(90deg, ${clr}, ${clr}cc)`,
                          transition: 'width 0.8s ease',
                        }} />
                      </div>

                      {/* Expand indicator */}
                      <div style={{ position: 'absolute', bottom: 8, right: 16, fontSize: 11, color: 'var(--text-muted)' }}>
                        {isExpanded ? '▲ collapse' : '▼ expand'}
                      </div>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div style={{ border: `1px solid ${clr}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden',
                        boxShadow: `0 4px 20px ${clr}15` }}>
                        {renderItemsTable(secItems)}
                      </div>
                    )}
                  </div>
                );
              })}
              {searchQuery && Object.keys(filteredGrouped).length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No items matching "{searchQuery}"
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
        );
      })()}

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
