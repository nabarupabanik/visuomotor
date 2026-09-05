# Groww CODE 2026 — Smart Market Watchlist
## Comprehensive Implementation & Architecture Report: Technical Audit, System Internals, and Root-Cause Issue Analysis

---

## 1. Executive Summary & Architectural Overview

The **Smart Market Watchlist** was designed and engineered for the **CODE by Groww 2026 Challenge**. Its objective is to solve the retail investor's information overload problem: instead of presenting a wall of static numbers, the system isolates and highlights what has **meaningfully changed** for each individual user since they last left the platform.

### 1.1 Core Architectural Philosophy: Decoupled Client-Compute
In an enterprise retail brokerage serving over 10 million concurrent active users, calculating personalized price deltas on the backend is computationally unviable. If 10 million users log off at different timestamps ($T_{\text{exit}, i}$) and with different personalized entry prices ($P_{\text{lastSeen}, i}$), pushing individual real-time deltas from a centralized server would require $O(N \times M)$ calculations per tick (where $N$ is users and $M$ is watchlist size), resulting in severe CPU exhaustion and network saturation.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DECOUPLED CLIENT-COMPUTE ARCHITECTURE                  │
└─────────────────────────────────────────────────────────────────────────────┘

       BACKEND (Centralized & Scalable)              FRONTEND (Edge Compute)
  ┌────────────────────────────────────────┐       ┌─────────────────────────────┐
  │ High-Frequency Broadcast Engine        │       │ User Session Checkpoint     │
  │ • SSE Stream: /api/stream/prices       │       │ • lastSeenPrice (paise)     │
  │ • Raw Ticks: {s, p, v, sc, tc}         │──────▶│ • lastSeenTs (epoch)        │
  │ • Zero User-Specific Delta Computation │  SSE  └──────────────┬──────────────┘
  └────────────────────────────────────────┘                      │
                                                                  ▼
  ┌────────────────────────────────────────┐       ┌─────────────────────────────┐
  │ Optimized State Hydration              │       │ Client Compute Engine       │
  │ • GET /api/session/hydrate             │──────▶│ • Personalized Delta (bps)  │
  │ • Positional tuples: [sym, delta, tc]  │       │ • Volatility Triage Sorting │
  └────────────────────────────────────────┘       │ • Micro-Sparkline Buffering │
                                                   └─────────────────────────────┘
```

**Architectural Principles:**
1. **Raw Server Broadcasts:** The backend streams raw, un-personalized ticks via Server-Sent Events (SSE).
2. **Edge Delta Computation:** Each client browser computes its own personalized session delta ($\Delta_{\text{bps}} = \frac{\text{LTP} - P_{\text{lastSeen}}}{P_{\text{lastSeen}}} \times 10,000$) in memory via React Zustand hooks.
3. **Zero-Overhead Exit Checkpointing:** As the user closes the browser tab or switches apps, `navigator.sendBeacon` flushes their exit price snapshot to the backend with zero latency impact.
4. **Hybrid Anomaly Classification:** Statistical Z-Score (Layer 1) paired with Scikit-learn Isolation Forest (Layer 2) runs on rolling tick windows to score price and volume anomalies.
5. **Contextual AI Intelligence:** Marketaux financial news API queries are strictly time-windowed to the user's offline period ($[T_{\text{lastSeen}}, T_{\text{now}}]$) and synthesized by an LLM into a single-sentence actionable catalyst.

---

## 2. Exhaustive Breakdown of Implemented Features

### 2.1 Authentication & User Session Management
- **Token Architecture:** Dual-token JSON Web Token (JWT) system using `flask-jwt-extended`.
  - **Access Token:** Short-lived (15 minutes), passed via `Authorization: Bearer <token>` header.
  - **Refresh Token:** Long-lived (30 days), stored in `localStorage` under `wl_refresh_token`.
- **Password Security:** Salted and hashed using `bcrypt` (12 rounds).
- **Auto-Seeding on Registration:** When a new user registers (`POST /api/auth/register`), the system automatically provisions:
  1. A default "Primary Watchlist".
  2. Auto-populated with top liquid Indian equities: `RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `ICICIBANK`, `TATAMOTORS`.
