import React from 'react';

/* ══════════════════════════════════════════════════════════════
   SHARED UI COMPONENTS
   Extracted from Dashboard & ProjectDashboard to eliminate duplication.
   ══════════════════════════════════════════════════════════════ */

export const COLORS = ['#e87b35','#2563eb','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#6366f1'];

// ── Format helpers ──
export const fmt = (n) => n != null ? 'KES ' + Number(n).toLocaleString() : '—';
export const fmtB = (n) => {
  if (!n) return 'KES 0';
  if (n >= 1e9) return 'KES ' + (n/1e9).toFixed(2) + ' B';
  if (n >= 1e6) return 'KES ' + (n/1e6).toFixed(1) + ' M';
  return 'KES ' + Number(n).toLocaleString();
};
export const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;
export const daysBetween = (a, b) => {
  if (!a || !b) return 0;
  return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
};
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Health grade calculator ──
export function getHealthGrade(score) {
  if (score >= 85) return { grade: 'A', label: 'Excellent', color: '#10b981' };
  if (score >= 70) return { grade: 'B', label: 'Good', color: '#16a34a' };
  if (score >= 55) return { grade: 'C', label: 'Fair', color: '#f59e0b' };
  if (score >= 40) return { grade: 'D', label: 'At Risk', color: '#f97316' };
  return { grade: 'F', label: 'Critical', color: '#ef4444' };
}

// ── Score Ring (circular progress) ──
export function ScoreRing({ value, max = 100, size = 72, stroke = 6, color, label, sublabel }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const progress = max > 0 ? (value / max) * circ : 0;
  const autoColor = color || (value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444');
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.3} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={autoColor} strokeWidth={stroke}
            strokeDasharray={`${progress} ${circ - progress}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          <div style={{ fontSize: size * 0.22, fontWeight: 800, color: autoColor }}>{value}</div>
          {max !== 100 && <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>/{max}</div>}
        </div>
      </div>
      {label && <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{label}</div>}
      {sublabel && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sublabel}</div>}
    </div>
  );
}

// ── KPI Card ──
export function KPICard({ title, value, subtitle, icon, trend, trendLabel, color, onClick, borderColor }) {
  const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#6b7280';
  return (
    <div className="card" onClick={onClick}
      style={{ padding: '16px 18px', cursor: onClick ? 'pointer' : 'default', borderTop: `3px solid ${borderColor || '#e87b35'}`,
        transition: 'transform 0.15s', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = '')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)', marginTop: 4 }}>{value}</div>
          {subtitle && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {icon && <div style={{ fontSize: 28, opacity: 0.15, position: 'absolute', right: 14, top: 14 }}>{icon}</div>}
      </div>
      {trend != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: trendColor, fontWeight: 700 }}>{trend > 0 ? '▲' : trend < 0 ? '▼' : '●'} {Math.abs(trend)}%</span>
          {trendLabel && <span style={{ color: 'var(--text-muted)' }}>{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ── Progress Row / Progress Bar ──
export function ProgressRow({ label, value, max = 100, color = '#e87b35' }) {
  const p = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{p.toFixed(0)}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3, transition: 'width 1s ease' }} />
      </div>
    </div>
  );
}

// ── Status Badge ──
export function StatusBadge({ status, size = 'sm' }) {
  const colors = {
    'On Track': '#10b981', 'Behind': '#f59e0b', 'Critical': '#ef4444', 'Ahead': '#2563eb',
    'Active': '#10b981', 'Completed': '#6b7280', 'Suspended': '#ef4444',
    'Open': '#f59e0b', 'In Progress': '#2563eb', 'Resolved': '#10b981', 'Closed': '#6b7280',
    'Approved': '#10b981', 'Rejected': '#ef4444', 'Pending': '#f59e0b',
    'Not Started': '#9ca3af', 'Laying In Progress': '#2563eb',
    'Laid': '#7c3aed', 'Tested': '#06b6d4', 'Rework': '#dc2626',
  };
  const c = colors[status] || '#6b7280';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999,
      fontSize: size === 'sm' ? 10 : 12, fontWeight: 700, background: c + '18', color: c, border: `1px solid ${c}40` }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
      {status}
    </span>
  );
}

// ── Empty State ──
export function EmptyState({ icon = '📭', title = 'No Data', message = 'Nothing to display yet.' }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{message}</div>
    </div>
  );
}

// ── Loading Spinner ──
export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 28, color: 'var(--accent)', marginBottom: 12, animation: 'spin 1s linear infinite' }}>◈</div>
      <div style={{ fontSize: 14 }}>{message}</div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Section Header ──
export function SectionHeader({ icon, title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          {icon && <span>{icon}</span>}
          {title}
        </h2>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

// ── Card wrapper with hover effect ──
export function HoverCard({ children, onClick, borderColor, style = {}, ...props }) {
  return (
    <div className="card" onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.15s, box-shadow 0.15s',
        borderLeft: borderColor ? `3px solid ${borderColor}` : undefined, ...style }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = '')}
      {...props}>
      {children}
    </div>
  );
}

// ── Tooltip-style info icon ──
export function InfoTip({ text }) {
  return (
    <span title={text} style={{ cursor: 'help', fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>ⓘ</span>
  );
}

// ── Responsive grid helper ──
export function Grid({ cols = 4, gap = 16, children, style = {} }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${Math.floor(900 / cols)}px, 1fr))`,
      gap,
      ...style
    }}>
      {children}
    </div>
  );
}
