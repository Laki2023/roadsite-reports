import { useState, useRef, useEffect } from 'react';

/**
 * SearchableSelect — type-ahead dropdown with category grouping + custom entry.
 * 
 * Props:
 *  - items: array of { name, category } or plain strings
 *  - value: current selected value (string)
 *  - onChange: (value) => void
 *  - placeholder: string
 *  - label: string (field label above)
 *  - allowCustom: boolean — show "Add custom..." option
 *  - grouped: boolean — group items by category
 *  - disabled: boolean
 */
export default function SearchableSelect({
  items = [],
  value = '',
  onChange,
  placeholder = 'Search or select...',
  label = '',
  allowCustom = true,
  grouped = true,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Normalize items to { name, category }
  const normalized = items.map(item =>
    typeof item === 'string' ? { name: item, category: '' } : item
  );

  // Filter by search
  const filtered = search.trim()
    ? normalized.filter(i => i.name.toLowerCase().includes(search.toLowerCase().trim()))
    : normalized;

  // Group items
  const groups = {};
  if (grouped) {
    filtered.forEach(item => {
      const cat = item.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
  }

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
    setSearch('');
    setCustomMode(false);
  };

  const handleCustomSubmit = () => {
    if (customValue.trim()) {
      handleSelect(customValue.trim());
      setCustomValue('');
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      {label && (
        <label style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 600,
          color: '#374151',
          marginBottom: '0.25rem',
        }}>
          {label}
        </label>
      )}

      {/* Trigger / Display */}
      <div
        onClick={() => { if (!disabled) { setOpen(!open); setCustomMode(false); }}}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 0.75rem',
          border: `1.5px solid ${open ? '#2563eb' : '#d1d5db'}`,
          borderRadius: '0.5rem',
          backgroundColor: disabled ? '#f3f4f6' : '#fff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.9rem',
          minHeight: '2.5rem',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ color: value ? '#111827' : '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
          {value && (
            <span
              onClick={handleClear}
              style={{ cursor: 'pointer', padding: '0 0.25rem', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}
              title="Clear"
            >
              ×
            </span>
          )}
          <span style={{ color: '#6b7280', fontSize: '0.7rem' }}>
            {open ? '▲' : '▼'}
          </span>
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          marginTop: '0.25rem',
          border: '1.5px solid #d1d5db',
          borderRadius: '0.5rem',
          backgroundColor: '#fff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: '320px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Search input */}
          <div style={{ padding: '0.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to search..."
              style={{
                width: '100%',
                padding: '0.5rem 0.6rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = '#2563eb'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          {/* Custom entry mode */}
          {customMode ? (
            <div style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
              <input
                autoFocus
                type="text"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomSubmit()}
                placeholder="Enter custom item..."
                style={{
                  flex: 1,
                  padding: '0.45rem 0.6rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleCustomSubmit}
                style={{
                  padding: '0.45rem 0.75rem',
                  backgroundColor: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add
              </button>
            </div>
          ) : (
            /* Options list */
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                  No matches found
                </div>
              ) : grouped ? (
                Object.entries(groups).map(([cat, catItems]) => (
                  <div key={cat}>
                    {cat && cat !== 'Other' && (
                      <div style={{
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        backgroundColor: '#f9fafb',
                        position: 'sticky',
                        top: 0,
                      }}>
                        {cat}
                      </div>
                    )}
                    {catItems.map(item => (
                      <div
                        key={item.name}
                        onClick={() => handleSelect(item.name)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          backgroundColor: value === item.name ? '#eff6ff' : 'transparent',
                          color: value === item.name ? '#2563eb' : '#111827',
                          fontWeight: value === item.name ? 600 : 400,
                          borderLeft: value === item.name ? '3px solid #2563eb' : '3px solid transparent',
                        }}
                        onMouseOver={e => { if (value !== item.name) e.target.style.backgroundColor = '#f3f4f6'; }}
                        onMouseOut={e => { if (value !== item.name) e.target.style.backgroundColor = 'transparent'; }}
                      >
                        {item.name}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                filtered.map(item => (
                  <div
                    key={item.name}
                    onClick={() => handleSelect(item.name)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      backgroundColor: value === item.name ? '#eff6ff' : 'transparent',
                      color: value === item.name ? '#2563eb' : '#111827',
                    }}
                    onMouseOver={e => { if (value !== item.name) e.target.style.backgroundColor = '#f3f4f6'; }}
                    onMouseOut={e => { if (value !== item.name) e.target.style.backgroundColor = 'transparent'; }}
                  >
                    {item.name}
                  </div>
                ))
              )}

              {/* Add custom option */}
              {allowCustom && (
                <div
                  onClick={() => setCustomMode(true)}
                  style={{
                    padding: '0.6rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    color: '#2563eb',
                    fontWeight: 600,
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                  onMouseOver={e => e.target.style.backgroundColor = '#eff6ff'}
                  onMouseOut={e => e.target.style.backgroundColor = 'transparent'}
                >
                  <span style={{ fontSize: '1rem' }}>+</span> Add custom item...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
