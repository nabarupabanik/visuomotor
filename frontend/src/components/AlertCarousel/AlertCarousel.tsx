import React from 'react';
import { useMarketStore } from '../../store/marketStore';
import { AlertCard } from './AlertCard';

interface AlertCarouselProps {
  onRetrySummary?: (symbol: string) => void;
}

export const AlertCarousel: React.FC<AlertCarouselProps> = ({ onRetrySummary }) => {
  const alerts = useMarketStore((state) => state.alerts);

  if (!alerts || alerts.length === 0) {
    return null;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.95rem' }}>⚡</span>
          <h3 style={{
            fontSize: '0.88rem',
            fontWeight: 700,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}>
            Meaningful Changes
          </h3>
          <span
            style={{
              padding: '1px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(235, 91, 60, 0.10)',
              color: '#EB5B3C',
              fontSize: '0.7rem',
              fontWeight: 700,
              border: '1px solid rgba(235, 91, 60, 0.18)',
            }}
          >
            {alerts.length} Active
          </span>
        </div>
        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
          Scroll horizontally →
        </div>
      </div>

      {/* Horizontal Swipeable Container with CSS scroll-snap */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          paddingBottom: '6px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {alerts.map((alert) => (
          <AlertCard
            key={alert.symbol}
            alert={alert}
            onRetrySummary={onRetrySummary}
          />
        ))}
      </div>
    </section>
  );
};
