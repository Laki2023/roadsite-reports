/**
 * NilReturnToggle — "Nothing to Report" skip toggle for wizard steps
 *
 * When activated, the step's data-entry UI is hidden and the RE
 * explicitly acknowledges there is nothing to report for this section.
 * The nil status is stored in the draft and displayed in the review step.
 */

import React from 'react';

export default function NilReturnToggle({ stepKey, label, isNil, onToggle }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        marginBottom: 12,
        background: isNil ? '#f0fdf4' : 'var(--bg-hover)',
        border: `1.5px solid ${isNil ? '#86efac' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{isNil ? '✅' : '📋'}</span>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isNil ? '#16a34a' : 'var(--text)',
            }}
          >
            {isNil ? `Nothing to report — ${label}` : `${label}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {isNil
              ? 'This section will be recorded as Nil in the daily report'
              : 'Toggle if there is nothing to report for this section'}
          </div>
        </div>
      </div>

      <label
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 44,
          height: 24,
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={isNil}
          onChange={(e) => onToggle(stepKey, e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            background: isNil ? '#22c55e' : '#d1d5db',
            borderRadius: 12,
            transition: 'background 0.2s',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: isNil ? 22 : 2,
            width: 20,
            height: 20,
            background: '#fff',
            borderRadius: '50%',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </label>
    </div>
  );
}

/**
 * NilSummaryBadge — shown in the Review step for nil sections
 */
export function NilSummaryBadge({ stepLabel, stepIcon }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: 'var(--radius)',
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: 14 }}>{stepIcon}</span>
      <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
        {stepLabel} — Nothing to Report (Nil)
      </span>
    </div>
  );
}
