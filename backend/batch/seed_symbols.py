"""
Seed script for populating stock_symbols catalog.
Can be executed directly:
    python -m backend.batch.seed_symbols
"""
import sys
import os

# Sample top liquid Indian stocks (NIFTY large, mid, small cap) with 52w high/low in paise
SEED_STOCKS = [
    {"symbol": "RELIANCE", "company_name": "Reliance Industries Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 302400, "week_52_low": 222000},
    {"symbol": "TCS", "company_name": "Tata Consultancy Services Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 459000, "week_52_low": 331000},
    {"symbol": "HDFCBANK", "company_name": "HDFC Bank Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 179400, "week_52_low": 136300},
    {"symbol": "INFY", "company_name": "Infosys Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 195000, "week_52_low": 135800},
    {"symbol": "ICICIBANK", "company_name": "ICICI Bank Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 130000, "week_52_low": 91000},
    {"symbol": "BHARTIARTL", "company_name": "Bharti Airtel Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 160000, "week_52_low": 85000},
    {"symbol": "ITC", "company_name": "ITC Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 52000, "week_52_low": 39900},
    {"symbol": "SBIN", "company_name": "State Bank of India", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 91200, "week_52_low": 55500},
    {"symbol": "LT", "company_name": "Larsen & Toubro Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 390000, "week_52_low": 285000},
    {"symbol": "HINDUNILVR", "company_name": "Hindustan Unilever Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 303400, "week_52_low": 217000},
    {"symbol": "TATAMOTORS", "company_name": "Tata Motors Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 117900, "week_52_low": 59300},
    {"symbol": "KOTAKBANK", "company_name": "Kotak Mahindra Bank Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 193000, "week_52_low": 154000},
    {"symbol": "AXISBANK", "company_name": "Axis Bank Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 133900, "week_52_low": 93400},
    {"symbol": "SUNPHARMA", "company_name": "Sun Pharmaceutical Industries", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 196000, "week_52_low": 109000},
    {"symbol": "TITAN", "company_name": "Titan Company Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 388600, "week_52_low": 298000},
    {"symbol": "ASIANPAINT", "company_name": "Asian Paints Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 342200, "week_52_low": 268500},
    {"symbol": "BAJFINANCE", "company_name": "Bajaj Finance Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 819000, "week_52_low": 635500},
    {"symbol": "MARUTI", "company_name": "Maruti Suzuki India Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 1368000, "week_52_low": 925000},
    {"symbol": "NTPC", "company_name": "NTPC Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 42500, "week_52_low": 23000},
    {"symbol": "ONGC", "company_name": "Oil & Natural Gas Corporation", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 34400, "week_52_low": 18000},
    {"symbol": "POWERGRID", "company_name": "Power Grid Corp of India", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 36600, "week_52_low": 19500},
    {"symbol": "TATASTEEL", "company_name": "Tata Steel Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 18400, "week_52_low": 11400},
    {"symbol": "COALINDIA", "company_name": "Coal India Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 54300, "week_52_low": 27500},
    {"symbol": "ADANIENT", "company_name": "Adani Enterprises Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 374300, "week_52_low": 214200},
    {"symbol": "WIPRO", "company_name": "Wipro Ltd", "exchange": "NSE", "asset_class": "large_cap", "week_52_high": 56400, "week_52_low": 37500},
    {"symbol": "ZOMATO", "company_name": "Zomato Ltd", "exchange": "NSE", "asset_class": "mid_cap", "week_52_high": 29800, "week_52_low": 9000},
    {"symbol": "JIOFIN", "company_name": "Jio Financial Services Ltd", "exchange": "NSE", "asset_class": "mid_cap", "week_52_high": 39400, "week_52_low": 20400},
    {"symbol": "PAYTM", "company_name": "One97 Communications Ltd", "exchange": "NSE", "asset_class": "mid_cap", "week_52_high": 95000, "week_52_low": 31000},
    {"symbol": "POLICYBZR", "company_name": "PB Fintech Ltd", "exchange": "NSE", "asset_class": "mid_cap", "week_52_high": 195000, "week_52_low": 68000},
    {"symbol": "SUZLON", "company_name": "Suzlon Energy Ltd", "exchange": "NSE", "asset_class": "small_cap", "week_52_high": 8600, "week_52_low": 2300},
    {"symbol": "IDEA", "company_name": "Vodafone Idea Ltd", "exchange": "NSE", "asset_class": "small_cap", "week_52_high": 1900, "week_52_low": 750},
]


def seed_stock_symbols(app=None):
    from ..extensions import db
    from ..models.stock_symbols import StockSymbol

    if app is None:
        from ..app import create_app
        app = create_app()

    with app.app_context():
        db.create_all()
        created_count = 0
        updated_count = 0

        for item in SEED_STOCKS:
            existing = db.session.get(StockSymbol, item["symbol"])
            if not existing:
                symbol_obj = StockSymbol(
                    symbol=item["symbol"],
                    company_name=item["company_name"],
                    exchange=item["exchange"],
                    asset_class=item["asset_class"],
                    week_52_high=item["week_52_high"],
                    week_52_low=item["week_52_low"],
                )
                db.session.add(symbol_obj)
                created_count += 1
            else:
                existing.company_name = item["company_name"]
                existing.exchange = item["exchange"]
                existing.asset_class = item["asset_class"]
                existing.week_52_high = item["week_52_high"]
                existing.week_52_low = item["week_52_low"]
                updated_count += 1

        db.session.commit()
        print(f"Seed complete: {created_count} created, {updated_count} updated.")


if __name__ == "__main__":
    seed_stock_symbols()
