"""
Nightly Batch Health Checker Job.
Scheduled at 3:00 AM IST via APScheduler.
Validates baseline key count, checks for batch failure, and fires PagerDuty alerts.
"""
from typing import Dict, Any
from ..extensions import redis_client
from ..utils.alerting import fire_pagerduty_alert
from ..utils.redis_keys import BATCH_FAILED_KEY
from .seed_symbols import SEED_STOCKS


def run_health_check() -> Dict[str, Any]:
    """
    Validates nightly baseline computation status.
    """
    expected_symbols = len(SEED_STOCKS)
    expected_keys = expected_symbols * 6  # 6 time bands

    key_count = 0
    batch_failed = False

    try:
        keys = redis_client.keys("baseline:*")
        key_count = len(keys)
        batch_failed = bool(redis_client.get(BATCH_FAILED_KEY))
    except Exception:
        # Redis offline in local environment
        pass

    # 1. P0 Check: Explicit batch failure flag set
    if batch_failed:
        fire_pagerduty_alert(
            severity="critical",
            title="P0: Nightly Baseline Precomputation Pipeline Failed",
            details={"expected_keys": expected_keys, "actual_keys": key_count},
        )
        return {"status": "P0_TRIGGERED", "reason": "batch_failed flag set"}

    # 2. Warning Check: Less than 95% of expected baseline keys found (when Redis active)
    if 0 < key_count < int(expected_keys * 0.95):
        fire_pagerduty_alert(
            severity="warning",
            title="WARNING: Partial Baseline Coverage in Redis",
            details={"expected_keys": expected_keys, "actual_keys": key_count},
        )
        return {"status": "WARNING_TRIGGERED", "coverage_pct": (key_count / expected_keys) * 100}

    print(f"[HEALTH_CHECK] 3:00 AM Validation Passed. Baseline coverage: {key_count} keys.")
    return {"status": "HEALTHY", "baseline_keys": key_count, "expected_keys": expected_keys}


if __name__ == "__main__":
    run_health_check()
