"""
Centralised Redis key schema.

All Redis key patterns are defined here as functions to ensure
consistency and prevent key typos across the codebase.
"""


# ── Live Market Ticks ─────────────────────────────────────────────────────────

def tick_latest(symbol: str) -> str:
    """Latest tick for a symbol. TTL: 5 seconds."""
    return f"tick:{symbol}"


def tick_history(symbol: str) -> str:
    """Sorted set of historical ticks for sparklines. Key: ts score."""
    return f"ticks:history:{symbol}"


# ── SSE Pub/Sub ───────────────────────────────────────────────────────────────

TICKS_CHANNEL = "channel:ticks"
SUMMARY_CHANNEL = "channel:summary"


# ── Nightly ATR Baselines ──────────────────────────────────────────────────────

def baseline(symbol: str, hhmm_start: str, hhmm_end: str) -> str:
    """
    Precomputed ATR baseline for a symbol in a time band.
    TTL: 72 hours (stale-cache retention).

    Example: baseline('HDFCBANK', '0915', '0930')
    → 'baseline:HDFCBANK:0915_0930'
    """
    return f"baseline:{symbol}:{hhmm_start}_{hhmm_end}"


# ── AI Summary Cache ──────────────────────────────────────────────────────────

def summary_cache(symbol: str, epoch_start: int, epoch_end: int) -> str:
    """
    Generated AI summary keyed by symbol and rounded time window.
    TTL: 4 hours.

    Epochs should be rounded to the hour before passing in.
    Example: summary_cache('HDFCBANK', 1725451200, 1725454800)
    → 'summary:HDFCBANK_1725451200_1725454800'
    """
    return f"summary:{symbol}_{epoch_start}_{epoch_end}"


# ── Distributed Locks ─────────────────────────────────────────────────────────

def baseline_warm_lock(symbol: str) -> str:
    """
    Singleflight mutex lock key for baseline cache warming.
    Prevents cache stampede: only one worker triggers DB query.
    TTL: 30 seconds.
    """
    return f"lock:baseline_warm:{symbol}"


# ── System State Flags ────────────────────────────────────────────────────────

FALLBACK_MODE_KEY = "fallback_mode"
"""
Set to 'tier2' or 'tier3' when the nightly batch fails.
Cleared by the health-checker once baselines are restored.
"""

BATCH_FAILED_KEY = "batch_failed"
"""
Set to '1' when the 2 AM batch job fails to complete before 3 AM.
Triggers PagerDuty P0 alert.
"""
