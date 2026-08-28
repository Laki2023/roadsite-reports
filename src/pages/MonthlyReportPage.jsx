import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchMonthlyReportData } from '../lib/monthlyReportData';
import { generateMonthlyPDF } from '../lib/generatePDF';
import { generateMonthlyDocx } from '../lib/generateDocx';

export default function MonthlyReportPage({ profile, showToast, selectedProject: contextProject }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1); // default to last month
    return d.toISOString().slice(0, 7);
  });

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState('');
  const [reportData, setReportData] = useState(null);
  const [narratives, setNarratives] = useState({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [autoLoaded, setAutoLoaded] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  // Auto-select project when navigating from Project Dashboard
  useEffect(() => {
    if (contextProject?.id && !autoLoaded) {
      setSelectedProject(contextProject.id);
      setAutoLoaded(true);
    }
  }, [contextProject, autoLoaded]);

  // Auto-load report when project is set from context
  useEffect(() => {
    if (selectedProject && autoLoaded && !reportData && !loading) {
      loadReport();
    }
  }, [selectedProject, autoLoaded]);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('id, name, contract_number').order('name');
    setProjects(data || []);
  }

  async function loadReport() {
    if (!selectedProject || !selectedMonth) return;
    setLoading(true);
    setReportData(null);
    try {
      const data = await fetchMonthlyReportData(selectedProject, selectedMonth);
      setReportData(data);
      setNarratives({
        executive_summary: data.narrative.executive_summary || '',
        physical_progress_narrative: data.narrative.physical_progress_narrative || '',
        financial_progress_narrative: data.narrative.financial_progress_narrative || '',
        quality_narrative: data.narrative.quality_narrative || '',
        hse_narrative: data.narrative.hse_narrative || '',
        environmental_narrative: data.narrative.environmental_narrative || '',
        upcoming_month_plan: data.narrative.upcoming_month_plan || '',
        critical_issues: data.narrative.critical_issues || '',
        recommendations: data.narrative.recommendations || '',
      });
    } catch (err) {
      console.error(err);
      showToast?.('Error loading report data');
    }
    setLoading(false);
  }

  async function saveNarratives() {
    if (!selectedProject || !selectedMonth) return;
    setSaving(true);
    const monthDate = `${selectedMonth}-01`;
    const payload = {
      project_id: selectedProject,
      report_month: monthDate,
      ...narratives,
      prepared_by: profile?.id,
    };

    const { data: existing } = await supabase
      .from('monthly_narratives')
      .select('id')
      .eq('project_id', selectedProject)
      .eq('report_month', monthDate)
      .maybeSingle();

    let error;
    if (existing?.id) {
      ({ error } = await supabase.from('monthly_narratives').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await supabase.from('monthly_narratives').insert(payload));
    }

    if (error) {
      console.error(error);
      showToast?.('Error saving narratives');
    } else {
      showToast?.('✅ Narratives saved');
    }
    setSaving(false);
  }

  async function handleExport(format) {
    if (!reportData) return;
    setGenerating(format);
    try {
      // Merge latest narratives into report data
      const dataWithNarratives = { ...reportData, narrative: { ...reportData.narrative, ...narratives } };

      if (format === 'pdf') {
        const doc = generateMonthlyPDF(dataWithNarratives);
        const fileName = `Monthly_Report_${reportData.project.name?.replace(/\s+/g, '_')}_${selectedMonth}.pdf`;
        doc.save(fileName);
        showToast?.(`✅ PDF downloaded: ${fileName}`);
      } else {
        const fileName = await generateMonthlyDocx(dataWithNarratives);
        showToast?.(`✅ Word document downloaded: ${fileName}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      showToast?.(`Export failed: ${err.message}`);
    }
    setGenerating('');
  }

  const monthLabel = selectedMonth ? new Date(selectedMonth + '-15').toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }) : '';

  // ── Stat Card ──
  function StatCard({ icon, label, value, color }) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}>
        <div style={{ fontSize: 20 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: color || 'var(--accent)' }}>{value}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{label}</div>
      </div>
    );
  }

  // ── Data Table ──
  function DataTable({ headers, rows }) {
    if (!rows || rows.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>No data for this period</div>;
    return (
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr>{headers.map((h, i) => (
              <th key={i} style={{ background: 'var(--accent)', color: '#fff', padding: '6px 8px', textAlign: 'left', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 ? 'var(--bg-hover)' : 'transparent' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>{cell ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Narrative Field ──
  function NarrativeField({ label, field }) {
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{label}</label>
        <textarea
          value={narratives[field] || ''}
          onChange={e => setNarratives({ ...narratives, [field]: e.target.value })}
          placeholder={`Enter ${label.toLowerCase()}...`}
          rows={4}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', background: 'var(--bg-card)', resize: 'vertical',
            fontFamily: 'inherit', lineHeight: 1.5,
          }}
        />
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'narratives', label: '📝 Narratives' },
    { id: 'works', label: '⚒️ Works' },
    { id: 'financial', label: '💰 Financial' },
    { id: 'equipment', label: '🚜 Equipment' },
    { id: 'quality', label: '🧪 Quality' },
    { id: 'issues', label: '⚠️ Issues' },
    { id: 'safety', label: '🦺 H&S' },
  ];

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>📋 Monthly Progress Report</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Auto-generated FIDIC-compliant monthly report with editable narratives</p>
        </div>
      </div>

      {/* Project + Month Selector */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 16, marginBottom: 16,
        display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Project</label>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="select">
            <option value="">Select Project...</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Report Month</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="select" />
        </div>
        <button className="btn btn-primary" onClick={loadReport} disabled={!selectedProject || loading} style={{ height: 38 }}>
          {loading ? '⏳ Loading...' : '📊 Generate Report'}
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Fetching report data for {monthLabel}...</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Querying 15+ tables across daily reports, works, financial, equipment, quality...</div>
        </div>
      )}

      {/* Report Content */}
      {reportData && !loading && (
        <>
          {/* Export Bar */}
          <div style={{
            background: 'linear-gradient(135deg, #1a1a2e, #16213e)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                {reportData.project.name} — {monthLabel}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                {reportData.weather.workingDays + reportData.weather.nonWorkingDays} calendar days · {reportData.weather.workingDays} working days · {reportData.physical.monthWorks.length} activities progressed
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                onClick={() => handleExport('pdf')}
                disabled={!!generating}
                style={{ background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {generating === 'pdf' ? '⏳' : '📄'} {generating === 'pdf' ? 'Generating...' : 'Export PDF'}
              </button>
              <button
                className="btn"
                onClick={() => handleExport('docx')}
                disabled={!!generating}
                style={{ background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {generating === 'docx' ? '⏳' : '📝'} {generating === 'docx' ? 'Generating...' : 'Export Word'}
              </button>
              <button className="btn btn-secondary" onClick={saveNarratives} disabled={saving}>
                {saving ? '⏳ Saving...' : '💾 Save Narratives'}
              </button>
            </div>
          </div>

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
            <StatCard icon="📐" label="Physical Progress" value={`${reportData.physical.overallProgress}%`} />
            <StatCard icon="💰" label="Financial Progress" value={`${reportData.financial.financialProgress}%`} />
            <StatCard icon="☀️" label="Working Days" value={reportData.weather.workingDays} color="#059669" />
            <StatCard icon="🌧️" label="Rain Days" value={reportData.weather.rainDays} color="#6366f1" />
            <StatCard icon="👷" label="Avg Labour/Day" value={reportData.labour.avgDailyLabour} color="#8b5cf6" />
            <StatCard icon="🧪" label="Pass Rate" value={`${reportData.quality.passRate}%`} color="#059669" />
            <StatCard icon="⚠️" label="Issues" value={reportData.issues.issues.length} color={reportData.issues.criticalIssues > 0 ? '#dc2626' : '#059669'} />
            <StatCard icon="📷" label="Photos" value={reportData.photos.length} color="#8b5cf6" />
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 16, overflowX: 'auto', borderBottom: '2px solid var(--border)' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab.id ? '3px solid var(--accent)' : '3px solid transparent',
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap', transition: 'all 0.2s',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>📊 Report Overview</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Weather Summary</h4>
                    <DataTable
                      headers={['Parameter', 'Value']}
                      rows={[
                        ['Working Days', reportData.weather.workingDays],
                        ['Non-Working Days', reportData.weather.nonWorkingDays],
                        ['Rain Days', reportData.weather.rainDays],
                        ['Avg Max Temp', `${reportData.weather.avgTemp} °C`],
                        ['Total Rainfall', `${reportData.weather.totalRainfall.toFixed(1)} mm`],
                      ]}
                    />
                  </div>
                  <div>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>Financial Summary</h4>
                    <DataTable
                      headers={['Parameter', 'Value']}
                      rows={[
                        ['Contract Sum', `KES ${Number(reportData.financial.contractSum).toLocaleString()}`],
                        ['Certified to Date', `KES ${Number(reportData.financial.totalCertified).toLocaleString()}`],
                        ['Paid to Date', `KES ${Number(reportData.financial.totalPaid).toLocaleString()}`],
                        ['Financial Progress', `${reportData.financial.financialProgress}%`],
                        ['IPCs Issued', reportData.financial.ipcs.length],
                      ]}
                    />
                  </div>
                </div>

                <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 16, marginBottom: 8 }}>Labour Summary</h4>
                <DataTable
                  headers={['Parameter', 'Value']}
                  rows={[
                    ['Total Labour-Days', Number(reportData.labour.totalLabourDays).toLocaleString()],
                    ['Avg Daily Labour', reportData.labour.avgDailyLabour],
                    ['Peak Labour', reportData.labour.peakLabour],
                  ]}
                />
              </div>
            )}

            {/* NARRATIVES TAB */}
            {activeTab === 'narratives' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>📝 Report Narratives</h3>
                  <button className="btn btn-primary" onClick={saveNarratives} disabled={saving} style={{ fontSize: 11 }}>
                    {saving ? '⏳ Saving...' : '💾 Save All Narratives'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, padding: '8px 12px', background: 'var(--bg-hover)', borderRadius: 'var(--radius)' }}>
                  These narratives are saved to the database and will be included in the PDF and Word exports. The RE or PE should fill these in to complement the auto-generated data.
                </div>
                <NarrativeField label="Executive Summary" field="executive_summary" />
                <NarrativeField label="Physical Progress Commentary" field="physical_progress_narrative" />
                <NarrativeField label="Financial Progress Commentary" field="financial_progress_narrative" />
                <NarrativeField label="Quality & Testing Commentary" field="quality_narrative" />
                <NarrativeField label="Health, Safety & Environment" field="hse_narrative" />
                <NarrativeField label="Environmental & Social" field="environmental_narrative" />
                <NarrativeField label="Programme for Next Month" field="upcoming_month_plan" />
                <NarrativeField label="Critical Issues" field="critical_issues" />
                <NarrativeField label="Recommendations" field="recommendations" />
              </div>
            )}

            {/* WORKS TAB */}
            {activeTab === 'works' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>⚒️ Works Progress This Month</h3>
                <DataTable
                  headers={['Activity', 'Code', 'Unit', 'This Month Qty', 'Planned Total']}
                  rows={reportData.physical.monthWorks.map(w => [
                    w.activity_name, w.activity_code, w.unit,
                    Number(w.month_qty).toLocaleString(), Number(w.planned).toLocaleString()
                  ])}
                />
                <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 20, marginBottom: 8 }}>Overall Activities Status</h4>
                <DataTable
                  headers={['Activity', 'Category', 'Unit', 'Planned', 'Completed', 'Progress']}
                  rows={reportData.physical.activities.slice(0, 30).map(a => [
                    a.activity_name, a.category, a.unit,
                    Number(a.planned_quantity || 0).toLocaleString(),
                    Number(a.completed_quantity || 0).toLocaleString(),
                    a.planned_quantity ? `${((a.completed_quantity || 0) / a.planned_quantity * 100).toFixed(1)}%` : '—'
                  ])}
                />
              </div>
            )}

            {/* FINANCIAL TAB */}
            {activeTab === 'financial' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>💰 Financial Progress</h3>
                <DataTable
                  headers={['IPC No.', 'Period', 'Certified (KES)', 'Paid (KES)', 'Status']}
                  rows={reportData.financial.ipcs.map(c => [
                    c.ipc_number, c.period || '—',
                    Number(c.certified_amount || 0).toLocaleString(),
                    Number(c.paid_amount || 0).toLocaleString(),
                    c.status || '—'
                  ])}
                />
                {reportData.variationOrders.variationOrders.length > 0 && (
                  <>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 20, marginBottom: 8 }}>Variation Orders</h4>
                    <DataTable
                      headers={['VO No.', 'Title', 'Type', 'Amount (KES)', 'Time (days)', 'Status']}
                      rows={reportData.variationOrders.variationOrders.map(v => [
                        v.vo_number, v.title, v.vo_type,
                        Number(v.approved_amount || v.estimated_amount || 0).toLocaleString(),
                        v.time_impact_days, v.status
                      ])}
                    />
                  </>
                )}
              </div>
            )}

            {/* EQUIPMENT TAB */}
            {activeTab === 'equipment' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🚜 Equipment Utilisation</h3>
                <DataTable
                  headers={['Equipment', 'Type', 'Hours Worked', 'Working Days', 'Idle Days', 'Breakdown Days']}
                  rows={reportData.equipment.equipUtil.map(e => [
                    e.name, e.type, Number(e.total_hours).toLocaleString(),
                    e.working_days, e.idle_days, e.breakdown_days
                  ])}
                />
              </div>
            )}

            {/* QUALITY TAB */}
            {activeTab === 'quality' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🧪 Quality Tests & Materials</h3>
                <DataTable
                  headers={['Date', 'Test Type', 'Location', 'Sample ID', 'Result', 'Spec Limit', 'Status']}
                  rows={reportData.quality.qualityTests.map(t => [
                    t.test_date, t.test_type, t.location || '—', t.sample_id || '—',
                    t.result_value || '—', t.spec_limit || '—', t.result_status
                  ])}
                />
                {reportData.materials.length > 0 && (
                  <>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 20, marginBottom: 8 }}>Materials Received</h4>
                    <DataTable
                      headers={['Material', 'Description', 'Quantity', 'Unit', 'Source', 'Date']}
                      rows={reportData.materials.map(m => [
                        m.material_type, m.description || '—', Number(m.quantity).toLocaleString(),
                        m.unit, m.source || '—', m.received_date
                      ])}
                    />
                  </>
                )}
              </div>
            )}

            {/* ISSUES TAB */}
            {activeTab === 'issues' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>⚠️ Site Issues & Instructions</h3>
                <DataTable
                  headers={['Date', 'Title', 'Category', 'Severity', 'Status']}
                  rows={reportData.issues.issues.map(i => [
                    i.reported_date, i.title, i.category, i.severity, i.status
                  ])}
                />
                {reportData.instructions.length > 0 && (
                  <>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginTop: 20, marginBottom: 8 }}>Site Instructions</h4>
                    <DataTable
                      headers={['SI No.', 'Type', 'Subject', 'FIDIC Clause', 'Status']}
                      rows={reportData.instructions.map(si => [
                        si.instruction_no, si.instruction_type?.replace(/_/g, ' '),
                        si.subject, si.fidic_clause, si.status
                      ])}
                    />
                  </>
                )}
              </div>
            )}

            {/* SAFETY TAB */}
            {activeTab === 'safety' && (
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 14 }}>🦺 Health & Safety</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <StatCard icon="📊" label="Total Incidents" value={reportData.safety.safetyIncidents.length} />
                  <StatCard icon="⚡" label="Near Misses" value={reportData.safety.nearMisses} color="#f59e0b" />
                  <StatCard icon="🚨" label="LTIs" value={reportData.safety.ltiCount} color="#dc2626" />
                  <StatCard icon="📅" label="Days Lost" value={reportData.safety.totalDaysLost} color="#dc2626" />
                </div>
                {reportData.safety.safetyIncidents.length > 0 && (
                  <DataTable
                    headers={['Date', 'Type', 'Severity', 'Description', 'Persons', 'Days Lost', 'Status']}
                    rows={reportData.safety.safetyIncidents.map(i => [
                      i.incident_date, i.incident_type?.replace(/_/g, ' '), i.severity,
                      (i.description || '').slice(0, 50), i.persons_involved, i.days_lost, i.status
                    ])}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty State */}
      {!reportData && !loading && (
        <div style={{
          textAlign: 'center', padding: 80, color: 'var(--text-muted)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        }}>
          <div style={{ fontSize: 50, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Monthly Progress Report Generator</div>
          <div style={{ fontSize: 12, marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>
            Select a project and month above, then click "Generate Report" to load all data. You can edit narratives, preview sections, and export as PDF or Word.
          </div>
        </div>
      )}
    </div>
  );
}
