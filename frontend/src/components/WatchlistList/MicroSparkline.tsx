import React, { useMemo } from 'react';

interface MicroSparklineProps {
  data: Array<[number, number]>;
  width?: number;
  height?: number;
}

export const MicroSparkline: React.FC<MicroSparklineProps> = ({
  data,
  width = 96,
  height = 28,
}) => {
  const { points, strokeColor } = useMemo(() => {
    if (!data || data.length < 2) {
      return { points: '', strokeColor: '#616161' };
    }

    const prices = data.map((d) => d[1]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;

    const padding = 2;
    const effectiveHeight = height - padding * 2;
    const effectiveWidth = width;

    const coords = prices.map((price, idx) => {
      const x = (idx / (prices.length - 1)) * effectiveWidth;
      const normalizedY = (price - minPrice) / range;
      // Invert Y because SVG 0 is top
      const y = height - padding - normalizedY * effectiveHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const isUp = prices[prices.length - 1] >= prices[0];
    const color = isUp ? '#00D09C' : '#EB5B3C'; // Groww teal / coral

    return {
      points: coords.join(' '),
      strokeColor: color,
    };
  }, [data, width, height]);

  if (!points) {
    return <div style={{ width, height }} />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible', display: 'block' }}
    >
      {/* Clean, un-filled 1.5px solid stroke line (Groww style) */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