- **State Reconciliation:** On frontend app mount (`App.tsx`), `useSessionStore` verifies `/api/auth/me`. If valid, it hydrates user preferences; if invalid/expired, it automatically attempts refresh before wiping stale tokens to avoid deadlocks.

### 2.2 Watchlist & Catalog Management
- **Endpoints:**
  - `GET /api/watchlist`: Fetches all watchlists belonging to the authenticated user.
  - `POST /api/watchlist`: Creates a new named watchlist.
  - `POST /api/watchlist/<id>/items`: Adds a stock symbol with a continuous `display_order` index.
  - `DELETE /api/watchlist/<id>/items/<symbol>`: Deletes a stock symbol.
  - `POST /api/watchlist/<id>/reorder`: Updates manual sorting preferences.
  - `GET /api/watchlist/catalog?q=<query>`: Searches available stock symbols.
- **Frontend Management:**
  - `WatchlistSidebar.tsx`: Allows switching between watchlists, viewing symbol counts, and creating custom lists.
  - `AddSymbolSearch.tsx`: Real-time debounced (200ms) search input with dropdown results and instant "Added" status indicators.

### 2.3 Real-Time Streaming & Tick Generation
- **Stream Mechanism:** Server-Sent Events (SSE) via `GET /api/stream/prices` implemented in `backend/api/stream.py`.
- **Broadcast Cadence:** 2Hz heartbeat loop in `backend/services/tick_broadcaster.py`.
- **Tick Wire Protocol:** Compact single-letter JSON payload to minimize serialization overhead:
  ```json
  {
    "s": "RELIANCE",
    "p": 248750,
    "v": 3200,
    "sc": 0.42,
    "tc": 0,
    "sparklineTs": 1725488120
  }
  ```
  - `s`: Stock ticker symbol.
  - `p`: Last Traded Price (LTP) represented in **paise** (integers avoid floating-point rounding errors).
  - `v`: Intraday tick volume.
  - `sc`: Continuous anomaly score $[0.0, 1.0]$.
  - `tc`: Anomaly trigger code integer ($0$ = Normal, $1$ = Volume Spike, $2$ = Price Plunge, $3$ = Volatility Breakout).
  - `sparklineTs`: Epoch seconds timestamp for rendering client-side micro-sparklines.
- **Resilient Pub/Sub Pipeline:** Ticks are published to Redis channel `channel:ticks` with a 10-second cache TTL (`tick:latest:<symbol>`). If Redis is unavailable, an in-memory thread lock subscriber pattern seamlessly handles client fanout without dropping connections.

### 2.4 Hybrid Anomaly Detection Engine (Layer 1 + Layer 2)
Located in `backend/services/anomaly_engine.py`:
- **Windowing:** Rolling double-ended queue (`deque(maxlen=200)`) tracking `[price, volume]` per symbol.
- **Layer 1 (Z-Score):**
  - Evaluates standard deviations of price over the most recent 50 ticks:
    $$Z = \frac{P_{\text{tick}} - \mu_{50}}{\sigma_{50} + \epsilon}$$
- **Layer 2 (Isolation Forest):**
  - Scikit-learn `IsolationForest(n_estimators=50, contamination=0.05, random_state=42)`.
  - Incrementally refitted every 25 ticks to model non-linear price/volume joint distributions.
- **Combined Anomaly Metric:**
  $$\text{Score}_{\text{combined}} = \min\left(1.0, 0.6 \times Z_{\text{norm}} + 0.4 \times \text{Score}_{\text{iso}}\right)$$
- **The 9:15 AM Opening Auction Seasonality Rule:**
  - Indian equity markets exhibit extreme natural volatility between 9:15 AM and 9:45 AM IST during price discovery.
  - The engine dynamically widens the Z-score detection threshold from $4.5\sigma$ at 9:15 AM down to $3.0\sigma$ at 9:45 AM using linear decay:
    $$\text{Threshold}(t) = 4.5 - 1.5 \times \left(\frac{t - 9.25}{0.5}\right)$$
  - This prevents false alarms during opening price discovery.

