"""
StockSymbol catalog database model.
Contains exchange catalog, market cap tier, and 52-week ranges.
"""
from ..extensions import db


class StockSymbol(db.Model):
    __tablename__ = "stock_symbols"

    symbol = db.Column(db.String(32), primary_key=True)
    company_name = db.Column(db.String(255), nullable=False)
    exchange = db.Column(db.String(16), nullable=False, default="NSE")
    asset_class = db.Column(db.String(32), nullable=False, default="large_cap")  # large_cap, mid_cap, small_cap
    week_52_high = db.Column(db.Integer, nullable=True)  # in paise
    week_52_low = db.Column(db.Integer, nullable=True)   # in paise

    def to_dict(self) -> dict:
        from ..services.tick_broadcaster import broadcaster
        return {
            "symbol": self.symbol,
            "company_name": self.company_name,
            "exchange": self.exchange,
            "asset_class": self.asset_class,
            "week_52_high": self.week_52_high,
            "week_52_low": self.week_52_low,
            "previous_close": broadcaster.get_previous_close(self.symbol),
        }
