# visuomotor
Smart Market Watchlist

Project Overview & Core Features
Groww CODE 2026 challenges engineers to build an attention-driven Smart Market Watchlist. Instead of using static 24-hour market close baselines, this application calculates stateful, personalized deltas to surface what has meaningfully changed since the user last checked.

Anomaly Detection Engine: Utilizes time-windowed Z-scores and an Isolation Forest model to evaluate rapid volatility and volume spikes against historical time-of-day baselines.

Contextual AI Catalyst: An on-demand pipeline that retrieves exchange filings strictly within the user's offline window, streaming a single-sentence explanation below the ticker.

Layered Triage UI: Features a swipeable alert carousel for high-urgency changes and a dynamic vertical list sorted by intraday volatility, supplemented by micro-sparklines.

Architecture & Tech Stack
The system follows a Decoupled Client-Compute architecture, where the backend acts as a stateless broadcast mechanism and the React client computes personalized deltas on the edge.

Frontend: React with Zustand for high-frequency state throttling, bypassing standard React re-rendering bottlenecks.

Backend: Python and Flask for REST and streaming endpoints.

Database & Cache: PostgreSQL for durable profiles; Redis for fast, ephemeral caching of live market data and precomputed statistical baselines.

AI & ML Orchestration: LangChain and LangGraph for the generation pipeline, alongside Scikit-learn for anomaly isolation.

API Design & Data Schema
Event Streaming: Universal market ticks are delivered via Server-Sent Events (SSE) for automatic reconnection and low-latency unidirectional flow.

Optimistic Hydration Payload: The initial API handshake returns a hyper-optimized JSON payload using positional tuples (e.g., ["RELIANCE", 420, 1]) to eliminate redundant keys and allow instant UI rendering.

Cross-Device Sync: Mobile and desktop sessions are synchronized by passing a last-seen timestamp to the backend, with conflict resolution favoring the latest interaction.

Resiliency & Edge Cases
The 9:15 AM Thundering Herd: Opening market volatility thresholds are precomputed overnight and cached in Redis. If the batch fails, the system safely falls back to retained cache or static heuristics to prevent database stampedes.

Circuit Breakers: If the third-party news API rate-limits the backend, the system fails silently on the frontend, presenting a subtle manual retry icon to conserve network resources.
