import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

const BOQ_CATEGORIES = ['Preliminary', 'Earthworks', 'Pavement', 'Drainage', 'Structures', 'Surfacing', 'Road Furniture', 'Dayworks', 'Other'];
const EQUIP_TYPES = ['Grader', 'Excavator', 'Roller', 'Loader', 'Dozer', 'Tipper', 'Bowser', 'Paver', 'Crusher', 'Compressor', 'Generator', 'Concrete Mixer', 'Bitumen Distributor', 'Water Tanker', 'Other'];
const PARTIES = [
  { value: 'employer', label: 'Employer / Client', desc: 'KeNHA, KURA, KeRRA, County Govt', icon: '🏛️', color: '#6366f1' },
  { value: 'engineer', label: 'Engineer', desc: 'Consulting firm appointed under FIDIC', icon: '📐', color: '#2563eb' },
  { value: 'engineer_rep', label: "Engineer's Representative", desc: 'RE & supervision team on site', icon: '👷', color: '#059669' },
  { value: 'contractor', label: 'Contractor', desc: 'Main contractor', icon: '🏗️', color: '#e87b35' },
  { value: 'subcontractor', label: 'Subcontractor', desc: 'Nominated or domestic sub', icon: '🔧', color: '#8b5cf6' },
];
const PARTY_VALUES = PARTIES.map(p => p.value);
const FIDIC_EDITIONS = ['Red Book 1999', 'Red Book 2017', 'Yellow Book 1999', 'Pink Book MDB', 'FIDIC 1987 4th Ed'];

// ── Pre-populated FIDIC Key Personnel by party ──
const STANDARD_PERSONNEL = [
  // Employer / Client
  { position_title: 'Project Director', party: 'employer' },
  { position_title: 'Project Manager', party: 'employer' },
  { position_title: 'Project Engineer', party: 'employer' },
  { position_title: 'Project Accountant', party: 'employer' },
  { position_title: 'Procurement Officer', party: 'employer' },
  // Engineer (Consulting Firm — the "Engineer" under FIDIC)
  { position_title: 'Team Leader / Principal Engineer', party: 'engineer' },
  { position_title: 'Deputy Team Leader', party: 'engineer' },
  { position_title: 'Highway / Pavement Engineer', party: 'engineer' },
  { position_title: 'Structural Engineer', party: 'engineer' },
  { position_title: 'Claims / Contract Specialist', party: 'engineer' },
  { position_title: 'Quantity Surveyor (HQ)', party: 'engineer' },
  // Engineer's Representative (RE & site supervision team)
  { position_title: 'Resident Engineer (RE)', party: 'engineer_rep' },
  { position_title: 'Assistant Resident Engineer', party: 'engineer_rep' },
  { position_title: 'Inspector of Works (Roads)', party: 'engineer_rep' },
  { position_title: 'Inspector of Works (Structures)', party: 'engineer_rep' },
  { position_title: 'Materials / Geotechnical Engineer', party: 'engineer_rep' },
  { position_title: 'Surveyor', party: 'engineer_rep' },
  { position_title: 'Quantity Surveyor', party: 'engineer_rep' },
  { position_title: 'Environmental Specialist', party: 'engineer_rep' },
  { position_title: 'Social / RAP Specialist', party: 'engineer_rep' },
  { position_title: 'Road Safety Specialist', party: 'engineer_rep' },
  { position_title: 'Laboratory Technician', party: 'engineer_rep' },
  { position_title: 'Survey Assistant / Chainman', party: 'engineer_rep' },
  { position_title: 'Office Administrator', party: 'engineer_rep' },
  // Contractor
  { position_title: 'Project Manager', party: 'contractor' },
  { position_title: 'Site Agent / Construction Manager', party: 'contractor' },
  { position_title: 'Deputy Site Agent', party: 'contractor' },
  { position_title: 'General Foreman', party: 'contractor' },
  { position_title: 'Materials Engineer', party: 'contractor' },
  { position_title: 'Chief Surveyor', party: 'contractor' },
  { position_title: 'Plant Manager', party: 'contractor' },
  { position_title: 'Quality Assurance / QC Manager', party: 'contractor' },
  { position_title: 'Safety / OHS Officer', party: 'contractor' },
  { position_title: 'Environmental Officer', party: 'contractor' },
  { position_title: 'Camp Manager / Admin', party: 'contractor' },
  { position_title: 'Quantity Surveyor', party: 'contractor' },
  { position_title: 'Accountant / Finance Officer', party: 'contractor' },
  { position_title: 'Laboratory Technician', party: 'contractor' },
  { position_title: 'Store Keeper', party: 'contractor' },
  // Subcontractor
  { position_title: 'Sub Site Agent', party: 'subcontractor' },
  { position_title: 'Sub Foreman', party: 'subcontractor' },
];

// ── Pre-populated Road Construction Equipment ──
const STANDARD_EQUIPMENT = [
  { equipment_name: 'Motor Grader', equipment_type: 'Grader' },
  { equipment_name: 'Hydraulic Excavator (20-30T)', equipment_type: 'Excavator' },
  { equipment_name: 'Hydraulic Excavator (7-15T)', equipment_type: 'Excavator' },
  { equipment_name: 'Backhoe Loader', equipment_type: 'Excavator' },
  { equipment_name: 'Bulldozer (D6/D7)', equipment_type: 'Dozer' },
  { equipment_name: 'Wheel Loader', equipment_type: 'Loader' },
  { equipment_name: 'Vibratory Roller (10-14T)', equipment_type: 'Roller' },
  { equipment_name: 'Pneumatic Tyre Roller', equipment_type: 'Roller' },
  { equipment_name: 'Tandem Steel Roller', equipment_type: 'Roller' },
  { equipment_name: 'Pedestrian / Walk-behind Roller', equipment_type: 'Roller' },
  { equipment_name: 'Tipper Truck (10-15m³)', equipment_type: 'Tipper' },
  { equipment_name: 'Tipper Truck (20-25m³)', equipment_type: 'Tipper' },
  { equipment_name: 'Water Bowser (10,000L)', equipment_type: 'Bowser' },
  { equipment_name: 'Bitumen Distributor', equipment_type: 'Bitumen Distributor' },
  { equipment_name: 'Asphalt Paver (Tracked)', equipment_type: 'Paver' },
  { equipment_name: 'Chip Spreader', equipment_type: 'Paver' },
  { equipment_name: 'Stone Crusher & Screen', equipment_type: 'Crusher' },
  { equipment_name: 'Concrete Batching Plant', equipment_type: 'Concrete Mixer' },
  { equipment_name: 'Concrete Mixer (0.5m³)', equipment_type: 'Concrete Mixer' },
  { equipment_name: 'Concrete Vibrator (Poker)', equipment_type: 'Other' },
  { equipment_name: 'Mobile Crane (20-50T)', equipment_type: 'Other' },
  { equipment_name: 'Compressor + Pneumatic Tools', equipment_type: 'Compressor' },
  { equipment_name: 'Generator Set', equipment_type: 'Generator' },
  { equipment_name: 'Low-bed Trailer', equipment_type: 'Other' },
  { equipment_name: 'Flat-bed Truck', equipment_type: 'Other' },
  { equipment_name: 'Fuel Bowser', equipment_type: 'Other' },
  { equipment_name: 'Survey Equipment (Total Station)', equipment_type: 'Other' },
  { equipment_name: 'DCP Test Set', equipment_type: 'Other' },
  { equipment_name: 'Nuclear Density Gauge', equipment_type: 'Other' },
  { equipment_name: 'Asphalt Cutter / Saw', equipment_type: 'Other' },
  { equipment_name: 'Pile Driver / Hammer', equipment_type: 'Other' },
  { equipment_name: 'Road Marking Machine', equipment_type: 'Other' },
];

