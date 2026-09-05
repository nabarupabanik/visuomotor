"""
Session Checkpoint Service.
Handles cross-device checkpoint persistence and 'latest timestamp wins' conflict resolution.
"""
import time
from typing import Dict, Any, Optional
from ..extensions import db
from ..models.session_checkpoint import SessionCheckpoint


def sync_checkpoint(
    user_id: str,
    last_seen_ts: int,
    price_snapshot: Dict[str, int],
    device_hint: Optional[str] = None
) -> SessionCheckpoint:
    """
    Upsert session checkpoint using 'latest timestamp wins' conflict resolution.
    Strictly sanitizes all prices to integer paise.
    """
    clean_prices: Dict[str, int] = {}
    if isinstance(price_snapshot, dict):
        for k, v in price_snapshot.items():
            try:
                clean_prices[str(k).upper()] = int(round(float(v)))
            except (ValueError, TypeError):
                continue

    clean_ts = int(last_seen_ts) if last_seen_ts else int(time.time())

    checkpoint = db.session.get(SessionCheckpoint, user_id)
    if not checkpoint:
        checkpoint = SessionCheckpoint(
            user_id=user_id,
            last_seen_ts=clean_ts,
            price_snapshot=clean_prices,
            device_hint=device_hint,
        )
        db.session.add(checkpoint)
    else:
        # Latest timestamp wins
        if clean_ts >= checkpoint.last_seen_ts:
            checkpoint.last_seen_ts = clean_ts
            checkpoint.price_snapshot = clean_prices
            checkpoint.device_hint = device_hint

    db.session.commit()
    return checkpoint


def get_checkpoint(user_id: str) -> Optional[SessionCheckpoint]:
    return db.session.get(SessionCheckpoint, user_id)
