"""
Hydration Service.
Constructs lightweight optimistic hydration payloads using positional tuples.
"""
import time
from typing import Dict, Any, List
from .tick_broadcaster import broadcaster
from .anomaly_engine import get_anomaly_engine
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
        ["RELIANCE", 420, 1, {"vol_multiplier": 3.4, "z_score": 3.8, "day_high": 295000, "day_low": 289000}, "https://..."]
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

    from ..utils.redis_keys import tick_latest
    import json

    for sym in symbols:
        sym_upper = str(sym).upper()
        raw_last = last_seen_prices.get(sym_upper) or last_seen_prices.get(sym)
        if not raw_last or raw_last <= 0:
            continue

        last_price = int(round(float(raw_last)))

        # 1. Quickly query Redis cache for current live price
        current_price = None
        try:
            cached = redis_client.get(tick_latest(sym_upper))
            if cached:
                cached_data = json.loads(cached)
                current_price = int(round(float(cached_data.get("p") or cached_data.get("ltp") or 0)))
        except Exception:
            pass

        # 2. Fall back to broadcaster's active in-memory price if Redis cache miss
        if not current_price or current_price <= 0:
            current_price = broadcaster.get_latest_price(sym_upper)

        current_price = int(round(float(current_price)))
        delta_bps = int(round(((current_price - last_price) / last_price) * 10000))

        # Check if magnitude warrants an alert card on re-entry
        trigger_code = 0
        if delta_bps >= 250:
            trigger_code = 3  # Volatility breakout
        elif delta_bps <= -250:
            trigger_code = 2  # Price plunge
        elif abs(delta_bps) >= 100:
            trigger_code = 1  # Volume / Price shift
        elif abs(delta_bps) >= 50:
            trigger_code = 1

        if trigger_code > 0:
            engine = get_anomaly_engine(sym_upper)
            metrics = {
                "vol_multiplier": 2.4,
                "z_score": round(delta_bps / 100.0, 2),
                "day_high": max(current_price, last_price, engine.day_high or current_price),
                "day_low": min(current_price, last_price, engine.day_low if engine.day_low != float('inf') else current_price),
                "baseline_price": last_price,
                "current_price": current_price,
            }
            filing_url = f"https://www.nseindia.com/companies-listing/corporate-filings-announcements?symbol={sym_upper}"
            alerts.append([sym_upper, delta_bps, trigger_code, metrics, filing_url])

    # Sort alerts by absolute delta descending (top volatile first)
    alerts.sort(key=lambda x: abs(x[1]), reverse=True)

    return {
        "ts": int(last_seen_ts) if last_seen_ts else int(time.time()),
        "mode": fallback_mode,
        "alerts": alerts[:5],  # top 5 volatile alerts
    }
