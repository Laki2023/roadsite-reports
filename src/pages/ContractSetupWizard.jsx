import React, { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

const BOQ_CATEGORIES = ['Preliminary', 'Earthworks', 'Pavement', 'Drainage', 'Structures', 'Surfacing', 'Road Furniture', 'Dayworks', 'Other'];
const EQUIP_TYPES = ['Grader', 'Excavator', 'Roller', 'Loader', 'Dozer', 'Tipper', 'Bowser', 'Paver', 'Crusher', 'Compressor', 'Generator', 'Concrete Mixer', 'Bitumen Distributor', 'Water Tanker', 'Other'];
const PARTIES = ['contractor', 'engineer', 'employer', 'subcontractor'];
const FIDIC_EDITIONS = ['Red Book 1999', 'Red Book 2017', 'Yellow Book 1999', 'Pink Book MDB', 'FIDIC 1987 4th Ed'];

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

// ── Main Wizard ──
export default function ContractSetupWizard({ profile, showToast, navigateTo }) {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // Extracted data
  const [contractDetails, setContractDetails] = useState({
    name: '', contract_no: '', employer: 'KeNHA', contractor_name: '', consultant: '',
    fidic_edition: 'Red Book 1999', contract_sum: '', commencement_date: '',
    original_completion_date: '', original_contract_period: '', defects_liability_period: 365,
    start_chainage: '', end_chainage: '', road_class: '', county: '', region: '',
    funding_source: 'GoK', category: 'Construction', current_phase: 'Mobilization', status: 'active',
  });
  const [boqItems, setBoqItems] = useState([]);
  const [equipmentList, setEquipmentList] = useState([]);
  const [personnelList, setPersonnelList] = useState([]);
  const [extractionSource, setExtractionSource] = useState(''); // 'ai' or 'excel' or 'manual'

  // ── File Handling ──
  function handleFiles(newFiles) {
    setFiles(prev => [...prev, ...newFiles]);
  }

  function removeFile(i) {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
  }

  // ── Excel Parsing (client-side, no AI needed) ──
  async function parseExcelFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const results = { boq: [], equipment: [], personnel: [] };

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (rows.length === 0) continue;

      const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());

      // Detect BoQ sheet
      if (headers.some(h => h.includes('item') || h.includes('bill')) &&
          headers.some(h => h.includes('description') || h.includes('desc')) &&
          headers.some(h => h.includes('qty') || h.includes('quantity') || h.includes('amount'))) {
        for (const row of rows) {
          const vals = Object.values(row);
          const itemNo = findCol(row, headers, ['item', 'no', 'ref', 'bill']);
          const desc = findCol(row, headers, ['description', 'desc', 'particulars', 'item description']);
          const unit = findCol(row, headers, ['unit', 'units']);
          const qty = parseNum(findCol(row, headers, ['qty', 'quantity']));
          const rate = parseNum(findCol(row, headers, ['rate', 'unit rate', 'price']));
          const amount = parseNum(findCol(row, headers, ['amount', 'total', 'sum']));
          if (desc && (qty || amount)) {
            results.boq.push({
              item_no: String(itemNo || ''), description: String(desc), unit: String(unit || 'LS'),
              quantity: qty || 0, rate: rate || 0, amount: amount || (qty * rate) || 0,
              category: guessBoqCategory(String(desc)),
            });
          }
        }
      }

      // Detect Equipment sheet
      if (headers.some(h => h.includes('equipment') || h.includes('plant') || h.includes('machine'))) {
        for (const row of rows) {
          const name = findCol(row, headers, ['equipment', 'plant', 'machine', 'description', 'name', 'type']);
          const qty = parseNum(findCol(row, headers, ['qty', 'quantity', 'no', 'number']));
          if (name && String(name).length > 2) {
            results.equipment.push({
              equipment_name: String(name), equipment_type: guessEquipType(String(name)),
              quantity: qty || 1, ownership: 'Owned',
            });
          }
        }
      }

      // Detect Personnel sheet
      if (headers.some(h => h.includes('personnel') || h.includes('staff') || h.includes('position') || h.includes('designation'))) {
        for (const row of rows) {
          const name = findCol(row, headers, ['name', 'staff name', 'personnel']);
          const position = findCol(row, headers, ['position', 'designation', 'title', 'role']);
          if (position) {
            results.personnel.push({
              name: String(name || ''), position_title: String(position),
              party: guessParty(String(position)), qualifications: '',
            });
          }
        }
      }
    }
    return results;
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
  async function processFiles() {
    if (files.length === 0) { showToast('Please upload at least one file', 'error'); return; }
    setProcessing(true);
    let allBoq = [], allEquip = [], allPersonnel = [];
    let details = { ...contractDetails };

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isExcel = /\.(xlsx?|csv)$/i.test(file.name);

        if (isExcel) {
          setProcessStatus(`Parsing Excel: ${file.name}...`);
          const result = await parseExcelFile(file);
          allBoq.push(...result.boq);
          allEquip.push(...result.equipment);
          allPersonnel.push(...result.personnel);
          setExtractionSource('excel');
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
    if (!contractDetails.name) { showToast('Project name is required', 'error'); return; }
    setSaving(true);

    try {
      // 1. Create project
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

      const { data: project, error: projErr } = await supabase.from('projects').insert(projectPayload).select().single();
      if (projErr) throw projErr;
      const projectId = project.id;

      // 2. Seed default construction elements
      try {
        await supabase.rpc('seed_project_elements', { p_project_id: projectId, p_category: projectPayload.category });
      } catch (e) { /* ignore if RPC doesn't exist */ }

      // 3. Insert BoQ / Works Activities
      if (boqItems.length > 0) {
        const boqPayload = boqItems.map((item, i) => ({
          project_id: projectId,
          activity_code: item.item_no || `ITEM-${String(i + 1).padStart(3, '0')}`,
          activity_name: item.description,
          unit: item.unit || 'LS',
          planned_quantity: parseFloat(item.quantity) || 0,
          rate: parseFloat(item.rate) || 0,
          boq_amount: parseFloat(item.amount) || 0,
          category: item.category || 'Other',
          sort_order: i + 1,
        }));
        const { error: boqErr } = await supabase.from('works_activities').insert(boqPayload);
        if (boqErr) throw boqErr;
      }

      // 4. Insert Equipment
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

      // 5. Insert Key Personnel
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

      showToast(`🎉 Project created with ${boqItems.length} BoQ items, ${equipmentList.length} equipment, ${personnelList.length} personnel!`);
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
          <h2>📄 Contract Setup Wizard</h2>
          <div className="subtitle">Upload your contract documents to auto-populate project data</div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigateTo('projects')}>← Back to Projects</button>
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

          <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
            <button onClick={processFiles} disabled={processing || files.length === 0}
              style={{ ...btnPrimary, opacity: processing || files.length === 0 ? 0.5 : 1 }}>
              {processing ? '⏳ Processing...' : '🤖 Extract & Import Data'}
            </button>
            <button onClick={() => { setExtractionSource('manual'); setStep(2); }} style={btnSecondary}>
              ✏️ Skip — Enter Manually
            </button>
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
          <h3 style={{ marginBottom: 4 }}>Equipment Register</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {equipmentList.length} items extracted. These will be available for daily report equipment tracking.
          </p>

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
        </div>
      )}

      {/* ══════ STEP 5: KEY PERSONNEL ══════ */}
      {step === 5 && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginBottom: 4 }}>Key Personnel</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {personnelList.length} personnel extracted. These will appear in daily report attendance tracking.
          </p>

          <EditableTable
            columns={[
              { key: 'name', label: 'Name', minWidth: 150, placeholder: 'Full name (or TBD)' },
              { key: 'position_title', label: 'Position', minWidth: 180, placeholder: 'e.g. Resident Engineer' },
              { key: 'party', label: 'Party', width: 120, type: 'select', options: PARTIES },
              { key: 'qualifications', label: 'Qualifications', minWidth: 140, placeholder: 'BSc Civil Eng' },
            ]}
            data={personnelList} setData={setPersonnelList}
            emptyRow={{ name: '', position_title: '', party: 'contractor', qualifications: '' }}
          />
        </div>
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

          {!contractDetails.name && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 12, color: '#ef4444', marginBottom: 16 }}>
              ⚠️ Project name is required. Go back to Step 2 to fill it in.
            </div>
          )}

          <button onClick={handleConfirm} disabled={saving || !contractDetails.name}
            style={{ ...btnPrimary, width: '100%', padding: 14, fontSize: 16, opacity: saving || !contractDetails.name ? 0.5 : 1 }}>
            {saving ? '⏳ Creating Project...' : '✅ Create Project & Import All Data'}
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