### 2.5 Personalized Session Checkpointing & Rehydration
- **Tracking Page Exits:** In `frontend/src/utils/checkpoint.ts`, listeners for `beforeunload` and `visibilitychange` trigger `navigator.sendBeacon('/api/session/sync', payload)`.
  - Operates asynchronously in the browser background even after the tab is terminated.
  - Stores a key-value snapshot of all watchlist symbols and their exact exit price in paise.
- **Optimistic Rehydration:** On next login, `GET /api/session/hydrate` evaluates the user's stored baseline against current prices and returns ultra-compact positional tuples:
  ```json
  {
    "ts": 1725489000,
    "mode": "live",
    "alerts": [
      ["RELIANCE", 320, 3],
      ["HDFCBANK", -180, 2]
    ]
  }
  ```
  - `["RELIANCE", 320, 3]` denotes Symbol, Delta in basis points (+3.20%), and Trigger Code 3 (Breakout).

### 2.6 Financial News & Offline Time-Window Ingestion
- **Service:** `backend/ai/news_fetcher.py`.
- **Provider:** Marketaux Financial News API.
- **Exchange Formatting:** Tickers are dynamically formatted with Indian exchange suffixes (`RELIANCE` $\to$ `RELIANCE.NS`).
- **Strict Time-Window Filtering:**
  - Accepts `start_ts` (user's exact logout timestamp).
  - Converts to ISO 8601 `published_after` parameter.
  - Ensures the user is only presented with news published while they were away, eliminating stale news repetition.
- **Circuit Breaker Protection:** Wrapped with `pybreaker` (`fail_max=5`, `reset_timeout=300`). If Marketaux experiences downtime or rate limits (HTTP 429), the circuit trips immediately to prevent hanging worker threads.

### 2.7 AI Catalyst Summarization Node
- **Service:** `backend/ai/summarizer.py`.
- **Endpoint:** `GET /api/summary/stream?symbol=<sym>&delta_bps=<bps>`.
- **LLM Prompting:** Uses OpenAI `gpt-4o-mini` with a strict instruction:
  > *"In EXACTLY one concise, high-impact sentence, explain the primary market catalyst for {symbol} based on these headlines... State the fact directly."*
- **Token Streaming:** Streams tokens over SSE directly to the frontend modal for zero-latency user perception.
- **Resilient Fallback Mode:** When OpenAI API credits are exhausted (HTTP 429), the engine automatically parses Marketaux article titles, applies sentiment heuristics from `delta_bps`, and streams a synthetic catalyst summary without crashing.

### 2.8 Official Groww Dark Mode Design System
The frontend was completely re-skinned to match the official Groww retail interface:
- **Palette Tokens:**
  - App Background: Flat dark grey `#121212` (replacing previous navy blue).
  - Elevated Cards / Surfaces: `#1E1E1E`.
  - Positive Accent: Groww Signature Teal `#00D09C`.
  - Negative Accent: Groww Coral / Red `#EB5B3C`.
  - Subtle Borders: `rgba(255, 255, 255, 0.05)`.
- **Typography:** Google Font **Roboto** loaded with strict visual hierarchy.
  - Stock Price: Primary focal point (`1.1rem`, `font-weight: 700`).
  - Personalized Percentage: Directly beneath price (`font-weight: 500`).
- **Components:**
  - **Stock Avatars:** Clean white squircles (rounded squares) displaying high-contrast dark company tickers.
  - **Watchlist Rows:** Flat, borderless rows separated only by ultra-subtle dividers. Action buttons (`^`, `v`, `x`) replaced by a single trash icon appearing strictly on row hover.
  - **Micro-Sparklines:** SVG polylines rendered with clean 1.5px un-filled stroke lines (gradient fills removed).
  - **Filter Badges:** Minimalist 16px pill chips with 10% opacity backgrounds for "Volatility Triage" and "Custom Order".
  - **Header Avatar:** Replaced full email strings with a circular user profile badge showing the first initial (e.g., "N").

---

## 3. Comprehensive Issue & Discrepancy Log (The "What" and "Why")

This section details every known issue, design constraint, or functional difference between this implementation and the live Groww production app.

---

### Issue 1: Asian Paints (and 4,000+ Other Equities) Not Found in Search

#### What is the issue?
When a user types `"ASIANPAINTS"` (or `"Asian Paints"`, `"BAJAJ-AUTO"`, `"NESTLEIND"`, `"DIVISLAB"`, etc.) into the Add Stock search box, the interface displays:
> *"No matching tickers found"*

However, in the real Groww app, Asian Paints is instantly searchable and available to trade.

#### Why does it occur?
1. **Catalog Source Constraint:**
   - The search endpoint (`GET /api/watchlist/catalog?q=...` in `backend/api/watchlist.py`) does **not** query an external exchange API.
   - It performs a SQL `ILIKE` query against the local PostgreSQL `stock_symbols` table:
     ```python
     symbols = StockSymbol.query.filter(
         (StockSymbol.symbol.ilike(f"%{query}%")) |
         (StockSymbol.company_name.ilike(f"%{query}%"))
     ).limit(20).all()
     ```
2. **Static Seed Dataset:**
   - The `stock_symbols` table is populated on startup by `backend/batch/seed_symbols.py`.
   - The script contains a curated list (`SEED_STOCKS`) of **30 top liquid NIFTY stocks** (`RELIANCE`, `TCS`, `HDFCBANK`, `INFY`, `ICICIBANK`, `BHARTIARTL`, `ITC`, `SBIN`, `LT`, `HINDUNILVR`, `TATAMOTORS`, `KOTAKBANK`, `AXISBANK`, `SUNPHARMA`, `TITAN`, `BAJFINANCE`, `MARUTI`, `NTPC`, `ONGC`, `POWERGRID`, `TATASTEEL`, `COALINDIA`, `ADANIENT`, `WIPRO`, `ZOMATO`, `JIOFIN`, `PAYTM`, `POLICYBZR`, `SUZLON`, `IDEA`).
   - `ASIANPAINTS` was simply not included in the initial 30-stock seed dictionary.

#### How is this solved in production?
- In production, Groww downloads the daily **NSE/BSE Master Instrument CSV/JSON dump** (containing ~5,000+ listed equities, ETFs, and derivative contracts) every morning before market pre-open (8:00 AM IST) via an automated ETL cron job.
- These records are indexed in an Elasticsearch / OpenSearch cluster or PostgreSQL with trigram fuzzy indexing (`pg_trgm`) to enable instant search across all Indian listed equities.

---

### Issue 2: Market Ticks are Simulated Rather Than Streamed from Live NSE/BSE Multicast Feeds

#### What is the issue?
Prices for Reliance, TCS, etc., fluctuate continuously at 2Hz around the clock (including nights, weekends, and trading holidays). The prices do not match live television or financial portal quotes to the exact rupee.

#### Why does it occur?
1. **Regulatory & Licensing Barriers:**
   - The National Stock Exchange of India (NSE) and Bombay Stock Exchange (BSE) strictly regulate real-time market tick distribution under SEBI market data guidelines.
   - Redistributing live Level 1 or Level 2 market feeds requires commercial exchange data vendor licenses costing tens of thousands of dollars annually.
2. **Broker API Architecture:**
   - Retail trading APIs (Zerodha Kite Connect, Angel One SmartAPI, Upstox) require daily morning OAuth logins with time-based OTPs (TOTP) and enforce strict websocket connection caps.
3. **Engineering Challenge Intent:**
   - The CODE 2026 problem statement explicitly asks candidates to demonstrate **system architecture, decoupled client-compute, and edge delta algorithms**, rather than integrating a proprietary broker websocket feed.
   - Hence, `backend/services/tick_broadcaster.py` utilizes a realistic **Geometric Brownian Motion / Gaussian Random Walk** generator with realistic paise increments, drift, and simulated micro-anomalies.

---

### Issue 3: OpenAI API 429 Quota Exhaustion & Fallback Synthesis

#### What is the issue?
When clicking an alert card to view the AI Impact Summary, the modal occasionally generates a summary constructed from real Marketaux headlines and directional templates rather than pure OpenAI GPT output.

#### Why does it occur?
- The OpenAI API key configured in `.env` encountered the following response from OpenAI's servers:
  ```json
  {
    "error": {
      "message": "You exceeded your current quota, please check your plan and billing details.",
      "type": "insufficient_quota",
      "code": "credit_balance_exhausted"
    }
  }
  ```
- **Architectural Mitigation Implemented:**
  Instead of failing with a 500 error or leaving the user with an empty screen, `backend/ai/summarizer.py` implements a **fail-safe streaming synthesizer**:
  ```python
  first_title = _extract_title(headlines[0]) if headlines else f"Unusual volume activity reported in {symbol}."
  direction_word = "surged" if delta_bps >= 0 else "pulled back"
  full_sentence = f"{first_title.rstrip('.')} as shares {direction_word} on heavy intraday institutional turnover."
  ```
  This streams token-by-token at 40ms intervals, ensuring the UI remains responsive and informative even during API quota exhaustion.

---

### Issue 4: News Availability Gaps for Non-NIFTY Small Caps

#### What is the issue?
For some smaller or mid-cap stocks, opening the news modal shows a single volume accumulation headline or fallback notification rather than multiple recent press articles.

#### Why does it occur?
1. **Corporate Media Asymmetry:**
   - Giant conglomerates like Reliance or Tata Motors receive dozens of articles daily.
   - Smaller companies (e.g., Vodafone Idea or Suzlon) may go days without formal media coverage or corporate exchange filings.
2. **Strict Time-Window Filter:**
   - The news fetcher strictly filters news published **after** the user's logout timestamp (`published_after = start_ts`).
   - If a user was offline for only 2 hours, and no corporate release occurred during those 2 hours, Marketaux returns an empty array `[]`.
3. **Marketaux Free Tier Limitations:**
   - The Marketaux free plan limits calls to 100 requests per day and only indexes select Indian publications.

---

### Issue 5: PostgreSQL Database Initialization on Fresh Environments

#### What is the issue?
When initializing a clean PostgreSQL database (`visuomotor_db`) without running manual migrations, registration requests previously failed with:
> `sqlalchemy.exc.ProgrammingError: (psycopg2.errors.UndefinedTable) relation "users" does not exist`

#### Why does it occur?
- In SQLAlchemy, defining model classes (`class User(db.Model)`) registers metadata in Python memory but does **not** execute `CREATE TABLE` on the PostgreSQL server.
- Standard Flask applications expect manual execution of `flask db upgrade` via Flask-Migrate.

#### How was it permanently resolved?
- In `backend/app.py`, `db.create_all()` and `seed_stock_symbols(app)` were injected directly into the application factory `create_app()`:
  ```python
  with app.app_context():
      db.create_all()
      from .batch.seed_symbols import seed_stock_symbols
      seed_stock_symbols(app)
  ```
- Every time the application starts (WSGI, CLI, tests, or hot-reload), all missing tables and seed stocks are verified and created automatically.

---

### Issue 6: Stale JWT Refresh Tokens in Browser LocalStorage

#### What is the issue?
When testing across different databases (e.g., switching between SQLite and PostgreSQL), the browser was stuck in an infinite 401 Unauthorized redirect loop on `/api/auth/me`.

#### Why does it occur?
- The frontend stored a refresh token in `localStorage.getItem('wl_refresh_token')` generated by the old database.
- When querying the new PostgreSQL database, the user ID encoded in the token did not exist, causing PostgreSQL to return 401/404.
- Because the frontend attempted to refresh using the invalid token, it entered an unrecoverable refresh cycle.

#### How was it resolved?
- In `frontend/src/App.tsx`, an explicit cleanup handler was added: if `/api/auth/me` returns 401 or 404, `localStorage.removeItem('wl_refresh_token')` is executed immediately, resetting state to a clean login screen.

---

### Issue 7: Redis Service Availability on Windows

#### What is the issue?
Redis is not natively supported as a Windows binary without WSL2 or Docker. When running the Flask backend bare-metal on Windows without Docker, Redis connection attempts can cause slow socket timeouts.

#### Why does it occur?
- Python's `redis.Redis()` client by default attempts a blocking connection with a multi-second timeout.
- In batch scripts like `backend/batch/baseline_precomputer.py`, checking Redis in a loop could delay server startup by 20+ seconds.

#### How was it resolved?
- Aggressive 100ms socket timeouts were configured in `backend/extensions.py`:
  ```python
  redis_client = redis.Redis.from_url(
      redis_url,
      socket_connect_timeout=0.1,
      socket_timeout=0.1,
      decode_responses=True
  )
  ```
- In `tick_broadcaster.py`, all Redis operations are wrapped in `try/except Exception: pass`, falling back to in-memory subscriber lists with zero latency penalty.

---

### Issue 8: Sparkline Ring Buffer Reset on Browser Reload

#### What is the issue?
When the user refreshes the browser, the micro-sparkline charts initially show a flat line or single point, only expanding into a full trend line after 10–15 seconds of receiving live ticks.

#### Why does it occur?
- Sparklines are rendered client-side using a fixed-length memory ring buffer (`deque` of size 20) inside `useMarketStore.ts`.
- Ticks are not permanently saved to an intraday tick database (like TimescaleDB or ClickHouse).
- When the page is reloaded, the browser JavaScript memory space is destroyed and re-initialized.

#### How would this be solved in production?
- An enterprise production setup maintains an intraday tick store (e.g., ClickHouse or Redis TimeSeries).
- On initial page load, the frontend requests `GET /api/market/sparklines?symbols=RELIANCE,TCS` to fetch the last 30 minutes of historical 1-minute close prices, pre-populating the SVG charts instantly.

---

## 4. Architectural Summary & Verification Matrix

| Component | Current Implementation | Production Reality (Groww Enterprise) | Reason for Architectural Choice |
| :--- | :--- | :--- | :--- |
| **Stock Catalog** | 30 curated NIFTY stocks in PostgreSQL | 5,000+ NSE/BSE equities via Elasticsearch | Scoped demonstration of top liquid assets; zero external dependency. |
| **Tick Pipeline** | Simulated Geometric Brownian Motion (2Hz SSE) | Multicast binary UDP feed (NSE NOW/TAP) converted to WebSockets | Regulatory licensing (SEBI market data redistribution guidelines). |
| **Delta Calculation** | Decoupled Client-Compute via React Zustand | Decoupled Client-Compute via React Native / Web | Eliminates $O(N \times M)$ server compute bottleneck for 10M+ users. |
| **Session Tracking** | `navigator.sendBeacon` to `/api/session/sync` | Native App Background State / Beacon API | Non-blocking, zero-latency exit persistence. |
| **Anomaly Scoring** | Z-Score (L1) + Scikit-learn Isolation Forest (L2) | Flink / Spark Streaming ML pipelines | Lightweight, real-time Python implementation runnable on edge instances. |
| **Market News** | Marketaux API with timestamp filter | Bloomberg / Reuters / Cogencis API feeds | Granular intraday timestamp filtering support for Indian exchanges. |
| **AI Summaries** | OpenAI GPT-4o-mini + Resilient Synthesizer | Fine-tuned internal financial LLM | Graceful degradation prevents UI breakage when API quota is exhausted. |
| **UI Design System** | Groww Official Dark Mode (`#121212`, `#00D09C`) | Groww Web / Mobile Production Design System | Pixel-perfect alignment with retail user expectations. |

---

## 5. How to Add Missing Stocks (e.g. Asian Paints)

To make `ASIANPAINTS` (or any other stock) immediately searchable and streamable in this environment:

1. Open `backend/batch/seed_symbols.py`.
2. Add the stock to `SEED_STOCKS`:
   ```python
   {
       "symbol": "ASIANPAINTS",
       "company_name": "Asian Paints Ltd",
       "exchange": "NSE",
       "asset_class": "large_cap",
       "week_52_high": 342200,
       "week_52_low": 268500
   },
   ```
3. Open `backend/services/tick_broadcaster.py` and add its base price in paise:
   ```python
   BASE_PRICES = {
       ...
       "ASIANPAINTS": 289000,
   }
   ```
4. Restart the backend. The startup hook will auto-seed `ASIANPAINTS` into PostgreSQL, and it will immediately appear in search and begin streaming real-time ticks.
