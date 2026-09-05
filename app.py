"""
Root entry point to launch the Flask backend.
Allows running `python app.py` directly from the workspace root.
"""
import sys
import os

# Ensure project root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from backend.app import create_app
from backend.extensions import db
from backend.batch.seed_symbols import seed_stock_symbols
from backend.services.tick_broadcaster import broadcaster

app = create_app("development")

if __name__ == "__main__":
    with app.app_context():
        # Auto-create tables and seed default stock symbols if not present
        db.create_all()
        try:
            seed_stock_symbols(app)
        except Exception as e:
            print(f"[INIT] Note on symbols seeding: {e}")

    # Start the live market tick broadcaster
    broadcaster.start()

    print("\n" + "=" * 60)
    print("🚀 Groww Smart Watchlist Backend running at: http://localhost:5000")
    print("📡 SSE Stream active at: http://localhost:5000/api/stream")
    print("=" * 60 + "\n")

    app.run(host="127.0.0.1", port=5000, debug=True, use_reloader=False)