const WIZARD_STEPS = [
  { num: 1, label: 'Upload Documents', icon: '📄' },
  { num: 2, label: 'Contract Details', icon: '📋' },
  { num: 3, label: 'BoQ / Works Activities', icon: '⛏️' },
  { num: 4, label: 'Equipment Register', icon: '🚜' },
  { num: 5, label: 'Key Personnel', icon: '👔' },
  { num: 6, label: 'Confirm & Create', icon: '✅' },
];

// ── Editable Table Component ──
function EditableTable({ columns, data, setData, emptyRow }) {
  function update(i, field, val) {
    setData(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function remove(i) { setData(prev => prev.filter((_, idx) => idx !== i)); }
  function add() { setData(prev => [...prev, { ...emptyRow }]); }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-hover)' }}>
              <th style={{ ...thStyle, width: 30 }}>#</th>
              {columns.map(c => (
                <th key={c.key} style={{ ...thStyle, width: c.width, minWidth: c.minWidth || 60 }}>{c.label}</th>
              ))}
              <th style={{ ...thStyle, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={tdStyle}>{i + 1}</td>
                {columns.map(c => (
                  <td key={c.key} style={tdStyle}>
                    {c.type === 'select' ? (
                      <select value={row[c.key] || ''} onChange={e => update(i, c.key, e.target.value)} style={inputStyle}>
                        <option value="">—</option>
                        {c.options.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={c.type || 'text'} value={row[c.key] ?? ''} placeholder={c.placeholder || ''}
                        onChange={e => update(i, c.key, c.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
                        style={{ ...inputStyle, textAlign: c.type === 'number' ? 'right' : 'left' }} />
                    )}
                  </td>
                ))}
                <td style={tdStyle}>
                  <span onClick={() => remove(i)} style={{ cursor: 'pointer', color: '#ef4444', fontSize: 14 }} title="Remove">✕</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={add} style={{ ...btnSecondary, marginTop: 8, fontSize: 12 }}>＋ Add Row</button>
      <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--text-muted)' }}>{data.length} items</span>
    </div>
  );
}

const thStyle = { padding: '8px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border)' };
const tdStyle = { padding: '4px 4px' };
const inputStyle = { width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--text)' };
const btnPrimary = { padding: '10px 24px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 'var(--radius)', background: 'var(--accent)', color: '#fff', cursor: 'pointer' };
const btnSecondary = { padding: '8px 16px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' };

// ── File Drop Zone ──
function DropZone({ onFiles, files, accept, label }) {
  const [drag, setDrag] = useState(false);
  const handleDrop = useCallback(e => {
    e.preventDefault(); setDrag(false);
    onFiles(Array.from(e.dataTransfer.files));
  }, [onFiles]);
  const handleSelect = useCallback(e => {
    onFiles(Array.from(e.target.files));
  }, [onFiles]);

  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={handleDrop}
      style={{ border: `2px dashed ${drag ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)',
        padding: 32, textAlign: 'center', background: drag ? 'rgba(59,130,246,0.04)' : 'var(--bg-hover)',
        cursor: 'pointer', transition: 'all 0.2s' }}
      onClick={() => document.getElementById('file-input-setup')?.click()}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{label || 'Drop files here or tap to browse'}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PDF, Excel (.xlsx), Word (.docx) — Max 25MB each</div>
      <input id="file-input-setup" type="file" multiple accept={accept || '.pdf,.xlsx,.xls,.docx'} onChange={handleSelect} style={{ display: 'none' }} />
      {files.length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'left' }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-card)',
              borderRadius: 4, marginBottom: 4, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 16 }}>{f.name.endsWith('.pdf') ? '📄' : '📊'}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{f.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Save Indicator Component ──
function SaveIndicator({ storageKey }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(t);
  }, [storageKey]);
  return (
    <div style={{ fontSize: 11, color: '#10b981', opacity: show ? 1 : 0.4, transition: 'opacity 0.5s', display: 'flex', alignItems: 'center', gap: 4 }}>
      💾 Auto-saved
    </div>
  );
}

// ── Main Wizard ──
export default function ContractSetupWizard({ profile, showToast, navigateTo, selectedProject: existingProject }) {
  const isImportMode = !!existingProject?.id;
  const storageKey = `wizard_${existingProject?.id || 'new'}`;

  // Restore state from sessionStorage if available
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(storageKey)) || {}; } catch { return {}; } })();

  const [step, setStep] = useState(saved.step || 1);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Extracted data — restore from session if available
  const [contractDetails, setContractDetails] = useState(saved.contractDetails || {
    name: '', contract_no: '', employer: 'KeNHA', contractor_name: '', consultant: '',
    fidic_edition: 'Red Book 1999', contract_sum: '', commencement_date: '',
    original_completion_date: '', original_contract_period: '', defects_liability_period: 365,
    start_chainage: '', end_chainage: '', road_class: '', county: '', region: '',
    funding_source: 'GoK', category: 'Construction', current_phase: 'Mobilization', status: 'active',
  });
  const [boqItems, setBoqItems] = useState(saved.boqItems || []);
  const [equipmentList, setEquipmentList] = useState(saved.equipmentList || []);
  const [personnelList, setPersonnelList] = useState(saved.personnelList || []);
  const [extractionSource, setExtractionSource] = useState(saved.extractionSource || '');

  // Auto-save wizard state to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        step, contractDetails, boqItems, equipmentList, personnelList, extractionSource,
      }));
    } catch (e) { /* storage full or unavailable */ }
  }, [step, contractDetails, boqItems, equipmentList, personnelList, extractionSource, storageKey]); // 'ai' or 'excel' or 'manual'

  // ── File Handling ──
  function handleFiles(newFiles) {
    setFiles(prev => [...prev, ...newFiles]);
  }

  function removeFile(i) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Excel Parsing (client-side + optional AI format detection) ──
  async function parseExcelFile(file, useAI = false) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const results = { boq: [], equipment: [], personnel: [] };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (rawRows.length < 2) continue;
      if (/^summary$/i.test(sheetName) && rawRows.length < 25) continue;

      // ── Try AI format detection first (if API key configured) ──
      if (useAI) {
        try {
          const sampleRows = rawRows.slice(0, Math.min(12, rawRows.length));
          const mapping = await detectFormatWithAI(sheetName, sampleRows);
          if (mapping && mapping.desc_col >= 0) {
            const items = extractWithMapping(rawRows, mapping, sheetName);
            if (items.length > 0) { results.boq.push(...items); continue; }
          }
        } catch (e) { console.log('AI detection fallback for', sheetName); }
      }

      // ── Rule-based: Kenya Standard BoQ (Bill X - ...) ──
      const isBillSheet = /^bill\s*\d/i.test(sheetName);
      if (isBillSheet) {
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
          const rowStr = rawRows[r].map(c => String(c).toUpperCase()).join('|');
          if ((rowStr.includes('ITEM') || rowStr.includes('REF')) &&
              (rowStr.includes('DESCRIPTION') || rowStr.includes('PARTICULARS'))) { headerRowIdx = r; break; }
        }
        if (headerRowIdx >= 0) {
          const hdrs = rawRows[headerRowIdx].map(h => String(h).toUpperCase().trim());
          const items = extractWithMapping(rawRows, {
            item_col: hdrs.findIndex(h => h === 'ITEM' || h === 'ITEM NO' || h === 'ITEM NO.' || h === 'REF' || h === 'NO.'),
            desc_col: hdrs.findIndex(h => h.includes('DESCRIPTION') || h.includes('PARTICULARS')),
            unit_col: hdrs.findIndex(h => h === 'UNIT' || h === 'UNITS'),
            qty_col: hdrs.findIndex(h => h === 'QTY' || h.includes('QUANTITY')),
            rate_col: hdrs.findIndex(h => h.includes('RATE')),
            amt_col: hdrs.findIndex(h => h.includes('AMOUNT') || (h.includes('TOTAL') && !h.includes('ITEM'))),
            data_start: headerRowIdx + 1,
            category: guessCategoryFromBill(sheetName),
          }, sheetName);
          results.boq.push(...items);
          continue;
        }
      }

      // ── Generic format detection (any layout — scans first 6 rows for headers) ──
      let foundBoq = false;
      for (let r = 0; r < Math.min(6, rawRows.length); r++) {
        const hdrs = rawRows[r].map(h => String(h).toUpperCase().trim());
        const hasDesc = hdrs.findIndex(h => h.includes('DESCRIPTION') || h.includes('PARTICULARS') || h.includes('ACTIVITY') || h.includes('WORK ITEM'));
        const hasQtyOrAmt = hdrs.findIndex(h => h.includes('QTY') || h.includes('QUANTITY') || h.includes('AMOUNT') || h.includes('TOTAL'));
        if (hasDesc >= 0 && hasQtyOrAmt >= 0) {
          const items = extractWithMapping(rawRows, {
            item_col: hdrs.findIndex(h => h.includes('ITEM') || h.includes('REF') || h.includes('NO') || h.includes('CODE')),
            desc_col: hasDesc,
            unit_col: hdrs.findIndex(h => h === 'UNIT' || h === 'UNITS' || h === 'UOM'),
            qty_col: hdrs.findIndex(h => h === 'QTY' || h.includes('QUANTITY') || h.includes('QUANT')),
            rate_col: hdrs.findIndex(h => h.includes('RATE') || h.includes('PRICE') || h.includes('UNIT COST')),
            amt_col: hdrs.findIndex(h => h.includes('AMOUNT') || h.includes('TOTAL') || h.includes('SUM') || h.includes('VALUE')),
            data_start: r + 1,
            category: guessBoqCategory(sheetName),
          }, sheetName);
          if (items.length > 0) { results.boq.push(...items); foundBoq = true; break; }
        }
      }
      if (foundBoq) continue;

      // ── Equipment / Personnel detection ──
      const sheetText = rawRows.slice(0, 3).map(r => (r||[]).join(' ')).join(' ').toLowerCase();
      if (/equipment|plant\s*schedule|machine/i.test(sheetText) || /equipment|plant/i.test(sheetName)) {
        for (let r = 1; r < rawRows.length; r++) {
          const name = String(rawRows[r][0] || rawRows[r][1] || '').trim();
          if (name.length > 3 && !/^(no|item|equipment|plant|description)/i.test(name)) {
            results.equipment.push({ equipment_name: name, equipment_type: guessEquipType(name),
              quantity: parseNum(rawRows[r][2] || rawRows[r][3]) || 1, ownership: 'Owned' });
          }
        }
      }
      if (/personnel|staff|key.*expert/i.test(sheetText) || /personnel|staff/i.test(sheetName)) {
        for (let r = 1; r < rawRows.length; r++) {
          const vals = rawRows[r];
          const name = String(vals[0] || vals[1] || '').trim();
          const position = String(vals[1] || vals[2] || '').trim();
          if (position.length > 3 && !/^(no|name|position|title)/i.test(position)) {
            results.personnel.push({ name, position_title: position, party: guessParty(position), qualifications: '' });
          }
        }
      }
    }
    return results;
  }

  // ── Extract rows using a column mapping ──
  function extractWithMapping(rawRows, mapping, sheetName) {
    const items = [];
    const { item_col, desc_col, unit_col, qty_col, rate_col, amt_col, data_start, category } = mapping;
    for (let r = data_start; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;
      const itemNo = item_col >= 0 ? String(row[item_col] || '').trim() : '';
      const desc = desc_col >= 0 ? String(row[desc_col] || '').trim() : '';
      const unit = unit_col >= 0 ? String(row[unit_col] || '').trim() : '';
      const qty = qty_col >= 0 ? parseNum(row[qty_col]) : 0;
      const rate = rate_col >= 0 ? parseNum(row[rate_col]) : 0;
      const amount = amt_col >= 0 ? parseNum(row[amt_col]) : 0;
      if (!desc) continue;
      if (/bill\s*no\.?\s*\d.*total|carried.*forward|grand.*summary|^note:|^n\.b|^sub.*total|^total$/i.test(desc)) continue;
      if (!itemNo && !qty && !amount && !unit) continue;
      if (itemNo || (unit && qty) || amount > 0) {
        items.push({ item_no: itemNo, description: desc.length > 250 ? desc.substring(0, 250) + '...' : desc,
          unit: unit || 'LS', quantity: qty, rate: rate, amount: amount || (qty * rate) || 0,
          category: category || guessCategoryFromBill(sheetName) || guessBoqCategory(desc) });
      }
    }
    return items;
  }

  // ── AI Format Detection (sends only headers + sample rows — ~KES 0.50) ──
  async function detectFormatWithAI(sheetName, sampleRows) {
    try {
      const sampleText = sampleRows.map((r, i) => `Row ${i}: ${r.map((c, j) => `[Col${j}]${c}`).join(' | ')}`).join('\n');
      const response = await fetch('/api/extract-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_base64: btoa(unescape(encodeURIComponent(`Sheet: ${sheetName}\n${sampleText}`))),
          file_type: 'text/plain', section: 'detect_format',
        }),
      });
      if (!response.ok) return null;
      return response.json();
    } catch (e) { return null; }
  }

  // ── AI Extraction (via Vercel API route) ──
  async function extractWithAI(file) {
    setProcessStatus('Converting document...');
    const base64 = await fileToBase64(file);

    setProcessStatus('AI is reading your contract document...');
    const response = await fetch('/api/extract-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: base64,
        file_type: file.type || 'application/pdf',
        file_name: file.name,
        section: 'all',
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'AI extraction failed');
    }

    return response.json();
  }

  // ── Process All Files ──
  async function processFiles(withAI = false) {
    if (files.length === 0) { showToast('Please upload at least one file', 'error'); return; }
    setProcessing(true);
    let allBoq = [], allEquip = [], allPersonnel = [];
    let details = { ...contractDetails };

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isExcel = /\.(xlsx?|csv)$/i.test(file.name);

        if (isExcel) {
          setProcessStatus(withAI
            ? `AI analyzing format of ${file.name}...`
            : `Parsing Excel: ${file.name}...`);
          const result = await parseExcelFile(file, withAI);
          allBoq.push(...result.boq);
          allEquip.push(...result.equipment);
          allPersonnel.push(...result.personnel);
          setExtractionSource(withAI ? 'ai' : 'excel');
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          setProcessStatus(`AI extracting from: ${file.name}... (this may take 30-60 seconds)`);
          try {
            const result = await extractWithAI(file);
            if (result.parse_error) {
              showToast(`AI returned unstructured text for ${file.name}. Try a clearer scan.`, 'error');
              continue;
            }
            if (result.contract_details) {
              details = { ...details, ...mapContractDetails(result.contract_details) };
            }
            if (result.boq_items) allBoq.push(...result.boq_items);
            if (result.equipment) allEquip.push(...result.equipment);
            if (result.key_personnel) allPersonnel.push(...result.key_personnel);
            setExtractionSource('ai');
          } catch (aiErr) {
            showToast(`AI extraction failed for ${file.name}: ${aiErr.message}. You can enter data manually.`, 'error');
          }
        }
      }

      setContractDetails(details);
      if (allBoq.length > 0) setBoqItems(allBoq);
      if (allEquip.length > 0) setEquipmentList(allEquip);
      if (allPersonnel.length > 0) setPersonnelList(allPersonnel);

      const totalItems = allBoq.length + allEquip.length + allPersonnel.length;
      if (totalItems > 0) {
        showToast(`✅ Extracted ${allBoq.length} BoQ items, ${allEquip.length} equipment, ${allPersonnel.length} personnel`);
      } else {
        showToast('No structured data found. You can enter data manually in the next steps.', 'error');
      }

      setStep(2);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setProcessing(false);
      setProcessStatus('');
    }
  }

  // ── Save Everything to Database ──
  async function handleConfirm() {
    setSaving(true);
    let projectId = existingProject?.id;
    let project = existingProject;

    try {
      if (isImportMode) {
        // IMPORT MODE — update existing project details if provided
        const updates = {};
        if (contractDetails.contractor_name) updates.contractor_name = contractDetails.contractor_name;
        if (contractDetails.contract_no) updates.contract_no = contractDetails.contract_no;
        if (contractDetails.fidic_edition) updates.fidic_edition = contractDetails.fidic_edition;
        if (contractDetails.contract_sum) {
          updates.contract_sum = parseFloat(contractDetails.contract_sum);
          updates.original_contract_sum = parseFloat(contractDetails.contract_sum);
        }
        if (contractDetails.commencement_date) updates.commencement_date = contractDetails.commencement_date;
        if (contractDetails.original_completion_date) updates.original_completion_date = contractDetails.original_completion_date;
        if (contractDetails.original_contract_period) updates.original_contract_period = parseInt(contractDetails.original_contract_period);
        if (contractDetails.start_chainage) updates.start_chainage = parseFloat(contractDetails.start_chainage);
        if (contractDetails.end_chainage) updates.end_chainage = parseFloat(contractDetails.end_chainage);
        if (contractDetails.county) updates.county = contractDetails.county;
        if (contractDetails.road_class) updates.road_class = contractDetails.road_class;

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
          if (error) throw error;
        }
      } else {
        // CREATE MODE — create new project
        if (!contractDetails.name) { showToast('Project name is required', 'error'); setSaving(false); return; }
        const projectPayload = {
          name: contractDetails.name,
          contract_no: contractDetails.contract_no || null,
          employer: contractDetails.employer || 'KeNHA',
          contractor_name: contractDetails.contractor_name || null,
          fidic_edition: contractDetails.fidic_edition || 'Red Book 1999',
          contract_sum: contractDetails.contract_sum ? parseFloat(contractDetails.contract_sum) : null,
          original_contract_sum: contractDetails.contract_sum ? parseFloat(contractDetails.contract_sum) : null,
          commencement_date: contractDetails.commencement_date || null,
          original_completion_date: contractDetails.original_completion_date || null,
          original_contract_period: contractDetails.original_contract_period ? parseInt(contractDetails.original_contract_period) : null,
          defects_liability_period: parseInt(contractDetails.defects_liability_period) || 365,
          start_chainage: contractDetails.start_chainage ? parseFloat(contractDetails.start_chainage) : null,
          end_chainage: contractDetails.end_chainage ? parseFloat(contractDetails.end_chainage) : null,
          road_class: contractDetails.road_class || null,
          county: contractDetails.county || null,
          region: contractDetails.region || null,
          category: contractDetails.category || 'Construction',
          current_phase: contractDetails.current_phase || 'Mobilization',
          status: 'active',
        };
        const { data: newProj, error: projErr } = await supabase.from('projects').insert(projectPayload).select().single();
        if (projErr) throw projErr;
        projectId = newProj.id;
        project = newProj;

        try {
          await supabase.rpc('seed_project_elements', { p_project_id: projectId, p_category: projectPayload.category });
        } catch (e) { /* ignore if RPC doesn't exist */ }
      }

      // Insert BoQ / Works Activities
      if (boqItems.length > 0) {
        const boqPayload = boqItems.map((item, i) => ({
          project_id: projectId,
          activity_code: item.item_no || `ITEM-${String(i + 1).padStart(3, '0')}`,
          activity_name: item.description,
          unit: item.unit || 'LS',
          planned_quantity: parseFloat(item.quantity) || 0,
          category: item.category || 'Other',
          sort_order: i + 1,
        }));
        const { error: boqErr } = await supabase.from('works_activities').insert(boqPayload);
        if (boqErr) throw boqErr;
      }

      // Insert Equipment
      if (equipmentList.length > 0) {
        const eqPayload = equipmentList.map(eq => ({
          project_id: projectId,
          equipment_name: eq.equipment_name,
          equipment_type: eq.equipment_type || 'Other',
          status: 'Operational',
        }));
        const { error: eqErr } = await supabase.from('equipment_register').insert(eqPayload);
        if (eqErr) throw eqErr;
      }

      // Insert Key Personnel
      if (personnelList.length > 0) {
        const kpPayload = personnelList.map(kp => ({
          project_id: projectId,
          name: kp.name || 'TBD',
          position_title: kp.position_title,
          party: kp.party || 'contractor',
          status: 'active',
        }));
        const { error: kpErr } = await supabase.from('key_personnel').insert(kpPayload);
        if (kpErr) throw kpErr;
      }

      const msg = isImportMode
        ? `✅ Imported ${boqItems.length} BoQ items, ${equipmentList.length} equipment, ${personnelList.length} personnel into ${existingProject.name}`
        : `🎉 Project created with ${boqItems.length} BoQ items, ${equipmentList.length} equipment, ${personnelList.length} personnel!`;
      showToast(msg);
      try { sessionStorage.removeItem(storageKey); } catch (e) {}
      navigateTo('project-dashboard', project);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──
  return (
    <div>
      <div className="page-header">
        <div>
          <h2>📄 {isImportMode ? `Import Contract Data` : 'Contract Setup Wizard'}</h2>
          <div className="subtitle">
            {isImportMode
              ? `Importing into: ${existingProject.name}`
              : 'Upload your contract documents to auto-populate project data'}
          </div>
        </div>
        <button className="btn btn-secondary"
          onClick={() => isImportMode ? navigateTo('project-dashboard', existingProject) : navigateTo('projects')}>
          ← {isImportMode ? 'Back to Dashboard' : 'Back to Projects'}
        </button>
      </div>

      {/* Step Navigator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', padding: '4px 0' }}>
        {WIZARD_STEPS.map(s => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div key={s.num} onClick={() => s.num <= step && setStep(s.num)}
              style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 'var(--radius)', cursor: s.num <= step ? 'pointer' : 'default',
                background: isActive ? 'var(--accent)' : isDone ? 'rgba(16,185,129,0.15)' : 'var(--bg-hover)',
                color: isActive ? '#fff' : isDone ? '#059669' : 'var(--text-muted)', transition: 'all 0.2s', minWidth: 80 }}>
              <div style={{ fontSize: 16 }}>{isDone ? '✓' : s.icon}</div>
              <div style={{ fontSize: 9, fontWeight: 700, marginTop: 2 }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* ══════ STEP 1: UPLOAD ══════ */}
      {step === 1 && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 4 }}>Upload Contract Documents</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Upload your contract PDF (even scanned) and/or BoQ Excel file. The AI will extract contract details,
            BoQ items, equipment schedule, and key personnel automatically.
          </p>

          <DropZone onFiles={handleFiles} files={files} label="Drop contract documents here" />

          <div style={{ marginTop: 10, padding: 10, background: 'rgba(16,185,129,0.06)', borderRadius: 'var(--radius)',
            border: '1px solid rgba(16,185,129,0.15)', fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 8 }}>
            🔒 Files are processed in your browser only — they are <strong>never uploaded or stored</strong> on the server.
          </div>

          {files.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Uploaded Files:</div>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  background: 'var(--bg-hover)', borderRadius: 'var(--radius)', marginBottom: 6, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>{/\.xlsx?$/i.test(f.name) ? '📊' : '📄'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {(f.size / 1024 / 1024).toFixed(1)} MB — {/\.xlsx?$/i.test(f.name) ? 'Will parse Excel directly' : 'Will use AI extraction'}
                    </div>
                  </div>
                  <span onClick={() => removeFile(i)} style={{ cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>✕</span>
                </div>
              ))}
            </div>
          )}

          {processing && (
            <div style={{ marginTop: 20, padding: 16, background: 'rgba(59,130,246,0.06)', borderRadius: 'var(--radius)',
              border: '1px solid rgba(59,130,246,0.2)', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Processing...</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{processStatus}</div>
              <div style={{ marginTop: 12, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: '60%', height: '100%', background: 'var(--accent)', borderRadius: 2, animation: 'pulse 1.5s infinite' }} />
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => processFiles(false)} disabled={processing || files.length === 0}
              style={{ ...btnPrimary, opacity: processing || files.length === 0 ? 0.5 : 1 }}>
              {processing ? '⏳ Processing...' : '📊 Import Data'}
            </button>
            <button onClick={() => processFiles(true)} disabled={processing || files.length === 0}
              style={{ ...btnSecondary, opacity: processing || files.length === 0 ? 0.5 : 1 }}
              title="Uses AI to detect any spreadsheet format — requires API key">
              {processing ? '⏳ Processing...' : '🤖 Smart Import (any format)'}
            </button>
            <button onClick={() => { setExtractionSource('manual'); setStep(2); }} style={btnSecondary}>
              ✏️ Skip — Enter Manually
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <strong>📊 Import Data</strong> — works instantly for Kenya Standard BoQ and common formats. No API key needed.<br/>
            <strong>🤖 Smart Import</strong> — uses AI to understand any spreadsheet format. Requires API key in Vercel settings.
          </div>
        </div>
      )}

      {/* ══════ STEP 2: CONTRACT DETAILS ══════ */}
      {step === 2 && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 4 }}>Contract Details</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {extractionSource === 'ai' ? '✨ AI-extracted — review and correct as needed' :
             extractionSource === 'excel' ? '📊 Parsed from Excel — fill in any missing details' :
             '✏️ Enter your contract details manually'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
            <FormField label="Project Name *" value={contractDetails.name} onChange={v => setContractDetails(p => ({ ...p, name: v }))} />
            <FormField label="Contract No." value={contractDetails.contract_no} onChange={v => setContractDetails(p => ({ ...p, contract_no: v }))} />
            <FormField label="Employer" value={contractDetails.employer} onChange={v => setContractDetails(p => ({ ...p, employer: v }))} />
            <FormField label="Contractor" value={contractDetails.contractor_name} onChange={v => setContractDetails(p => ({ ...p, contractor_name: v }))} />
            <FormField label="Supervising Consultant" value={contractDetails.consultant} onChange={v => setContractDetails(p => ({ ...p, consultant: v }))} />
            <FormField label="FIDIC Edition" value={contractDetails.fidic_edition} type="select" options={FIDIC_EDITIONS}
              onChange={v => setContractDetails(p => ({ ...p, fidic_edition: v }))} />
            <FormField label="Contract Sum (KES)" value={contractDetails.contract_sum} type="number"
              onChange={v => setContractDetails(p => ({ ...p, contract_sum: v }))} />
            <FormField label="Funding Source" value={contractDetails.funding_source}
              type="select" options={['GoK', 'World Bank', 'AfDB', 'EU', 'JICA', 'KfW', 'Other']}
              onChange={v => setContractDetails(p => ({ ...p, funding_source: v }))} />
            <FormField label="Commencement Date" value={contractDetails.commencement_date} type="date"
              onChange={v => setContractDetails(p => ({ ...p, commencement_date: v }))} />
            <FormField label="Original Completion Date" value={contractDetails.original_completion_date} type="date"
              onChange={v => setContractDetails(p => ({ ...p, original_completion_date: v }))} />
            <FormField label="Contract Period (days)" value={contractDetails.original_contract_period} type="number"
              onChange={v => setContractDetails(p => ({ ...p, original_contract_period: v }))} />
            <FormField label="DLP (days)" value={contractDetails.defects_liability_period} type="number"
              onChange={v => setContractDetails(p => ({ ...p, defects_liability_period: v }))} />
            <FormField label="Start Chainage (km)" value={contractDetails.start_chainage} type="number"
              onChange={v => setContractDetails(p => ({ ...p, start_chainage: v }))} />
            <FormField label="End Chainage (km)" value={contractDetails.end_chainage} type="number"
              onChange={v => setContractDetails(p => ({ ...p, end_chainage: v }))} />
            <FormField label="Road Class" value={contractDetails.road_class}
              type="select" options={['A', 'B', 'C', 'D', 'E', 'Special']}
              onChange={v => setContractDetails(p => ({ ...p, road_class: v }))} />
            <FormField label="County" value={contractDetails.county} onChange={v => setContractDetails(p => ({ ...p, county: v }))} />
            <FormField label="Category" value={contractDetails.category}
              type="select" options={['Construction', 'Rehabilitation', 'Maintenance']}
              onChange={v => setContractDetails(p => ({ ...p, category: v }))} />
            <FormField label="Current Phase" value={contractDetails.current_phase}
              type="select" options={['Procurement', 'Mobilization', 'Construction', 'Defects Liability', 'Completed']}
              onChange={v => setContractDetails(p => ({ ...p, current_phase: v }))} />
          </div>
        </div>
      )}

      {/* ══════ STEP 3: BOQ ══════ */}
      {step === 3 && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>BoQ / Works Activities</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {boqItems.length} items extracted. Review, edit, add or remove items before saving.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                📊 Import Excel
                <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={async e => {
                    const f = e.target.files[0]; if (!f) return;
                    const result = await parseExcelFile(f);
                    if (result.boq.length > 0) {
                      setBoqItems(prev => [...prev, ...result.boq]);
                      showToast(`Added ${result.boq.length} BoQ items from ${f.name}`);
                    } else {
                      showToast('No BoQ items found in this file', 'error');
                    }
                  }} />
              </label>
            </div>
          </div>

          <EditableTable
            columns={[
              { key: 'item_no', label: 'Item No.', width: 80, placeholder: '1/01/001' },
              { key: 'description', label: 'Description', minWidth: 200, placeholder: 'Activity description' },
              { key: 'unit', label: 'Unit', width: 60, placeholder: 'km' },
              { key: 'quantity', label: 'Qty', width: 70, type: 'number' },
              { key: 'rate', label: 'Rate (KES)', width: 90, type: 'number' },
              { key: 'amount', label: 'Amount (KES)', width: 100, type: 'number' },
              { key: 'category', label: 'Category', width: 110, type: 'select', options: BOQ_CATEGORIES },
            ]}
            data={boqItems} setData={setBoqItems}
            emptyRow={{ item_no: '', description: '', unit: 'LS', quantity: 0, rate: 0, amount: 0, category: 'Other' }}
          />

          {boqItems.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)', display: 'flex', gap: 20, fontSize: 12 }}>
              <span><strong>Total Items:</strong> {boqItems.length}</span>
              <span><strong>Total Amount:</strong> KES {boqItems.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0).toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {/* ══════ STEP 4: EQUIPMENT ══════ */}
      {step === 4 && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <h3>Equipment Register</h3>
            <SaveIndicator storageKey={storageKey} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Tick the equipment on your project. You can edit quantities and add custom items below.
          </p>

          {/* Quick-add checklist from standard equipment */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>🚜 Standard Road Construction Plant</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6 }}>
              {STANDARD_EQUIPMENT.map(eq => {
                const isAdded = equipmentList.some(e => e.equipment_name === eq.equipment_name);
                return (
                  <div key={eq.equipment_name} onClick={() => {
                    if (isAdded) {
                      setEquipmentList(prev => prev.filter(e => e.equipment_name !== eq.equipment_name));
                    } else {
                      setEquipmentList(prev => [...prev, { ...eq, quantity: 1, ownership: 'Owned' }]);
                    }
                  }} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer',
                    background: isAdded ? 'rgba(16,185,129,0.08)' : 'var(--bg-hover)',
                    border: `1px solid ${isAdded ? '#10b981' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)', transition: 'all 0.15s', fontSize: 12,
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isAdded ? '#10b981' : 'var(--bg-card)', border: `2px solid ${isAdded ? '#10b981' : 'var(--border)'}`,
                      color: '#fff', fontSize: 11, fontWeight: 800 }}>{isAdded ? '✓' : ''}</div>
                    <span style={{ fontWeight: isAdded ? 600 : 400 }}>{eq.equipment_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{eq.equipment_type}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Editable table for selected + custom equipment */}
          {equipmentList.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📋 Selected Equipment ({equipmentList.length})</div>
              <EditableTable
                columns={[
                  { key: 'equipment_name', label: 'Equipment Name', minWidth: 200, placeholder: 'e.g. CAT 140H Motor Grader' },
                  { key: 'equipment_type', label: 'Type', width: 120, type: 'select', options: EQUIP_TYPES },
                  { key: 'quantity', label: 'Qty', width: 60, type: 'number' },
                  { key: 'ownership', label: 'Ownership', width: 100, type: 'select', options: ['Owned', 'Leased', 'Hired'] },
                ]}
                data={equipmentList} setData={setEquipmentList}
                emptyRow={{ equipment_name: '', equipment_type: 'Other', quantity: 1, ownership: 'Owned' }}
              />
            </>
          )}
        </div>
      )}

      {/* ══════ STEP 5: KEY PERSONNEL ══════ */}
      {step === 5 && (
        <PersonnelStep
          personnelList={personnelList} setPersonnelList={setPersonnelList}
          storageKey={storageKey} parseExcelFile={parseExcelFile} showToast={showToast}
        />
      )}

      {/* ══════ STEP 6: CONFIRM ══════ */}
      {step === 6 && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Confirm & Create Project</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { icon: '📋', label: 'Project', value: contractDetails.name || 'Not set', color: contractDetails.name ? '#059669' : '#ef4444' },
              { icon: '🏗️', label: 'Contractor', value: contractDetails.contractor_name || 'Not set' },
              { icon: '💰', label: 'Contract Sum', value: contractDetails.contract_sum ? `KES ${Number(contractDetails.contract_sum).toLocaleString()}` : 'Not set' },
              { icon: '📐', label: 'FIDIC', value: contractDetails.fidic_edition || 'Not set' },
              { icon: '⛏️', label: 'BoQ Items', value: boqItems.length, color: boqItems.length > 0 ? '#059669' : '#f59e0b' },
              { icon: '🚜', label: 'Equipment', value: equipmentList.length, color: equipmentList.length > 0 ? '#059669' : '#f59e0b' },
              { icon: '👔', label: 'Personnel', value: personnelList.length, color: personnelList.length > 0 ? '#059669' : '#f59e0b' },
              { icon: '📄', label: 'Source', value: extractionSource === 'ai' ? 'AI Extracted' : extractionSource === 'excel' ? 'Excel Import' : 'Manual Entry' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: 14, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                <div style={{ fontSize: 20 }}>{s.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color || 'var(--text)', marginTop: 4 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {!isImportMode && !contractDetails.name && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 12, color: '#ef4444', marginBottom: 16 }}>
              ⚠️ Project name is required. Go back to Step 2 to fill it in.
            </div>
          )}

          <button onClick={handleConfirm} disabled={saving || (!isImportMode && !contractDetails.name)}
            style={{ ...btnPrimary, width: '100%', padding: 14, fontSize: 16, opacity: saving || (!isImportMode && !contractDetails.name) ? 0.5 : 1 }}>
            {saving ? '⏳ Saving...' : isImportMode ? `✅ Import Data into ${existingProject.name}` : '✅ Create Project & Import All Data'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
          ← Previous
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>Step {step} of {WIZARD_STEPS.length}</span>
        {step < WIZARD_STEPS.length ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>Next →</button>
        ) : (
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || !contractDetails.name}>
            {saving ? 'Creating...' : '✅ Confirm'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Personnel Step with Upload Feature ──
function PersonnelStep({ personnelList, setPersonnelList, storageKey, parseExcelFile, showToast }) {
  const [uploadedPeople, setUploadedPeople] = useState([]);
  const [bulkParty, setBulkParty] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // Parse Excel — look for name/position columns
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const people = [];

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rawRows.length < 2) continue;

        // Find header row
        let hdrIdx = -1;
        for (let r = 0; r < Math.min(5, rawRows.length); r++) {
          const rowStr = rawRows[r].map(c => String(c).toUpperCase()).join('|');
          if (rowStr.includes('NAME') || rowStr.includes('PERSONNEL') || rowStr.includes('DESIGNATION') || rowStr.includes('POSITION')) {
            hdrIdx = r; break;
          }
        }
        if (hdrIdx < 0) hdrIdx = 0; // Assume first row is header

        const hdrs = rawRows[hdrIdx].map(h => String(h).toUpperCase().trim());
        const nameCol = hdrs.findIndex(h => h.includes('NAME') || h.includes('PERSONNEL') || h.includes('STAFF'));
        const posCol = hdrs.findIndex(h => h.includes('POSITION') || h.includes('DESIGNATION') || h.includes('TITLE') || h.includes('ROLE'));
        const qualCol = hdrs.findIndex(h => h.includes('QUALIFICATION') || h.includes('EDUCATION') || h.includes('DEGREE'));

        // If no clear columns, use first two columns as name and position
        const nCol = nameCol >= 0 ? nameCol : 0;
        const pCol = posCol >= 0 ? posCol : (nameCol >= 0 ? (nameCol === 0 ? 1 : 0) : 1);

        for (let r = hdrIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          const name = String(row[nCol] || '').trim();
          const position = String(row[pCol] || '').trim();
          const quals = qualCol >= 0 ? String(row[qualCol] || '').trim() : '';

          if (!name && !position) continue;
          if (/^(no|s\/n|#|total|sub)/i.test(name) && name.length < 5) continue;

          people.push({
            name: name || '',
            position_title: position || '',
            party: '', // User will assign
            qualifications: quals,
            _selected: true,
          });
        }
      }

      if (people.length > 0) {
        setUploadedPeople(people);
        setShowUpload(true);
        showToast(`Found ${people.length} people in ${file.name}`);
      } else {
        showToast('No personnel found in this file. Check the format.', 'error');
      }
    } catch (err) {
      showToast(`Error reading file: ${err.message}`, 'error');
    }
  }

  function applyBulkParty() {
    if (!bulkParty) return;
    setUploadedPeople(prev => prev.map(p => ({ ...p, party: p.party || bulkParty })));
  }

  function addUploadedToList() {
    const toAdd = uploadedPeople.filter(p => p._selected && p.party);
    if (toAdd.length === 0) {
      showToast('Select people and assign a party first', 'error');
      return;
    }
    setPersonnelList(prev => [...prev, ...toAdd.map(({ _selected, ...rest }) => rest)]);
    setUploadedPeople([]);
    setShowUpload(false);
    showToast(`Added ${toAdd.length} personnel`);
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3>Key Personnel</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '6px 12px' }}>
            📊 Upload Personnel List
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
          <SaveIndicator storageKey={storageKey} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Tick standard roles below, or upload an Excel list from the contractor/consultant/employer.
      </p>

      {/* ── Uploaded Personnel Review ── */}
      {showUpload && uploadedPeople.length > 0 && (
        <div style={{ marginBottom: 20, padding: 16, background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
              📊 Imported {uploadedPeople.length} people — assign party and add
            </div>
            <button onClick={() => { setShowUpload(false); setUploadedPeople([]); }}
              style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Cancel</button>
          </div>

          {/* Bulk party assignment */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Assign all to:</span>
            <select value={bulkParty} onChange={e => setBulkParty(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }}>
              <option value="">Select party...</option>
              {PARTIES.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
            </select>
            <button onClick={applyBulkParty} disabled={!bulkParty}
              style={{ ...btnSecondary, fontSize: 11, padding: '4px 10px', opacity: bulkParty ? 1 : 0.5 }}>Apply</button>
          </div>

          {/* Review table */}
          <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-hover)', position: 'sticky', top: 0 }}>
                  <th style={{ ...thStyle, width: 30 }}>✓</th>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Position</th>
                  <th style={{ ...thStyle, width: 150 }}>Party</th>
                </tr>
              </thead>
              <tbody>
                {uploadedPeople.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: p._selected ? 'transparent' : 'rgba(0,0,0,0.05)' }}>
                    <td style={tdStyle}>
                      <input type="checkbox" checked={p._selected}
                        onChange={e => setUploadedPeople(prev => prev.map((pp, idx) => idx === i ? { ...pp, _selected: e.target.checked } : pp))} />
                    </td>
                    <td style={tdStyle}>
                      <input type="text" value={p.name} onChange={e => setUploadedPeople(prev => prev.map((pp, idx) => idx === i ? { ...pp, name: e.target.value } : pp))}
                        style={{ ...inputStyle, fontWeight: 600 }} />
                    </td>
                    <td style={tdStyle}>
                      <input type="text" value={p.position_title} onChange={e => setUploadedPeople(prev => prev.map((pp, idx) => idx === i ? { ...pp, position_title: e.target.value } : pp))}
                        style={inputStyle} />
                    </td>
                    <td style={tdStyle}>
                      <select value={p.party} onChange={e => setUploadedPeople(prev => prev.map((pp, idx) => idx === i ? { ...pp, party: e.target.value } : pp))}
                        style={{ ...inputStyle, color: p.party ? 'var(--text)' : '#ef4444', fontWeight: p.party ? 400 : 700 }}>
                        <option value="">⚠ Assign party</option>
                        {PARTIES.map(pt => <option key={pt.value} value={pt.value}>{pt.icon} {pt.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button onClick={addUploadedToList} style={{ ...btnPrimary, fontSize: 13, padding: '8px 16px' }}>
              ✅ Add {uploadedPeople.filter(p => p._selected && p.party).length} personnel to project
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {uploadedPeople.filter(p => p._selected && !p.party).length > 0 &&
                `⚠ ${uploadedPeople.filter(p => p._selected && !p.party).length} still need a party assigned`}
            </span>
          </div>
        </div>
      )}

      {/* ── Standard FIDIC roles checklist ── */}
      {PARTIES.map(p => {
        const partyRoles = STANDARD_PERSONNEL.filter(sp => sp.party === p.value);
        return (
          <div key={p.value} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, color: p.color }}>
              {p.icon} {p.label}
              <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>— {p.desc}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
              {partyRoles.map(role => {
                const isAdded = personnelList.some(pl => pl.position_title === role.position_title && pl.party === role.party);
                const existing = personnelList.find(pl => pl.position_title === role.position_title && pl.party === role.party);
                return (
                  <div key={`${role.party}-${role.position_title}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer',
                    background: isAdded ? 'rgba(16,185,129,0.08)' : 'var(--bg-hover)',
                    border: `1px solid ${isAdded ? '#10b981' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)', transition: 'all 0.15s',
                  }} onClick={() => {
                    if (isAdded) {
                      setPersonnelList(prev => prev.filter(pl => !(pl.position_title === role.position_title && pl.party === role.party)));
                    } else {
                      setPersonnelList(prev => [...prev, { name: '', position_title: role.position_title, party: role.party, qualifications: '' }]);
                    }
                  }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isAdded ? '#10b981' : 'var(--bg-card)', border: `2px solid ${isAdded ? '#10b981' : 'var(--border)'}`,
                      color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{isAdded ? '✓' : ''}</div>
                    <span style={{ fontSize: 12, fontWeight: isAdded ? 600 : 400 }}>{role.position_title}</span>
                    {isAdded && existing?.name && (
                      <span style={{ fontSize: 10, color: '#059669', marginLeft: 'auto' }}>{existing.name}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Editable table */}
      {personnelList.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>
            📋 Selected Personnel ({personnelList.length}) — add names and qualifications below
          </div>
          <EditableTable
            columns={[
              { key: 'name', label: 'Name', minWidth: 150, placeholder: 'Full name (or TBD)' },
              { key: 'position_title', label: 'Position', minWidth: 180, placeholder: 'e.g. Resident Engineer' },
              { key: 'party', label: 'Party', width: 130, type: 'select', options: PARTY_VALUES },
              { key: 'qualifications', label: 'Qualifications', minWidth: 140, placeholder: 'BSc Civil Eng' },
            ]}
            data={personnelList} setData={setPersonnelList}
            emptyRow={{ name: '', position_title: '', party: 'contractor', qualifications: '' }}
          />
        </>
      )}
    </div>
  );
}

// ── Helper Components ──
function FormField({ label, value, onChange, type = 'text', options = [] }) {
  return (
    <div className="form-group" style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 11, fontWeight: 600 }}>{label}</label>
      {type === 'select' ? (
        <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
      )}
    </div>
  );
}

// ── Helper Functions ──
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function findCol(row, headers, keywords) {
  const keys = Object.keys(row);
  for (const kw of keywords) {
    const idx = headers.findIndex(h => h.includes(kw.toLowerCase()));
    if (idx >= 0 && row[keys[idx]] !== undefined && row[keys[idx]] !== '') return row[keys[idx]];
  }
  return '';
}

function parseNum(val) {
  if (val === '' || val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/[,\s]/g, '')) || 0;
}

function guessCategoryFromBill(sheetName) {
  const s = sheetName.toLowerCase();
  if (/prelim|general/i.test(s)) return 'Preliminary';
  if (/site\s*clear|topsoil/i.test(s)) return 'Earthworks';
  if (/earth/i.test(s)) return 'Earthworks';
  if (/excav.*fill|filling.*struct/i.test(s)) return 'Structures';
  if (/culvert|drain/i.test(s)) return 'Drainage';
  if (/passage|traffic/i.test(s)) return 'Preliminary';
  if (/natural\s*material|subbase|sub.*base/i.test(s)) return 'Pavement';
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

function guessBoqCategory(desc) {
  const d = desc.toLowerCase();
  if (/prelim|general|site clear|mobiliz|establish|insur|bond/i.test(d)) return 'Preliminary';
  if (/earth|excav|fill|cut|borrow|compact|formation|subgrade/i.test(d)) return 'Earthworks';
  if (/sub.?base|base.?course|gravel|pavement|layer|crush/i.test(d)) return 'Pavement';
  if (/drain|culvert|pipe|ditch|scour|mitre|catch/i.test(d)) return 'Drainage';
  if (/bridge|retain|wall|abut|pier|box.*culvert|headwall|wing/i.test(d)) return 'Structures';
  if (/surfac|seal|prime|tack|asphalt|bitum|ac.*layer|wearing/i.test(d)) return 'Surfacing';
  if (/sign|guard|marker|delineat|road.?mark|paint|bollard|kerb/i.test(d)) return 'Road Furniture';
  if (/daywork|day.*work|provisional|contingenc/i.test(d)) return 'Dayworks';
  return 'Other';
}

function guessEquipType(name) {
  const n = name.toLowerCase();
  if (/grader/i.test(n)) return 'Grader';
  if (/excav|backhoe/i.test(n)) return 'Excavator';
  if (/roller|compact/i.test(n)) return 'Roller';
  if (/loader/i.test(n)) return 'Loader';
  if (/dozer|bull/i.test(n)) return 'Dozer';
  if (/tipper|dump/i.test(n)) return 'Tipper';
  if (/bowser|water.*tank/i.test(n)) return 'Bowser';
  if (/paver/i.test(n)) return 'Paver';
  if (/crush/i.test(n)) return 'Crusher';
  if (/compress/i.test(n)) return 'Compressor';
  if (/generat/i.test(n)) return 'Generator';
  if (/concrete.*mix|batch/i.test(n)) return 'Concrete Mixer';
  if (/bitum.*distrib/i.test(n)) return 'Bitumen Distributor';
  return 'Other';
}

function guessParty(position) {
  const p = position.toLowerCase();
  if (/resident.*eng|re |inspector|supervision|survey.*eng|material.*eng/i.test(p)) return 'engineer';
  if (/employer|client|director/i.test(p)) return 'employer';
  return 'contractor';
}

function mapContractDetails(ai) {
  return {
    name: ai.project_name || '',
    contract_no: ai.contract_no || '',
    employer: ai.employer || 'KeNHA',
    contractor_name: ai.contractor_name || '',
    consultant: ai.consultant || '',
    fidic_edition: ai.fidic_edition || 'Red Book 1999',
    contract_sum: ai.contract_sum || '',
    commencement_date: ai.commencement_date || '',
    original_completion_date: ai.original_completion_date || '',
    original_contract_period: ai.original_contract_period || '',
    defects_liability_period: ai.defects_liability_period || 365,
    start_chainage: ai.start_chainage || '',
    end_chainage: ai.end_chainage || '',
    road_class: ai.road_class || '',
    county: ai.county || '',
    region: ai.region || '',
    funding_source: ai.funding_source || 'GoK',
  };
}
