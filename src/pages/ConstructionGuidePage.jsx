import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const PHASE_ICONS = {
  'Site Establishment': '🔨',
  'Setting Out & Survey': '📐',
  'Site Clearance': '🌿',
  'Earthworks – Cut': '⚒️',
  'Earthworks – Fill': '🚛',
  'Subgrade Preparation': '🔧',
  'Sub-base Construction': '🪨',
  'Base Course Construction': '🧱',
  'Prime Coat': '🖌️',
  'Binder Course': '🛤️',
  'Wearing Course': '🛣️',
  'Drainage Works': '🌊',
  'Structural Works': '🌉',
  'Road Furniture': '🚦',
  'Completion & Handover': '📋',
};

const TEST_TYPE_BADGES = {
  field: { label: 'Field', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  lab: { label: 'Lab', bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  both: { label: 'Both', bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
};

const FIDIC_COLORS = {
  red: { label: 'Red Book', bg: '#fee2e2', color: '#991b1b', border: '#fecaca', desc: 'Employer-Designed' },
  yellow: { label: 'Yellow Book', bg: '#fef9c3', color: '#854d0e', border: '#fef08a', desc: 'Design-Build' },
  silver: { label: 'Silver Book', bg: '#e5e7eb', color: '#374151', border: '#d1d5db', desc: 'EPC/Turnkey' },
};

export default function ConstructionGuidePage({ profile, showToast }) {
  const [phases, setPhases] = useState([]);
  const [activities, setActivities] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [filterTestType, setFilterTestType] = useState('all');
  const [filterFidic, setFilterFidic] = useState('all');
  const [expandedActivity, setExpandedActivity] = useState(null);
  const [viewMode, setViewMode] = useState('phases'); // 'phases' | 'matrix'
  const [showHoldPointsOnly, setShowHoldPointsOnly] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [pRes, aRes, tRes] = await Promise.all([
        supabase.from('construction_phases').select('*').order('phase_number'),
        supabase.from('phase_activities').select('*').order('phase_id, activity_number'),
        supabase.from('activity_tests').select('*').order('activity_id, test_name'),
      ]);
      setPhases(pRes.data || []);
      setActivities(aRes.data || []);
      setTests(tRes.data || []);
    } catch (err) {
      showToast('Failed to load construction guide data', 'error');
    }
    setLoading(false);
  }

  // Build a map: phase_id -> activities, activity_id -> tests
  const actsByPhase = useMemo(() => {
    const map = {};
    activities.forEach(a => {
      if (!map[a.phase_id]) map[a.phase_id] = [];
      map[a.phase_id].push(a);
    });
    return map;
  }, [activities]);

  const testsByActivity = useMemo(() => {
    const map = {};
    tests.forEach(t => {
      if (!map[t.activity_id]) map[t.activity_id] = [];
      map[t.activity_id].push(t);
    });
    return map;
  }, [tests]);

  // Filter logic
  const filteredPhases = useMemo(() => {
    if (!selectedPhase) return phases;
    return phases.filter(p => p.id === selectedPhase);
  }, [phases, selectedPhase]);

  const matchesSearch = (text) => {
    if (!search) return true;
    return text.toLowerCase().includes(search.toLowerCase());
  };

  const matchesFilters = (activity, actTests) => {
    // Hold points filter
    if (showHoldPointsOnly && !activity.hold_point) return false;

    // Test type filter
    if (filterTestType !== 'all') {
      const hasMatchingTest = actTests?.some(t => t.test_type === filterTestType);
      if (!hasMatchingTest && actTests?.length > 0) return false;
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const actMatch = activity.activity_name.toLowerCase().includes(searchLower) ||
        activity.description?.toLowerCase().includes(searchLower) ||
        activity.kenya_standard_ref?.toLowerCase().includes(searchLower);
      const testMatch = actTests?.some(t =>
        t.test_name.toLowerCase().includes(searchLower) ||
        t.standard_reference?.toLowerCase().includes(searchLower) ||
        t.acceptance_criteria?.toLowerCase().includes(searchLower) ||
        t.equipment_required?.toLowerCase().includes(searchLower)
      );
      if (!actMatch && !testMatch) return false;
    }

    return true;
  };

  // Stats
  const stats = useMemo(() => ({
    phases: phases.length,
    activities: activities.length,
    tests: tests.length,
    holdPoints: activities.filter(a => a.hold_point).length,
    fieldTests: tests.filter(t => t.test_type === 'field').length,
    labTests: tests.filter(t => t.test_type === 'lab').length,
  }), [phases, activities, tests]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
        <div style={{ fontSize: 18, color: '#6b7280' }}>Loading Construction Guide...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 32 }}>📚</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>
              Construction Guide
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
              Kenya Road Construction Standards &bull; FIDIC Red/Yellow/Silver Book References
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Phases', value: stats.phases, icon: '🔢', color: '#6366f1' },
          { label: 'Activities', value: stats.activities, icon: '⚒️', color: '#0891b2' },
          { label: 'Total Tests', value: stats.tests, icon: '🧪', color: '#059669' },
          { label: 'Hold Points', value: stats.holdPoints, icon: '🛑', color: '#dc2626' },
          { label: 'Field Tests', value: stats.fieldTests, icon: '📍', color: '#d97706' },
          { label: 'Lab Tests', value: stats.labTests, icon: '🔬', color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} style={{
            background: '#fff', borderRadius: 10, padding: '14px 16px',
            border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters Bar */}
      <div style={{
        background: '#fff', borderRadius: 10, padding: 16, marginBottom: 20,
        border: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 250px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Search tests, standards, criteria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8,
              border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#9ca3af' }}>🔍</span>
        </div>

        {/* Phase Filter */}
        <select
          value={selectedPhase || ''}
          onChange={e => setSelectedPhase(e.target.value || null)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }}
        >
          <option value="">All Phases</option>
          {phases.map(p => (
            <option key={p.id} value={p.id}>
              {p.phase_number}. {p.phase_name}
            </option>
          ))}
        </select>

        {/* Test Type Filter */}
        <select
          value={filterTestType}
          onChange={e => setFilterTestType(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }}
        >
          <option value="all">All Test Types</option>
          <option value="field">Field Tests</option>
          <option value="lab">Lab Tests</option>
          <option value="both">Both (Field & Lab)</option>
        </select>

        {/* FIDIC Filter */}
        <select
          value={filterFidic}
          onChange={e => setFilterFidic(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', cursor: 'pointer' }}
        >
          <option value="all">All FIDIC Forms</option>
          <option value="red">Red Book (Employer-Designed)</option>
          <option value="yellow">Yellow Book (Design-Build)</option>
          <option value="silver">Silver Book (EPC/Turnkey)</option>
        </select>

        {/* Hold Points Toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={showHoldPointsOnly}
            onChange={e => setShowHoldPointsOnly(e.target.checked)}
            style={{ accentColor: '#dc2626' }}
          />
          🛑 Hold Points Only
        </label>

        {/* View Toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
          {['phases', 'matrix'].map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              style={{
                padding: '6px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: viewMode === v ? '#1f2937' : '#fff',
                color: viewMode === v ? '#fff' : '#374151',
              }}
            >
              {v === 'phases' ? '📋 Phases' : '📊 Matrix'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'phases' ? (
        <PhasesView
          phases={filteredPhases}
          actsByPhase={actsByPhase}
          testsByActivity={testsByActivity}
          matchesFilters={matchesFilters}
          expandedActivity={expandedActivity}
          setExpandedActivity={setExpandedActivity}
          filterFidic={filterFidic}
        />
      ) : (
        <MatrixView
          phases={filteredPhases}
          actsByPhase={actsByPhase}
          testsByActivity={testsByActivity}
          matchesFilters={matchesFilters}
          filterFidic={filterFidic}
        />
      )}
    </div>
  );
}

/* ============================================= */
/* Phases View (Accordion-style)                 */
/* ============================================= */
function PhasesView({ phases, actsByPhase, testsByActivity, matchesFilters, expandedActivity, setExpandedActivity, filterFidic }) {
  const [expandedPhase, setExpandedPhase] = useState(null);

  // Auto-expand if only 1 phase
  useEffect(() => {
    if (phases.length === 1) setExpandedPhase(phases[0].id);
  }, [phases]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {phases.map(phase => {
        const phaseActs = actsByPhase[phase.id] || [];
        const filteredActs = phaseActs.filter(a => matchesFilters(a, testsByActivity[a.id]));
        if (filteredActs.length === 0 && phaseActs.length > 0) return null;

        const isExpanded = expandedPhase === phase.id;
        const icon = PHASE_ICONS[phase.phase_name] || '🔷';
        const totalTests = filteredActs.reduce((s, a) => s + (testsByActivity[a.id]?.length || 0), 0);
        const holdPoints = filteredActs.filter(a => a.hold_point).length;

        return (
          <div key={phase.id} style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden'
          }}>
            {/* Phase Header */}
            <button
              onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
              style={{
                width: '100%', padding: '16px 20px', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, background: isExpanded ? '#f9fafb' : '#fff',
                textAlign: 'left', transition: 'background 0.15s'
              }}
            >
              <span style={{ fontSize: 24 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#fff', background: '#6366f1',
                    padding: '2px 8px', borderRadius: 10
                  }}>
                    Phase {phase.phase_number}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{phase.phase_name}</span>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {filteredActs.length} activities &bull; {totalTests} tests
                  {holdPoints > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>🛑 {holdPoints} hold points</span>}
                </div>
              </div>
              <span style={{ fontSize: 18, color: '#9ca3af', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
            </button>

            {/* Phase Content */}
            {isExpanded && (
              <div style={{ padding: '0 20px 16px' }}>
                {filteredActs.map(activity => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    tests={testsByActivity[activity.id] || []}
                    isExpanded={expandedActivity === activity.id}
                    onToggle={() => setExpandedActivity(expandedActivity === activity.id ? null : activity.id)}
                    filterFidic={filterFidic}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================= */
/* Activity Card                                 */
/* ============================================= */
function ActivityCard({ activity, tests, isExpanded, onToggle, filterFidic }) {
  const fidicRef = filterFidic === 'red' ? activity.fidic_red_book
    : filterFidic === 'yellow' ? activity.fidic_yellow_book
    : filterFidic === 'silver' ? activity.fidic_silver_book
    : null;

  return (
    <div style={{
      marginTop: 12, borderRadius: 10, border: '1px solid #e5e7eb',
      overflow: 'hidden', background: '#fafafa'
    }}>
      {/* Activity Header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', padding: '12px 16px', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 10, background: 'transparent',
          textAlign: 'left'
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#e5e7eb',
          padding: '2px 8px', borderRadius: 8, flexShrink: 0, marginTop: 2
        }}>
          {activity.activity_number}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{activity.activity_name}</span>
            {activity.hold_point && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2',
                padding: '2px 8px', borderRadius: 10, border: '1px solid #fecaca'
              }}>
                🛑 HOLD POINT
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>
            {activity.description}
          </div>
          {/* FIDIC + Kenya refs */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {filterFidic === 'all' ? (
              <>
                {activity.fidic_red_book && <FidicBadge type="red" clause={activity.fidic_red_book} />}
                {activity.fidic_yellow_book && <FidicBadge type="yellow" clause={activity.fidic_yellow_book} />}
                {activity.fidic_silver_book && <FidicBadge type="silver" clause={activity.fidic_silver_book} />}
              </>
            ) : (
              fidicRef && <FidicBadge type={filterFidic} clause={fidicRef} />
            )}
            {activity.kenya_standard_ref && (
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 8,
                background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0'
              }}>
                🇰🇪 {activity.kenya_standard_ref}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{tests.length} tests</span>
          <span style={{ fontSize: 14, color: '#9ca3af', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
        </div>
      </button>

      {/* Tests List */}
      {isExpanded && tests.length > 0 && (
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tests.map(test => (
              <TestCard key={test.id} test={test} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================= */
/* Test Card                                     */
/* ============================================= */
function TestCard({ test }) {
  const badge = TEST_TYPE_BADGES[test.test_type] || TEST_TYPE_BADGES.field;

  return (
    <div style={{
      background: '#fff', borderRadius: 8, padding: 14, border: '1px solid #e5e7eb',
      fontSize: 13
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#1f2937' }}>{test.test_name}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`
          }}>
            {badge.label}
          </span>
          {test.is_confirmatory && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a'
            }}>
              Confirmatory
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6 }}>
          {test.standard_reference}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', marginBottom: 2 }}>Acceptance Criteria</div>
          <div style={{ color: '#374151', lineHeight: 1.4 }}>{test.acceptance_criteria}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0891b2', marginBottom: 2 }}>Frequency</div>
          <div style={{ color: '#374151' }}>{test.test_frequency}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#7c3aed', marginBottom: 2 }}>Equipment Required</div>
          <div style={{ color: '#374151' }}>{test.equipment_required}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', marginBottom: 2 }}>Failure Action</div>
          <div style={{ color: '#374151', lineHeight: 1.4 }}>{test.failure_action}</div>
        </div>
      </div>
    </div>
  );
}

/* ============================================= */
/* FIDIC Badge                                   */
/* ============================================= */
function FidicBadge({ type, clause }) {
  const f = FIDIC_COLORS[type];
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 8,
      background: f.bg, color: f.color, border: `1px solid ${f.border}`
    }}>
      {f.label}: {clause}
    </span>
  );
}

/* ============================================= */
/* Matrix View                                   */
/* ============================================= */
function MatrixView({ phases, actsByPhase, testsByActivity, matchesFilters, filterFidic }) {
  // Flatten all tests with phase/activity info for the matrix
  const allRows = useMemo(() => {
    const rows = [];
    phases.forEach(phase => {
      const acts = actsByPhase[phase.id] || [];
      acts.forEach(act => {
        const actTests = testsByActivity[act.id] || [];
        if (!matchesFilters(act, actTests)) return;
        actTests.forEach(test => {
          rows.push({ phase, activity: act, test });
        });
        // If no tests but activity matches, add row without test
        if (actTests.length === 0) {
          rows.push({ phase, activity: act, test: null });
        }
      });
    });
    return rows;
  }, [phases, actsByPhase, testsByActivity, matchesFilters]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Phase</th>
              <th style={thStyle}>Activity</th>
              <th style={thStyle}>Hold</th>
              <th style={thStyle}>Test</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Standard</th>
              <th style={thStyle}>Acceptance Criteria</th>
              <th style={thStyle}>Frequency</th>
              {filterFidic === 'all' ? (
                <>
                  <th style={{ ...thStyle, ...fidTh, background: '#fee2e2' }}>Red</th>
                  <th style={{ ...thStyle, ...fidTh, background: '#fef9c3' }}>Yellow</th>
                  <th style={{ ...thStyle, ...fidTh, background: '#e5e7eb' }}>Silver</th>
                </>
              ) : (
                <th style={thStyle}>FIDIC Ref</th>
              )}
              <th style={thStyle}>Kenya Ref</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row, i) => {
              const badge = row.test ? (TEST_TYPE_BADGES[row.test.test_type] || TEST_TYPE_BADGES.field) : null;
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500 }}>{row.phase.phase_number}. {row.phase.phase_name}</span>
                  </td>
                  <td style={tdStyle}>
                    <span>{row.activity.activity_name}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {row.activity.hold_point && <span style={{ color: '#dc2626' }}>🛑</span>}
                  </td>
                  <td style={tdStyle}>
                    {row.test ? <span style={{ fontWeight: 500 }}>{row.test.test_name}</span> : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {badge && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                        background: badge.bg, color: badge.color
                      }}>
                        {badge.label}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {row.test?.standard_reference || '—'}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 250 }}>
                    {row.test?.acceptance_criteria || '—'}
                  </td>
                  <td style={tdStyle}>
                    {row.test?.test_frequency || '—'}
                  </td>
                  {filterFidic === 'all' ? (
                    <>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{row.activity.fidic_red_book || '—'}</td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{row.activity.fidic_yellow_book || '—'}</td>
                      <td style={{ ...tdStyle, fontSize: 11 }}>{row.activity.fidic_silver_book || '—'}</td>
                    </>
                  ) : (
                    <td style={{ ...tdStyle, fontSize: 11 }}>
                      {filterFidic === 'red' ? row.activity.fidic_red_book :
                       filterFidic === 'yellow' ? row.activity.fidic_yellow_book :
                       row.activity.fidic_silver_book || '—'}
                    </td>
                  )}
                  <td style={{ ...tdStyle, fontSize: 11 }}>
                    {row.activity.kenya_standard_ref || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {allRows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          No matching records found. Try adjusting your filters.
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151',
  fontSize: 12, whiteSpace: 'nowrap', position: 'sticky', top: 0
};

const fidTh = { fontSize: 11, textAlign: 'center', minWidth: 60 };

const tdStyle = {
  padding: '10px 12px', verticalAlign: 'top', color: '#374151', lineHeight: 1.4
};
