# Project - TickerTrail

## Overview

**TickerTrail** is a full-stack web application that streams real-time cryptocurrency prices directly from TradingView using browser automation. Built with a Node.js backend and a Next.js frontend, it enables users to track multiple cryptocurrency pairs simultaneously with live price updates pushed to the browser the moment prices change on the exchange.

**GitHub:** https://github.com/BhargavaSharabha/TickerTrail
**Developer:** Bhargava Sharabha
**License:** Private

---

## Problem Statement

Publicly available cryptocurrency price APIs either require paid subscriptions, impose rate limits, or introduce significant latency through client-side polling. TickerTrail addresses this by automating a real browser session against TradingView — the same live data a trader watches on-screen — and streaming those prices in real time to any number of connected web clients.

Specific problems solved:

- No dependency on third-party paid APIs or rate-limited REST endpoints
- Push-based delivery via Server-Sent Events (SSE) eliminates polling delays on the client side
- A single shared Playwright `BrowserContext` serves all tracked tickers efficiently, avoiding the overhead of spawning one browser per ticker
- Server-side ticker validation prevents bad subscriptions from polluting the client's tracked list
- A free-text ticker input allows users to track any valid Binance/TradingView cryptocurrency symbol, not just a predefined list

---

## Technical Implementation

### Architecture

```
┌──────────────────┐         SSE (GET /events)          ┌──────────────────────┐
│   Next.js        │ ◄─────────────────────────────────  │   Node.js HTTP       │
│   Frontend       │                                      │   Server  :8080      │
│   :3000          │  ──── POST /subscribe ────────────► │                      │
│                  │  ──── POST /unsubscribe ──────────► │   PriceScraper       │
└──────────────────┘                                      │   (Playwright)       │
                                                          └──────────┬───────────┘
                                                                     │ Chromium (headed)
                                                                     │ One Page per Ticker
                                                                     ▼
                                                       https://tradingview.com/symbols/
                                                            {TICKER}/?exchange=BINANCE
```

**Frontend** — Next.js 14 (App Router), React 18, TypeScript. Opens a persistent `EventSource` connection to `GET /events` on mount to receive SSE price updates. Subscribe and unsubscribe actions are plain `fetch` `POST` calls.

**Backend** — Vanilla Node.js `http.createServer`, TypeScript executed directly with `tsx`. Three endpoints: `GET /events` (SSE stream), `POST /subscribe`, `POST /unsubscribe`. Manages a `Map` of active SSE clients and delegates all browser automation to the `PriceScraper` class.

**PriceScraper** — A singleton class that owns one shared Playwright `BrowserContext` backed by a headed Chromium instance. Each unique ticker symbol gets its own `Page` navigated to the TradingView URL. A `setInterval` running every 500 ms extracts the current price from the DOM and fires registered callbacks when the price value has changed since the last read.

**Protocol Buffer Schema** — A `crypto.proto` service definition is maintained in `proto/` and compiled via `buf`, providing a typed schema reference for the data model (`Ticker`, `PriceUpdate`, `SubscribeRequest`, etc.).

**Workspaces** — `pnpm` workspaces manage `backend` and `frontend` as two co-located packages under a single root, installable with one command (`pnpm install --recursive`).

---

### Key Features

#### 1. Real-Time Price Streaming (SSE)
- `GET /events` establishes a persistent HTTP connection; the browser's native `EventSource` API keeps it open
- The backend broadcasts to only the clients that have subscribed to a given ticker, keeping the SSE payload targeted
- Message payload: `{ ticker: string, price: string, timestamp: number }` serialised as JSON in the SSE `data` field
- Frontend auto-reconnects after a 5-second delay on any SSE error or disconnection

#### 2. Dynamic Ticker Subscription & Unsubscription
- Free-text input accepts any valid Binance cryptocurrency ticker (e.g., `BTCUSD`, `ETHUSD`, `SOLUSD`)
- Input is force-uppercased client-side; the backend also normalises to uppercase for consistency
- `POST /subscribe` triggers Playwright automation for the new ticker; the response is `{ success: true }` or `{ error: "..." }`
- `POST /unsubscribe` removes the ticker from all SSE client sets and, if no subscribers remain, closes the Playwright `Page` and clears the polling interval
- Tracked tickers are sorted alphabetically in the UI at all times
- Duplicate subscription is blocked client-side with an inline error message

#### 3. Server-Side Ticker Validation
- On subscription the backend loads `https://www.tradingview.com/symbols/{TICKER}/?exchange=BINANCE` in a Playwright page
- After a 3-second wait for the page to hydrate, the extractor attempts to read a numeric price from the DOM
- If no valid price is found the page is closed, the ticker is discarded, and HTTP 400 is returned with a descriptive error message
- This ensures only genuinely tradeable symbols with live data are accepted

#### 4. Multi-Strategy Price Extraction
- **Primary selector:** `span.js-symbol-last` — TradingView's well-known last-price element
- **Problem:** TradingView dynamically splits the numeric price across nested `<span>` children during real-time animation (growing/falling price indicators), meaning a simple `textContent` read on a child span returns only a fragment of the price
- **Solution:** The extractor reads `textContent` on the *parent* `.js-symbol-last` element, which always concatenates the full value, then strips commas and validates against `/^\d+(\.\d+)?$/`
- **Fallback selectors:** `div.tv-symbol-price-quote__value`, `span[data-symbol-last]`, `[class*="priceValue"]` — evaluated in sequence to handle TradingView layout variations across symbol types

#### 5. Shared Browser Resource Management
- A single `BrowserContext` is created at server startup and reused for all ticker pages
- User-agent is set to a realistic Chrome string; the `AutomationControlled` Blink feature flag is disabled to reduce bot-detection friction on TradingView
- On `SIGINT` the server clears all polling intervals, closes every open `Page`, closes the `BrowserContext`, and finally closes the `Browser` before exiting

