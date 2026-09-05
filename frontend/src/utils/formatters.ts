/**
 * Numerical and currency formatting utilities.
 * Handles integer paise representations and basis-point conversions.
 */

/**
 * Format paise (integer) to Indian Rupee string (e.g. 248500 -> "₹2,485.00")
 */
export function formatPaise(paise: number | undefined | null): string {
  if (paise === undefined || paise === null || isNaN(paise)) return '₹0.00';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Format basis points into signed percentage string (e.g. 420 -> "+4.20%", -180 -> "-1.80%")
 */
export function formatBps(bps: number | undefined | null): string {
  if (bps === undefined || bps === null || isNaN(bps)) return '0.00%';
  const percent = bps / 100;
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}

/**
 * Convert basis points to raw percentage number
 */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/**
 * Format Unix epoch (seconds or milliseconds) to readable time (e.g. "09:15:22 AM")
 */
export function formatEpoch(ts: number | undefined | null): string {
  if (!ts) return '--:--:--';
  const epochMs = ts < 1e11 ? ts * 1000 : ts;
  const date = new Date(epochMs);
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Format human-readable relative time (e.g. "5m ago", "2h ago")
 */
export function formatRelativeTime(ts: number | undefined | null): string {
  if (!ts) return '';
  const epochMs = ts < 1e11 ? ts * 1000 : ts;
  const diffSec = Math.floor((Date.now() - epochMs) / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Format large volumes with Indian numbering / standard suffixes (e.g., 1.8M, 45.2K)
 */
export function formatVolume(volume: number | undefined | null): string {
  if (!volume || isNaN(volume)) return '0';
  if (volume >= 10_000_000) return `${(volume / 10_000_000).toFixed(2)} Cr`;
  if (volume >= 100_000) return `${(volume / 100_000).toFixed(2)} L`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)} K`;
  return volume.toLocaleString('en-IN');
}
