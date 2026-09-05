"""
Automated ETL Pipeline: NSE Master Instrument Ingestion.
Downloads the official NSE equity master list (EQUITY_L.csv),
bulk-upserts into PostgreSQL 'stock_symbols', enables pg_trgm,
and creates GIN indexes for sub-millisecond typo-tolerant fuzzy search.
"""
import io
import csv
import urllib.request
import logging
from sqlalchemy import text
from ..extensions import db
from ..models.stock_symbols import StockSymbol
from .seed_symbols import SEED_STOCKS

logger = logging.getLogger(__name__)

NSE_EQUITY_URL = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"


def sync_nse_master_instruments(app=None) -> int:
    """
    Downloads and ingests all listed equities from NSE India into PostgreSQL.
    Creates pg_trgm extension and GIN indexes if using PostgreSQL.
    """
    if app is None:
        from ..app import create_app
        app = create_app()

    with app.app_context():
        db.create_all()

        # 1. Fetch CSV from NSE with User-Agent
        logger.info("Fetching official NSE master instrument list from %s...", NSE_EQUITY_URL)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        }
        req = urllib.request.Request(NSE_EQUITY_URL, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                csv_text = response.read().decode("utf-8-sig")
        except Exception as e:
            logger.error("Failed to download NSE instrument list: %s. Relying on seeded symbols.", e)
            return 0

        # Build lookup for curated seed stocks with specific 52w ranges
        seed_lookup = {item["symbol"]: item for item in SEED_STOCKS}

        # 2. Parse CSV
        reader = csv.DictReader(io.StringIO(csv_text))
        records = []
        for row in reader:
            # Clean keys and values of surrounding whitespace
            clean_row = {k.strip(): v.strip() for k, v in row.items() if k}
            symbol = clean_row.get("SYMBOL", "").strip().upper()
            company_name = clean_row.get("NAME OF COMPANY", "").strip()
            series = clean_row.get("SERIES", "").strip()

            # Filter for equity series (EQ = Regular Equity, BE = Book Entry/Trade for Trade)
            if not symbol or not company_name or series not in ("EQ", "BE", "BZ"):
                continue

            if symbol in seed_lookup:
                s_item = seed_lookup[symbol]
                records.append({
                    "symbol": symbol,
                    "company_name": s_item.get("company_name", company_name),
                    "exchange": "NSE",
                    "asset_class": s_item.get("asset_class", "large_cap"),
                    "week_52_high": s_item.get("week_52_high", 300000),
                    "week_52_low": s_item.get("week_52_low", 150000),
                })
            else:
                # Default baseline values for newly imported equities
                records.append({
                    "symbol": symbol,
                    "company_name": company_name,
                    "exchange": "NSE",
                    "asset_class": "mid_cap",
                    "week_52_high": 250000,
                    "week_52_low": 120000,
                })

        logger.info("Parsed %d active equity symbols from NSE.", len(records))

        # 3. Bulk Upsert into PostgreSQL
        dialect_name = db.engine.dialect.name
        if dialect_name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert

            # Upsert in batches of 500
            batch_size = 500
            total_upserted = 0
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                stmt = insert(StockSymbol).values(batch)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["symbol"],
                    set_={
                        "company_name": stmt.excluded.company_name,
                        "exchange": stmt.excluded.exchange,
                        "asset_class": stmt.excluded.asset_class,
                    }
                )
                db.session.execute(stmt)
                total_upserted += len(batch)
            db.session.commit()
            logger.info("Successfully upserted %d instruments into PostgreSQL.", total_upserted)

            # 4. Enable pg_trgm & create GIN trigram indexes
            try:
                db.session.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm;"))
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_stock_symbols_symbol_trgm 
                    ON stock_symbols USING gin (symbol gin_trgm_ops);
                """))
                db.session.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_stock_symbols_name_trgm 
                    ON stock_symbols USING gin (company_name gin_trgm_ops);
                """))
                db.session.commit()
                logger.info("PostgreSQL pg_trgm extension and GIN indexes created successfully.")
            except Exception as e:
                db.session.rollback()
                logger.warning("Could not create pg_trgm indexes: %s", e)

            return total_upserted
        else:
            # Fallback for SQLite / other dialects
            count = 0
            for rec in records:
                existing = db.session.get(StockSymbol, rec["symbol"])
                if not existing:
                    db.session.add(StockSymbol(**rec))
                    count += 1
            db.session.commit()
            return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    upserted = sync_nse_master_instruments()
    print(f"Master instrument sync finished. Total upserted: {upserted}")
