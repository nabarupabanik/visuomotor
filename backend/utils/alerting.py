"""
PagerDuty Alerting Integration.
Sends P0/WARNING alerts to PagerDuty Events API v2 on batch pipeline failures.
"""
import time
import requests
from typing import Dict, Any, Optional
from ..config import get_config

config = get_config()


def fire_pagerduty_alert(
    severity: str,
    title: str,
    details: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Fires an alert to PagerDuty Events API v2.
    severity: 'critical' | 'error' | 'warning' | 'info'
    """
    routing_key = config.PAGERDUTY_ROUTING_KEY
    payload = {
        "routing_key": routing_key,
        "event_action": "trigger",
        "payload": {
            "summary": title,
            "severity": severity,
            "source": "visuomotor-batch-pipeline",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "custom_details": details or {},
        },
    }

    if routing_key and routing_key != "REPLACE_WITH_PAGERDUTY_ROUTING_KEY":
        try:
            res = requests.post(
                "https://events.pagerduty.com/v2/enqueue",
                json=payload,
                timeout=4.0,
            )
            return {"status": "dispatched", "response_code": res.status_code}
        except Exception as e:
            print(f"[ALERTING] Failed to deliver PagerDuty alert: {e}")
            return {"status": "failed", "error": str(e)}

    print(f"[ALERTING (Simulated)] Severity: {severity} | Title: {title} | Details: {details}")
    return {"status": "simulated", "payload": payload}
