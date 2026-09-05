"""
Tiered Fallback Service.
Implements the 3-Tier Fallback Hierarchy on Cache Miss or Nightly Batch Outage:
  Tier 1: Stale Redis baseline key (72h TTL) -> Use yesterday's baselines
  Tier 2: In-memory static heuristics by market cap tier (large_cap 1.5%, mid_cap 2.5%, small_cap 3.5%)
  Tier 3: Disable ML scoring entirely -> Raw deterministic thresholds + 'mode': 'fallback'
"""
import json
from typing import Dict, Any, Optional
from ..extensions import redis_client
from ..utils.redis_keys import baseline, FALLBACK_MODE_KEY

STATIC_HEURISTICS: Dict[str, float] = {
    "large_cap": 0.015,  # 1.5% expected opening move
    "mid_cap": 0.025,    # 2.5% expected opening move
    "small_cap": 0.035,  # 3.5% expected opening move
}


_in_memory_fallback: bool = False


class FallbackService:
    @staticmethod
    def get_symbol_baseline(
        symbol: str,
        time_band: str = "0915_0930",
        asset_class: str = "large_cap"
    ) -> Dict[str, Any]:
        global _in_memory_fallback
        """
        Executes tiered fallback resolution.
        """
        # ── Tier 1: Check Redis cache (fresh or stale up to 72h) ─────────────
        start, end = time_band.split("_") if "_" in time_band else ("0915", "0930")
        key = baseline(symbol, start, end)
        try:
            val = redis_client.get(key)
            if val:
                data = json.loads(val)
                data["tier"] = 1
                return data
        except Exception:
            pass

        # ── Check if Tier 3 fallback mode is engaged ─────────────────────────
        is_tier3 = _in_memory_fallback
        try:
            flag = redis_client.get(FALLBACK_MODE_KEY)
            if flag:
                is_tier3 = True
        except Exception:
            pass

        if is_tier3:
            return {
                "symbol": symbol,
                "time_band": time_band,
                "expected_atr_pct": 0.030,
                "tier": 3,
                "note": "Deterministic fallback mode (Tier 3)",
            }

        # ── Tier 2: In-memory static heuristics ──────────────────────────────
        expected_move = STATIC_HEURISTICS.get(asset_class, 0.020)
        return {
            "symbol": symbol,
            "time_band": time_band,
            "expected_atr_pct": expected_move,
            "tier": 2,
            "note": "Static heuristic applied (Tier 2)",
        }

    @staticmethod
    def set_system_fallback_mode(active: bool = True) -> None:
        global _in_memory_fallback
        _in_memory_fallback = active
        try:
            if active:
                redis_client.set(FALLBACK_MODE_KEY, "tier3")
            else:
                redis_client.delete(FALLBACK_MODE_KEY)
        except Exception:
            pass
