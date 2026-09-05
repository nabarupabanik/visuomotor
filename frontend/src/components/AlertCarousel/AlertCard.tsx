import React from 'react';
import { TRIGGER_LABELS, TRIGGER_COLORS, TRIGGER_ICONS, TriggerCode } from '../../constants/triggerCodes';
import { AlertData } from '../../store/marketStore';
import { formatBps } from '../../utils/formatters';

interface AlertCardProps {
  alert: AlertData;
  onRetrySummary?: (symbol: string) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onRetrySummary }) => {
  const rawCode = alert.triggerCode || 0;
  const triggerCode = (rawCode >= 0 && rawCode <= 5 ? rawCode : 1) as TriggerCode;
  const label = TRIGGER_LABELS[triggerCode] || 'Anomaly';
  const color = TRIGGER_COLORS[triggerCode] || '#00D09C';
  const icon = TRIGGER_ICONS[triggerCode] || '⚡';

  const isPositive = alert.deltaBps >= 0;

  return (
    <div
      style={{
        minWidth: '272px',
        maxWidth: '310px',
        flex: '0 0 auto',
        scrollSnapAlign: 'start',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        position: 'relative',
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: '1px solid #E8E9EB',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
      }}
    >
      {/* Header: Symbol + Trigger Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#44475B', letterSpacing: '-0.01em' }}>
          {alert.symbol}
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: '16px',
            backgroundColor: `${color}14`,
            color: color,
            border: `1px solid ${color}30`,
          }}
        >
          <span>{icon}</span>
          {label}
        </span>
      </div>

      {/* Metric: Basis Point Delta */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span
          style={{
            fontSize: '1.3rem',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            color: isPositive ? 'var(--color-green)' : 'var(--color-red)',
            letterSpacing: '-0.02em',
          }}
        >
          {formatBps(alert.deltaBps)}
        </span>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>since exit</span>
      </div>

      {/* AI Catalyst News Context */}
      <div
        style={{
          marginTop: '2px',
          padding: '8px 10px',
          borderRadius: '6px',
          backgroundColor: '#F4F5F7',
          border: '1px solid #E8E9EB',
          minHeight: '46px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {alert.summary ? (
          <div style={{ fontSize: '0.78rem', color: '#44475B', lineHeight: 1.4 }}>
            💡 <span style={{ fontWeight: 400 }}>{alert.summary}</span>
          </div>
        ) : alert.isSummaryError ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>News context unavailable</span>
            {onRetrySummary && (
              <button
                type="button"
                onClick={() => onRetrySummary(alert.symbol)}
                title="Retry AI summary"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-green)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                }}
              >
                ⟳
              </button>
            )}
          </div>
        ) : alert.isSummaryLoading ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="skeleton-shimmer" style={{ height: '10px', width: '85%' }} />
            <div className="skeleton-shimmer" style={{ height: '10px', width: '60%' }} />
          </div>
        ) : (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Monitoring order book & catalyst feeds...
          </div>
        )}
      </div>
    </div>
  );
};
