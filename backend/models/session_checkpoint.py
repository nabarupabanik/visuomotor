"""
Session Checkpoint database model.
One checkpoint row per user, upserted on session exit / disconnect.
"""
from datetime import datetime, timezone
from ..extensions import db


class SessionCheckpoint(db.Model):
    __tablename__ = "session_checkpoints"

    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    last_seen_ts = db.Column(db.BigInteger, nullable=False)
    price_snapshot = db.Column(db.JSON, nullable=False, default=dict)
    device_hint = db.Column(db.String(64), nullable=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "last_seen_ts": self.last_seen_ts,
            "price_snapshot": self.price_snapshot or {},
            "device_hint": self.device_hint,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
