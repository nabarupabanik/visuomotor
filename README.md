# Groww Smart Watchlist

> **A triage-driven market interface that answers one question: *"What meaningfully changed for ME since I last checked?"***

[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-1.5-F7931E?style=for-the-badge&logo=scikitlearn&logoColor=white)](https://scikit-learn.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Zustand](https://img.shields.io/badge/Zustand-4.5-443E38?style=for-the-badge&logo=react&logoColor=white)](https://zustand-demo.pmnd.rs/)
[![Live Frontend](https://img.shields.io/badge/Live_App-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://visuomotor-henna.vercel.app/)
[![Live Backend](https://img.shields.io/badge/Live_API-Railway-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://visuomotor-production.up.railway.app/)

---

## 1. The Problem: The Flaw of Traditional Watchlists

### Storytelling via Persona: Meet Naba

**Naba** is a retail growth investor with 35 stocks on her radar. At 11:30 AM on a Tuesday, she locks her laptop and steps away for a 2-hour product strategy meeting. 

At 1:30 PM, she reopens her trading app. Her watchlist shows:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TRADITIONAL BROKER WATCHLIST (Anchored to Yesterday 3:30 PM Close)          │
│                                                                             │
│ TATA MOTORS       ₹982.50      ▲ +4.5%                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

At first glance, Naba breathes easy. Her holding appears to be having a solid green trading day.

### The Hidden Trap: `T-1 Close` Blindspot

What the static `+4.5%` label hides from Naba:
1. **The Morning Runaway:** Tata Motors opened with aggressive demand and surged **+10.0%** by 11:15 AM.
2. **The Offline Plunge:** At 12:45 PM—while Naba was in her meeting—a regulatory inquiry leaked, triggering an intraday **5.5% flash sell-off**.
3. **The Silent Loss:** Since Naba stepped away at 11:30 AM, her position suffered a steep loss, yet the green `+4.5%` tag treated her as if she had been watching since yesterday afternoon.

```
 Price (₹)
   │                           ▲ Peak (+10.0% at 11:15 AM)
   │                          / \
   │                         /   \  ◄── Naba exits at 11:30 AM (Baseline: ₹1,034)
   │                        /     \
   │                       /       \──────┐
   │                      /               ▼ Current Price: ₹982.50 (+4.5% vs T-1)
   │  T-1 Close: ₹940.00 /                  BUT: -5.0% since Naba checked!
───┴────────────────────┴───────────────────────────────────────────────────────► Time
                        09:15 AM          11:30 AM         01:30 PM
```

### The Pain Points
- **Hidden Intraday Volatility:** T-1 closing prices measure market state over a 24-hour cycle, ignoring personal user absence.
- **Cognitive Exhaustion:** Mentally calculating where each of 50+ stocks stood when you last checked is impossible during rapid intraday moves.
- **Action Paralysis:** Investors miss critical rebalancing or stop-loss windows because their watchlist displays false-positive serenity.

---

## 2. Core MVPs: The Solution

The **Groww Smart Watchlist** transitions market monitoring from passive tabular data to an active **triage intelligence system**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ GROWW SMART WATCHLIST (Personalized Triage Interface)                        │
│                                                                             │
│ TATAMOTORS   ₹982.50   1D: +4.5%   ▼ -5.0% since exit   💼 25 qty   [Placard]│
│ ↳ AI Catalyst: "Regulatory probe on EV subsidy claimed at 12:45 PM"         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Personalized Session Baseline
- Stores microsecond-precision `last_seen_at` checkpoint anchors in a lightweight session vault upon user disconnect or window blur.
- Automatically calculates:
  $$\Delta P_{\text{offline}} = P_{\text{current}} - P_{\text{last\_seen}}$$
  $$\text{Delta BPS} = \left(\frac{P_{\text{current}} - P_{\text{last\_seen}}}{P_{\text{last\_seen}}}\right) \times 10{,}000$$
- Displays real-time rupee ($\Delta ₹$) and basis point ($\Delta \text{bps}$) shifts explicitly labeled **"since you left"**.

### 2. Dual-Layer Anomaly Engine
- **Layer 1 (Time-of-Day Z-Score):** Evaluates price velocity and volume against intraday historical distributions partitioned into 15-minute time buckets.
- **Layer 2 (Isolation Forest):** High-dimensional anomaly isolation scoring across volume acceleration, spread expansion, and volatility skew to filter out false-alarm noise.

### 3. Urgency-Ranked Triage Carousel
- Ranks watchlist anomalies into actionable urgency tiers:
  - 🔴 **CRITICAL:** High z-score price plunge or breakout exceeding 3.0σ with volume surge.
  - 🟡 **ELEVATED:** Volume spikes >2.5x the 30-minute historical moving average or 52-week envelope test.
  - 🟢 **STABLE:** Normal random-walk variance within expected bounds.
- Renders urgent tickers as interactive **Meaningful Changes** placards above the watchlist fold.

### 4. 1-Sentence AI Context
- When an anomaly triggers, an automated background pipeline pulls exchange corporate disclosures (NSE/BSE filings) and financial news published *strictly within the user's offline window*.
- Generates a concise, verifiable **1-sentence AI catalyst summary** (e.g., *"Q3 operating margins contracted 180bps in surprise noon filing"*), eliminating the need to browse external news feeds.

### 5. Visual Exit-Delta Charting
- Integrated 5-minute candlestick charts powered by `lightweight-charts`.
- Overlays a distinct horizontal **Session Exit Baseline** marker against live tick candles, giving immediate visual intuition of price trajectory relative to the user's departure.

### 6. Contextual Portfolio Exposure
- Injects real demat exposure tags (e.g., `<Briefcase /> 25 qty`) directly adjacent to ticker rows.
- Prioritizes stocks where the investor has actual capital at risk, preventing triage blindness on high-weight portfolio positions.

---

## 3. Engineering & Architecture: The "Why"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM TOPOLOGY                                │
│                                                                             │
│   ┌───────────────────┐               ┌──────────────────────────────────┐  │
│   │   Market Stream   │               │           Flask Engine           │  │
│   │   Tick Simulator  │ ─── ticks ──► │  • Time-of-Day Normalization     │  │
│   │   (50 NSE Tickers)│               │  • Dual-Layer Anomaly Detector   │  │
│   └───────────────────┘               │  • AI Catalyst Pipeline (Gemini) │  │
│                                       └────────────────┬─────────────────┘  │
│                                                        │                    │
│                                                  SSE Stream (/stream)       │
│                                                        │                    │
│                                                        ▼                    │
│                                       ┌──────────────────────────────────┐  │
│                                       │         React 18 Frontend        │  │
│                                       │  • Zustand In-Memory State       │  │
│                                       │  • lightweight-charts .update()  │  │
│                                       │  • Exit Snapshot Vault           │  │
│                                       └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Time-of-Day Z-Scores + Isolation Forest?
Standard volatility metrics (like static standard deviation) fail in equity markets due to the intraday **"U-shaped volatility smile"**:
- **9:15 AM - 10:00 AM:** Naturally high variance, wider spreads, institutional auction rebalancing. A 1.2% swing is standard noise.
- **01:00 PM - 02:00 PM:** European market open, midday consolidation. A 1.2% swing on 4x volume is an extreme structural anomaly.

> [!IMPORTANT]
> A static threshold produces high false-positive rates at the open and misses real breakdowns at midday. Our Time-of-Day normalization anchors variance to historical 15-minute time buckets, and the Isolation Forest confirms multi-feature anomalies before alarming the user.

### Why Server-Sent Events (SSE) over WebSockets?
| Dimension | WebSockets | Server-Sent Events (SSE) | Why We Chose SSE |
| :--- | :--- | :--- | :--- |
| **Communication** | Full-Duplex (Bidirectional) | Simplex (Server-to-Client) | Market tick distribution is strictly unidirectional broadcast |
| **Protocol** | Custom WS protocol over TCP | Standard HTTP/1.1 or HTTP/2 | Seamless pass-through across corporate firewalls & proxies |
| **Reconnection** | Requires custom client backoff logic | Native browser auto-reconnect with `Last-Event-ID` | Built-in resilience with automatic buffer replay |
| **Resource Footprint** | Heavy persistent state per connection | Extremely lightweight, stateless HTTP streaming | Scalable to 100k+ concurrent Groww retail sessions |

### Why `lightweight-charts` `.update()` instead of `.setData()`?
Calling `.setData()` destroys and recreates the canvas point buffer on every tick, causing:
1. Significant garbage collection overhead on rapid 50ms tick streams.
2. A jarring visual "left-to-right sweep" redraw animation that makes intraday tracking unusable.

By contrast, TradingView's `.update()` performs an in-place mutation of the active candle:
```typescript
// O(1) in-place candle mutation — 60 FPS buttery smooth stream
candleSeriesRef.current.update({
  time: currentCandleTime,
  open: activeCandle.open,
  high: Math.max(activeCandle.high, tickPrice),
  low: Math.min(activeCandle.low, tickPrice),
  close: tickPrice,
});
```

### Why In-Memory JWTs + Zustand Client Snapshots?
- **Security:** Tokens stored in `localStorage` or insecure cookies are vulnerable to XSS extraction. Storing JWTs in Zustand memory with an automated refresh cycle ensures zero client-side token leakage.
- **Zero Cross-Account Bleed:** The exit checkpoint is scoped with a user-isolated namespace (`wl_exit_snapshot_${userId}`). Switching accounts instantly flushes previous user state, preventing stale baseline leaks in multi-user browser environments.

---

## 4. Future Implementation: Smart Groups

Modern watchlists are flat lists that treat index giants, speculative microcaps, and defensive dividend stocks identically. Our next milestone introduces **Intelligent Watchlist Groups**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SMART GROUPS PHILOSOPHY                            │
│                                                                             │
│   ORGANIZE        DETECT           PRIORITIZE           EXPLAIN             │
│  ───────────   ─────────────   ──────────────────   ───────────────         │
│  Sector /      Intraday        Group-level risk     Synthesized             │
│  Thematic      Cross-Asset     ordering based on    catalyst                │
│  clustering    Correlation     capital exposure     narrative               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Group-Level Intelligence
Instead of alerting on individual tickers in isolation, the Smart Group Engine evaluates systemic cluster movements:
- *"3 of 6 EV & Battery stocks moved down >3% simultaneously in the last 40 minutes."*
- Correlates commodity shifts (e.g., Lithium import tariffs) across the entire cluster.

### The "Nothing Changed" Tranquil State
Active traders suffer from notification fatigue and anxiety when constantly monitoring markets. 
- When a user inspects a group that experienced zero statistical anomalies during their offline window, the UI renders a prominent, calming confirmation:
  > **🌿 Nothing Changed in Banking**  
  > All 8 stocks traded within normal historical bands (±0.4%) while you were away. No filings or catalysts detected.
- Reduces cognitive load and prevents impulsive over-trading.

---

## 5. Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Bundler:** Vite 5
- **State Management:** Zustand 4 (Micro-stores for zero-re-render updates)
- **Charting Engine:** TradingView Lightweight Charts 5
- **Iconography:** Lucide React (monochromatic enterprise SVGs)
- **Styling:** Groww Light Design System + Tailwind CSS utilities

### Backend
- **Runtime:** Python 3.12
- **Web Framework:** Flask 3.0 with Flask-CORS
- **Machine Learning:** Scikit-Learn 1.5 (Isolation Forest, StandardScaler)
- **Data & Math:** NumPy & Pandas
- **AI Synthesis:** Google Gemini 1.5 Flash / LangChain
- **Event Streaming:** Server-Sent Events (SSE) with `text/event-stream`

---

## 6. Local Setup & Quickstart

### Prerequisites
- Node.js 18+ and npm 9+
- Python 3.10+ (Python 3.12 recommended)
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/nabarupabanik/visuomotor.git
cd visuomotor
```

### 2. Backend Setup
```bash
# Create and activate Python virtual environment
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend streaming server (Port 5000)
python run.py
```

### 3. Frontend Setup
```bash
# Open a new terminal and navigate to frontend
cd frontend

# Install dependencies
npm install

# Start Vite development server (Port 3000)
npm run dev
```

### 4. Open the Application
Navigate to `http://localhost:3000` in your browser.
- **Seeded Demo Account:**
  - **Email:** `demo@groww.in`
  - **Password:** `groww123`
- Or click **"Sign Up"** to create a custom watchlist session.

---

## 7. Quality Assurance & Verification

```bash
# Type-check and build production bundle
cd frontend
npm run build

# Run TypeScript validation directly
npm run typecheck
```

---

<div align="center">
  <sub>Built with precision for the <strong>Groww Engineering Challenge 2026</strong>. Designed to scale to millions of retail investors.</sub>
</div>
