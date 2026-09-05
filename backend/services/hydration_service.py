"""
Hydration Service.
Constructs lightweight optimistic hydration payloads using positional tuples.
"""
import time
from typing import Dict, Any, List
from .tick_broadcaster import broadcaster
from ..extensions import redis_client
from ..utils.redis_keys import FALLBACK_MODE_KEY


def build_hydration_payload(
    user_id: str,
    last_seen_ts: int,
    last_seen_prices: Dict[str, int],
    symbols: List[str]
) -> Dict[str, Any]:
    """
    Builds the positional tuple hydration payload for session initialization.
    Format:
    {
      "ts": 1725453000,
      "mode": "live" | "fallback",
      "alerts": [
        ["RELIANCE", 420, 1],
        ["HDFCBANK", -180, 2]
      ]
    }
    """
    # Check fallback mode
    fallback_mode = "live"
    try:
        if redis_client.get(FALLBACK_MODE_KEY):
            fallback_mode = "fallback"
    except Exception:
        pass

    alerts: List[List[Any]] = []

    for sym in symbols:
        last_price = last_seen_prices.get(sym)
        if not last_price or last_price <= 0:
            continue

        current_price = broadcaster.get_latest_price(sym)
        delta_bps = int(round(((current_price - last_price) / last_price) * 10000))

        # Check if magnitude warrants an alert card on re-entry (e.g. > 150 bps or < -150 bps)
        trigger_code = 0
        if delta_bps >= 250:
            trigger_code = 3  # Volatility breakout
        elif delta_bps <= -250:
            trigger_code = 2  # Price plunge
        elif abs(delta_bps) >= 150:
            trigger_code = 1  # Volume / Price shift

        if trigger_code > 0:
            alerts.append([sym, delta_bps, trigger_code])

    # Sort alerts by absolute delta descending (top volatile first)
    alerts.sort(key=lambda x: abs(x[1]), reverse=True)

    return {
        "ts": last_seen_ts or int(time.time()),
        "mode": fallback_mode,
        "alerts": alerts[:5],  # top 5 volatile alerts
    }
