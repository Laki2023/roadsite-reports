import React, { useState, useEffect } from 'react';
import { getStoredTheme, setTheme } from '../lib/theme';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

export default function ThemeToggle() {
  const [current, setCurrent] = useState(getStoredTheme);

  useEffect(() => {
    function onThemeChange() {
      setCurrent(getStoredTheme());
    }
    window.addEventListener('theme-change', onThemeChange);
    return () => window.removeEventListener('theme-change', onThemeChange);
  }, []);

  function handleSelect(value) {
    setTheme(value);
    setCurrent(value);
  }

  return (
    <div style={{
      display: 'flex',
      gap: 2,
      padding: '2px',
      background: 'rgba(255,255,255,0.06)',
      borderRadius: 'var(--radius)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {OPTIONS.map(opt => {
        const isActive = current === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            title={opt.label}
            aria-label={`${opt.label} theme`}
            aria-pressed={isActive}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: '5px 6px',
              border: 'none',
              borderRadius: 'calc(var(--radius) - 2px)',
              background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
              color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              cursor: 'pointer',
              transition: 'all var(--transition)',
              fontFamily: 'var(--font-body)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 13 }}>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
