"""
Watchlist and WatchlistItem database models.
"""
import uuid
from datetime import datetime, timezone
from ..extensions import db


class Watchlist(db.Model):
    __tablename__ = "watchlists"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    items = db.relationship(
        "WatchlistItem",
        backref="watchlist",
        cascade="all, delete-orphan",
        lazy="joined",
        order_by="WatchlistItem.display_order",
    )

    def to_dict(self, include_items: bool = False) -> dict:
        data = {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "item_count": len(self.items) if self.items is not None else 0,
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class WatchlistItem(db.Model):
    __tablename__ = "watchlist_items"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    watchlist_id = db.Column(db.String(36), db.ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False, index=True)
    symbol = db.Column(db.String(32), nullable=False)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    added_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        db.UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_symbol"),
    )

    def to_dict(self) -> dict:
        from ..services.tick_broadcaster import broadcaster
        return {
            "id": self.id,
            "watchlist_id": self.watchlist_id,
            "symbol": self.symbol,
            "display_order": self.display_order,
            "added_at": self.added_at.isoformat() if self.added_at else None,
            "previous_close": broadcaster.get_previous_close(self.symbol),
        }