#### 6. UI Design
- Dark glassmorphism aesthetic: deep navy/purple radial-gradient background with animated floating glow blobs
- Animated gradient on the page heading using `background-size: 200%` and a CSS keyframe `background-position` sweep
- Live/Disconnected status badge with a pulsing green/red dot indicator
- Per-ticker cards with `backdrop-filter: blur(10px)`, hover lift (`translateY(-4px)`) and purple glow border transition
- Each card shows the ticker symbol, current price in monospace font, a pulsing live dot, and a "Updated HH:MM:SS" timestamp
- Loading spinner (`border-top` rotation) shown during ticker subscription
- Inline error banner with slide-in animation for validation failures
- Responsive grid: `repeat(auto-fill, minmax(320px, 1fr))`

---

### Performance Design

| Consideration | Approach |
|---|---|
| Browser resource usage | Single `BrowserContext` shared across all ticker `Page` instances — not one browser per ticker |
| Network efficiency | SSE push model; backend writes only when `newPrice !== cachedPrice`, preventing redundant messages |
| DOM polling | 500 ms interval per ticker page — fast enough for near-real-time prices, light enough to avoid throttling |
| Lazy teardown | Playwright `Page` and its interval are destroyed immediately when the last subscriber for a ticker unsubscribes |
| Client reconnection | Exponential-style reconnect (fixed 5 s) on SSE failure, with full state restored from SSE messages after reconnect |

---

## Challenges & Solutions

| Challenge | Solution |
|---|---|
| TradingView splits the displayed price across nested `<span>` children during price-change animations (growing/falling), making child-element `.textContent` return only a price fragment | Read `textContent` on the outer `.js-symbol-last` parent, which always yields the complete numeric string regardless of its internal DOM structure |
| No API to validate whether a ticker symbol is real without attempting a full page load | Treat the Playwright page load itself as validation: navigate to the TradingView symbol URL, wait 3 seconds for DOM hydration, then check whether a parseable price exists — if not, reject the ticker |
| Initial implementation used a dropdown with a fixed list of tickers | Replaced with a free-text `<input>`, added client-side duplicate guard and uppercase normalisation, and made server-side validation the enforcement mechanism for invalid symbols |
| Playwright runs in headed (non-headless) mode, increasing bot-detection risk on TradingView | Disabled `AutomationControlled` Blink flag (`--disable-blink-features=AutomationControlled`) and set a realistic Windows/Chrome user-agent string on the `BrowserContext` |
| Both backend and frontend must start cleanly from a single script across Linux and Windows | Provided `run.sh` (bash, process group management with `trap cleanup SIGINT`) and `run.bat` (Windows batch, `start cmd /k` for parallel processes) |

---

## Setup & Running

**Prerequisites:** `node`, `pnpm`, and a desktop environment (Playwright runs in headed Chromium mode).

```bash
# 1. Install all workspace dependencies
pnpm install --recursive

# 2. Install Playwright's Chromium browser
cd backend && pnpm exec playwright install && cd ..

# 3. (Linux only) Install Playwright system-level dependencies
cd backend && sudo pnpm exec playwright install-deps && cd ..

# 4. Start both servers  — Linux / macOS
./run.sh

# 4. Start both servers — Windows
run.bat
```

- Backend runs on **http://localhost:8080**
- Frontend accessible at **http://localhost:3000**

The launch scripts handle dependency checks, Playwright installation, sequential server startup (backend first with a 5-second startup delay before the frontend), and graceful shutdown on `Ctrl+C`.

### Adding a Ticker

1. Open `http://localhost:3000` in a browser.
2. Type any valid Binance cryptocurrency symbol into the input (e.g., `BTCUSD`).
3. Press **Enter** or click **Add Ticker**.
4. The backend launches a headed Chromium tab for that symbol; once a live price is found the card appears and updates in real time.
5. Click **Remove** on any card to unsubscribe and close the browser tab for that ticker.

---

## Technologies

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | Next.js (App Router) | ^14.0.4 |
| UI Library | React / React DOM | ^18.2.0 |
| Frontend Language | TypeScript | ^5.3.3 |
| Backend Runtime | Node.js + tsx | ^4.7.0 |
| Backend Language | TypeScript | ^5.3.3 |
| Browser Automation | Playwright — Chromium | ^1.40.1 |
| Package Manager | pnpm (workspaces) | — |
| Schema / Code Gen | Protocol Buffers + Buf CLI | ^1.28.1 |
| Protobuf Runtime | @bufbuild/protobuf | ^1.6.0 |
| RPC Framework | ConnectRPC | ^1.2.0 |
| Dev Environment | Nix Flakes (nixpkgs-unstable) | — |
| Build Scripts | Bash (`run.sh`) + Batch (`run.bat`) | — |

---

## Project Structure

```
TickerTrail/
├── backend/
│   └── src/
│       ├── server.ts           # HTTP server, SSE client management, route handlers
│       └── price-scraper.ts    # PriceScraper class — Playwright lifecycle & DOM extraction
├── frontend/
│   └── app/
│       ├── layout.tsx          # Root layout (HTML shell)
│       └── page.tsx            # Main page — SSE client, ticker UI, subscription logic
├── proto/
│   └── crypto.proto            # Protobuf schema: CryptoService, PriceUpdate, Ticker
├── buf.yaml                    # Buf module configuration
├── buf.gen.yaml                # Buf code generation configuration
├── pnpm-workspace.yaml         # pnpm workspace definition (backend + frontend)
├── flake.nix                   # Nix development shell (node, pnpm, bash, git)
├── run.sh                      # Linux/macOS launch script
└── run.bat                     # Windows launch script
```
