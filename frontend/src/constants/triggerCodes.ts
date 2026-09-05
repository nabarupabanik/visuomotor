/**
 * Trigger Code constants — bundled at build time, never fetched remotely.
 *
 * Bundling ensures these are available in memory the millisecond the
 * application executes, eliminating any network waterfall on session init.
 */

export const TRIGGER_CODES = {
  NONE: 0,
  VOLUME_SPIKE: 1,
  PRICE_PLUNGE: 2,
  VOLATILITY_BREAKOUT: 3,
  WEEK_52_TOUCH: 4,
  NEWS_CATALYST: 5,
} as const;

export type TriggerCode = (typeof TRIGGER_CODES)[keyof typeof TRIGGER_CODES];

export const TRIGGER_LABELS: Record<TriggerCode, string> = {
  [TRIGGER_CODES.NONE]: 'No Change',
  [TRIGGER_CODES.VOLUME_SPIKE]: 'Volume Spike',
  [TRIGGER_CODES.PRICE_PLUNGE]: 'Price Plunge',
  [TRIGGER_CODES.VOLATILITY_BREAKOUT]: 'Volatility Breakout',
  [TRIGGER_CODES.WEEK_52_TOUCH]: '52-Week High/Low',
  [TRIGGER_CODES.NEWS_CATALYST]: 'News Catalyst',
};

/** HSL-based colors — harmonious palette, not generic red/green */
export const TRIGGER_COLORS: Record<TriggerCode, string> = {
  [TRIGGER_CODES.NONE]: 'transparent',
  [TRIGGER_CODES.VOLUME_SPIKE]: 'hsl(38, 95%, 58%)',    // amber
  [TRIGGER_CODES.PRICE_PLUNGE]: 'hsl(4, 86%, 58%)',     // crimson
  [TRIGGER_CODES.VOLATILITY_BREAKOUT]: 'hsl(270, 72%, 65%)', // violet
  [TRIGGER_CODES.WEEK_52_TOUCH]: 'hsl(217, 89%, 61%)',  // electric blue
  [TRIGGER_CODES.NEWS_CATALYST]: 'hsl(152, 68%, 46%)',  // emerald
};

export const TRIGGER_ICONS: Record<TriggerCode, string> = {
  [TRIGGER_CODES.NONE]: '',
  [TRIGGER_CODES.VOLUME_SPIKE]: '⚡',
  [TRIGGER_CODES.PRICE_PLUNGE]: '↘',
  [TRIGGER_CODES.VOLATILITY_BREAKOUT]: '〜',
  [TRIGGER_CODES.WEEK_52_TOUCH]: '★',
  [TRIGGER_CODES.NEWS_CATALYST]: '📰',
};
