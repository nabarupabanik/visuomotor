"""
Session Checkpoint Service.
Handles cross-device checkpoint persistence and 'latest timestamp wins' conflict resolution.
"""
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
    """
    checkpoint = db.session.get(SessionCheckpoint, user_id)
    if not checkpoint:
        checkpoint = SessionCheckpoint(
            user_id=user_id,
            last_seen_ts=last_seen_ts,
            price_snapshot=price_snapshot,
            device_hint=device_hint,
        )
        db.session.add(checkpoint)
    else:
        # Latest timestamp wins
        if last_seen_ts >= checkpoint.last_seen_ts:
            checkpoint.last_seen_ts = last_seen_ts
            checkpoint.price_snapshot = price_snapshot
            checkpoint.device_hint = device_hint

    db.session.commit()
    return checkpoint


def get_checkpoint(user_id: str) -> Optional[SessionCheckpoint]:
    return db.session.get(SessionCheckpoint, user_id)
