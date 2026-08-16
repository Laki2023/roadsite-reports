import React, { useState, useEffect, useRef } from 'react';
import { supabase, hasRole, ROLE_LABELS, INSTRUCTION_TYPES } from '../lib/supabase';
import PhotoUploader, { uploadReportPhotos } from '../components/PhotoUploader';
import {
  WEATHER_OPTIONS,
  EQUIPMENT_LIST, EQUIPMENT_STATUS_OPTIONS, EQUIPMENT_CATEGORIES,
  STRUCTURES_LIST, STRUCTURE_STATUS_OPTIONS, STRUCTURE_CATEGORIES,
  ACTIVITIES_LIST, ACTIVITY_CATEGORIES,
  QUALITY_TESTS_LIST, QUALITY_TEST_CATEGORIES,
  MATERIALS_LIST,
  ISSUE_CATEGORIES as REF_ISSUE_CATEGORIES,
} from '../data/referenceData';

// ── Constants ──
const ISSUE_SEVERITY = ['Low', 'Medium', 'High', 'Critical'];

const STEPS = [
  { num: 1, label: 'Project & Weather', icon: '🌤️', short: 'Weather' },
  { num: 2, label: 'Contractor Workforce', icon: '🏗️', short: 'Contractor' },
  { num: 3, label: "Engineer's Team", icon: '👷', short: 'Engineer' },
  { num: 4, label: 'Works Progress', icon: '⛏️', short: 'Works' },
  { num: 5, label: 'Equipment', icon: '🚜', short: 'Equipment' },
  { num: 6, label: 'Quality & Materials', icon: '🧪', short: 'Quality' },
  { num: 7, label: 'Structures', icon: '🌉', short: 'Structures' },
  { num: 8, label: 'Issues & Instructions', icon: '⚠️', short: 'Issues' },
  { num: 9, label: 'Review & Submit', icon: '✅', short: 'Submit' },
];

// ── Standard Road Construction Layers/Activities ──
const WORK_LAYERS = [
  // Earthworks & Formation
  { name: 'Site Clearance', unit: 'Km', group: 'earthworks' },
  { name: 'Top Soil Stripping', unit: 'Km', group: 'earthworks' },
  { name: 'Compaction of OGL', unit: 'Km', group: 'earthworks' },
  { name: 'Final Earthworks', unit: 'Km', group: 'earthworks' },
  { name: 'Cut to Fill', unit: 'm³', group: 'earthworks' },
  { name: 'Cut to Spoil', unit: 'm³', group: 'earthworks' },
  { name: 'Fill from Borrow', unit: 'm³', group: 'earthworks' },
  { name: 'Rock Excavation', unit: 'm³', group: 'earthworks' },
  { name: 'Fill in Structures', unit: 'm³', group: 'earthworks' },
  // Pavement Layers
  { name: 'Bottom Subgrade', unit: 'Km', group: 'pavement' },
  { name: 'Top Subgrade', unit: 'Km', group: 'pavement' },
  { name: 'Improved Subgrade', unit: 'Km', group: 'pavement' },
  { name: 'CIG Subbase', unit: 'Km', group: 'pavement' },
  { name: 'Natural Gravel Subbase', unit: 'Km', group: 'pavement' },
  { name: 'GCS Base', unit: 'Km', group: 'pavement' },
  { name: 'Cement Stabilised Base', unit: 'Km', group: 'pavement' },
  { name: 'Concrete Pavement', unit: 'Km', group: 'pavement' },
  // Surfacing
  { name: 'Prime Coat', unit: 'Km', group: 'surfacing' },
  { name: 'Tack Coat', unit: 'Km', group: 'surfacing' },
  { name: 'Binder Course (AC)', unit: 'Km', group: 'surfacing' },
  { name: 'Wearing Course (AC)', unit: 'Km', group: 'surfacing' },
  { name: 'Surface Dressing', unit: 'Km', group: 'surfacing' },
  { name: 'Slurry Seal', unit: 'Km', group: 'surfacing' },
  // Drainage & Structures
  { name: 'Pipe Culverts & Sleeves', unit: 'm', group: 'drainage' },
  { name: 'Box Culverts', unit: 'No.', group: 'drainage' },
  { name: 'Side Drains / Ditches', unit: 'm', group: 'drainage' },
  { name: 'Mitre Drains', unit: 'No.', group: 'drainage' },
  { name: 'Scour Checks', unit: 'No.', group: 'drainage' },
  { name: 'Headwalls / Wingwalls', unit: 'No.', group: 'drainage' },
  { name: 'Bridge Works', unit: 'm', group: 'drainage' },
  { name: 'Gabion / Rip-rap Protection', unit: 'm³', group: 'drainage' },
  { name: 'Retaining Walls', unit: 'm', group: 'drainage' },
  // Road Furniture & Finishes
  { name: 'Guard Rails', unit: 'm', group: 'furniture' },
  { name: 'Road Signs', unit: 'No.', group: 'furniture' },
  { name: 'Road Marking', unit: 'Km', group: 'furniture' },
  { name: 'Kerbing', unit: 'm', group: 'furniture' },
  { name: 'Footpaths / Walkways', unit: 'm', group: 'furniture' },
  { name: 'Bus Bays / Lay-bys', unit: 'No.', group: 'furniture' },
  { name: 'Speed Bumps / Humps', unit: 'No.', group: 'furniture' },
  { name: 'Delineator Posts', unit: 'No.', group: 'furniture' },
  // Other
  { name: 'Relocation of Services', unit: 'LS', group: 'other' },
  { name: 'Environmental Mitigation', unit: 'LS', group: 'other' },
  { name: 'Remedial / Defects Works', unit: 'LS', group: 'other' },
];

