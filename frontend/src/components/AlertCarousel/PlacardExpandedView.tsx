import React, { useState, useMemo } from 'react';
import { TRIGGER_LABELS, TRIGGER_COLORS, TriggerCode } from '../../constants/triggerCodes';
import { AlertData } from '../../store/marketStore';
import { CandlestickView } from './CandlestickView';

interface PlacardExpandedViewProps {
  alert: AlertData;
  onCollapse: () => void;
  onDismiss: (symbol: string) => void;
  onRetrySummary?: (symbol: string) => void;
}

export const PlacardExpandedView: React.FC<PlacardExpandedViewProps> = ({
  alert,
  onCollapse,
  onDismiss,
  onRetrySummary,
}) => {
  const [showChart, setShowChart] = useState(false);

  const rawCode = alert?.triggerCode ?? 0;
  const triggerCode = (rawCode >= 0 && rawCode <= 5 ? rawCode : 1) as TriggerCode;
  const label = TRIGGER_LABELS[triggerCode] || 'Anomaly';
  const color = TRIGGER_COLORS[triggerCode] || '#00D09C';

  const symbol = alert?.symbol || 'STOCK';
  const deltaBps = Number(alert?.deltaBps) || 0;
  const isPositive = deltaBps >= 0;

  const baseline = Number(alert?.baselinePrice) || Number(alert?.currentPrice) || 100000;
  const current = Number(alert?.currentPrice) || baseline;
  const deltaPercent = (deltaBps / 100).toFixed(2);

  const volMultiplier = alert?.metrics?.volMultiplier !== undefined ? alert.metrics.volMultiplier : 'N/A';
  const zScore = alert?.metrics?.zScore !== undefined ? alert.metrics.zScore : 0;

  // Absence Duration formatted helper
  const absenceText = useMemo(() => {
    if (!alert?.exitTimestamp) return 'Since you left 3h 15m ago';
    const diffMs = Math.max(0, Date.now() - alert.exitTimestamp);
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) {
      return `Since you left ${hours}h ${mins}m ago`;
    }
    return `Since you left ${mins || 1}m ago`;
  }, [alert?.exitTimestamp]);

  // Intraday High/Low range calculation
  const dayHigh = Number(alert?.metrics?.dayHigh) || Math.max(current, baseline);
  const dayLow = Number(alert?.metrics?.dayLow) || Math.min(current, baseline);
  const markerPercent =
    dayHigh > dayLow
      ? Math.max(0, Math.min(100, ((current - dayLow) / (dayHigh - dayLow)) * 100))
      : 50;

  // Session-bounded simulated sparkline polyline points
  const sparklinePoints = useMemo(() => {
    const pts: { x: number; y: number; isSession: boolean }[] = [];
    const totalSteps = 24;
    const baseP = (baseline || 100000) / 100;
    const currP = (current || baseP) / 100;
    const minP = Math.min(baseP, currP) * 0.995;
    const maxP = Math.max(baseP, currP) * 1.005;
    const range = maxP - minP || 1;

    for (let i = 0; i <= totalSteps; i++) {
      const isSession = i >= 8;
      const interpolated =
        baseP + (currP - baseP) * (i < 8 ? 0.1 * (i / 8) : 0.1 + 0.9 * ((i - 8) / (totalSteps - 8)));
      const noise = (Math.sin(i * 1.4) + Math.cos(i * 0.8)) * (range * 0.08);
      const priceVal = Math.max(minP, Math.min(maxP, interpolated + (i === totalSteps ? 0 : noise)));

      const x = (i / totalSteps) * 260 + 10;
      const y = 50 - ((priceVal - minP) / range) * 40;
      pts.push({ x, y, isSession });
    }
    return pts;
  }, [baseline, current]);

  const preExitPath = useMemo(() => {
    const prePts = sparklinePoints.filter((_, i) => i <= 8);
    return prePts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [sparklinePoints]);

  const sessionPath = useMemo(() => {
    const sessPts = sparklinePoints.filter((_, i) => i >= 8);
    return sessPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }, [sparklinePoints]);

  const lastPoint = sparklinePoints[sparklinePoints.length - 1];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(4px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.18s ease-out',
      }}
      onClick={onCollapse}
    >
      {/* Modal Card Container */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E8E8E8',
          borderRadius: '12px',
          maxWidth: '580px',
          width: '92%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          color: '#44475B',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header with Close 'X' */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.35rem', fontWeight: 700, color: '#121212', letterSpacing: '-0.02em' }}>
              {symbol}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: '4px',
                backgroundColor: `${color}14`,
                color: color,
                border: `1px solid ${color}35`,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
          </div>

          <button
            type="button"
            onClick={onCollapse}
            title="Close modal"
            style={{
              background: 'transparent',
              border: '1px solid #E8E8E8',
              borderRadius: '6px',
              color: '#7C7E8C',
              cursor: 'pointer',
              padding: '6px 10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease, color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F5F5F5';
              e.currentTarget.style.color = '#121212';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#7C7E8C';
            }}
          >
            ✕
          </button>
        </div>

        {/* ── SECTION 1: Session Delta & Price Anchor ─────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            backgroundColor: '#F9F9F9',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid #E8E8E8',
          }}
        >
          {/* Price progression & Absence text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#121212', letterSpacing: '-0.01em' }}>
                ₹{(baseline / 100).toFixed(2)} → ₹{(current / 100).toFixed(2)}
              </span>
              <span
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: isPositive ? '#00D09C' : '#EB5B3C',
                }}
              >
                ({isPositive ? `+${deltaPercent}` : deltaPercent}%)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 500,
                  color: '#7C7E8C',
                  background: 'none',
                  padding: 0,
                }}
              >
                {absenceText}
              </span>
            </div>
          </div>

          {/* Intraday Mini Progress Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#7C7E8C', fontWeight: 500 }}>
              <span>Low: ₹{(dayLow / 100).toFixed(2)}</span>
              <span>High: ₹{(dayHigh / 100).toFixed(2)}</span>
            </div>
            <div
              style={{
                position: 'relative',
                height: '4px',
                backgroundColor: '#E8E8E8',
                borderRadius: '2px',
                width: '100%',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${markerPercent}%`,
                  backgroundColor: isPositive ? 'rgba(0, 208, 156, 0.35)' : 'rgba(235, 91, 60, 0.35)',
                  borderRadius: '2px',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '-4px',
                  left: `${markerPercent}%`,
                  transform: 'translateX(-50%)',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: isPositive ? '#00D09C' : '#EB5B3C',
                  border: '2px solid #FFFFFF',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                }}
                title={`Current: ₹${(current / 100).toFixed(2)}`}
              />
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Anomaly Breakdown / Candlestick Chart View ─────── */}
        {showChart ? (
          <CandlestickView alert={alert} height={250} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Quantitative Trigger Badges (Clean transparent pills, subtle border) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#121212',
                  backgroundColor: '#FFFFFF',
                  padding: '5px 11px',
                  borderRadius: '6px',
                  border: '1px solid #E8E8E8',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C7E8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <span>
                  <strong style={{ fontWeight: 600 }}>{volMultiplier}x</strong> <span style={{ color: '#7C7E8C' }}>higher than 30m avg volume</span>
                </span>
              </span>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: '#121212',
                  backgroundColor: '#FFFFFF',
                  padding: '5px 11px',
                  borderRadius: '6px',
                  border: '1px solid #E8E8E8',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7C7E8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span>
                  <strong style={{ fontWeight: 600 }}>{Math.abs(Number(zScore) || parseFloat(deltaPercent) || 0)}σ</strong> <span style={{ color: '#7C7E8C' }}>deviation from expected curve</span>
                </span>
              </span>
            </div>

            {/* Session-Bounded Sparkline Graph */}
            <div
              style={{
                backgroundColor: '#F9F9F9',
                borderRadius: '8px',
                padding: '14px 16px',
                border: '1px solid #E8E8E8',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#7C7E8C' }}>
                <span>Historical baseline (pre-exit)</span>
                <span style={{ fontWeight: 600, color: isPositive ? '#00D09C' : '#EB5B3C' }}>● Offline session delta</span>
              </div>
              <svg viewBox="0 0 280 60" style={{ width: '100%', height: '58px', overflow: 'visible' }}>
                {/* Pre-exit dashed grey path */}
                <path d={preExitPath} fill="none" stroke="#B0B4C0" strokeWidth="1.8" strokeDasharray="3 3" />
                {/* Session highlighted colored path */}
                <path d={sessionPath} fill="none" stroke={isPositive ? '#00D09C' : '#EB5B3C'} strokeWidth="2" />
                {/* Anomaly Marker on current price point */}
                {lastPoint && (
                  <>
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill={isPositive ? '#00D09C' : '#EB5B3C'} opacity="0.3" />
                    <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={isPositive ? '#00D09C' : '#EB5B3C'} stroke="#FFFFFF" strokeWidth="1.5" />
                  </>
                )}
              </svg>
            </div>

            {/* Catalyst / Filings Context */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: '#F9F9F9',
                border: '1px solid #E8E8E8',
                fontSize: '0.82rem',
                color: '#44475B',
                lineHeight: 1.5,
              }}
            >
              {alert?.summary ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C7E8C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <div>
                    <strong style={{ color: '#121212', fontWeight: 600 }}>AI Catalyst:</strong> {alert.summary}
                  </div>
                </div>
              ) : alert?.isSummaryLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div className="skeleton-shimmer" style={{ height: '12px', width: '85%', backgroundColor: '#E8E8E8' }} />
                  <div className="skeleton-shimmer" style={{ height: '12px', width: '60%', backgroundColor: '#E8E8E8' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span style={{ color: '#7C7E8C' }}>
                    No media catalyst detected.{' '}
                    <a
                      href={alert?.filingUrl || `https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol=${symbol}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#00D09C', fontWeight: 600, textDecoration: 'none' }}
                    >
                      View Exchange Corporate Filings ↗
                    </a>
                  </span>
                  {onRetrySummary && (
                    <button
                      type="button"
                      onClick={() => onRetrySummary(symbol)}
                      title="Retry AI summary"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#7C7E8C',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#00D09C')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#7C7E8C')}
                    >
                      ⟳
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SECTION 3: Immediate Action & Alert Management ──────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            paddingTop: '14px',
            borderTop: '1px solid #E8E8E8',
          }}
        >
          {/* Trade CTAs & Technical Chart Link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.alert(`Initiating BUY order for ${symbol}`)}
              style={{
                backgroundColor: '#00D09C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Buy
            </button>

            <button
              type="button"
              onClick={() => window.alert(`Initiating SELL order for ${symbol}`)}
              style={{
                backgroundColor: '#EB5B3C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Sell
            </button>

            <button
              type="button"
              onClick={() => setShowChart((prev) => !prev)}
              style={{
                backgroundColor: showChart ? '#F5F5F5' : 'transparent',
                color: showChart ? '#00D09C' : '#44475B',
                border: showChart ? '1px solid #00D09C' : '1px solid #E8E8E8',
                borderRadius: '6px',
                padding: '7px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!showChart) {
                  e.currentTarget.style.backgroundColor = '#F5F5F5';
                  e.currentTarget.style.borderColor = '#D0D0D0';
                }
              }}
              onMouseLeave={(e) => {
                if (!showChart) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.borderColor = '#E8E8E8';
                }
              }}
            >
              {showChart ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  Summary
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Chart
                </>
              )}
            </button>
          </div>

          {/* Acknowledge / Dismiss Button (Dismisses Alert & Closes Modal) */}
          <div>
            <button
              type="button"
              onClick={() => {
                onDismiss(symbol);
                onCollapse();
              }}
              title="Acknowledge and dismiss from Zone 1"
              style={{
                backgroundColor: 'transparent',
                color: '#7C7E8C',
                border: '1px solid #E8E8E8',
                borderRadius: '6px',
                padding: '7px 16px',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(235, 91, 60, 0.08)';
                e.currentTarget.style.color = '#EB5B3C';
                e.currentTarget.style.borderColor = '#EB5B3C';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#7C7E8C';
                e.currentTarget.style.borderColor = '#E8E8E8';
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Acknowledge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
