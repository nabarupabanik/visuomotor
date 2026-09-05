import React from 'react';

interface SortToggleProps {
  sortBy: 'volatility' | 'custom';
  onChange: (sort: 'volatility' | 'custom') => void;
}

export const SortToggle: React.FC<SortToggleProps> = ({ sortBy, onChange }) => {
  const baseStyle: React.CSSProperties = {
    padding: '5px 12px',
    borderRadius: '16px',
    fontSize: '0.78rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    whiteSpace: 'nowrap' as const,
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      {/* Volatility Triage */}
      <button
        type="button"
        onClick={() => onChange('volatility')}
        style={{
          ...baseStyle,
          border: sortBy === 'volatility'
            ? '1px solid rgba(0, 208, 156, 0.4)'
            : '1px solid var(--border-subtle)',
          backgroundColor: sortBy === 'volatility'
            ? 'rgba(0, 208, 156, 0.08)'
            : 'transparent',
          color: sortBy === 'volatility' ? '#00D09C' : 'var(--text-secondary)',
          fontWeight: sortBy === 'volatility' ? 600 : 500,
        }}
      >
        <span>⚡</span> Volatility Triage
      </button>

      {/* Custom Order */}
      <button
        type="button"
        onClick={() => onChange('custom')}
        style={{
          ...baseStyle,
          border: sortBy === 'custom'
            ? '1px solid #AAACB8'
            : '1px solid var(--border-subtle)',
          backgroundColor: sortBy === 'custom'
            ? '#F4F5F7'
            : 'transparent',
          color: sortBy === 'custom' ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: sortBy === 'custom' ? 600 : 500,
        }}
      >
        <span>📑</span> Custom Order
      </button>
    </div>
  );
};