// ════════════════════════════════════════════════════════
// SearchableDropdown — inline component with type-ahead,
// category grouping, and "Add custom..." option
// ════════════════════════════════════════════════════════
function SearchableDropdown({ items, value, onChange, placeholder = 'Search...', allowCustom = true, style = {} }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) { setOpen(false); setSearch(''); } }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // items can be strings or { name, category }
  const normalized = items.map(i => typeof i === 'string' ? { name: i, category: '' } : i);
  const filtered = search.trim()
    ? normalized.filter(i => i.name.toLowerCase().includes(search.toLowerCase().trim()))
    : normalized;

  // Group by category
  const groups = {};
  filtered.forEach(item => {
    const cat = item.category || '';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });

  const handleSelect = (val) => { onChange(val); setOpen(false); setSearch(''); };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px',
          border: `1.5px solid ${open ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius)',
          background: 'var(--bg-card)', cursor: 'pointer', fontSize: 12, minHeight: 32, transition: 'border-color 0.15s' }}>
        <span style={{ color: value ? 'var(--text)' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginLeft: 4 }}>
          {value && <span onClick={e => { e.stopPropagation(); onChange(''); }} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</span>}
          <span style={{ color: 'var(--text-muted)', fontSize: 8 }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 3,
          border: '1.5px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--bg-card)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, display: 'flex', flexDirection: 'column' }}>
          {/* Search input */}
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Type to search..." style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)',
              borderRadius: 4, fontSize: 12, outline: 'none', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text)' }} />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No matches</div>
            ) : (
              Object.entries(groups).map(([cat, catItems]) => (
                <div key={cat || 'default'}>
                  {cat && (
                    <div style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg-hover)',
                      position: 'sticky', top: 0 }}>{cat}</div>
                  )}
                  {catItems.map(item => (
                    <div key={item.name} onClick={() => handleSelect(item.name)}
                      style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                        background: value === item.name ? 'var(--accent-light, #dbeafe)' : 'transparent',
                        color: value === item.name ? 'var(--accent)' : 'var(--text)',
                        fontWeight: value === item.name ? 600 : 400,
                        borderLeft: value === item.name ? '3px solid var(--accent)' : '3px solid transparent' }}
                      onMouseOver={e => { if (value !== item.name) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseOut={e => { if (value !== item.name) e.currentTarget.style.background = 'transparent'; }}>
                      {item.name}
                    </div>
                  ))}
                </div>
              ))
            )}

            {/* Add custom option */}
            {allowCustom && search.trim() && !normalized.some(i => i.name.toLowerCase() === search.toLowerCase().trim()) && (
              <div onClick={() => handleSelect(search.trim())}
                style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--accent)',
                  fontWeight: 600, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 14 }}>+</span> Add "{search.trim()}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable Workforce Step Component ──
function WorkforceStep({ party, partyLabel, roles, personnel, presence, setPresence, labourEntries, setLabourEntries, showTooltips }) {
  const keyPersonnel = personnel || [];
  const skilledRoles = roles.filter(r => r.party === party && r.category === 'skilled');
  const unskilledRoles = roles.filter(r => r.party === party && r.category === 'unskilled');
  const [showCustom, setShowCustom] = useState(false);
  const [customRole, setCustomRole] = useState({ role_title: '', category: 'skilled', male_count: 0, female_count: 0 });

  // Initialize entries from roles if empty
  useEffect(() => {
    if (labourEntries.length === 0 && roles.length > 0) {
      const partyRoles = roles.filter(r => r.party === party);
      setLabourEntries(partyRoles.map(r => ({
        role_title: r.role_title, category: r.category, male_count: 0, female_count: 0,
        description: r.description, ref_id: r.id,
      })));
    }
  }, [roles, party]);

  const totalMale = labourEntries.reduce((s, e) => s + (e.male_count || 0), 0);
  const totalFemale = labourEntries.reduce((s, e) => s + (e.female_count || 0), 0);
  const total = totalMale + totalFemale;
  const kpPresent = Object.values(presence).filter(Boolean).length;
  const kpTotal = keyPersonnel.length;

  function updateEntry(i, field, val) {
    const copy = [...labourEntries];
    copy[i][field] = field.includes('count') ? (parseInt(val) || 0) : val;
    setLabourEntries(copy);
  }

  function removeEntry(i) { setLabourEntries(labourEntries.filter((_, idx) => idx !== i)); }

  function addCustom() {
    if (!customRole.role_title) return;
    setLabourEntries([...labourEntries, { ...customRole }]);
    setCustomRole({ role_title: '', category: 'skilled', male_count: 0, female_count: 0 });
    setShowCustom(false);
  }

  // ── Gender Bar ──
  const mPct = total > 0 ? Math.round(totalMale / total * 100) : 0;

  return (
    <SectionCard title={`${partyLabel} Workforce`} icon={party === 'contractor' ? '🏗️' : '👷'}
      count={`${total} workers + ${kpPresent}/${kpTotal} KP`} color={total > 0 ? '#10b981' : 'var(--accent)'}>

      {/* Key Personnel Attendance */}
      {keyPersonnel.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Key Personnel — Present Today ({kpPresent}/{kpTotal})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {keyPersonnel.map(t => (
              <label key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--radius)',
                  border: `1.5px solid ${presence[t.id] ? '#10b981' : 'var(--border)'}`,
                  background: presence[t.id] ? '#f0fdf420' : 'transparent', cursor: 'pointer', fontSize: 11,
                  transition: 'all 0.15s', fontWeight: presence[t.id] ? 600 : 400 }}>
                <input type="checkbox" checked={!!presence[t.id]}
                  onChange={e => setPresence({ ...presence, [t.id]: e.target.checked })}
                  style={{ accentColor: '#10b981' }} />
                <span style={{ color: presence[t.id] ? '#10b981' : 'var(--text-muted)' }}>
                  {t.title_prefix ? `${t.title_prefix} ` : ''}{t.name}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>({t.position_title})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Labour entries by category */}
      {['skilled', 'unskilled'].map(cat => {
        const catEntries = labourEntries.filter(e => e.category === cat);
        if (catEntries.length === 0 && labourEntries.length > 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', justifyContent: 'space-between' }}>
              <span>{cat === 'skilled' ? '🔧 Skilled' : '👥 Unskilled'}</span>
              <span>{catEntries.reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0)} total</span>
            </div>
            {catEntries.map((entry, idx) => {
              const globalIdx = labourEntries.indexOf(entry);
              return (
                <div key={globalIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 28px', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>
                    {entry.role_title}
                    {entry.description && showTooltips && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>({entry.description})</span>
                    )}
                  </div>
                  <input type="number" min="0" placeholder="M" value={entry.male_count || ''}
                    onChange={e => updateEntry(globalIdx, 'male_count', e.target.value)}
                    style={{ fontSize: 12, textAlign: 'center', padding: '4px 6px' }} />
                  <input type="number" min="0" placeholder="F" value={entry.female_count || ''}
                    onChange={e => updateEntry(globalIdx, 'female_count', e.target.value)}
                    style={{ fontSize: 12, textAlign: 'center', padding: '4px 6px' }} />
                  <button onClick={() => removeEntry(globalIdx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Add custom role */}
      {showCustom ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 6, marginTop: 8, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Role Title</label>
            <input type="text" placeholder="e.g. Mason" value={customRole.role_title} onChange={e => setCustomRole({ ...customRole, role_title: e.target.value })} style={{ fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Category</label>
            <select value={customRole.category} onChange={e => setCustomRole({ ...customRole, category: e.target.value })} style={{ fontSize: 12 }}>
              <option value="skilled">Skilled</option>
              <option value="unskilled">Unskilled</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Male</label>
            <input type="number" min="0" value={customRole.male_count} onChange={e => setCustomRole({ ...customRole, male_count: parseInt(e.target.value) || 0 })} style={{ fontSize: 12 }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Female</label>
            <input type="number" min="0" value={customRole.female_count} onChange={e => setCustomRole({ ...customRole, female_count: parseInt(e.target.value) || 0 })} style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'flex', gap: 4, paddingBottom: 2 }}>
            <button onClick={addCustom} className="btn btn-primary" style={{ fontSize: 11, padding: '5px 10px' }}>Add</button>
            <button onClick={() => setShowCustom(false)} style={{ fontSize: 11, padding: '5px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
          </div>
        </div>
      ) : (
        <AddButton label={`+ Add ${partyLabel} Role`} onClick={() => setShowCustom(true)} />
      )}

      {/* Gender ratio bar */}
      {total > 0 && (
        <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>♂ {totalMale} Male ({mPct}%)</span>
            <span style={{ fontWeight: 700 }}>{total} Total</span>
            <span style={{ color: '#ec4899', fontWeight: 600 }}>♀ {totalFemale} Female ({100 - mPct}%)</span>
          </div>
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${mPct}%`, background: '#3b82f6', transition: 'width 0.3s' }} />
            <div style={{ flex: 1, background: '#ec4899' }} />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ── Helper Components ──
