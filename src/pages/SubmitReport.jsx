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

// ── Kenya chainage parser ──
// Accepts: "5+200" → 5.2 | "Km 5+200" → 5.2 | "5200" (metres) → 5.2 | "5.2" (Km) → 5.2
export function parseChainage(input) {
  if (input == null || input === '') return null;
  const str = String(input).trim().replace(/km/i, '').trim();
  if (str.includes('+')) {
    const [kmPart, mPart] = str.split('+');
    const km = parseFloat(kmPart.replace(/[^0-9.]/g, '')) || 0;
    const m = parseFloat(mPart.replace(/[^0-9.]/g, '')) || 0;
    return km + m / 1000;
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return null;
  // Plain numbers ≥ 200 are almost certainly metres (roads rarely exceed 200 Km chainage)
  return num >= 200 ? num / 1000 : num;
}

// ── Chainage overlap detection ──
// Returns previous entries that overlap the given range for the same activity.
// Sides conflict when either is 'Both' or they're equal (LHS vs RHS is legitimate).
export function findOverlaps(recentProgress, activityId, chFrom, chTo, side) {
  if (!activityId || chFrom == null || chTo == null) return [];
  const lo = Math.min(chFrom, chTo), hi = Math.max(chFrom, chTo);
  return recentProgress.filter(p => {
    if (p.activity_id !== activityId) return false;
    const pLo = Math.min(p.start_chainage || 0, p.end_chainage || 0);
    const pHi = Math.max(p.start_chainage || 0, p.end_chainage || 0);
    if (pLo === pHi) return false; // point entries can't overlap a range meaningfully
    const sideConflict = side === 'Both' || p.side === 'Both' || p.side === side;
    return sideConflict && Math.max(lo, pLo) < Math.min(hi, pHi);
  });
}

// Format a Km value back to chainage notation: 5.2 → "5+200"
export function fmtChainage(km) {
  if (km == null) return '—';
  const k = Math.floor(km);
  const m = Math.round((km - k) * 1000);
  return `${k}+${String(m).padStart(3, '0')}`;
}

// ── Side factor: full-width vs side-specific activities ──
// Full-width (carriageway) activities: one side = half the section quantity.
// Side-specific items (drains, kerbs, guardrails): each side counts in full.
const FULL_WIDTH_KEYWORDS = ['clearance', 'stripping', 'topsoil', 'earthwork', 'formation', 'ogl',
  'subgrade', 'subbase', 'sub-base', 'base', 'gravel', 'stabilis', 'pavement', 'prime', 'tack',
  'binder', 'wearing', 'asphalt', 'surface dressing', 'slurry', 'concrete pavement', 'cut to', 'fill', 'excavation'];
const SIDE_SPECIFIC_KEYWORDS = ['drain', 'ditch', 'kerb', 'guard', 'rail', 'sign', 'footpath', 'walkway',
  'sidewalk', 'delineator', 'marker post', 'shoulder', 'mitre', 'scour'];

export function isFullWidthActivity(name) {
  const n = (name || '').toLowerCase();
  if (SIDE_SPECIFIC_KEYWORDS.some(k => n.includes(k))) return false;
  return FULL_WIDTH_KEYWORDS.some(k => n.includes(k));
}

// Returns { factor, label } for a given activity name and side
export function sideFactor(activityName, side) {
  if (side === 'Both' || !side) return { factor: 1, label: null };
  if (isFullWidthActivity(activityName)) {
    return { factor: 0.5, label: `${side} = half carriageway width` };
  }
  return { factor: 1, label: `${side} — side item, full credit` };
}

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
  const [recentProgress, setRecentProgress] = useState([]);

  // ── Weather Auto-Detect (Open-Meteo) ──
  const [metWeather, setMetWeather] = useState(null); // { weather, temp, min_temp, rainfall, raw }
  const [metLoading, setMetLoading] = useState(false);
  const [weatherOverride, setWeatherOverride] = useState(false); // inspector changed from suggestion

  // WMO Weather Code → human-readable weather string
  function wmoToWeather(code) {
    if (code <= 1) return 'Sunny / Clear';
    if (code === 2) return 'Partly Cloudy';
    if (code === 3) return 'Overcast';
    if (code >= 45 && code <= 48) return 'Foggy / Misty';
    if (code >= 51 && code <= 55) return 'Light Rain / Drizzle';
    if (code >= 56 && code <= 57) return 'Light Rain / Drizzle';
    if (code >= 61 && code <= 63) return 'Moderate Rain';
    if (code >= 65 && code <= 67) return 'Heavy Rain';
    if (code >= 71 && code <= 77) return 'Cold';
    if (code >= 80 && code <= 82) return 'Heavy Rain';
    if (code >= 85 && code <= 86) return 'Cold';
    if (code >= 95 && code <= 99) return 'Thunderstorm';
    return 'Partly Cloudy';
  }

  async function fetchWeather(lat, lng) {
    if (!lat || !lng) return;
    setMetLoading(true);
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}`
        + `&current=temperature_2m,rain,weather_code`
        + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum`
        + `&timezone=Africa/Nairobi&forecast_days=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather API ${res.status}`);
      const data = await res.json();
      const current = data.current || {};
      const daily = data.daily || {};
      const met = {
        weather: wmoToWeather(current.weather_code ?? 2),
        temp: current.temperature_2m != null ? Math.round(current.temperature_2m) : null,
        max_temp: daily.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null,
        min_temp: daily.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null,
        rainfall: daily.precipitation_sum?.[0] != null ? Math.round(daily.precipitation_sum[0] * 10) / 10 : null,
        raw: data,
      };
      setMetWeather(met);
      // Pre-fill only if inspector hasn't touched weather yet
      if (!form.weather && !weatherOverride) {
        setForm(prev => ({
          ...prev,
          weather: met.weather,
          max_temp_c: met.max_temp ?? prev.max_temp_c,
          min_temp_c: met.min_temp ?? prev.min_temp_c,
          rainfall_mm: met.rainfall ?? prev.rainfall_mm,
        }));
      }
    } catch (err) {
      console.warn('Weather auto-detect failed (non-critical):', err.message);
    } finally {
      setMetLoading(false);
    }
  }

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
    supabase.from('projects').select('id, name, category, latitude, longitude').order('name').then(({ data }) => setProjects(data || []));
    supabase.from('labour_role_reference').select('*').eq('is_active', true).order('display_order').then(({ data }) => setLabourRoles(data || []));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    // Fetch weather for this project's location
    const proj = projects.find(p => p.id === selectedProject);
    if (proj?.latitude && proj?.longitude) {
      fetchWeather(proj.latitude, proj.longitude);
    }
    setWeatherOverride(false);
    Promise.all([
      supabase.from('works_activities').select('id, activity_name, activity_code, category, unit, planned_quantity, completed_quantity, parent_activity_id, is_component, component_order').eq('project_id', selectedProject).order('sort_order'),
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
      // Recent progress entries for overlap detection (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
      supabase.from('works_progress')
        .select('activity_id, start_chainage, end_chainage, side, work_date, quantity')
        .eq('project_id', selectedProject)
        .gte('work_date', ninetyDaysAgo)
        .not('activity_id', 'is', null)
        .order('work_date', { ascending: false })
        .limit(500)
        .then(({ data }) => setRecentProgress(data || []));
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
  function addWork() { setWorksEntries([...worksEntries, { layer_name: '', activity_id: '', component_id: '', start_chainage: '', end_chainage: '', side: 'Both', quantity: '', unit: 'Km', notes: '' }]); }
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
      const warnings = [];
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
        urgent_flag: form.urgent_flag || false,
        progress_pct: 0,
        // Met station data stored for cross-reference (claims analysis, audit trail)
        met_weather: metWeather?.weather || null,
        met_temp_c: metWeather?.temp || null,
        met_rainfall_mm: metWeather?.rainfall || null,
        weather_source: weatherOverride ? 'inspector_override' : metWeather ? 'met_prefill_confirmed' : 'manual',
      };
      const { data: report, error: repErr } = await supabase.from('daily_reports').insert(reportData).select().single();
      if (repErr) throw repErr;

      // 2. Works Progress — linked to project activity register where possible
      // Component takes priority: if inspector selected a component, that's where progress tracks.
      for (const w of worksEntries) {
        if (!w.layer_name) continue;
        // Resolve: component_id > activity_id > name-match
        let actId = w.component_id || w.activity_id || null;
        if (!actId) {
          const match = activities.find(a => a.activity_name.toLowerCase() === w.layer_name.toLowerCase());
          if (match) actId = match.id;
        }
        const linkedAct = actId ? activities.find(a => a.id === actId) : null;
        const unit = linkedAct?.unit || (WORK_LAYERS.find(l => l.name === w.layer_name)?.unit) || 'Km';
        const isLinear = unit === 'Km' || unit === 'km';
        const chFrom = parseChainage(w.start_chainage);
        const chTo = parseChainage(w.end_chainage);
        const rawLength = isLinear && chFrom != null && chTo != null
          ? Math.abs(chTo - chFrom) : null;
        // Side factor: half-width for carriageway activities worked one side only.
        // Raw chainage is stored untouched — only the synced quantity carries the factor.
        const sf = isLinear ? sideFactor(w.layer_name, w.side || 'Both') : { factor: 1, label: null };
        const autoQty = rawLength != null
          ? rawLength * sf.factor
          : parseFloat(w.quantity) || 0;
        const sideTag = sf.label && sf.factor !== 1
          ? ` (${sf.label}: ${rawLength?.toFixed(3)} Km × 0.5 = ${autoQty.toFixed(3)} Km eq.)`
          : '';
        // Flag overlaps in the record so the RE sees them during review/measurement
        const subOverlaps = actId ? findOverlaps(recentProgress, actId, chFrom, chTo, w.side || 'Both') : [];
        const overlapTag = subOverlaps.length > 0
          ? ` [⚠ OVERLAPS prior entry ${fmtChainage(subOverlaps[0].start_chainage)}→${fmtChainage(subOverlaps[0].end_chainage)} of ${subOverlaps[0].work_date} — verify at measurement]`
          : '';
        const { error: wpErr } = await supabase.from('works_progress').insert({
          project_id: selectedProject, activity_id: actId,
          work_date: form.report_date, start_chainage: chFrom || 0,
          end_chainage: chTo || 0, side: w.side || 'Both',
          quantity: autoQty, notes: w.layer_name + (w.notes ? ' — ' + w.notes : '') + sideTag + overlapTag,
          reported_by: profile.id,
        });
        if (wpErr) warnings.push(`Works "${w.layer_name}": ${wpErr.message}`);
      }

      // 3. Equipment Status — auto-register items from reference list
      for (const eq of equipEntries) {
        if (!eq.equipment_id && !eq.equipment_name) continue;
        let eqId = eq.equipment_id;
        // If picked from reference list (no project equipment_id), auto-register it
        if (!eqId && eq.equipment_name) {
          const existing = equipment.find(e => e.equipment_name === eq.equipment_name);
          if (existing) {
            eqId = existing.id;
          } else {
            const { data: newEq, error: eqErr } = await supabase.from('equipment_register').insert({
              project_id: selectedProject, equipment_name: eq.equipment_name,
              equipment_type: eq.equipment_name, actual_on_site: 1, required_quantity: 1,
            }).select('id').single();
            if (eqErr) { warnings.push(`Equipment "${eq.equipment_name}": ${eqErr.message}`); continue; }
            if (newEq) eqId = newEq.id;
          }
        }
        if (eqId) {
          const { error: esErr } = await supabase.from('equipment_daily_status').upsert({
            equipment_id: eqId, project_id: selectedProject,
            status_date: form.report_date, status: eq.status,
            hours_worked: parseFloat(eq.hours_worked) || 0,
            notes: eq.notes || null, reported_by: profile.id,
          }, { onConflict: 'equipment_id,status_date' });
          if (esErr) warnings.push(`Equipment status: ${esErr.message}`);
        }
      }

      // 4. Structures — auto-register items from reference list
      for (const s of structEntries) {
        if ((!s.structure_id && !s.structure_name) || !s.stage) continue;
        let strId = s.structure_id;
        // If picked from reference list (no project structure_id), auto-register it
        if (!strId && s.structure_name) {
          const existing = structures.find(st => st.structure_type === s.structure_name);
          if (existing) {
            strId = existing.id;
          } else {
            const strRef = s.structure_name.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '') + '-' + Date.now().toString().slice(-4);
            const { data: newStr, error: strErr } = await supabase.from('structures').insert({
              project_id: selectedProject, structure_ref: strRef,
              structure_type: s.structure_name, chainage: 0,
              overall_status: 'In Progress', percent_complete: 0,
            }).select('id').single();
            if (strErr) { warnings.push(`Structure "${s.structure_name}": ${strErr.message}`); continue; }
            if (newStr) strId = newStr.id;
          }
        }
        if (strId) {
          const { error: spErr } = await supabase.from('structure_progress').insert({
            structure_id: strId, project_id: selectedProject,
            stage: s.stage, status: s.status, work_date: form.report_date,
            concrete_volume_m3: s.concrete_volume_m3 ? parseFloat(s.concrete_volume_m3) : null,
            rebar_kg: s.rebar_kg ? parseFloat(s.rebar_kg) : null,
            notes: s.notes || null, reported_by: profile.id,
          });
          if (spErr) warnings.push(`Structure progress: ${spErr.message}`);
        }
      }

      // 5. Quality Tests
      for (const t of testEntries) {
        if (!t.test_type) continue;
        const { error: qtErr } = await supabase.from('quality_tests').insert({
          project_id: selectedProject, test_type: t.test_type,
          test_date: form.report_date, location: t.location || null,
          chainage: t.chainage || null, sample_id: t.sample_id || null,
          result_value: t.result_value || null, spec_limit: t.spec_limit || null,
          result_status: t.result_status, notes: t.notes || null,
          tested_by: profile.id,
        });
        if (qtErr) warnings.push(`Test "${t.test_type}": ${qtErr.message}`);
      }

      // 6. Site Issues
      for (const iss of issueEntries) {
        if (!iss.title) continue;
        const { error: issErr } = await supabase.from('site_issues').insert({
          project_id: selectedProject, title: iss.title,
          category: iss.category, severity: iss.severity,
          description: iss.description || null, action_required: iss.action_required || null,
          status: 'Open', raised_by: profile.id, date_raised: form.report_date,
        });
        if (issErr) warnings.push(`Issue "${iss.title}": ${issErr.message}`);
      }

      // 7. Site Instructions
      for (const instr of instructionEntries) {
        if (!instr.subject) continue;
        const { count } = await supabase.from('site_instructions')
          .select('id', { count: 'exact', head: true }).eq('project_id', selectedProject);
        const { error: siErr } = await supabase.from('site_instructions').insert({
          project_id: selectedProject, instruction_no: `SI-${String((count || 0) + 1).padStart(4, '0')}`,
          instruction_type: instr.instruction_type, subject: instr.subject,
          description: instr.description || null, chainage_from: instr.chainage || null,
          issued_by: profile.id, issued_by_role: profile.role,
          response_required: instr.response_required, status: 'issued',
        });
        if (siErr) warnings.push(`Instruction "${instr.subject}": ${siErr.message}`);
      }

      // 8. Materials Received
      for (const m of materialEntries) {
        if (!m.material_type || !m.quantity) continue;
        const { error: matErr } = await supabase.from('project_materials').insert({
          project_id: selectedProject, material_type: m.material_type,
          description: m.description || null, quantity: parseFloat(m.quantity) || 0,
          unit: m.unit, source: m.source || null, delivery_note: m.delivery_note || null,
          received_date: form.report_date, received_by: profile.id,
        });
        if (matErr) warnings.push(`Material "${m.material_type}": ${matErr.message}`);
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
        const { error: labErr } = await supabase.from('daily_labour').insert(labourRecords);
        if (labErr) warnings.push(`Labour records: ${labErr.message}`);
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
      if (warnings.length > 0) {
        console.error('Report submitted with warnings:', warnings);
        showToast(`⚠️ Report saved but ${warnings.length} section(s) failed: ${warnings[0]}`, 'error');
      } else {
        showToast(`✅ Report submitted${photoCount > 0 ? ` with ${photoCount} photos` : ''} — all data auto-synced!`);
      }
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
            {/* Auto-detect badge */}
            {metLoading && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>🌐 Fetching weather data...</span>
            )}
            {metWeather && !metLoading && !weatherOverride && form.weather === metWeather.weather && (
              <span style={{ fontSize: 10, color: '#3b82f6', marginLeft: 8, fontWeight: 600 }}>
                🌐 Auto-detected from met station — confirm or change based on your site observation
              </span>
            )}
            {weatherOverride && metWeather && form.weather !== metWeather.weather && (
              <span style={{ fontSize: 10, color: '#f59e0b', marginLeft: 8, fontWeight: 600 }}>
                ✏️ Inspector override (met station reported: {metWeather.weather})
              </span>
            )}
            <SearchableDropdown
              items={WEATHER_OPTIONS.map(w => ({ name: w, category: '' }))}
              value={form.weather}
              onChange={val => {
                setForm({ ...form, weather: val });
                if (metWeather && val !== metWeather.weather) setWeatherOverride(true);
              }}
              placeholder="Select or search weather..."
              allowCustom={true}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group mb-16">
              <label>Max Temp (°C) {metWeather?.max_temp != null && form.max_temp_c == metWeather.max_temp && <span style={{ fontSize: 9, color: '#3b82f6' }}>🌐 met</span>}</label>
              <input type="number" value={form.max_temp_c} onChange={e => setForm({ ...form, max_temp_c: e.target.value })} placeholder="e.g. 28" />
            </div>
            <div className="form-group mb-16">
              <label>Min Temp (°C) {metWeather?.min_temp != null && form.min_temp_c == metWeather.min_temp && <span style={{ fontSize: 9, color: '#3b82f6' }}>🌐 met</span>}</label>
              <input type="number" value={form.min_temp_c} onChange={e => setForm({ ...form, min_temp_c: e.target.value })} placeholder="e.g. 16" />
            </div>
            <div className="form-group mb-16">
              <label>Rainfall (mm) {metWeather?.rainfall != null && form.rainfall_mm == metWeather.rainfall && <span style={{ fontSize: 9, color: '#3b82f6' }}>🌐 met</span>}</label>
              <input type="number" value={form.rainfall_mm} onChange={e => setForm({ ...form, rainfall_mm: e.target.value })} placeholder="0" min="0" />
            </div>
          </div>

          {/* Cross-check warning: inspector says sunny but met says rain */}
          {metWeather && form.weather && (() => {
            const inspectorDry = ['Sunny / Clear', 'Partly Cloudy', 'Overcast', 'Hot & Humid', 'Windy', 'Cold'].includes(form.weather);
            const metRain = ['Light Rain / Drizzle', 'Moderate Rain', 'Heavy Rain', 'Thunderstorm'].includes(metWeather.weather);
            const inspectorRain = ['Light Rain / Drizzle', 'Moderate Rain', 'Heavy Rain', 'Thunderstorm'].includes(form.weather);
            const metDry = ['Sunny / Clear', 'Partly Cloudy', 'Overcast'].includes(metWeather.weather);
            if (inspectorDry && metRain) return (
              <div style={{ padding: '8px 12px', background: '#78350f15', border: '1.5px solid #f59e0b', borderRadius: 'var(--radius)', fontSize: 11, marginBottom: 12 }}>
                <span style={{ color: '#f59e0b', fontWeight: 700 }}>⚠ Cross-check:</span> Met station data indicates <b>{metWeather.weather}</b> in the project area ({metWeather.rainfall ?? 0} mm rainfall), but you selected <b>"{form.weather}"</b>. If it's genuinely dry at the active chainage, your on-site observation takes precedence — proceed as is.
              </div>
            );
            if (inspectorRain && metDry) return (
              <div style={{ padding: '8px 12px', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 'var(--radius)', fontSize: 11, marginBottom: 12 }}>
                <span style={{ color: '#3b82f6', fontWeight: 700 }}>ℹ Note:</span> Met station reports <b>{metWeather.weather}</b> for the area, but you observed <b>"{form.weather}"</b> at site. Localised rainfall is common along road corridors — your field observation is the authoritative record.
              </div>
            );
            return null;
          })()}

          {/* Attribution */}
          {metWeather && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'right' }}>
              Weather data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)' }}>Open-Meteo.com</a> (CC BY 4.0) · Met station forecast for project coordinates
            </div>
          )}
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
      {step === 4 && (() => {
        // Build hierarchy: parents with their children
        const parentActivities = activities.filter(a => !a.is_component && !a.parent_activity_id);
        const childrenOf = (parentId) => activities.filter(a => a.parent_activity_id === parentId).sort((a, b) => (a.component_order || 0) - (b.component_order || 0));
        const hasChildren = parentActivities.some(p => childrenOf(p.id).length > 0);

        return (
        <SectionCard title="Works Progress" icon="⛏️" count={worksEntries.length}>
          {activities.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              {hasChildren
                ? '📌 Pick the activity, then select the specific operation. Progress tracks at component level and auto-rolls up.'
                : '📌 Pick from project activities to link directly to the register, BoQ and IPC.'}
            </p>
          )}
          {worksEntries.map((w, i) => {
            const reportActId = w.component_id || w.activity_id;
            const linkedAct = reportActId ? activities.find(a => a.id === reportActId) : null;
            const parentAct = w.activity_id ? activities.find(a => a.id === w.activity_id) : null;
            const unit = linkedAct?.unit || parentAct?.unit || (WORK_LAYERS.find(l => l.name === w.layer_name)?.unit) || 'Km';
            const isLinear = unit === 'Km' || unit === 'km';
            const chFrom = parseChainage(w.start_chainage);
            const chTo = parseChainage(w.end_chainage);
            const autoKm = isLinear && chFrom != null && chTo != null ? Math.abs(chTo - chFrom).toFixed(3) : null;
            const remaining = linkedAct && linkedAct.planned_quantity > 0 ? Math.max(0, linkedAct.planned_quantity - (linkedAct.completed_quantity || 0)) : null;
            const trackId = reportActId || w.activity_id;
            const actHistory = trackId ? recentProgress.filter(p => p.activity_id === trackId) : [];
            const lastEntry = actHistory.length > 0 ? actHistory[0] : null;
            const overlaps = (chFrom != null && chTo != null && trackId) ? findOverlaps(recentProgress, trackId, chFrom, chTo, w.side || 'Both') : [];
            const components = w.activity_id ? childrenOf(w.activity_id) : [];

            return (
              <EntryRow key={i} onRemove={() => removeEntry(setWorksEntries, worksEntries, i)}>
                {/* Level 1: Parent Activity */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 3, display: 'block' }}>Activity</label>
                  <SearchableDropdown
                    items={[
                      ...parentActivities.map(a => ({ name: `${a.activity_code ? a.activity_code + ' — ' : ''}${a.activity_name}`, category: `Project — ${a.category || 'General'}` })),
                      ...(parentActivities.length === 0 ? WORK_LAYERS.map(l => ({ name: l.name, category: ({ earthworks: 'Ref: Earthworks', pavement: 'Ref: Pavement', surfacing: 'Ref: Surfacing', drainage: 'Ref: Drainage', furniture: 'Ref: Road Furniture', other: 'Ref: Other' })[l.group] || l.group })) : []),
                    ]}
                    value={parentAct ? `${parentAct.activity_code ? parentAct.activity_code + ' — ' : ''}${parentAct.activity_name}` : w.layer_name}
                    onChange={val => {
                      const projAct = parentActivities.find(a => `${a.activity_code ? a.activity_code + ' — ' : ''}${a.activity_name}` === val || a.activity_name === val);
                      const copy = [...worksEntries];
                      if (projAct) { copy[i] = { ...copy[i], activity_id: projAct.id, component_id: '', layer_name: projAct.activity_name, unit: projAct.unit || 'Km' }; }
                      else { const def = WORK_LAYERS.find(l => l.name === val); copy[i] = { ...copy[i], activity_id: '', component_id: '', layer_name: val, unit: def?.unit || 'Km' }; }
                      setWorksEntries(copy);
                    }}
                    placeholder={parentActivities.length > 0 ? `Search ${parentActivities.length} activities...` : 'Search activity / layer...'}
                  />
                </div>

                {/* Level 2: Component buttons */}
                {components.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 3, display: 'block' }}>↳ What was done today? *</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {components.map(comp => {
                        const isSel = w.component_id === comp.id;
                        const compPct = comp.planned_quantity > 0 ? Math.min(100, Math.round((comp.completed_quantity || 0) / comp.planned_quantity * 100)) : 0;
                        return (
                          <button key={comp.id} type="button"
                            onClick={() => { const copy = [...worksEntries]; copy[i] = { ...copy[i], component_id: isSel ? '' : comp.id }; setWorksEntries(copy); }}
                            style={{ padding: '5px 10px', borderRadius: 'var(--radius)', border: `1.5px solid ${isSel ? '#3b82f6' : 'var(--border)'}`, background: isSel ? '#3b82f620' : 'transparent', color: isSel ? '#3b82f6' : 'var(--text)', fontSize: 11, fontWeight: isSel ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {isSel ? '✅ ' : ''}{comp.activity_name}
                            {comp.planned_quantity > 0 && <span style={{ fontSize: 9, color: compPct >= 100 ? '#10b981' : 'var(--text-muted)', fontWeight: 600 }}>{compPct}%</span>}
                          </button>
                        );
                      })}
                    </div>
                    {!w.component_id && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 4 }}>⚠ Select the operation performed today</div>}
                  </div>
                )}

                {/* Context strip */}
                {linkedAct && (
                  <div style={{ marginBottom: 8, padding: '6px 10px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)', fontSize: 10, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ color: '#3b82f6', fontWeight: 600 }}>🔗 {linkedAct.is_component ? linkedAct.activity_name + ' (→ ' + (parentAct?.activity_name || '') + ')' : 'Linked to register'}</span>
                    <span>Planned: <b>{linkedAct.planned_quantity || 0} {unit}</b></span>
                    <span>Done: <b>{Number(linkedAct.completed_quantity || 0).toFixed(2)} {unit}</b></span>
                    {remaining != null && <span style={{ color: remaining > 0 ? '#e87b35' : '#10b981', fontWeight: 600 }}>Remaining: {Number(remaining).toFixed(2)} {unit}</span>}
                    {lastEntry && <span style={{ width: '100%', color: 'var(--text-muted)' }}>📍 Last: Ch {fmtChainage(lastEntry.start_chainage)} → {fmtChainage(lastEntry.end_chainage)} ({lastEntry.side}) on {lastEntry.work_date} — enter <b>today\'s new section</b> only</span>}
                  </div>
                )}

                {/* Chainage + side + quantity */}
                <div style={{ display: 'grid', gridTemplateColumns: isLinear ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
                  <input type="text" placeholder="Start Ch. e.g. 5+200" value={w.start_chainage} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'start_chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <input type="text" placeholder="End Ch. e.g. 7+850" value={w.end_chainage} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'end_chainage', e.target.value)} style={{ fontSize: 12 }} />
                  <select value={w.side} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'side', e.target.value)} style={{ fontSize: 12 }}>
                    {['Both', 'LHS', 'RHS', 'Centre'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {!isLinear && <input type="number" step="0.01" placeholder={`Qty (${unit})`} value={w.quantity || ''} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'quantity', e.target.value)} style={{ fontSize: 12 }} />}
                </div>
                <input type="text" placeholder="Notes" value={w.notes || ''} onChange={e => updateEntry(setWorksEntries, worksEntries, i, 'notes', e.target.value)} style={{ fontSize: 12, width: '100%' }} />

                {isLinear && autoKm && overlaps.length === 0 && (() => {
                  const uiSf = sideFactor(w.layer_name, w.side || 'Both');
                  const eqKm = (parseFloat(autoKm) * uiSf.factor).toFixed(3);
                  return (<div style={{ marginTop: 6, fontSize: 10, color: '#059669', fontWeight: 600 }}>
                    ✅ {uiSf.factor !== 1 ? `${autoKm} Km on ${w.side} → ${eqKm} Km eq. (${uiSf.label})` : `${autoKm} Km — ${w.side || 'Both'} sides`}{linkedAct ? ' → auto-syncs' : ''}
                  </div>);
                })()}
                {!isLinear && w.quantity > 0 && (<div style={{ marginTop: 6, fontSize: 10, color: '#059669', fontWeight: 600 }}>✅ {w.quantity} {unit}{linkedAct ? ' → auto-syncs' : ''}</div>)}
                {overlaps.length > 0 && (
                  <div style={{ marginTop: 6, padding: '8px 10px', background: '#78350f15', border: '1.5px solid #f59e0b', borderRadius: 'var(--radius)', fontSize: 10 }}>
                    <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: 3 }}>⚠ OVERLAP:</div>
                    {overlaps.slice(0, 3).map((o, oi) => (<div key={oi} style={{ color: 'var(--text-muted)' }}>• Ch {fmtChainage(o.start_chainage)} → {fmtChainage(o.end_chainage)} ({o.side}) on {o.work_date}</div>))}
                    <div style={{ color: 'var(--text)', marginTop: 4 }}>Continue from Ch {fmtChainage(Math.max(...overlaps.map(o => Math.max(o.start_chainage || 0, o.end_chainage || 0))))} or proceed if legitimate repeat.</div>
                  </div>
                )}
              </EntryRow>
            );
          })}
          <AddButton label="＋ Add Works Progress" onClick={addWork} />
          <PhotoUploader projectId={selectedProject} category="works_progress" photos={worksPhotos} setPhotos={setWorksPhotos} maxPhotos={10} label="Works Photos" />
        </SectionCard>
        );
      })()}

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
