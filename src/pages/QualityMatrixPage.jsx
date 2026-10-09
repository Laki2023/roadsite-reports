import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const PAVEMENT_LAYERS = [
  'Subgrade', 'Improved Subgrade', 'Subbase', 'Base',
  'Binder Course', 'Wearing Course', 'Prime Coat', 'Tack Coat'
];

const EMPTY_TEST = {
  chainage_from: '', chainage_to: '', pavement_layer: 'Subgrade',
  test_type: '', test_result: '', test_date: '', tested_by: '',
  lab_ref: '', sample_location: '', remarks: ''
};

const DEFAULT_STANDARDS = [
  { pavement_layer: 'Subgrade', test_type: 'CBR', test_name: 'California Bearing Ratio', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: 15, specification_max: null, unit: '%', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Subgrade', test_type: 'MDD', test_name: 'Maximum Dry Density', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: null, specification_max: null, unit: 'kg/m3', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Subgrade', test_type: 'OMC', test_name: 'Optimum Moisture Content', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: null, specification_max: null, unit: '%', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Subgrade', test_type: 'PI', test_name: 'Plasticity Index', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: null, specification_max: 25, unit: '', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Subgrade', test_type: 'Swell', test_name: 'Swell', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: null, specification_max: 1, unit: '%', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Improved Subgrade', test_type: 'CBR', test_name: 'California Bearing Ratio', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: 30, specification_max: null, unit: '%', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Improved Subgrade', test_type: 'PI', test_name: 'Plasticity Index', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: null, specification_max: 15, unit: '', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Improved Subgrade', test_type: 'Swell', test_name: 'Swell', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 5', specification_min: null, specification_max: 0.5, unit: '%', frequency_requirement: 'Every 500m or change of material', is_active: true },
  { pavement_layer: 'Subbase', test_type: 'CBR', test_name: 'California Bearing Ratio', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 10', specification_min: 30, specification_max: null, unit: '%', frequency_requirement: 'Every 500m', is_active: true },
  { pavement_layer: 'Subbase', test_type: 'PI', test_name: 'Plasticity Index', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 10', specification_min: null, specification_max: 12, unit: '', frequency_requirement: 'Every 500m', is_active: true },
  { pavement_layer: 'Subbase', test_type: 'GM', test_name: 'Grading Modulus', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 10', specification_min: 1.5, specification_max: 2.5, unit: '', frequency_requirement: 'Every 500m', is_active: true },
  { pavement_layer: 'Base', test_type: 'CBR', test_name: 'California Bearing Ratio', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 11', specification_min: 80, specification_max: null, unit: '%', frequency_requirement: 'Every 250m', is_active: true },
  { pavement_layer: 'Base', test_type: 'ACV', test_name: 'Aggregate Crushing Value', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 11', specification_min: null, specification_max: 29, unit: '%', frequency_requirement: 'Per source', is_active: true },
  { pavement_layer: 'Base', test_type: 'LAA', test_name: 'Los Angeles Abrasion', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 11', specification_min: null, specification_max: 45, unit: '%', frequency_requirement: 'Per source', is_active: true },
  { pavement_layer: 'Base', test_type: 'PI', test_name: 'Plasticity Index', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 11', specification_min: null, specification_max: 6, unit: '', frequency_requirement: 'Every 250m', is_active: true },
  { pavement_layer: 'Base', test_type: 'FI', test_name: 'Flakiness Index', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 11', specification_min: null, specification_max: 30, unit: '%', frequency_requirement: 'Per source', is_active: true },
  { pavement_layer: 'Wearing Course', test_type: 'Marshall Stability', test_name: 'Marshall Stability', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 16', specification_min: 9, specification_max: null, unit: 'kN', frequency_requirement: 'Every 250m or daily', is_active: true },
  { pavement_layer: 'Wearing Course', test_type: 'Marshall Flow', test_name: 'Marshall Flow', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 16', specification_min: 2, specification_max: 4, unit: 'mm', frequency_requirement: 'Every 250m or daily', is_active: true },
  { pavement_layer: 'Wearing Course', test_type: 'Air Voids', test_name: 'Air Voids', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 16', specification_min: 3, specification_max: 5, unit: '%', frequency_requirement: 'Every 250m or daily', is_active: true },
  { pavement_layer: 'Wearing Course', test_type: 'VMA', test_name: 'Voids in Mineral Aggregate', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 16', specification_min: 14, specification_max: null, unit: '%', frequency_requirement: 'Every 250m or daily', is_active: true },
  { pavement_layer: 'Wearing Course', test_type: 'Bitumen Content', test_name: 'Bitumen Content', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 16', specification_min: 5, specification_max: 7, unit: '%', frequency_requirement: 'Every 250m or daily', is_active: true },
  { pavement_layer: 'Wearing Course', test_type: 'Core Density', test_name: 'Core Density', rdm_reference: 'RDM Part III', ssrbc_reference: 'SSRBC Cl. 16', specification_min: 95, specification_max: null, unit: '% Marshall', frequency_requirement: 'Every 250m', is_active: true },
];

function formatChainage(val) {
  if (val == null || val === '') return '';
  const num = parseFloat(val);
  const km = Math.floor(num / 1000);
  const m = Math.round(num % 1000);
  return `${km}+${String(m).padStart(3, '0')}`;
}

function parseChainage(str) {
  if (!str) return null;
  if (str.includes('+')) {
    const [km, m] = str.split('+');
    return parseFloat(km) * 1000 + parseFloat(m);
  }
  return parseFloat(str);
}

function calcCompliance(result, specMin, specMax) {
  if (result == null || result === '') return 'Pending';
  const val = parseFloat(result);
  if (isNaN(val)) return 'Pending';
  const hasMin = specMin != null && specMin !== '';
  const hasMax = specMax != null && specMax !== '';
  if (!hasMin && !hasMax) return 'Pass';
  if (hasMin && val < parseFloat(specMin)) {
    const margin = Math.abs((parseFloat(specMin) - val) / parseFloat(specMin));
    return margin <= 0.05 ? 'Marginal' : 'Fail';
  }
  if (hasMax && val > parseFloat(specMax)) {
    const margin = Math.abs((val - parseFloat(specMax)) / parseFloat(specMax));
    return margin <= 0.05 ? 'Marginal' : 'Fail';
  }
  if (hasMin) {
    const margin = (val - parseFloat(specMin)) / parseFloat(specMin);
    if (margin <= 0.05) return 'Marginal';
  }
  if (hasMax) {
    const margin = (parseFloat(specMax) - val) / parseFloat(specMax);
    if (margin <= 0.05) return 'Marginal';
  }
  return 'Pass';
}

const STATUS_COLORS = {
  Pass: '#16a34a',
  Fail: '#dc2626',
  Marginal: '#f59e0b',
  Pending: '#9ca3af',
};

const badge = (status) => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 12,
  fontSize: 11, fontWeight: 600, color: '#fff',
  background: STATUS_COLORS[status] || '#9ca3af',
});

export default function QualityMatrixPage({ profile, showToast, navigateTo, selectedProject }) {
  const [activeTab, setActiveTab] = useState('matrix');
  const [tests, setTests] = useState([]);
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showStdModal, setShowStdModal] = useState(false);
  const [testForm, setTestForm] = useState(EMPTY_TEST);
  const [stdForm, setStdForm] = useState({ pavement_layer: 'Subgrade', test_type: '', test_name: '', rdm_reference: '', ssrbc_reference: '', specification_min: '', specification_max: '', unit: '', frequency_requirement: '', is_active: true });
  const [editTestId, setEditTestId] = useState(null);
  const [editStdId, setEditStdId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [filterLayer, setFilterLayer] = useState('all');
  const [filterChainageFrom, setFilterChainageFrom] = useState('');
  const [filterChainageTo, setFilterChainageTo] = useState('');
  const [stdSearch, setStdSearch] = useState('');
  const [stdLayerFilter, setStdLayerFilter] = useState('all');
  const [specLookup, setSpecLookup] = useState(null);

  const projectId = selectedProject?.id;

  useEffect(() => {
    if (projectId) {
      loadTests();
      loadStandards();
    }
  }, [projectId]);

  async function loadTests() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('quality_test_matrix')
        .select('*').eq('project_id', projectId).order('chainage_from');
      if (error) throw error;
      setTests(data || []);
    } catch (err) {
      showToast('Failed to load test results: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadStandards() {
    try {
      const { data, error } = await supabase.from('quality_standards')
        .select('*').eq('is_active', true).order('pavement_layer');
      if (error) throw error;
      setStandards(data && data.length > 0 ? data : DEFAULT_STANDARDS);
    } catch {
      setStandards(DEFAULT_STANDARDS);
    }
  }

  async function seedStandards() {
    setSaving(true);
    try {
      const { error } = await supabase.from('quality_standards').insert(DEFAULT_STANDARDS);
      if (error) throw error;
      showToast('Standards seeded successfully');
      loadStandards();
    } catch (err) {
      showToast('Failed to seed standards: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  function lookupSpec(layer, testType) {
    const std = standards.find(s => s.pavement_layer === layer && s.test_type === testType);
    setSpecLookup(std || null);
    return std || null;
  }

  function testTypesForLayer(layer) {
    return standards.filter(s => s.pavement_layer === layer).map(s => s.test_type);
  }

  async function handleSaveTest(e) {
    e.preventDefault();
    const fromVal = parseChainage(testForm.chainage_from);
    const toVal = parseChainage(testForm.chainage_to);
    if (fromVal == null || toVal == null || toVal <= fromVal) {
      showToast('Invalid chainage range', 'error'); return;
    }
    if (!testForm.test_type) { showToast('Select a test type', 'error'); return; }

    setSaving(true);
    try {
      const std = lookupSpec(testForm.pavement_layer, testForm.test_type);
      const compliance = calcCompliance(testForm.test_result, std?.specification_min, std?.specification_max);
      const payload = {
        project_id: projectId,
        chainage_from: fromVal, chainage_to: toVal,
        pavement_layer: testForm.pavement_layer,
        test_type: testForm.test_type,
        test_ref: std ? `${std.rdm_reference || ''} / ${std.ssrbc_reference || ''}`.trim().replace(/^\/\s*/, '').replace(/\s*\/\s*$/, '') : null,
        specification_min: std?.specification_min ?? null,
        specification_max: std?.specification_max ?? null,
        specification_unit: std?.unit || null,
        test_result: testForm.test_result ? parseFloat(testForm.test_result) : null,
        test_date: testForm.test_date || null,
        tested_by: testForm.tested_by || null,
        lab_ref: testForm.lab_ref || null,
        sample_location: testForm.sample_location || null,
        compliance_status: compliance,
        remarks: testForm.remarks || null,
        created_by: profile?.id || null,
      };

      if (editTestId) {
        const { error } = await supabase.from('quality_test_matrix').update(payload).eq('id', editTestId);
        if (error) throw error;
        showToast('Test result updated');
      } else {
        const { error } = await supabase.from('quality_test_matrix').insert(payload);
        if (error) throw error;
        showToast('Test result added');
      }
      setShowTestModal(false);
      setTestForm(EMPTY_TEST);
      setEditTestId(null);
      setSpecLookup(null);
      loadTests();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStandard(e) {
    e.preventDefault();
    if (!stdForm.test_type || !stdForm.test_name) {
      showToast('Test type and name are required', 'error'); return;
    }
    setSaving(true);
    try {
      const payload = {
        pavement_layer: stdForm.pavement_layer,
        test_type: stdForm.test_type,
        test_name: stdForm.test_name,
        rdm_reference: stdForm.rdm_reference || null,
        ssrbc_reference: stdForm.ssrbc_reference || null,
        specification_min: stdForm.specification_min !== '' ? parseFloat(stdForm.specification_min) : null,
        specification_max: stdForm.specification_max !== '' ? parseFloat(stdForm.specification_max) : null,
        unit: stdForm.unit || null,
        frequency_requirement: stdForm.frequency_requirement || null,
        is_active: stdForm.is_active,
      };
      if (editStdId) {
        const { error } = await supabase.from('quality_standards').update(payload).eq('id', editStdId);
        if (error) throw error;
        showToast('Standard updated');
      } else {
        const { error } = await supabase.from('quality_standards').insert(payload);
        if (error) throw error;
        showToast('Standard added');
      }
      setShowStdModal(false);
      setStdForm({ pavement_layer: 'Subgrade', test_type: '', test_name: '', rdm_reference: '', ssrbc_reference: '', specification_min: '', specification_max: '', unit: '', frequency_requirement: '', is_active: true });
      setEditStdId(null);
      loadStandards();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // --- Build matrix data ---
  function buildChainageSections() {
    if (tests.length === 0) return [];
    const allFrom = tests.map(t => t.chainage_from);
    const allTo = tests.map(t => t.chainage_to);
    const min = Math.min(...allFrom);
    const max = Math.max(...allTo);
    const step = 500;
    const sections = [];
    for (let start = Math.floor(min / step) * step; start < max; start += step) {
      sections.push({ from: start, to: start + step });
    }
    return sections;
  }

  function getCellStatus(sectionFrom, sectionTo, layer) {
    const cellTests = tests.filter(t =>
      t.pavement_layer === layer &&
      t.chainage_from < sectionTo && t.chainage_to > sectionFrom
    );
    if (cellTests.length === 0) return { status: 'N/A', tests: [] };
    if (cellTests.some(t => t.compliance_status === 'Fail')) return { status: 'Fail', tests: cellTests };
    if (cellTests.some(t => t.compliance_status === 'Marginal')) return { status: 'Marginal', tests: cellTests };
    if (cellTests.some(t => t.compliance_status === 'Pending')) return { status: 'Pending', tests: cellTests };
    return { status: 'Pass', tests: cellTests };
  }

  // --- Compliance stats ---
  const totalTests = tests.length;
  const passCount = tests.filter(t => t.compliance_status === 'Pass').length;
  const failCount = tests.filter(t => t.compliance_status === 'Fail').length;
  const marginalCount = tests.filter(t => t.compliance_status === 'Marginal').length;
  const pendingCount = tests.filter(t => t.compliance_status === 'Pending').length;
  const passRate = totalTests > 0 ? ((passCount / totalTests) * 100).toFixed(1) : '0.0';
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const testsThisWeek = tests.filter(t => t.test_date && new Date(t.test_date) >= weekAgo).length;

  function complianceByLayer() {
    return PAVEMENT_LAYERS.map(layer => {
      const lt = tests.filter(t => t.pavement_layer === layer);
      const pass = lt.filter(t => t.compliance_status === 'Pass').length;
      return { layer, total: lt.length, pass, pct: lt.length > 0 ? ((pass / lt.length) * 100).toFixed(1) : null };
    }).filter(l => l.total > 0);
  }

  const failedTests = tests.filter(t => t.compliance_status === 'Fail' || t.compliance_status === 'Marginal')
    .sort((a, b) => (a.compliance_status === 'Fail' ? 0 : 1) - (b.compliance_status === 'Fail' ? 0 : 1));

  if (!projectId) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#9888;</div>
        <h3 style={{ color: 'var(--text)', marginBottom: 8 }}>No Project Selected</h3>
        <p>Please select a project from the sidebar to view the Quality Test Matrix.</p>
      </div>
    );
  }

  const tabs = [
    { key: 'matrix', label: 'Test Matrix' },
    { key: 'dashboard', label: 'Compliance Dashboard' },
    { key: 'standards', label: 'Standards Reference' },
  ];

  const sections = buildChainageSections();
  const filteredLayers = filterLayer === 'all' ? PAVEMENT_LAYERS : [filterLayer];
  const filteredSections = sections.filter(s => {
    if (filterChainageFrom && s.to <= parseChainage(filterChainageFrom)) return false;
    if (filterChainageTo && s.from >= parseChainage(filterChainageTo)) return false;
    return true;
  });

  // Standards reference filtered
  const filteredStandards = standards.filter(s => {
    if (stdLayerFilter !== 'all' && s.pavement_layer !== stdLayerFilter) return false;
    if (stdSearch) {
      const q = stdSearch.toLowerCase();
      return (s.test_type?.toLowerCase().includes(q) || s.test_name?.toLowerCase().includes(q) ||
        s.rdm_reference?.toLowerCase().includes(q) || s.ssrbc_reference?.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 style={{ margin: 0 }}>Quality Test Matrix</h2>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            RDM &amp; SSRBC compliance tracking - {selectedProject?.name || 'Project'}
          </div>
        </div>
        {activeTab === 'matrix' && (
          <button style={btnPrimary} onClick={() => { setTestForm(EMPTY_TEST); setEditTestId(null); setSpecLookup(null); setShowTestModal(true); }}>
            + Add Test Result
          </button>
        )}
        {activeTab === 'standards' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnPrimary} onClick={() => { setStdForm({ pavement_layer: 'Subgrade', test_type: '', test_name: '', rdm_reference: '', ssrbc_reference: '', specification_min: '', specification_max: '', unit: '', frequency_requirement: '', is_active: true }); setEditStdId(null); setShowStdModal(true); }}>
              + Add Standard
            </button>
            {standards === DEFAULT_STANDARDS && (
              <button style={btnOutline} onClick={seedStandards} disabled={saving}>
                Seed Kenya RDM Standards
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: activeTab === t.key ? 600 : 400, fontSize: 14,
            color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>}

      {!loading && activeTab === 'matrix' && renderMatrix()}
      {!loading && activeTab === 'dashboard' && renderDashboard()}
      {!loading && activeTab === 'standards' && renderStandards()}

      {showTestModal && renderTestModal()}
      {showStdModal && renderStdModal()}
      {selectedCell && renderCellDetail()}
    </div>
  );

  // ======================== TAB 1: TEST MATRIX ========================
  function renderMatrix() {
    return (
      <div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={filterLabel}>Layer:
            <select value={filterLayer} onChange={e => setFilterLayer(e.target.value)} style={selectStyle}>
              <option value="all">All Layers</option>
              {PAVEMENT_LAYERS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label style={filterLabel}>From:
            <input placeholder="e.g. 0+000" value={filterChainageFrom} onChange={e => setFilterChainageFrom(e.target.value)} style={inputSmall} />
          </label>
          <label style={filterLabel}>To:
            <input placeholder="e.g. 5+000" value={filterChainageTo} onChange={e => setFilterChainageTo(e.target.value)} style={inputSmall} />
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
            <span style={{ ...badge('Pass') }}>Pass</span>
            <span style={{ ...badge('Fail') }}>Fail</span>
            <span style={{ ...badge('Marginal') }}>Marginal</span>
            <span style={{ ...badge('Pending') }}>Pending</span>
          </div>
        </div>

        {tests.length === 0 ? (
          <div style={emptyState}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>&#128203;</div>
            <p style={{ margin: 0, fontWeight: 500 }}>No test results recorded yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Click "Add Test Result" to start building the quality matrix
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, minWidth: 120, position: 'sticky', left: 0, background: 'var(--card)', zIndex: 2 }}>Chainage</th>
                  {filteredLayers.map(l => (
                    <th key={l} style={{ ...thStyle, minWidth: 100, textAlign: 'center', fontSize: 11 }}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSections.map(sec => (
                  <tr key={sec.from}>
                    <td style={{ ...tdStyle, fontWeight: 500, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1, fontSize: 12 }}>
                      {formatChainage(sec.from)} - {formatChainage(sec.to)}
                    </td>
                    {filteredLayers.map(layer => {
                      const cell = getCellStatus(sec.from, sec.to, layer);
                      return (
                        <td key={layer} style={{
                          ...tdStyle, textAlign: 'center', cursor: cell.tests.length > 0 ? 'pointer' : 'default',
                          background: cell.status === 'Pass' ? '#dcfce7' : cell.status === 'Fail' ? '#fef2f2' :
                            cell.status === 'Marginal' ? '#fffbeb' : cell.status === 'Pending' ? '#f3f4f6' : 'transparent',
                        }} onClick={() => cell.tests.length > 0 && setSelectedCell({ from: sec.from, to: sec.to, layer, tests: cell.tests })}>
                          {cell.status !== 'N/A' && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[cell.status] || '#666' }}>
                              {cell.tests.length} {cell.status === 'Pass' ? '✓' : cell.status === 'Fail' ? '✗' : cell.status === 'Marginal' ? '~' : '?'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ======================== TAB 2: COMPLIANCE DASHBOARD ========================
  function renderDashboard() {
    const layerData = complianceByLayer();
    const recentTests = [...tests].sort((a, b) => (b.test_date || '').localeCompare(a.test_date || '')).slice(0, 20);

    return (
      <div>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Tests', value: totalTests, color: 'var(--accent)' },
            { label: 'Pass Rate', value: `${passRate}%`, color: '#16a34a' },
            { label: 'Failed', value: failCount, color: '#dc2626' },
            { label: 'Pending', value: pendingCount, color: '#9ca3af' },
            { label: 'This Week', value: testsThisWeek, color: '#8b5cf6' },
          ].map(kpi => (
            <div key={kpi.label} style={cardStyle}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{kpi.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Overall Compliance */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h4 style={sectionTitle}>Overall Compliance</h4>
          {totalTests > 0 ? (
            <div>
              <div style={{ display: 'flex', gap: 4, height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                {passCount > 0 && <div style={{ flex: passCount, background: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>{passRate}%</div>}
                {marginalCount > 0 && <div style={{ flex: marginalCount, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>{((marginalCount / totalTests) * 100).toFixed(1)}%</div>}
                {failCount > 0 && <div style={{ flex: failCount, background: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>{((failCount / totalTests) * 100).toFixed(1)}%</div>}
                {pendingCount > 0 && <div style={{ flex: pendingCount, background: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>{((pendingCount / totalTests) * 100).toFixed(1)}%</div>}
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                <span>{passCount} Pass</span><span>{marginalCount} Marginal</span>
                <span>{failCount} Fail</span><span>{pendingCount} Pending</span>
              </div>
            </div>
          ) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No test data available</div>}
        </div>

        {/* Compliance by Layer */}
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <h4 style={sectionTitle}>Compliance by Pavement Layer</h4>
          {layerData.length > 0 ? layerData.map(ld => (
            <div key={ld.layer} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{ld.layer}</span>
                <span style={{ color: parseFloat(ld.pct) >= 80 ? '#16a34a' : parseFloat(ld.pct) >= 50 ? '#f59e0b' : '#dc2626', fontWeight: 600 }}>
                  {ld.pct}% ({ld.pass}/{ld.total})
                </span>
              </div>
              <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${ld.pct}%`, background: parseFloat(ld.pct) >= 80 ? '#16a34a' : parseFloat(ld.pct) >= 50 ? '#f59e0b' : '#dc2626', borderRadius: 5, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          )) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No layer data available</div>}
        </div>

        {/* Alerts */}
        {failedTests.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: 20, borderLeft: '4px solid #dc2626' }}>
            <h4 style={{ ...sectionTitle, color: '#dc2626' }}>Attention Required ({failedTests.length})</h4>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {failedTests.slice(0, 10).map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{t.test_type}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{t.pavement_layer} | {formatChainage(t.chainage_from)}-{formatChainage(t.chainage_to)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12 }}>Result: {t.test_result}{t.specification_unit ? ` ${t.specification_unit}` : ''}</span>
                    <span style={badge(t.compliance_status)}>{t.compliance_status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Tests */}
        <div style={cardStyle}>
          <h4 style={sectionTitle}>Recent Test Results</h4>
          {recentTests.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Chainage</th>
                    <th style={thStyle}>Layer</th>
                    <th style={thStyle}>Test</th>
                    <th style={thStyle}>Result</th>
                    <th style={thStyle}>Spec</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTests.map(t => (
                    <tr key={t.id}>
                      <td style={tdStyle}>{t.test_date || '-'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: 12 }}>{formatChainage(t.chainage_from)}-{formatChainage(t.chainage_to)}</td>
                      <td style={tdStyle}>{t.pavement_layer}</td>
                      <td style={tdStyle}>{t.test_type}</td>
                      <td style={tdStyle}>{t.test_result != null ? `${t.test_result}${t.specification_unit ? ' ' + t.specification_unit : ''}` : '-'}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.specification_min != null || t.specification_max != null
                          ? `${t.specification_min != null ? 'Min ' + t.specification_min : ''}${t.specification_min != null && t.specification_max != null ? ' / ' : ''}${t.specification_max != null ? 'Max ' + t.specification_max : ''}`
                          : '-'}
                      </td>
                      <td style={tdStyle}><span style={badge(t.compliance_status)}>{t.compliance_status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No test results yet</div>}
        </div>
      </div>
    );
  }

  // ======================== TAB 3: STANDARDS REFERENCE ========================
  function renderStandards() {
    return (
      <div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={stdLayerFilter} onChange={e => setStdLayerFilter(e.target.value)} style={selectStyle}>
            <option value="all">All Layers</option>
            {PAVEMENT_LAYERS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <input placeholder="Search tests..." value={stdSearch} onChange={e => setStdSearch(e.target.value)} style={{ ...inputSmall, minWidth: 200 }} />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Layer</th>
                <th style={thStyle}>Test Type</th>
                <th style={thStyle}>Test Name</th>
                <th style={thStyle}>RDM Ref</th>
                <th style={thStyle}>SSRBC Ref</th>
                <th style={thStyle}>Min</th>
                <th style={thStyle}>Max</th>
                <th style={thStyle}>Unit</th>
                <th style={thStyle}>Frequency</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStandards.map((s, i) => (
                <tr key={s.id || i}>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{s.pavement_layer}</td>
                  <td style={tdStyle}>{s.test_type}</td>
                  <td style={tdStyle}>{s.test_name}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{s.rdm_reference || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{s.ssrbc_reference || '-'}</td>
                  <td style={tdStyle}>{s.specification_min != null ? s.specification_min : '-'}</td>
                  <td style={tdStyle}>{s.specification_max != null ? s.specification_max : '-'}</td>
                  <td style={tdStyle}>{s.unit || '-'}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{s.frequency_requirement || '-'}</td>
                  <td style={tdStyle}>
                    {s.id && (
                      <button style={btnSmall} onClick={() => {
                        setStdForm({
                          pavement_layer: s.pavement_layer, test_type: s.test_type, test_name: s.test_name,
                          rdm_reference: s.rdm_reference || '', ssrbc_reference: s.ssrbc_reference || '',
                          specification_min: s.specification_min != null ? s.specification_min : '',
                          specification_max: s.specification_max != null ? s.specification_max : '',
                          unit: s.unit || '', frequency_requirement: s.frequency_requirement || '', is_active: s.is_active,
                        });
                        setEditStdId(s.id);
                        setShowStdModal(true);
                      }}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredStandards.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
            No standards match the filter criteria
          </div>
        )}
      </div>
    );
  }

  // ======================== MODALS ========================
  function renderTestModal() {
    const layerTypes = testTypesForLayer(testForm.pavement_layer);
    return (
      <div style={overlay} onClick={() => setShowTestModal(false)}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>{editTestId ? 'Edit Test Result' : 'Add Test Result'}</h3>
            <button style={closeBtn} onClick={() => setShowTestModal(false)}>&times;</button>
          </div>
          <form onSubmit={handleSaveTest}>
            <div style={formGrid}>
              <div style={formGroup}>
                <label style={labelStyle}>Chainage From *</label>
                <input style={inputStyle} placeholder="e.g. 0+000 or 0" required
                  value={testForm.chainage_from} onChange={e => setTestForm({ ...testForm, chainage_from: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Chainage To *</label>
                <input style={inputStyle} placeholder="e.g. 0+500 or 500" required
                  value={testForm.chainage_to} onChange={e => setTestForm({ ...testForm, chainage_to: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Pavement Layer *</label>
                <select style={inputStyle} value={testForm.pavement_layer}
                  onChange={e => {
                    const layer = e.target.value;
                    setTestForm({ ...testForm, pavement_layer: layer, test_type: '' });
                    setSpecLookup(null);
                  }}>
                  {PAVEMENT_LAYERS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Test Type *</label>
                <select style={inputStyle} value={testForm.test_type}
                  onChange={e => {
                    const tt = e.target.value;
                    setTestForm({ ...testForm, test_type: tt });
                    lookupSpec(testForm.pavement_layer, tt);
                  }}>
                  <option value="">-- Select Test --</option>
                  {layerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {specLookup && (
                <div style={{ ...formGroup, gridColumn: '1 / -1' }}>
                  <div style={{ background: 'var(--bg)', padding: '8px 12px', borderRadius: 'var(--radius)', fontSize: 12, border: '1px solid var(--border)' }}>
                    <strong>{specLookup.test_name}</strong> &mdash;
                    {specLookup.specification_min != null ? ` Min: ${specLookup.specification_min}${specLookup.unit ? ' ' + specLookup.unit : ''}` : ''}
                    {specLookup.specification_max != null ? ` Max: ${specLookup.specification_max}${specLookup.unit ? ' ' + specLookup.unit : ''}` : ''}
                    {specLookup.specification_min == null && specLookup.specification_max == null ? ' (Reference only)' : ''}
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                      {specLookup.rdm_reference} / {specLookup.ssrbc_reference}
                    </span>
                  </div>
                </div>
              )}

              <div style={formGroup}>
                <label style={labelStyle}>Test Result</label>
                <input style={inputStyle} type="number" step="any" placeholder={specLookup?.unit ? `Value (${specLookup.unit})` : 'Value'}
                  value={testForm.test_result} onChange={e => setTestForm({ ...testForm, test_result: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Test Date</label>
                <input style={inputStyle} type="date" value={testForm.test_date}
                  onChange={e => setTestForm({ ...testForm, test_date: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Tested By</label>
                <input style={inputStyle} placeholder="Lab technician name"
                  value={testForm.tested_by} onChange={e => setTestForm({ ...testForm, tested_by: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Lab Reference</label>
                <input style={inputStyle} placeholder="Lab report no."
                  value={testForm.lab_ref} onChange={e => setTestForm({ ...testForm, lab_ref: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Sample Location</label>
                <input style={inputStyle} placeholder="e.g. LHS, RHS, CL"
                  value={testForm.sample_location} onChange={e => setTestForm({ ...testForm, sample_location: e.target.value })} />
              </div>
              <div style={{ ...formGroup, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Remarks</label>
                <textarea style={{ ...inputStyle, minHeight: 60 }} placeholder="Additional notes..."
                  value={testForm.remarks} onChange={e => setTestForm({ ...testForm, remarks: e.target.value })} />
              </div>

              {testForm.test_result && specLookup && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span>Compliance:</span>
                    <span style={badge(calcCompliance(testForm.test_result, specLookup.specification_min, specLookup.specification_max))}>
                      {calcCompliance(testForm.test_result, specLookup.specification_min, specLookup.specification_max)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" style={btnOutline} onClick={() => setShowTestModal(false)}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving ? 'Saving...' : editTestId ? 'Update' : 'Add Result'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderStdModal() {
    return (
      <div style={overlay} onClick={() => setShowStdModal(false)}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>{editStdId ? 'Edit Standard' : 'Add Standard'}</h3>
            <button style={closeBtn} onClick={() => setShowStdModal(false)}>&times;</button>
          </div>
          <form onSubmit={handleSaveStandard}>
            <div style={formGrid}>
              <div style={formGroup}>
                <label style={labelStyle}>Pavement Layer *</label>
                <select style={inputStyle} value={stdForm.pavement_layer}
                  onChange={e => setStdForm({ ...stdForm, pavement_layer: e.target.value })}>
                  {PAVEMENT_LAYERS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Test Type *</label>
                <input style={inputStyle} required value={stdForm.test_type}
                  onChange={e => setStdForm({ ...stdForm, test_type: e.target.value })} placeholder="e.g. CBR" />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Test Name *</label>
                <input style={inputStyle} required value={stdForm.test_name}
                  onChange={e => setStdForm({ ...stdForm, test_name: e.target.value })} placeholder="e.g. California Bearing Ratio" />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>RDM Reference</label>
                <input style={inputStyle} value={stdForm.rdm_reference}
                  onChange={e => setStdForm({ ...stdForm, rdm_reference: e.target.value })} placeholder="e.g. RDM Part III" />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>SSRBC Reference</label>
                <input style={inputStyle} value={stdForm.ssrbc_reference}
                  onChange={e => setStdForm({ ...stdForm, ssrbc_reference: e.target.value })} placeholder="e.g. SSRBC Cl. 5" />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Spec Min</label>
                <input style={inputStyle} type="number" step="any" value={stdForm.specification_min}
                  onChange={e => setStdForm({ ...stdForm, specification_min: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Spec Max</label>
                <input style={inputStyle} type="number" step="any" value={stdForm.specification_max}
                  onChange={e => setStdForm({ ...stdForm, specification_max: e.target.value })} />
              </div>
              <div style={formGroup}>
                <label style={labelStyle}>Unit</label>
                <input style={inputStyle} value={stdForm.unit}
                  onChange={e => setStdForm({ ...stdForm, unit: e.target.value })} placeholder="e.g. %, kN, mm" />
              </div>
              <div style={{ ...formGroup, gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Frequency Requirement</label>
                <input style={inputStyle} value={stdForm.frequency_requirement}
                  onChange={e => setStdForm({ ...stdForm, frequency_requirement: e.target.value })} placeholder="e.g. Every 500m or change of material" />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button type="button" style={btnOutline} onClick={() => setShowStdModal(false)}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={saving}>
                {saving ? 'Saving...' : editStdId ? 'Update' : 'Add Standard'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  function renderCellDetail() {
    return (
      <div style={overlay} onClick={() => setSelectedCell(null)}>
        <div style={{ ...modalStyle, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>
              Tests: {selectedCell.layer} @ {formatChainage(selectedCell.from)} - {formatChainage(selectedCell.to)}
            </h3>
            <button style={closeBtn} onClick={() => setSelectedCell(null)}>&times;</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Test</th>
                  <th style={thStyle}>Result</th>
                  <th style={thStyle}>Spec</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Lab Ref</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedCell.tests.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{t.test_type}</td>
                    <td style={tdStyle}>{t.test_result != null ? `${t.test_result}${t.specification_unit ? ' ' + t.specification_unit : ''}` : '-'}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-muted)' }}>
                      {t.specification_min != null ? `Min ${t.specification_min}` : ''}
                      {t.specification_min != null && t.specification_max != null ? ' / ' : ''}
                      {t.specification_max != null ? `Max ${t.specification_max}` : ''}
                    </td>
                    <td style={tdStyle}><span style={badge(t.compliance_status)}>{t.compliance_status}</span></td>
                    <td style={tdStyle}>{t.test_date || '-'}</td>
                    <td style={tdStyle}>{t.lab_ref || '-'}</td>
                    <td style={tdStyle}>
                      <button style={btnSmall} onClick={() => {
                        setTestForm({
                          chainage_from: String(t.chainage_from), chainage_to: String(t.chainage_to),
                          pavement_layer: t.pavement_layer, test_type: t.test_type,
                          test_result: t.test_result != null ? String(t.test_result) : '',
                          test_date: t.test_date || '', tested_by: t.tested_by || '',
                          lab_ref: t.lab_ref || '', sample_location: t.sample_location || '',
                          remarks: t.remarks || '',
                        });
                        setEditTestId(t.id);
                        lookupSpec(t.pavement_layer, t.test_type);
                        setSelectedCell(null);
                        setShowTestModal(true);
                      }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedCell.tests.length > 0 && selectedCell.tests[0].remarks && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              <strong>Remarks:</strong> {selectedCell.tests[0].remarks}
            </div>
          )}
        </div>
      </div>
    );
  }
}

// ======================== SHARED STYLES ========================
const cardStyle = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: 16,
};
const sectionTitle = { margin: '0 0 12px 0', fontSize: 15, fontWeight: 600 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border)',
  fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap',
};
const tdStyle = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 13 };
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
};
const modalStyle = {
  background: 'var(--card)', borderRadius: 'var(--radius)', padding: 24,
  maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const formGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const formGroup = { display: 'flex', flexDirection: 'column', gap: 4 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' };
const inputStyle = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none',
};
const selectStyle = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  fontSize: 13, background: 'var(--bg)', color: 'var(--text)', outline: 'none',
};
const inputSmall = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  fontSize: 13, background: 'var(--bg)', color: 'var(--text)', width: 120, outline: 'none',
};
const filterLabel = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' };
const btnPrimary = {
  padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none',
  borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const btnOutline = {
  padding: '8px 16px', background: 'transparent', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13, cursor: 'pointer',
};
const btnSmall = {
  padding: '4px 10px', background: 'var(--bg)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 11, cursor: 'pointer',
};
const closeBtn = {
  background: 'none', border: 'none', fontSize: 22, cursor: 'pointer',
  color: 'var(--text-muted)', padding: '0 4px', lineHeight: 1,
};
const emptyState = {
  textAlign: 'center', padding: 48, color: 'var(--text)', background: 'var(--card)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)',
};
