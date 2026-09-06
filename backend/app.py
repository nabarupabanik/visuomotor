"""
Flask application factory.

Creates and configures the Flask app, registers all blueprints,
and initialises all extensions.
"""
from flask import Flask
from flask_cors import CORS

from .config import get_config
from .extensions import db, redis_client, jwt, scheduler


def create_app(config_name: str = "development") -> Flask:
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    # ── Extensions ────────────────────────────────────────────────────────────
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    db.init_app(app)
    jwt.init_app(app)

    # Ensure all tables exist and stock symbols are seeded
    with app.app_context():
        from .models import User, Watchlist, WatchlistItem, SessionCheckpoint, StockSymbol
        try:
            db.create_all()
            from .batch.seed_symbols import seed_stock_symbols
            seed_stock_symbols(app)
            # If full master catalog not yet populated, run sync
            if StockSymbol.query.count() < 100 and not app.config.get("TESTING"):
                from .batch.sync_master_instruments import sync_nse_master_instruments
                sync_nse_master_instruments(app)

            # Auto-seed demo user trader@groww.in if not existing
            demo_user = User.query.filter_by(email="trader@groww.in").first()
            if not demo_user:
                demo_user = User(email="trader@groww.in")
                demo_user.set_password("securepassword123")
                db.session.add(demo_user)
                db.session.flush()

                demo_wl = Watchlist(user_id=demo_user.id, name="My Watchlist")
                db.session.add(demo_wl)
                db.session.flush()

                default_symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "ITC", "SBIN", "BHARTIARTL"]
                for idx, sym in enumerate(default_symbols):
                    item = WatchlistItem(
                        watchlist_id=demo_wl.id,
                        symbol=sym,
                        display_order=idx,
                    )
                    db.session.add(item)
                db.session.commit()
                app.logger.info("Demo user trader@groww.in seeded successfully.")
        except Exception as err:
            db.session.rollback()
            app.logger.warning(f"Database auto-creation note: {err}")

    if not scheduler.running and not app.config.get("TESTING"):
        try:
            from .batch.sync_master_instruments import sync_nse_master_instruments
            scheduler.add_job(
                id="sync_nse_master",
                func=sync_nse_master_instruments,
                trigger="cron",
                hour=8,
                minute=0,
                replace_existing=True,
            )
            scheduler.start()
        except Exception:
            pass

    # Redis is initialised directly from config URL (not an extension)
    app.extensions["redis"] = redis_client

    # ── Blueprints ────────────────────────────────────────────────────────────
    from .api.auth import auth_bp
    from .api.watchlist import watchlist_bp
    from .api.session import session_bp
    from .api.stream import stream_bp
    from .api.summary import summary_bp

    app.register_blueprint(auth_bp,      url_prefix="/api/auth")
    app.register_blueprint(watchlist_bp, url_prefix="/api/watchlists")
    app.register_blueprint(session_bp,   url_prefix="/api/session")
    app.register_blueprint(stream_bp,    url_prefix="/api")
    app.register_blueprint(summary_bp,   url_prefix="/api/summary")

    # ── Frontend SPA static serving (from frontend/dist) ──────────────────────
    import os
    from flask import send_from_directory
    dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        # Do not intercept API routes
        if path.startswith("api"):
            return {"error": "Endpoint not found"}, 404
        if path and os.path.exists(os.path.join(dist_dir, path)):
            return send_from_directory(dist_dir, path)
        if os.path.exists(os.path.join(dist_dir, "index.html")):
            return send_from_directory(dist_dir, "index.html")
        return {
            "message": "Groww Smart Watchlist API is running.",
            "instructions": "Run 'cd frontend && npm run dev' to start the frontend Vite server.",
        }, 200

    # ── Shell context ─────────────────────────────────────────────────────────
    @app.shell_context_processor
    def make_shell_context():
        from .models.user import User
        from .models.watchlist import Watchlist, WatchlistItem
        from .models.session_checkpoint import SessionCheckpoint
        return {"db": db, "User": User, "Watchlist": Watchlist,
                "WatchlistItem": WatchlistItem,
                "SessionCheckpoint": SessionCheckpoint}

    return app
