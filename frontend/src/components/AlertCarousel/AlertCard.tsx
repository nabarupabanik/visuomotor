import React from 'react';
import { TRIGGER_LABELS, TRIGGER_COLORS, TRIGGER_ICONS, TriggerCode } from '../../constants/triggerCodes';
import { AlertData, useMarketStore } from '../../store/marketStore';
import { formatBps } from '../../utils/formatters';

interface AlertCardProps {
  alert: AlertData;
  onRetrySummary?: (symbol: string) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onRetrySummary }) => {
  const expandedAlertSymbol = useMarketStore((state) => state.expandedAlertSymbol);
  const setExpandedAlert = useMarketStore((state) => state.setExpandedAlert);
  const dismissAlert = useMarketStore((state) => state.dismissAlert);

  if (!alert || !alert.symbol) {
    return null;
  }

  const symbol = alert.symbol;
  const isExpanded = expandedAlertSymbol === symbol;

  const rawCode = alert.triggerCode ?? 0;
  const triggerCode = (rawCode >= 0 && rawCode <= 5 ? rawCode : 1) as TriggerCode;
  const label = TRIGGER_LABELS[triggerCode] || 'Anomaly';
  const color = TRIGGER_COLORS[triggerCode] || '#00D09C';
  const icon = TRIGGER_ICONS[triggerCode] || '⚡';

  const deltaBps = Number(alert.deltaBps) || 0;
  const isPositive = deltaBps >= 0;

  return (
    <div
      style={{
        minWidth: '280px',
        maxWidth: '320px',
        flex: '0 0 auto',
        scrollSnapAlign: 'start',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        position: 'relative',
        backgroundColor: '#FFFFFF',
        borderRadius: '10px',
        border: isExpanded ? `2px solid ${color}` : '1px solid #E8E9EB',
        boxShadow: isExpanded ? `0 6px 20px ${color}22` : '0 2px 4px rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onClick={() => setExpandedAlert(symbol)}
      onMouseEnter={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isExpanded) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
        }
      }}
    >
      {/* Top action: Dismiss button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismissAlert(symbol);
        }}
        title="Dismiss alert"
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'none',
          border: 'none',
          color: '#9CA3AF',
          fontSize: '0.85rem',
          cursor: 'pointer',
          padding: '2px 6px',
          borderRadius: '4px',
          lineHeight: 1,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#EB5B3C')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#9CA3AF')}
      >
        ✕
      </button>

      {/* Header: Symbol + Trigger Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '20px' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1E2232', letterSpacing: '-0.01em' }}>
          {symbol}
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            padding: '2px 7px',
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

      {/* Metric: Basis Point Delta & Action hint */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: isExpanded ? color : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          {isExpanded ? 'Active ▲' : 'Placard ▼'}
        </span>
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
            <span>
              News unavailable.{' '}
              <a
                href={alert.filingUrl || `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${alert.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{ color: '#00D09C', fontWeight: 600 }}
              >
                Filings ↗
              </a>
            </span>
            {onRetrySummary && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetrySummary(alert.symbol);
                }}
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

