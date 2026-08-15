# Project-01-Screen-and-Scan
Its an end-to-end, full-stack financial analysis and screening application.
GlobalRadarProGlobalRadarPro is an end-to-end, full-stack financial analysis and technical market screening application. It provides real-time equity screening using custom institutional trading models (Smart Money Concepts / ICT) and custom financial ratio filters across global stock exchanges (NASDAQ, NYSE, NSE, BSE).
# Key FeaturesInstitutional:
## SMC & ICT Technical Screener:
Detects Optimal Trade Entry (OTE) zones ($61.8\% - 79\%$ Fibonacci retracements), Order Blocks (OB), and Fair Value Gaps (FVG).Tracks multi-timeframe setups (4H, Daily, Weekly, Monthly, 3M).Identifies fresh Order Block touches, liquidity sweeps, and price proximity thresholds.
## Fundamental & Financial Ratio Filtering
Applies custom non-financial equity screens, such as debt-to-asset ratios, illiquid asset proportions, and interest income bounds.Tracks prohibited stock exclusions and non-compliant equities.
## Interactive Dashboard UI
Dynamic multi-column sorting, pagination, search, and exchange filtering.LocalStorage-backed ticker watchlist management (★).Instant CSV export for offline analysis.
## Automated Data Pipeline & Background Scanner
Asynchronous OHLC market data refresh with live status polling and progress tracking.Automatic scheduled auto-refresh timer display with live countdowns.On-demand live price updates per individual ticker symbol via Express endpoints.
# Tech Stack & Architecture
Backend: Node.js, Express.jsFrontend: Native HTML5, CSS3 (CSS Variables, Flexbox/Grid Layout), Modern JavaScript (ES6+ Fetch API)Data Sources & API Integration: Yahoo Finance API / Custom Financial Data ServicesStorage & Persistence: LocalStorage (Watchlist & Client State), File-System/In-Memory Scan State
# Project StructurePlaintextGlobalRadarPro/
│
├── routes/
│   └── apiRoutes.js          # Express API routes for setups, prices, and scan triggers
├── public/                   # Static web assets (if served via Express static)
│   ├── css/
│   └── js/
├── index.html                # Main financial ratio & equity screener dashboard
├── technical.html            # SMC / ICT Order Block & FVG technical screener UI
├── prohibited.html           # Non-compliant & prohibited stocks interface
├── server.js                 # Application entry point & Express server initialization
├── package.json              # Node.js project dependencies and scripts
└── README.md                 # Project documentation
# API Endpoints
GET - /api/technical-stocks - Retrieves technical setups based on proximity parameters (?proximity=2).
GET - /api/live-price/:symbol - Fetches real-time price data for a single symbol (e.g., AAPL, RELIANCE.NS).
POST - /api/trigger-technical-refresh - Triggers a background scan across watchlists/passed equities.
POST - /api/stop-technical-refresh - Aborts an active background scanner task. 
GET - /api/refresh-status - Polls progress percentage, active symbol, and next auto-refresh timestamp.
# Getting Started
## Prerequisites
Node.js (v16.0.0 or higher)
npm or yarn
# License
