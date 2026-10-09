import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const SEVERITY = { critical: 'critical', warning: 'warning', info: 'info' };
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', icon: '🔴', color: '#ef4444', bg: '#fef2f2', border: '#ef4444' },
  warning:  { label: 'Warning',  icon: '🟠', color: '#f59e0b', bg: '#fffbeb', border: '#f59e0b' },
  info:     { label: 'Info',     icon: '🟡', color: '#3b82f6', bg: '#eff6ff', border: '#3b82f6' },
};

const CATEGORIES = {
  guarantee:      { label: 'Guarantees',      icon: '🔐', nav: 'guarantees' },
  ipc:            { label: 'IPCs',             icon: '💰', nav: 'ipc' },
  eot:            { label: 'EoT',              icon: '⏱️', nav: 'eot' },
  correspondence: { label: 'Correspondence',   icon: '✉️', nav: 'correspondence' },
  milestone:      { label: 'Milestones',       icon: '🏗️', nav: 'programme' },
  quality:        { label: 'Quality',          icon: '🔬', nav: 'quality-tests' },
};

const CATEGORY_KEYS = Object.keys(CATEGORIES);

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null;
  return Math.ceil((new Date(dateA) - new Date(dateB)) / 86400000);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtAmount(amt) {
  if (amt == null) return '—';
  return Number(amt).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDismissedAlerts(projectId) {
  try {
    const raw = localStorage.getItem(`alerts_dismissed_${projectId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function setDismissedAlerts(projectId, dismissed) {
  try {
    localStorage.setItem(`alerts_dismissed_${projectId}`, JSON.stringify(dismissed));
  } catch { /* ignore */ }
}

/* ─── Alert generation functions ─── */

function generateGuaranteeAlerts(guarantees, today) {
  const alerts = [];
  for (const g of guarantees) {
    const expiry = g.extended_to || g.expiry_date;
    if (!expiry) continue;
    if (g.status === 'Returned' || g.status === 'Cancelled') continue;
    const daysLeft = daysBetween(expiry, today);

    if (daysLeft <= 30) {
      const expired = daysLeft < 0;
      alerts.push({
        id: `guarantee-${g.id}`,
        category: 'guarantee',
        severity: SEVERITY.critical,
        title: expired
          ? `${g.guarantee_type || 'Guarantee'} EXPIRED ${Math.abs(daysLeft)} days ago`
          : `${g.guarantee_type || 'Guarantee'} expiring in ${daysLeft} days`,
        description: `${g.description || g.guarantee_type || 'Guarantee'} issued by ${g.issuing_institution || 'Unknown'} — Amount: KES ${fmtAmount(g.amount)} — Expiry: ${fmtDate(expiry)}`,
        source: 'View in Guarantee Register',
        sourceNav: 'guarantees',
        detectedAt: today.toISOString(),
      });
    } else if (daysLeft <= 60) {
      alerts.push({
        id: `guarantee-${g.id}`,
        category: 'guarantee',
        severity: SEVERITY.warning,
        title: `${g.guarantee_type || 'Guarantee'} expiring in ${daysLeft} days`,
        description: `${g.description || g.guarantee_type || 'Guarantee'} issued by ${g.issuing_institution || 'Unknown'} — Amount: KES ${fmtAmount(g.amount)} — Expiry: ${fmtDate(expiry)}`,
        source: 'View in Guarantee Register',
        sourceNav: 'guarantees',
        detectedAt: today.toISOString(),
      });
    }
  }
  return alerts;
}

function generateIPCAlerts(ipcs, today) {
  const alerts = [];
  for (const ipc of ipcs) {
    // Payment overdue
    if (ipc.payment_due_date && (ipc.status !== 'Paid')) {
      const daysOverdue = daysBetween(today, ipc.payment_due_date);
      if (daysOverdue > 14) {
        alerts.push({
          id: `ipc-pay-${ipc.id}`,
          category: 'ipc',
          severity: SEVERITY.critical,
          title: `IPC ${ipc.ipc_no || '—'} payment overdue by ${daysOverdue} days`,
          description: `Certified: KES ${fmtAmount(ipc.certified_amount)} — Paid: KES ${fmtAmount(ipc.paid_amount)} — Due: ${fmtDate(ipc.payment_due_date)} — Ref: FIDIC Sub-Clause 14.7 / 14.8 (late payment interest applies)`,
          source: 'View in IPC Register',
          sourceNav: 'ipc',
          detectedAt: today.toISOString(),
        });
      } else if (daysOverdue >= -7 && daysOverdue <= 14) {
        const daysLeft = -daysOverdue;
        if (daysOverdue > 0) {
          alerts.push({
            id: `ipc-pay-${ipc.id}`,
            category: 'ipc',
            severity: SEVERITY.warning,
            title: `IPC ${ipc.ipc_no || '—'} payment overdue by ${daysOverdue} days`,
            description: `Certified: KES ${fmtAmount(ipc.certified_amount)} — Due: ${fmtDate(ipc.payment_due_date)} — FIDIC 14.7 financing charges may apply`,
            source: 'View in IPC Register',
            sourceNav: 'ipc',
            detectedAt: today.toISOString(),
          });
        } else if (daysLeft <= 7 && daysLeft >= 0) {
          alerts.push({
            id: `ipc-pay-${ipc.id}`,
            category: 'ipc',
            severity: SEVERITY.warning,
            title: `IPC ${ipc.ipc_no || '—'} payment due in ${daysLeft} days`,
            description: `Certified: KES ${fmtAmount(ipc.certified_amount)} — Due: ${fmtDate(ipc.payment_due_date)} — Ref: FIDIC Sub-Clause 14.7`,
            source: 'View in IPC Register',
            sourceNav: 'ipc',
            detectedAt: today.toISOString(),
          });
        }
      }
    }

    // Certification due
    if (ipc.certification_due_date && ipc.status !== 'Certified' && ipc.status !== 'Paid') {
      const daysLeft = daysBetween(ipc.certification_due_date, today);
      if (daysLeft >= 0 && daysLeft <= 7) {
        alerts.push({
          id: `ipc-cert-${ipc.id}`,
          category: 'ipc',
          severity: SEVERITY.info,
          title: `IPC ${ipc.ipc_no || '—'} certification due in ${daysLeft} days`,
          description: `Contractor submitted: ${fmtDate(ipc.contractor_submitted_date)} — Certification due: ${fmtDate(ipc.certification_due_date)} — Ref: FIDIC Sub-Clause 14.6`,
          source: 'View in IPC Register',
          sourceNav: 'ipc',
          detectedAt: today.toISOString(),
        });
      }
    }
  }
  return alerts;
}

function generateEoTAlerts(eots, today) {
  const alerts = [];
  for (const eot of eots) {
    if (!eot.notice_due_date) continue;
    const hasNotice = !!eot.notice_date;
    const daysLeft = daysBetween(eot.notice_due_date, today);

    if (!hasNotice && daysLeft < 0) {
      alerts.push({
        id: `eot-${eot.id}`,
        category: 'eot',
        severity: SEVERITY.critical,
        title: `EoT ${eot.eot_no || '—'} — Notice deadline missed by ${Math.abs(daysLeft)} days`,
        description: `"${eot.title || 'Untitled'}" — Event: ${fmtDate(eot.event_date)} — Notice was due: ${fmtDate(eot.notice_due_date)} — FIDIC 20.1: late notice may bar entitlement`,
        source: 'View in EoT Tracker',
        sourceNav: 'eot',
        detectedAt: today.toISOString(),
      });
    } else if (!hasNotice && daysLeft >= 0 && daysLeft <= 7) {
      alerts.push({
        id: `eot-${eot.id}`,
        category: 'eot',
        severity: SEVERITY.warning,
        title: `EoT ${eot.eot_no || '—'} — Notice due in ${daysLeft} days`,
        description: `"${eot.title || 'Untitled'}" — Event: ${fmtDate(eot.event_date)} — Notice due: ${fmtDate(eot.notice_due_date)} — ${eot.days_claimed ? eot.days_claimed + ' days claimed' : ''}`,
        source: 'View in EoT Tracker',
        sourceNav: 'eot',
        detectedAt: today.toISOString(),
      });
    }
  }
  return alerts;
}

function generateCorrespondenceAlerts(correspondence, today) {
  const alerts = [];
  for (const c of correspondence) {
    if (!c.response_due_date || !c.response_required) continue;
    if (c.response_received_date) continue;
    const daysOverdue = daysBetween(today, c.response_due_date);
    if (daysOverdue > 0) {
      alerts.push({
        id: `corr-${c.id}`,
        category: 'correspondence',
        severity: SEVERITY.warning,
        title: `Response overdue: ${c.reference_no || 'No ref'}`,
        description: `"${c.subject || 'No subject'}" — Ball in court: ${c.ball_in_court || '—'} — Due: ${fmtDate(c.response_due_date)} — ${daysOverdue} days overdue`,
        source: 'View in Correspondence Register',
        sourceNav: 'correspondence',
        detectedAt: today.toISOString(),
      });
    }
  }
  return alerts;
}

function generateMilestoneAlerts(milestones, today) {
  const alerts = [];
  for (const m of milestones) {
    if (!m.planned_date) continue;
    if (m.status === 'Achieved' || m.status === 'Completed') continue;
    const daysLeft = daysBetween(m.planned_date, today);

    if (daysLeft < 0) {
      alerts.push({
        id: `ms-${m.id}`,
        category: 'milestone',
        severity: SEVERITY.critical,
        title: `Milestone overdue: ${m.title || 'Untitled'}`,
        description: `Planned: ${fmtDate(m.planned_date)} — ${Math.abs(daysLeft)} days overdue — Status: ${m.status || '—'}`,
        source: 'View in Programme',
        sourceNav: 'programme',
        detectedAt: today.toISOString(),
      });
    } else if (daysLeft <= 30) {
      alerts.push({
        id: `ms-${m.id}`,
        category: 'milestone',
        severity: SEVERITY.warning,
        title: `Milestone approaching: ${m.title || 'Untitled'}`,
        description: `Planned: ${fmtDate(m.planned_date)} — ${daysLeft} days remaining — Status: ${m.status || '—'}`,
        source: 'View in Programme',
        sourceNav: 'programme',
        detectedAt: today.toISOString(),
      });
    }
  }
  return alerts;
}

function generateQualityAlerts(tests, today) {
  const alerts = [];
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const t of tests) {
    if (t.compliance_status !== 'Fail') continue;
    const testDate = t.test_date ? new Date(t.test_date) : null;
    if (!testDate || testDate < sevenDaysAgo) continue;

    alerts.push({
      id: `qual-${t.id}`,
      category: 'quality',
      severity: SEVERITY.warning,
      title: `Quality test failure: ${t.test_type || t.material_type || 'Test'}`,
      description: `Chainage: ${t.chainage || '—'} — Date: ${fmtDate(t.test_date)} — Result: ${t.result || t.compliance_status}`,
      source: 'View in Quality Matrix',
      sourceNav: 'quality-tests',
      detectedAt: today.toISOString(),
    });
  }
  return alerts;
}

/* ─── Keyframes for pulsing critical alerts ─── */
const pulseKeyframes = `
@keyframes alertPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.15); }
  50% { box-shadow: 0 0 0 6px rgba(239,68,68,0.08); }
}
`;

/* ─── Component ─── */
export default function AlertCentrePage({ profile, showToast, navigateTo, selectedProject }) {
  const [tab, setTab] = useState('centre');
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [dismissed, setDismissed] = useState({});
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');

  const projectId = selectedProject?.id;

  // Load dismissed state from localStorage
  useEffect(() => {
    if (projectId) setDismissed(getDismissedAlerts(projectId));
  }, [projectId]);

  // Fetch data and generate alerts
  useEffect(() => {
    if (!projectId) { setAlerts([]); return; }
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [gRes, ipcRes, eotRes, corrRes, msRes, qRes] = await Promise.all([
          supabase.from('guarantee_register').select('*').eq('project_id', projectId),
          supabase.from('ipc_certificates').select('*').eq('project_id', projectId),
          supabase.from('eot_applications').select('*').eq('project_id', projectId),
          supabase.from('correspondence').select('*').eq('project_id', projectId),
          supabase.from('contract_milestones').select('*').eq('project_id', projectId),
          supabase.from('quality_test_matrix').select('*').eq('project_id', projectId),
        ]);

        const errors = [gRes, ipcRes, eotRes, corrRes, msRes, qRes].filter(r => r.error);
        if (errors.length) {
          showToast?.('Error loading some alert data: ' + errors.map(e => e.error.message).join('; '), 'error');
        }

        if (cancelled) return;

        const today = new Date();
        const all = [
          ...generateGuaranteeAlerts(gRes.data || [], today),
          ...generateIPCAlerts(ipcRes.data || [], today),
          ...generateEoTAlerts(eotRes.data || [], today),
          ...generateCorrespondenceAlerts(corrRes.data || [], today),
          ...generateMilestoneAlerts(msRes.data || [], today),
          ...generateQualityAlerts(qRes.data || [], today),
        ];

        all.sort((a, b) => {
          const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
          if (sev !== 0) return sev;
          return new Date(a.detectedAt) - new Date(b.detectedAt);
        });

        setAlerts(all);
      } catch (err) {
        showToast?.('Failed to generate alerts: ' + err.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  function handleDismiss(alertId) {
    const next = { ...dismissed, [alertId]: new Date().toISOString() };
    setDismissed(next);
    if (projectId) setDismissedAlerts(projectId, next);
  }

  // Filtered alerts (active = not dismissed)
  const activeAlerts = alerts.filter(a => !dismissed[a.id]);
  const filteredAlerts = activeAlerts.filter(a => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false;
    if (filterSeverity !== 'all' && a.severity !== filterSeverity) return false;
    return true;
  });

  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = activeAlerts.filter(a => a.severity === 'warning').length;
  const infoCount = activeAlerts.filter(a => a.severity === 'info').length;

  // Health score
  const healthScore = Math.max(0, Math.min(100, 100 - (criticalCount * 10) - (warningCount * 3) - (infoCount * 1)));
  const healthColor = healthScore >= 80 ? '#10b981' : healthScore >= 50 ? '#f59e0b' : '#ef4444';

  // No project guard
  if (!projectId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
        <h2 style={{ color: 'var(--text)', marginBottom: 8 }}>Alert Centre</h2>
        <p>Please select a project to view alerts.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 32px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{pulseKeyframes}</style>

      {/* Header */}
      <div style={{ marginBottom: 24, padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '16px 0 4px' }}>
          🔔 Proactive Alert Engine
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
          {selectedProject?.name || 'Project'} — Consolidated contract & compliance alerts
        </p>
      </div>

      {/* KPI Bar */}
      <div style={{ display: 'flex', gap: 12, padding: '0 16px', marginBottom: 20, flexWrap: 'wrap' }}>
        <KPICard label="Total Active" value={activeAlerts.length} color="var(--accent)" />
        <KPICard label="Critical" value={criticalCount} color="#ef4444" />
        <KPICard label="Warning" value={warningCount} color="#f59e0b" />
        <KPICard label="Info" value={infoCount} color="#3b82f6" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, padding: '0 16px', marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {[
          { key: 'centre', label: 'Alert Centre' },
          { key: 'summary', label: 'Alert Summary' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            background: 'none', color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          Loading alerts...
        </div>
      ) : tab === 'centre' ? (
        <AlertCentreTab
          alerts={filteredAlerts}
          allAlerts={activeAlerts}
          filterCategory={filterCategory}
          setFilterCategory={setFilterCategory}
          filterSeverity={filterSeverity}
          setFilterSeverity={setFilterSeverity}
          onDismiss={handleDismiss}
          navigateTo={navigateTo}
        />
      ) : (
        <AlertSummaryTab
          alerts={alerts}
          activeAlerts={activeAlerts}
          dismissed={dismissed}
          healthScore={healthScore}
          healthColor={healthColor}
          criticalCount={criticalCount}
          warningCount={warningCount}
          infoCount={infoCount}
        />
      )}
    </div>
  );
}

/* ─── KPI Card ─── */
function KPICard({ label, value, color }) {
  return (
    <div style={{
      flex: '1 1 120px', minWidth: 110, background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius, 8px)', padding: '14px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

/* ─── Alert Centre Tab ─── */
function AlertCentreTab({ alerts, allAlerts, filterCategory, setFilterCategory, filterSeverity, setFilterSeverity, onDismiss, navigateTo }) {
  const selectStyle = {
    padding: '7px 12px', borderRadius: 'var(--radius, 6px)', border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ padding: '0 16px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--text-muted)' }}>Category:</label>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="all">All Categories</option>
          {CATEGORY_KEYS.map(k => (
            <option key={k} value={k}>{CATEGORIES[k].icon} {CATEGORIES[k].label}</option>
          ))}
        </select>

        <label style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8 }}>Severity:</label>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selectStyle}>
          <option value="all">All Severities</option>
          {Object.keys(SEVERITY_CONFIG).map(k => (
            <option key={k} value={k}>{SEVERITY_CONFIG[k].icon} {SEVERITY_CONFIG[k].label}</option>
          ))}
        </select>

        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Showing {alerts.length} of {allAlerts.length} alerts
        </span>
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 48, background: 'var(--card)',
          borderRadius: 'var(--radius, 8px)', border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>No active alerts</p>
          <p style={{ fontSize: 13, margin: 0 }}>All clear — no items require attention right now.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map(alert => (
            <AlertCard key={alert.id} alert={alert} onDismiss={onDismiss} navigateTo={navigateTo} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Single Alert Card ─── */
function AlertCard({ alert, onDismiss, navigateTo }) {
  const sev = SEVERITY_CONFIG[alert.severity];
  const cat = CATEGORIES[alert.category];
  const isCritical = alert.severity === 'critical';

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderLeft: `4px solid ${sev.border}`, borderRadius: 'var(--radius, 8px)',
      padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
      animation: isCritical ? 'alertPulse 2s ease-in-out infinite' : 'none',
      transition: 'box-shadow 0.2s',
    }}>
      {/* Severity + category icons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 36, paddingTop: 2 }}>
        <span style={{ fontSize: 20 }}>{sev.icon}</span>
        <span style={{ fontSize: 16 }}>{cat?.icon}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            color: sev.color, background: sev.bg, padding: '2px 8px', borderRadius: 10,
          }}>{sev.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cat?.label}</span>
        </div>

        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4, lineHeight: 1.35 }}>
          {alert.title}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 8 }}>
          {alert.description}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigateTo?.(alert.sourceNav || cat?.nav)}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, padding: 0, textDecoration: 'none',
            }}
          >
            {alert.source} →
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Detected: {fmtDate(alert.detectedAt)}
          </span>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(alert.id)}
        title="Dismiss alert"
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius, 6px)',
          color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 10px', fontSize: 12,
          whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2, transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        Dismiss
      </button>
    </div>
  );
}

/* ─── Alert Summary Tab ─── */
function AlertSummaryTab({ alerts, activeAlerts, dismissed, healthScore, healthColor, criticalCount, warningCount, infoCount }) {
  // Matrix data
  const matrix = {};
  for (const cat of CATEGORY_KEYS) {
    matrix[cat] = { critical: 0, warning: 0, info: 0 };
  }
  for (const a of activeAlerts) {
    if (matrix[a.category]) matrix[a.category][a.severity]++;
  }

  // Recent history (last 30, including dismissed)
  const recentHistory = [...alerts].slice(0, 30);

  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        {/* Health Score */}
        <div style={{
          flex: '0 0 auto', background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius, 8px)', padding: '24px 32px', textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 200,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 16 }}>
            Project Health Score
          </div>
          <HealthGauge score={healthScore} color={healthColor} />
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {healthScore >= 80 ? 'Good standing' : healthScore >= 50 ? 'Needs attention' : 'Critical issues'}
          </div>
        </div>

        {/* Heatmap Matrix */}
        <div style={{
          flex: 1, minWidth: 300, background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius, 8px)', padding: 20, overflow: 'auto',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
            Alert Distribution Matrix
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Category</th>
                <th style={{ ...thStyle, textAlign: 'center', color: '#ef4444' }}>🔴 Critical</th>
                <th style={{ ...thStyle, textAlign: 'center', color: '#f59e0b' }}>🟠 Warning</th>
                <th style={{ ...thStyle, textAlign: 'center', color: '#3b82f6' }}>🟡 Info</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_KEYS.map(cat => (
                <tr key={cat}>
                  <td style={tdStyle}>{CATEGORIES[cat].icon} {CATEGORIES[cat].label}</td>
                  <MatrixCell count={matrix[cat].critical} severity="critical" />
                  <MatrixCell count={matrix[cat].warning} severity="warning" />
                  <MatrixCell count={matrix[cat].info} severity="info" />
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td style={tdStyle}>Total</td>
                <MatrixCell count={criticalCount} severity="critical" bold />
                <MatrixCell count={warningCount} severity="warning" bold />
                <MatrixCell count={infoCount} severity="info" bold />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent History */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius, 8px)', padding: 20,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>
          Recent Alert History (last 30)
        </div>
        {recentHistory.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 16, textAlign: 'center' }}>
            No alerts generated.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Severity</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Alert</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentHistory.map(a => {
                  const sev = SEVERITY_CONFIG[a.severity];
                  const cat = CATEGORIES[a.category];
                  const isDismissed = !!dismissed[a.id];
                  return (
                    <tr key={a.id} style={{ opacity: isDismissed ? 0.55 : 1 }}>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                          color: sev.color, background: sev.bg, padding: '2px 8px', borderRadius: 10,
                        }}>{sev.label}</span>
                      </td>
                      <td style={tdStyle}>{cat?.icon} {cat?.label}</td>
                      <td style={{ ...tdStyle, maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: isDismissed ? '#9ca3af' : sev.color,
                        }}>
                          {isDismissed ? 'Dismissed' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Health Gauge (circular progress) ─── */
function HealthGauge({ score, color }) {
  const radius = 54;
  const stroke = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      {/* Background track */}
      <circle cx="70" cy="70" r={radius} fill="none"
        stroke="var(--border)" strokeWidth={stroke} />
      {/* Progress arc */}
      <circle cx="70" cy="70" r={radius} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      {/* Score text */}
      <text x="70" y="65" textAnchor="middle" style={{ fontSize: 28, fontWeight: 700, fill: color }}>
        {score}
      </text>
      <text x="70" y="85" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-muted)' }}>
        / 100
      </text>
    </svg>
  );
}

/* ─── Matrix Cell ─── */
function MatrixCell({ count, severity, bold }) {
  const sev = SEVERITY_CONFIG[severity];
  return (
    <td style={{ ...tdStyle, textAlign: 'center' }}>
      {count > 0 ? (
        <span style={{
          display: 'inline-block', minWidth: 28, padding: '3px 8px', borderRadius: 12,
          background: sev.bg, color: sev.color, fontWeight: bold ? 700 : 600, fontSize: 13,
        }}>{count}</span>
      ) : (
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>0</span>
      )}
    </td>
  );
}

/* ─── Table styles ─── */
const thStyle = {
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border)',
  color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '8px 10px', borderBottom: '1px solid var(--border)',
  color: 'var(--text)', verticalAlign: 'middle',
};