function SectionCard({ title, icon, children, count, color = 'var(--accent)' }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{title}</span>
        {count !== undefined && (
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: color + '20', color }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function EntryRow({ children, onRemove }) {
  return (
    <div style={{ position: 'relative', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', padding: 10, marginBottom: 8, border: '1px solid var(--border)' }}>
      {children}
      <button onClick={onRemove}
        style={{ position: 'absolute', top: 6, right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
        title="Remove">×</button>
    </div>
  );
}

function AddButton({ label, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', padding: '10px', border: '2px dashed var(--border)', borderRadius: 'var(--radius)',
        background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)',
        transition: 'all 0.15s', marginTop: 4 }}
      onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'transparent'; }}>
      {label}
    </button>
  );
}


// ════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════
export default function SubmitReport({ profile, showToast, navigateTo, selectedProject: propProject }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(propProject || '');

  // Project-specific data
  const [activities, setActivities] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [structures, setStructures] = useState([]);
  const [layers, setLayers] = useState([]);

  const isPlatformAdmin = profile.is_platform_admin === true;
  const isRE = hasRole(profile.role, 'resident_engineer') || isPlatformAdmin;

  // ── Form State (CANONICAL column names only) ──
  const [form, setForm] = useState({
    report_date: new Date().toISOString().split('T')[0],
    weather: '', max_temp_c: '', min_temp_c: '', rainfall_mm: '',
    working_hours: 8, non_working_reason: '', is_working_day: true,
    contractor_labour_skilled: 0, contractor_labour_unskilled: 0, subcontractor_labour: 0,
    supervisor_count: 0, work_done: '', quality_observations: '', challenges: '',
    instructions_issued: '', visitors: '', urgent_flag: false, safety_incidents: '',
  });

  const [worksEntries, setWorksEntries] = useState([]);
  const [equipEntries, setEquipEntries] = useState([]);
  const [structEntries, setStructEntries] = useState([]);
  const [testEntries, setTestEntries] = useState([]);
  const [issueEntries, setIssueEntries] = useState([]);
  const [instructionEntries, setInstructionEntries] = useState([]);
  const [materialEntries, setMaterialEntries] = useState([]);

  // ── Photo State ──
  const [worksPhotos, setWorksPhotos] = useState([]);
  const [equipPhotos, setEquipPhotos] = useState([]);
  const [qualityPhotos, setQualityPhotos] = useState([]);
  const [structPhotos, setStructPhotos] = useState([]);
  const [issuePhotos, setIssuePhotos] = useState([]);
  const [generalPhotos, setGeneralPhotos] = useState([]);

  // ── Workforce ──
  const [labourRoles, setLabourRoles] = useState([]);
  const [contractorPersonnel, setContractorPersonnel] = useState([]);
  const [supervisionPersonnel, setSupervisionPersonnel] = useState([]);
  const [contractorPresence, setContractorPresence] = useState({});
  const [supervisionPresence, setSupervisionPresence] = useState({});
  const [contractorLabour, setContractorLabour] = useState([]);
  const [supervisionLabour, setSupervisionLabour] = useState([]);

  // ── Data Loading ──
  useEffect(() => {
    supabase.from('projects').select('id, name, category').order('name').then(({ data }) => setProjects(data || []));
    supabase.from('labour_role_reference').select('*').eq('is_active', true).order('display_order').then(({ data }) => setLabourRoles(data || []));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    Promise.all([
      supabase.from('works_activities').select('id, activity_name, activity_code, category, unit, planned_quantity, completed_quantity').eq('project_id', selectedProject).order('sort_order'),
      supabase.from('equipment_register').select('id, equipment_name, equipment_type').eq('project_id', selectedProject).order('equipment_type'),
      supabase.from('structures').select('id, structure_ref, structure_type, chainage').eq('project_id', selectedProject).order('chainage'),
      supabase.from('pavement_layers').select('id, layer_type, start_chainage, end_chainage, layer_status').eq('project_id', selectedProject),
      supabase.from('key_personnel').select('id, name, position_title, party, title_prefix').eq('project_id', selectedProject).eq('status', 'active').in('party', ['contractor', 'subcontractor']).order('position_title'),
      supabase.from('key_personnel').select('id, name, position_title, party, title_prefix').eq('project_id', selectedProject).eq('status', 'active').in('party', ['client', 'engineer', 'project_manager', 'engineer_rep']).order('position_title'),
    ]).then(([actRes, eqRes, strRes, layRes, contKpRes, supKpRes]) => {
      setActivities(actRes.data || []);
      setEquipment(eqRes.data || []);
      setStructures(strRes.data || []);
      setLayers(layRes.data || []);
      setContractorPersonnel(contKpRes.data || []);
      const contPresence = {};
      (contKpRes.data || []).forEach(t => { contPresence[t.id] = true; });
      setContractorPresence(contPresence);
      setSupervisionPersonnel(supKpRes.data || []);
      const supPresence = {};
      (supKpRes.data || []).forEach(t => { supPresence[t.id] = true; });
      setSupervisionPresence(supPresence);
    });
    setContractorLabour([]);
    setSupervisionLabour([]);
  }, [selectedProject]);

  // ── Entry Helpers ──
  function addWork() { setWorksEntries([...worksEntries, { layer_name: '', activity_id: '', start_chainage: '', end_chainage: '', side: 'Both', quantity: '', unit: 'Km', notes: '' }]); }
  function addEquip() { setEquipEntries([...equipEntries, { equipment_id: '', equipment_name: '', status: 'Operational', hours_worked: 0, notes: '' }]); }
  function addStruct() { setStructEntries([...structEntries, { structure_id: '', structure_name: '', stage: '', status: 'In Progress', concrete_volume_m3: '', rebar_kg: '', notes: '' }]); }
  function addTest() { setTestEntries([...testEntries, { test_type: '', location: '', chainage: '', sample_id: '', result_value: '', spec_limit: '', result_status: 'Pending', notes: '' }]); }
  function addIssue() { setIssueEntries([...issueEntries, { title: '', category: '', severity: 'Medium', description: '', action_required: '' }]); }
  function addInstruction() { setInstructionEntries([...instructionEntries, { instruction_type: 'site_instruction', subject: '', description: '', chainage: '', response_required: false }]); }
  function addMaterial() { setMaterialEntries([...materialEntries, { material_type: '', description: '', quantity: '', unit: 'Tonnes', source: '', delivery_note: '' }]); }

  function updateEntry(setter, list, i, field, val) { const copy = [...list]; copy[i][field] = val; setter(copy); }
  function removeEntry(setter, list, i) { setter(list.filter((_, idx) => idx !== i)); }

  // ── Completeness ──
  const stepComplete = [
    selectedProject && form.report_date && form.weather,
    true, true, true, true, true, true, true, true,
  ];
  const totalEntries = worksEntries.length + equipEntries.length + structEntries.length + testEntries.length + issueEntries.length + instructionEntries.length + materialEntries.length;
  const totalPhotos = worksPhotos.length + equipPhotos.length + qualityPhotos.length + structPhotos.length + issuePhotos.length + generalPhotos.length;

  // ── Submit — CANONICAL column names only ──
  async function handleSubmit() {
    if (!selectedProject) { showToast('Select a project first', 'error'); return; }
    setSaving(true);

    try {
      // 1. Daily Report — CANONICAL columns (no dual-write)
      const reportData = {
        project_id: selectedProject,
        submitted_by: profile.id,
        report_date: form.report_date,
        weather: form.weather,
        max_temp_c: form.max_temp_c ? parseFloat(form.max_temp_c) : null,
        min_temp_c: form.min_temp_c ? parseFloat(form.min_temp_c) : null,
        rainfall_mm: form.rainfall_mm ? parseFloat(form.rainfall_mm) : null,
        working_hours: parseFloat(form.working_hours) || 0,
        contractor_labour_skilled: parseInt(form.contractor_labour_skilled) || 0,
        contractor_labour_unskilled: parseInt(form.contractor_labour_unskilled) || 0,
        subcontractor_labour: parseInt(form.subcontractor_labour) || 0,
        work_done: form.work_done || null,
        quality_observations: form.quality_observations || null,
        challenges: form.challenges || null,
        visitors: form.visitors || null,
        safety_incidents: form.safety_incidents || null,
        progress_pct: 0,
      };
      const { data: report, error: repErr } = await supabase.from('daily_reports').insert(reportData).select().single();
      if (repErr) throw repErr;

      // 2. Works Progress
      for (const w of worksEntries) {
        if (!w.layer_name) continue;
        const layerDef = WORK_LAYERS.find(l => l.name === w.layer_name);
        const isLinear = layerDef ? layerDef.unit === 'Km' : false;
        const autoQty = isLinear && w.start_chainage && w.end_chainage
          ? Math.abs(parseFloat(w.end_chainage) - parseFloat(w.start_chainage))
          : parseFloat(w.quantity) || 0;
        await supabase.from('works_progress').insert({
          project_id: selectedProject, activity_id: w.activity_id || null,
          work_date: form.report_date, start_chainage: parseFloat(w.start_chainage) || 0,
          end_chainage: parseFloat(w.end_chainage) || 0, side: w.side || 'Both',
          quantity: autoQty, notes: w.layer_name + (w.notes ? ' — ' + w.notes : ''),
          reported_by: profile.id,
        });
      }

      // 3. Equipment Status — auto-register items from reference list
      for (const eq of equipEntries) {
        if (!eq.equipment_id && !eq.equipment_name) continue;
        let eqId = eq.equipment_id;
        // If picked from reference list (no project equipment_id), auto-register it
        if (!eqId && eq.equipment_name) {
          const { data: newEq } = await supabase.from('equipment_register').insert({
            project_id: selectedProject, equipment_name: eq.equipment_name,
            equipment_type: eq.equipment_name, actual_on_site: 1, required_quantity: 1,
          }).select('id').single();
          if (newEq) eqId = newEq.id;
        }
        if (eqId) {
          await supabase.from('equipment_daily_status').upsert({
            equipment_id: eqId, project_id: selectedProject,
            status_date: form.report_date, status: eq.status,
            hours_worked: parseFloat(eq.hours_worked) || 0,
            notes: eq.notes || null, reported_by: profile.id,
          }, { onConflict: 'equipment_id,status_date' });
        }
      }

      // 4. Structures — auto-register items from reference list
      for (const s of structEntries) {
        if ((!s.structure_id && !s.structure_name) || !s.stage) continue;
        let strId = s.structure_id;
        // If picked from reference list (no project structure_id), auto-register it
        if (!strId && s.structure_name) {
          const strRef = s.structure_name.substring(0, 20).replace(/[^a-zA-Z0-9-]/g, '');
          const { data: newStr } = await supabase.from('structures').insert({
            project_id: selectedProject, structure_ref: strRef,
            structure_type: s.structure_name, chainage: null, status: s.status || 'In Progress',
          }).select('id').single();
          if (newStr) strId = newStr.id;
        }
        if (strId) {
          await supabase.from('structure_progress').insert({
            structure_id: strId, project_id: selectedProject,
            stage: s.stage, status: s.status, work_date: form.report_date,
            concrete_volume_m3: s.concrete_volume_m3 ? parseFloat(s.concrete_volume_m3) : null,
            rebar_kg: s.rebar_kg ? parseFloat(s.rebar_kg) : null,
            notes: s.notes || null, reported_by: profile.id,
          });
        }
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

      // 7. Site Instructions
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

      // 9. Upload Photos
      const allPhotos = [...worksPhotos, ...equipPhotos, ...qualityPhotos, ...structPhotos, ...issuePhotos, ...generalPhotos];
      let photoCount = 0;
      if (allPhotos.length > 0) {
        photoCount = await uploadReportPhotos(allPhotos, selectedProject, report.id, profile, form.report_date);
      }

      // 10. Key Personnel Attendance
      const allPersonnel = [
        ...contractorPersonnel.map(t => ({ ...t, presenceMap: contractorPresence })),
        ...supervisionPersonnel.map(t => ({ ...t, presenceMap: supervisionPresence })),
      ];
      if (allPersonnel.length > 0) {
        const attendanceRecords = allPersonnel.map(t => ({
          project_id: selectedProject, personnel_id: t.id,
          attendance_date: form.report_date, is_present: !!t.presenceMap[t.id],
          recorded_by: profile.id,
        }));
        await supabase.from('personnel_attendance').upsert(attendanceRecords, { onConflict: 'personnel_id,attendance_date' });
      }

      // 11. Daily Labour
      const allLabour = [
        ...contractorLabour.filter(e => (e.male_count || 0) + (e.female_count || 0) > 0).map(e => ({ ...e, party: 'contractor' })),
        ...supervisionLabour.filter(e => (e.male_count || 0) + (e.female_count || 0) > 0).map(e => ({ ...e, party: 'supervision' })),
      ];
      if (allLabour.length > 0) {
        const labourRecords = allLabour.map(e => ({
          daily_report_id: report.id, project_id: selectedProject,
          report_date: form.report_date, party: e.party, category: e.category,
          role_title: e.role_title, male_count: e.male_count || 0,
          female_count: e.female_count || 0, key_personnel_id: null, is_present: true,
        }));
        await supabase.from('daily_labour').insert(labourRecords);
      }

      // Update legacy labour columns
      const contSkilled = contractorLabour.filter(e => e.category === 'skilled').reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0);
      const contUnskilled = contractorLabour.filter(e => e.category === 'unskilled').reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0);
      if (contSkilled > 0 || contUnskilled > 0) {
        await supabase.from('daily_reports').update({
          contractor_labour_skilled: contSkilled, contractor_labour_unskilled: contUnskilled,
        }).eq('id', report.id);
      }

      setSubmitted(true);
      showToast(`✅ Report submitted${photoCount > 0 ? ` with ${photoCount} photos` : ''} — all data auto-synced!`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Summary stats ──
  const contLabourTotal = contractorLabour.reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0);
  const supLabourTotal = supervisionLabour.reduce((s, e) => s + (e.male_count || 0) + (e.female_count || 0), 0);
  const contKpPresent = Object.values(contractorPresence).filter(Boolean).length;
  const supKpPresent = Object.values(supervisionPresence).filter(Boolean).length;
  const totalLabour = contLabourTotal + supLabourTotal;
  const totalWorkforce = totalLabour + contKpPresent + supKpPresent;

  // ── Submitted ──
  if (submitted) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Report Submitted</h2>
        <p style={{ color: 'var(--text-muted)', margin: '8px 0 24px' }}>
          {form.report_date} — {totalEntries} entries, {totalPhotos} photos, {totalWorkforce} workforce
        </p>
        <button className="btn btn-primary" onClick={() => { setSubmitted(false); setStep(1); setForm({
          report_date: new Date().toISOString().split('T')[0], weather: '', max_temp_c: '', min_temp_c: '', rainfall_mm: '',
          working_hours: 8, non_working_reason: '', is_working_day: true, contractor_labour_skilled: 0,
          contractor_labour_unskilled: 0, subcontractor_labour: 0, supervisor_count: 0, work_done: '',
          quality_observations: '', challenges: '', instructions_issued: '', visitors: '', urgent_flag: false, safety_incidents: '',
        }); setWorksEntries([]); setEquipEntries([]); setStructEntries([]); setTestEntries([]); setIssueEntries([]); setInstructionEntries([]); setMaterialEntries([]);
          setWorksPhotos([]); setEquipPhotos([]); setQualityPhotos([]); setStructPhotos([]); setIssuePhotos([]); setGeneralPhotos([]);
          setContractorLabour([]); setSupervisionLabour([]); }}>
          Submit Another Report
        </button>
      </div>
    );
  }

  // ── RENDER ──
  return (
    <div>
      {/* Step Progress */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {STEPS.map(s => (
          <div key={s.num} onClick={() => { if (stepComplete[0] || s.num === 1) setStep(s.num); }}
            style={{ flex: 1, height: 4, borderRadius: 2, cursor: stepComplete[0] || s.num === 1 ? 'pointer' : 'default',
              background: s.num < step ? 'var(--accent)' : s.num === step ? '#93c5fd' : 'var(--border)', transition: 'background 0.2s' }} />
        ))}
      </div>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Step {step}/{STEPS.length} — {STEPS[step - 1].icon} {STEPS[step - 1].label}
        </span>
      </div>

      {/* ══════ STEP 1: PROJECT & WEATHER ══════ */}
      {step === 1 && (
        <SectionCard title="Project & Weather" icon="🌤️">
          <div className="form-group mb-16">
            <label>Project *</label>
            <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>Report Date *</label>
              <input type="date" value={form.report_date} onChange={e => setForm({ ...form, report_date: e.target.value })} />
            </div>
            <div className="form-group mb-16">
              <label>Working Hours</label>
              <input type="number" value={form.working_hours} onChange={e => setForm({ ...form, working_hours: e.target.value })} min="0" max="24" step="0.5" />
            </div>
          </div>

          <div className="form-group mb-16">
            <label>Weather Conditions *</label>
            <SearchableDropdown
              items={WEATHER_OPTIONS.map(w => ({ name: w, category: '' }))}
              value={form.weather}
              onChange={val => setForm({ ...form, weather: val })}
              placeholder="Select or search weather..."
              allowCustom={true}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>Max Temp (°C)</label>
              <input type="number" value={form.max_temp_c} onChange={e => setForm({ ...form, max_temp_c: e.target.value })} placeholder="e.g. 28" />
            </div>
            <div className="form-group mb-16">
              <label>Min Temp (°C)</label>
              <input type="number" value={form.min_temp_c} onChange={e => setForm({ ...form, min_temp_c: e.target.value })} placeholder="e.g. 16" />
            </div>
            <div className="form-group mb-16">
              <label>Rainfall (mm)</label>
              <input type="number" value={form.rainfall_mm} onChange={e => setForm({ ...form, rainfall_mm: e.target.value })} placeholder="0" min="0" />
            </div>
          </div>
        </SectionCard>
      )}

      {/* ══════ STEP 2: CONTRACTOR WORKFORCE ══════ */}
      {step === 2 && (
        <WorkforceStep party="contractor" partyLabel="Contractor" roles={labourRoles}
          personnel={contractorPersonnel} presence={contractorPresence} setPresence={setContractorPresence}
          labourEntries={contractorLabour} setLabourEntries={setContractorLabour}
          showTooltips={true} />
      )}

      {/* ══════ STEP 3: SUPERVISION WORKFORCE ══════ */}
      {step === 3 && (
        <WorkforceStep party="supervision" partyLabel="Engineer's Team" roles={labourRoles}
          personnel={supervisionPersonnel} presence={supervisionPresence} setPresence={setSupervisionPresence}
          labourEntries={supervisionLabour} setLabourEntries={setSupervisionLabour}
          showTooltips={true} />
      )}

      {/* ══════ STEP 4: WORKS PROGRESS ══════ */}
      {step === 4 && (
        <SectionCard title="Works Progress" icon="⛏️" count={worksEntries.length}>
          {worksEntries.map((w, i) => {
            const layerDef = WORK_LAYERS.find(l => l.name === w.layer_name);
            const isLinear = layerDef ? layerDef.unit === 'Km' : false;
            const autoKm = isLinear && w.start_chainage && w.end_chainage
              ? Math.abs(parseFloat(w.end_chainage) - parseFloat(w.start_chainage)).toFixed(3) : null;
            return (
              <EntryRow key={i} onRemove={() => removeEntry(setWorksEntries, worksEntries, i)}>
                <div style={{ marginBottom: 8 }}>
                  <SearchableDropdown
                    items={WORK_LAYERS.map(l => ({ name: l.name, category: ({ earthworks: 'Earthworks', pavement: 'Pavement Layers', surfacing: 'Surfacing', drainage: 'Drainage & Structures', furniture: 'Road Furniture', other: 'Other' })[l.group] || l.group }))}
                    value={w.layer_name}
                    onChange={val => { const def = WORK_LAYERS.find(l => l.name === val); updateEntry(setWorksEntries, worksEntries, i, 'layer_name', val); if (def) updateEntry(setWorksEntries, worksEntries, i, 'unit', def.unit); }}
                    placeholder="Search activity / layer..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
                  <input type="text" placeholder="Start Chainage" value={w.start_chainage} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'start_chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="End Chainage" value={w.end_chainage} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'end_chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <select value={w.side} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'side', e.target.value)} style={{ fontSize: 12 }}>
                    {['Both', 'LHS', 'RHS', 'Centre'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <input type="text" placeholder="Notes — e.g. 'Grading to formation level, compaction ongoing'" value={w.notes || ''} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'notes', e.target.value)} style={{ fontSize: 12, width: '100%' }} />
                {isLinear && autoKm && (
                  <div style={{ marginTop: 6, fontSize: 10, color: '#059669', fontWeight: 600 }}>
                    ✅ {autoKm} Km of {w.layer_name} — {w.side || 'Both'} sides
                  </div>
                )}
              </EntryRow>
            );
          })}
          <AddButton label="＋ Add Layer Progress" onClick={addWork} />
          <PhotoUploader projectId={selectedProject} category="works_progress" photos={worksPhotos} setPhotos={setWorksPhotos} maxPhotos={10} label="Works Photos" />
        </SectionCard>
      )}

      {/* ══════ STEP 5: EQUIPMENT ══════ */}
      {step === 5 && (
        <SectionCard title="Equipment Status" icon="🚜" count={equipEntries.length}>
          {equipEntries.map((eq, i) => (
            <EntryRow key={i} onRemove={() => removeEntry(setEquipEntries, equipEntries, i)}>
              <div style={{ marginBottom: 8 }}>
                {/* If project has equipment_register, show project items first; otherwise show reference list */}
                {equipment.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                    <SearchableDropdown
                      items={[
                        ...equipment.map(e => ({ name: `${e.equipment_name} (${e.equipment_type})`, category: 'Project Equipment', _id: e.id })),
                        ...EQUIPMENT_LIST.map(e => ({ name: e.name, category: e.category })),
                      ]}
                      value={eq.equipment_name || (eq.equipment_id ? equipment.find(e => e.id === eq.equipment_id)?.equipment_name : '')}
                      onChange={val => {
                        const projItem = equipment.find(e => `${e.equipment_name} (${e.equipment_type})` === val);
                        if (projItem) {
                          updateEntry(setEquipEntries, equipEntries, i, 'equipment_id', projItem.id);
                          updateEntry(setEquipEntries, equipEntries, i, 'equipment_name', projItem.equipment_name);
                        } else {
                          updateEntry(setEquipEntries, equipEntries, i, 'equipment_id', '');
                          updateEntry(setEquipEntries, equipEntries, i, 'equipment_name', val);
                        }
                      }}
                      placeholder="Search project equipment or reference list..."
                    />
                  </div>
                ) : (
                  <SearchableDropdown
                    items={EQUIPMENT_LIST}
                    value={eq.equipment_name}
                    onChange={val => updateEntry(setEquipEntries, equipEntries, i, 'equipment_name', val)}
                    placeholder="Search equipment (85+ types)..."
                  />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
                <select value={eq.status} onChange={e => updateEntry(setEquipEntries, equipEntries, i, 'status', e.target.value)} style={{ fontSize: 12 }}>
                  {EQUIPMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" placeholder="Hours worked" value={eq.hours_worked} onChange={e => updateEntry(setEquipEntries, equipEntries, i, 'hours_worked', e.target.value)} style={{ fontSize: 12 }} />
                <input type="text" placeholder="Notes" value={eq.notes || ''} onChange={e => updateEntry(setEquipEntries, equipEntries, i, 'notes', e.target.value)} style={{ fontSize: 12 }} />
              </div>
            </EntryRow>
          ))}
          <AddButton label="Add Equipment Entry" onClick={addEquip} />
          <PhotoUploader projectId={selectedProject} category="equipment" photos={equipPhotos} setPhotos={setEquipPhotos} maxPhotos={5} label="Equipment Photos" compact />

          {equipEntries.length > 0 && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 11, color: '#059669' }}>
              {equipEntries.length} items — {equipEntries.filter(e => e.status === 'Operational' || e.status === 'Working').length} working,
              {' '}{equipEntries.filter(e => e.status === 'Idle' || e.status === 'Standby').length} idle,
              {' '}{equipEntries.filter(e => e.status === 'Breakdown').length} breakdown
            </div>
          )}
        </SectionCard>
      )}

      {/* ══════ STEP 6: QUALITY & MATERIALS ══════ */}
      {step === 6 && (
        <>
          <SectionCard title="Quality Tests" icon="🧪" count={testEntries.length}>
            {testEntries.map((t, i) => (
              <EntryRow key={i} onRemove={() => removeEntry(setTestEntries, testEntries, i)}>
                <div style={{ marginBottom: 8 }}>
                  <SearchableDropdown
                    items={QUALITY_TESTS_LIST}
                    value={t.test_type}
                    onChange={val => updateEntry(setTestEntries, testEntries, i, 'test_type', val)}
                    placeholder="Search quality tests (43 types)..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input type="text" placeholder="Location / Layer" value={t.location} onChange={e => updateEntry(setTestEntries, testEntries, i, 'location', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Chainage" value={t.chainage} onChange={e => updateEntry(setTestEntries, testEntries, i, 'chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Sample ID" value={t.sample_id} onChange={e => updateEntry(setTestEntries, testEntries, i, 'sample_id', e.target.value)} style={{ fontSize: 12 }} />
                  <select value={t.result_status} onChange={e => updateEntry(setTestEntries, testEntries, i, 'result_status', e.target.value)} style={{ fontSize: 12 }}>
                    {['Pending', 'Pass', 'Fail', 'Marginal'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="text" placeholder="Result Value (e.g. 97% MDD)" value={t.result_value} onChange={e => updateEntry(setTestEntries, testEntries, i, 'result_value', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="Spec Limit (e.g. ≥95% MDD)" value={t.spec_limit} onChange={e => updateEntry(setTestEntries, testEntries, i, 'spec_limit', e.target.value)} style={{ fontSize: 12 }} />
                </div>
              </EntryRow>
            ))}
            <AddButton label="Add Quality Test" onClick={addTest} />
            <PhotoUploader projectId={selectedProject} category="quality_test" photos={qualityPhotos} setPhotos={setQualityPhotos} maxPhotos={10} label="Test / Material Photos" />
          </SectionCard>

          <SectionCard title="Materials Received" icon="📦" count={materialEntries.length}>
            {materialEntries.map((m, i) => (
              <EntryRow key={i} onRemove={() => removeEntry(setMaterialEntries, materialEntries, i)}>
                <div style={{ marginBottom: 8 }}>
                  <SearchableDropdown
                    items={MATERIALS_LIST.map(m => ({ name: m, category: '' }))}
                    value={m.material_type}
                    onChange={val => updateEntry(setMaterialEntries, materialEntries, i, 'material_type', val)}
                    placeholder="Search materials (35+ types)..."
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
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

      {/* ══════ STEP 7: STRUCTURES ══════ */}
      {step === 7 && (
        <SectionCard title="Structures Progress" icon="🌉" count={structEntries.length}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
            Culverts, bridges, drainage structures, retaining walls, road furniture — anything under construction or inspected today.
          </p>
          {structEntries.map((s, i) => (
            <EntryRow key={i} onRemove={() => removeEntry(setStructEntries, structEntries, i)}>
              <div style={{ marginBottom: 8 }}>
                {/* If project has structures registered, show those first; otherwise show reference list */}
                {structures.length > 0 ? (
                  <SearchableDropdown
                    items={[
                      ...structures.map(st => ({ name: `${st.structure_ref} — ${st.structure_type} (Ch. ${st.chainage})`, category: 'Project Structures', _id: st.id })),
                      ...STRUCTURES_LIST.map(st => ({ name: st.name, category: st.category })),
                    ]}
                    value={s.structure_name || (s.structure_id ? structures.find(st => st.id === s.structure_id)?.structure_ref : '')}
                    onChange={val => {
                      const projItem = structures.find(st => `${st.structure_ref} — ${st.structure_type} (Ch. ${st.chainage})` === val);
                      if (projItem) {
                        updateEntry(setStructEntries, structEntries, i, 'structure_id', projItem.id);
                        updateEntry(setStructEntries, structEntries, i, 'structure_name', projItem.structure_ref);
                      } else {
                        updateEntry(setStructEntries, structEntries, i, 'structure_id', '');
                        updateEntry(setStructEntries, structEntries, i, 'structure_name', val);
                      }
                    }}
                    placeholder="Search project structures or reference list..."
                  />
                ) : (
                  <SearchableDropdown
                    items={STRUCTURES_LIST}
                    value={s.structure_name}
                    onChange={val => updateEntry(setStructEntries, structEntries, i, 'structure_name', val)}
                    placeholder="Search structures (58 types)..."
                  />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input type="text" placeholder="Stage (e.g. Foundation)" value={s.stage} onChange={e => updateEntry(setStructEntries, structEntries, i, 'stage', e.target.value)} style={{ fontSize: 12 }} />
                <select value={s.status} onChange={e => updateEntry(setStructEntries, structEntries, i, 'status', e.target.value)} style={{ fontSize: 12 }}>
                  {STRUCTURE_STATUS_OPTIONS.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
                <input type="text" placeholder="Notes" value={s.notes} onChange={e => updateEntry(setStructEntries, structEntries, i, 'notes', e.target.value)} style={{ fontSize: 12 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="number" placeholder="Concrete (m³)" value={s.concrete_volume_m3} onChange={e => updateEntry(setStructEntries, structEntries, i, 'concrete_volume_m3', e.target.value)} style={{ fontSize: 12 }} />
                <input type="number" placeholder="Rebar (kg)" value={s.rebar_kg} onChange={e => updateEntry(setStructEntries, structEntries, i, 'rebar_kg', e.target.value)} style={{ fontSize: 12 }} />
              </div>
            </EntryRow>
          ))}
          <AddButton label="Add Structure Progress" onClick={addStruct} />
          <PhotoUploader projectId={selectedProject} category="structure" photos={structPhotos} setPhotos={setStructPhotos} maxPhotos={10} label="Structure Photos" />
        </SectionCard>
      )}

      {/* ══════ STEP 8: ISSUES & INSTRUCTIONS ══════ */}
      {step === 8 && (
        <>
          <SectionCard title="Site Issues" icon="⚠️" count={issueEntries.length} color="#ef4444">
            {issueEntries.map((iss, i) => (
              <EntryRow key={i} onRemove={() => removeEntry(setIssueEntries, issueEntries, i)}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input type="text" placeholder="Issue title *" value={iss.title} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'title', e.target.value)} style={{ fontSize: 12, fontWeight: 600 }} />
                  <select value={iss.severity} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'severity', e.target.value)}
                    style={{ fontSize: 12, color: iss.severity === 'Critical' ? '#ef4444' : iss.severity === 'High' ? '#f59e0b' : 'inherit', fontWeight: 600 }}>
                    {ISSUE_SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <SearchableDropdown
                    items={REF_ISSUE_CATEGORIES.map(c => ({ name: c, category: '' }))}
                    value={iss.category}
                    onChange={val => updateEntry(setIssueEntries, issueEntries, i, 'category', val)}
                    placeholder="Select issue category..."
                  />
                </div>
                <textarea rows={2} placeholder="Description..." value={iss.description} onChange={e => updateEntry(setIssueEntries, issueEntries, i, 'description', e.target.value)} style={{ fontSize: 12, width: '100%' }} />
              </EntryRow>
            ))}
            <AddButton label="Report Issue" onClick={addIssue} />
            <PhotoUploader projectId={selectedProject} category="issue" photos={issuePhotos} setPhotos={setIssuePhotos} maxPhotos={10} label="Issue Evidence Photos" />
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

      {/* ══════ STEP 9: REVIEW & SUBMIT ══════ */}
      {step === 9 && (
        <div>
          <SectionCard title="General Observations" icon="📝">
            <div className="form-group mb-16">
              <label>Work Description / Summary</label>
              <textarea rows={3} value={form.work_done} onChange={e => setForm({ ...form, work_done: e.target.value })}
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

          <SectionCard title="Site Photos" icon="📸" count={totalPhotos} color="#8b5cf6">
            <PhotoUploader projectId={selectedProject} category="general" photos={generalPhotos} setPhotos={setGeneralPhotos} maxPhotos={10} label="General Site Photos" />
            {totalPhotos > 0 && (
              <div style={{ marginTop: 12, padding: 10, background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>📷 Photos attached to this report:</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--text-muted)' }}>
                  {worksPhotos.length > 0 && <span>⛏️ Works: {worksPhotos.length}</span>}
                  {equipPhotos.length > 0 && <span>🚜 Equipment: {equipPhotos.length}</span>}
                  {qualityPhotos.length > 0 && <span>🧪 Quality: {qualityPhotos.length}</span>}
                  {structPhotos.length > 0 && <span>🌉 Structures: {structPhotos.length}</span>}
                  {issuePhotos.length > 0 && <span>⚠️ Issues: {issuePhotos.length}</span>}
                  {generalPhotos.length > 0 && <span>📸 General: {generalPhotos.length}</span>}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Report Summary" icon="✅">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { icon: '🌤️', label: 'Weather', value: form.weather },
                { icon: '🏗️', label: 'Contractor', value: `${contLabourTotal + contKpPresent}`, color: contLabourTotal > 0 ? '#10b981' : '#6b7280' },
                { icon: '👷', label: "Engineer's Team", value: `${supLabourTotal + supKpPresent}`, color: supLabourTotal + supKpPresent > 0 ? '#059669' : '#6b7280' },
                { icon: '⛏️', label: 'Activities', value: worksEntries.length },
                { icon: '🚜', label: 'Equipment', value: equipEntries.length },
                { icon: '🧪', label: 'Tests', value: testEntries.length },
                { icon: '🌉', label: 'Structures', value: structEntries.length },
                { icon: '📦', label: 'Materials', value: materialEntries.length },
                { icon: '⚠️', label: 'Issues', value: issueEntries.length, color: issueEntries.length > 0 ? '#ef4444' : '#10b981' },
                { icon: '📋', label: 'Instructions', value: instructionEntries.length },
                { icon: '📷', label: 'Photos', value: totalPhotos, color: totalPhotos > 0 ? '#8b5cf6' : 'var(--text-muted)' },
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
