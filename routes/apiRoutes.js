const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ 
  queue: { concurrency: 2 },
  validation: { logErrors: false }
});
if (typeof yahooFinance.suppressNotices === 'function') {
  yahooFinance.suppressNotices(['validation']);
}

const { DB_PATH } = require('../config/constants');
const { normalizeExchange, formatMarketCap, parseSafeNum } = require('../utils/formatters');
const { evaluateCompliance } = require('../services/complianceEngine');
const smcEngine = require('../services/smcEngine');

const evaluateSMC = smcEngine.evaluateAllTimeframesInstitutional || smcEngine.evaluateSMCAllTimeframes || smcEngine.analyzeSMC;

const metadataPath = path.join(__dirname, '../metadata.json');

const AUTO_REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 Minutes
let nextAutoRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS).toISOString();

let cancelRequested = false;
let techRefreshState = {
  status: "idle",
  progress: 0,
  completed: 0,
  total: 0,
  currentTicker: "",
  message: "Idle",
  lastUpdated: null
};

function getDbConnection(readOnly = false) {
  const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
  const mode = readOnly ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE;
  return new sqlite3.Database(dbFile, mode, (err) => {
    if (err) console.error("SQLite connection error:", err.message);
  });
}

function formatPct(val, fallback = "0.00%") {
  if (val === null || val === undefined) return fallback;
  const num = parseSafeNum(val, null);
  if (num === null) return fallback;
  return `${(num * 100).toFixed(2)}%`;
}

function getMetadata() {
  try {
    if (fs.existsSync(metadataPath)) {
      const rawData = fs.readFileSync(metadataPath, 'utf8');
      const cleanData = rawData.replace(/^\uFEFF/, '');
      return JSON.parse(cleanData);
    }
  } catch (err) {
    console.error("Error reading metadata:", err);
  }
  const now = new Date();
  const nextQuarter = new Date(now);
  nextQuarter.setDate(nextQuarter.getDate() + 90);
  return { lastUpdated: now.toISOString(), nextDue: nextQuarter.toISOString(), status: "idle" };
}

function saveMetadata(data) {
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving metadata:", err);
  }
}

function buildStockRow(s, customThresholds) {
  const compliance = evaluateCompliance(s, customThresholds);
  const price = s.current_price ?? s.price ?? null;

  let debtRatio = compliance.metrics.debt;
  if (debtRatio === null || debtRatio === undefined) {
    if (s.total_debt && s.total_assets && s.total_assets > 0) {
      debtRatio = s.total_debt / s.total_assets;
    } else if (s.total_debt && s.market_cap && s.market_cap > 0) {
      debtRatio = s.total_debt / s.market_cap;
    } else if (s.debt_to_equity !== null && s.debt_to_equity !== undefined) {
      debtRatio = parseSafeNum(s.debt_to_equity, 0) / 100;
    } else {
      debtRatio = 0;
    }
  }

  let illiquidRatio = compliance.metrics.illiquid ?? 0;
  let interestRatio = compliance.metrics.interest ?? 0;

  return {
    ticker: s.ticker || "UNKNOWN",
    name: s.name || s.company_name || s.company || s.ticker || "N/A",
    exchange: normalizeExchange(s.exchange, s.ticker),
    sector: s.sector || "Unknown",
    price: price !== null ? parseSafeNum(price) : null,
    price_fmt: price !== null ? `$${parseSafeNum(price).toFixed(2)}` : "N/A",
    market_cap: s.market_cap || 0,
    market_cap_fmt: formatMarketCap(s.market_cap),
    debt_to_assets: debtRatio,
    debt_to_assets_pct: formatPct(debtRatio),
    illiquid_assets_ratio: illiquidRatio,
    illiquid_assets_pct: formatPct(illiquidRatio),
    interest_income_ratio: interestRatio,
    interest_income_pct: formatPct(interestRatio),
    status: compliance.status || "REVIEW",
    reasons: compliance.reasons || []
  };
}

// 1. Financial Screener Endpoint
router.get('/stocks', (req, res) => {
  const db = getDbConnection(true);
  const maxDebt = parseSafeNum(req.query.maxDebtToAssets, 0.33);
  const minIlliquid = parseSafeNum(req.query.minIlliquid, 0.20);
  const maxInterest = parseSafeNum(req.query.maxInterest, 0.05);

  const cleanQuery = `
    SELECT * FROM stock_metrics 
    WHERE market_cap IS NOT NULL AND market_cap > 0
    ORDER BY market_cap DESC
  `;

  db.all(cleanQuery, [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });

    try {
      const allStocks = (rows || []).map(s => buildStockRow(s, { maxDebt, minIlliquid, maxInterest }));
      res.json({ success: true, count: allStocks.length, data: allStocks });
    } catch (parseErr) {
      res.status(500).json({ success: false, error: parseErr.message });
    }
  });
});

// 2. Prohibited & Non-Compliant Stocks Endpoint
router.get(['/prohibited-stocks', '/non-compliant-stocks', '/prohibited'], (req, res) => {
  const db = getDbConnection(true);
  const maxDebt = parseSafeNum(req.query.maxDebtToAssets, 0.33);
  const minIlliquid = parseSafeNum(req.query.minIlliquid, 0.20);
  const maxInterest = parseSafeNum(req.query.maxInterest, 0.05);

  db.all(`SELECT * FROM stock_metrics`, [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });

    try {
      const nonCompliantStocks = (rows || [])
        .map(s => buildStockRow(s, { maxDebt, minIlliquid, maxInterest }))
        .filter(s => s.status === 'FAIL' || s.status === 'REVIEW' || s.status === 'PROHIBITED');

      res.json({ success: true, count: nonCompliantStocks.length, data: nonCompliantStocks });
    } catch (parseErr) {
      res.status(500).json({ success: false, error: parseErr.message });
    }
  });
});

// 3. Technical Screener Endpoint (SMC)
router.get('/technical-stocks', (req, res) => {
  const proximityPct = parseSafeNum(req.query.proximity, 10);
  const db = getDbConnection(true);

  db.all(`SELECT * FROM stock_metrics`, [], (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });

    const passStocks = (rows || []).filter(s => {
      const comp = evaluateCompliance(s);
      return comp.isCompliant || comp.status === 'PASS';
    });

    const groupedResults = [];

    passStocks.forEach(s => {
      let dailyRaw = [], hourlyRaw = [], weeklyRaw = [], monthlyRaw = [], threeMonthRaw = [];
      try { if (s.ohlc_json) dailyRaw = typeof s.ohlc_json === 'string' ? JSON.parse(s.ohlc_json) : s.ohlc_json; } catch (e) {}
      try { if (s.hourly_ohlc_json) hourlyRaw = typeof s.hourly_ohlc_json === 'string' ? JSON.parse(s.hourly_ohlc_json) : s.hourly_ohlc_json; } catch (e) {}
      try { if (s.weekly_ohlc_json) weeklyRaw = typeof s.weekly_ohlc_json === 'string' ? JSON.parse(s.weekly_ohlc_json) : s.weekly_ohlc_json; } catch (e) {}
      try { if (s.monthly_ohlc_json) monthlyRaw = typeof s.monthly_ohlc_json === 'string' ? JSON.parse(s.monthly_ohlc_json) : s.monthly_ohlc_json; } catch (e) {}
      try { if (s.three_month_ohlc_json) threeMonthRaw = typeof s.three_month_ohlc_json === 'string' ? JSON.parse(s.three_month_ohlc_json) : s.three_month_ohlc_json; } catch (e) {}

      if (!Array.isArray(dailyRaw) || dailyRaw.length === 0) return;

      const fourHourInput = (Array.isArray(hourlyRaw) && hourlyRaw.length >= 4) ? hourlyRaw : dailyRaw;

      const currentPrice = parseSafeNum(s.current_price ?? s.price ?? dailyRaw[dailyRaw.length - 1]?.close, 0);
      if (currentPrice <= 0) return;

      let matches = [];
      if (typeof evaluateSMC === 'function') {
        matches = evaluateSMC(dailyRaw, fourHourInput, weeklyRaw, monthlyRaw, threeMonthRaw, proximityPct);
      }

      if (matches && matches.length > 0) {
        const tfList = matches.map(m => m.timeframe || m.tf || "Daily");
        const zoneCodes = matches.map(m => m.zoneCode || "PREMIUM");
        const hasFreshTouch = matches.some(m => m.isFirstRedLatest === true);

        const ex = normalizeExchange(s.exchange, s.ticker);
        const cleanTicker = (s.ticker || "").replace(/\.(NS|BO)$/, '');

        groupedResults.push({
          ticker: cleanTicker,
          raw_ticker: s.ticker,
          name: s.name || s.company_name || cleanTicker,
          exchange: ex,
          market_cap: s.market_cap || 0,
          market_cap_fmt: formatMarketCap(s.market_cap),
          price_num: currentPrice,
          price_fmt: `$${currentPrice.toFixed(2)}`,
          timeframe_list: tfList,
          zone_codes: zoneCodes,
          has_fresh_red_touch: hasFreshTouch,
          tf_details: matches,
          tradingview_url: `https://www.tradingview.com/symbols/${ex}-${cleanTicker}/`
        });
      }
    });

    res.json({ success: true, count: groupedResults.length, data: groupedResults });
  });
});

// 4. Single Stock Sync & Fetcher
router.get('/live-price/:ticker', async (req, res) => {
  let ticker = req.params.ticker;
  try {
    const quote = await yahooFinance.quote(ticker, {}, { validateResult: false });
    const livePrice = quote.regularMarketPrice || quote.postMarketPrice || quote.preMarketPrice;

    if (!livePrice) return res.status(404).json({ success: false, error: 'Price not found' });

    const db = getDbConnection(false);
    db.run(`UPDATE stock_metrics SET current_price = ? WHERE ticker = ?`, [livePrice, ticker], () => db.close());

    res.json({ success: true, ticker, price: livePrice, price_fmt: `$${livePrice.toFixed(2)}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Technical Refresh Status Endpoint
router.get('/refresh-status', (req, res) => {
  res.json({ 
    success: true, 
    ...techRefreshState,
    nextAutoRefresh: nextAutoRefreshTime
  });
});

// 6. Stop Technical Refresh Endpoint
router.post('/stop-technical-refresh', (req, res) => {
  if (techRefreshState.status === "running") {
    cancelRequested = true;
    techRefreshState.status = "cancelled";
    techRefreshState.message = "Cancellation requested by user.";
    return res.json({ success: true, message: "Technical refresh stopping...", nextAutoRefresh: nextAutoRefreshTime });
  }
  res.json({ success: true, message: "No refresh currently running.", nextAutoRefresh: nextAutoRefreshTime });
});

// 7. Trigger Technical OHLC Batch Refresh Engine (PASS STOCKS ONLY)
router.post('/trigger-technical-refresh', async (req, res) => {
  if (techRefreshState.status === "running") {
    return res.json({ success: true, message: "Refresh already in progress", ...techRefreshState, nextAutoRefresh: nextAutoRefreshTime });
  }

  cancelRequested = false;
  const db = getDbConnection(true);

  db.all(`SELECT * FROM stock_metrics`, [], async (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ success: false, error: err.message });

    const passTickers = (rows || [])
      .filter(s => {
        const comp = evaluateCompliance(s);
        return comp.isCompliant || comp.status === 'PASS';
      })
      .map(s => s.ticker)
      .filter(Boolean);

    if (passTickers.length === 0) {
      return res.json({ success: false, message: "No PASS tickers found to update" });
    }

    techRefreshState = {
      status: "running",
      progress: 0,
      completed: 0,
      total: passTickers.length,
      currentTicker: passTickers[0],
      message: "Starting PASS stocks technical refresh...",
      lastUpdated: new Date().toISOString()
    };

    res.json({ 
      success: true, 
      message: `Technical OHLC refresh started for ${passTickers.length} PASS stocks`, 
      ...techRefreshState,
      nextAutoRefresh: nextAutoRefreshTime 
    });

    runBatchTechnicalUpdate(passTickers);
  });
});

async function runBatchTechnicalUpdate(tickers) {
  const batchSize = 5;
  const delayMs = 150;

  const d7 = new Date();
  d7.setDate(d7.getDate() - 7);
  const startDate1h = d7.toISOString().split('T')[0];

  for (let i = 0; i < tickers.length; i += batchSize) {
    if (cancelRequested) {
      techRefreshState.status = "cancelled";
      techRefreshState.message = `Refresh cancelled at ${techRefreshState.completed}/${techRefreshState.total} tickers.`;
      techRefreshState.lastUpdated = new Date().toISOString();
      return;
    }

    const chunk = tickers.slice(i, i + batchSize);
    
    await Promise.all(chunk.map(async (ticker) => {
      if (cancelRequested) return;
      techRefreshState.currentTicker = ticker;

      try {
        const dailyResult = await yahooFinance.chart(
          ticker, 
          { period1: '2024-01-01', interval: '1d' }, 
          { validateResult: false }
        );
        
        let hourlyBars = [];
        try {
          const hourlyResult = await yahooFinance.chart(
            ticker, 
            { period1: startDate1h, interval: '1h' }, 
            { validateResult: false }
          );
          if (hourlyResult && hourlyResult.quotes) {
            hourlyBars = hourlyResult.quotes
              .filter(q => q.open && q.high && q.low && q.close)
              .map(q => ({
                date: q.date ? new Date(q.date).toISOString() : "",
                open: q.open,
                high: q.high,
                low: q.low,
                close: q.close,
                volume: q.volume || 0
              }));
          }
        } catch (e) {}

        if (dailyResult && dailyResult.quotes && dailyResult.quotes.length > 0) {
          const cleanBars = dailyResult.quotes
            .filter(q => q.open && q.high && q.low && q.close)
            .map(q => ({
              date: q.date ? new Date(q.date).toISOString().split('T')[0] : "",
              open: q.open,
              high: q.high,
              low: q.low,
              close: q.close,
              volume: q.volume || 0
            }));

          const latestPrice = cleanBars[cleanBars.length - 1].close;
          const marketCap = dailyResult.meta?.marketCap || null;

          const db = getDbConnection(false);
          const hourlyJson = JSON.stringify(hourlyBars);

          if (marketCap) {
            db.run(
              `UPDATE stock_metrics SET ohlc_json = ?, hourly_ohlc_json = ?, current_price = ?, market_cap = ? WHERE ticker = ?`,
              [JSON.stringify(cleanBars), hourlyJson, latestPrice, marketCap, ticker],
              () => db.close()
            );
          } else {
            db.run(
              `UPDATE stock_metrics SET ohlc_json = ?, hourly_ohlc_json = ?, current_price = ? WHERE ticker = ?`,
              [JSON.stringify(cleanBars), hourlyJson, latestPrice, ticker],
              () => db.close()
            );
          }
        }
      } catch (err) {
      } finally {
        techRefreshState.completed++;
        techRefreshState.progress = Math.round((techRefreshState.completed / techRefreshState.total) * 100);
      }
    }));

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  if (!cancelRequested) {
    techRefreshState.status = "completed";
    techRefreshState.message = "Technical OHLC refresh complete!";
    techRefreshState.lastUpdated = new Date().toISOString();
    // Reset timer starting from the exact moment the batch finished
    nextAutoRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS).toISOString();
  }
}

// 8. Database Status Endpoint
router.get('/update-status', (req, res) => {
  const meta = getMetadata();
  res.json({ 
    success: true, 
    ...meta, 
    techRefresh: {
      ...techRefreshState,
      nextAutoRefresh: nextAutoRefreshTime
    }
  });
});

// 9. Manual Quarterly Database Refresh Trigger Endpoint
router.post('/trigger-update', (req, res) => {
  try {
    const now = new Date();
    const nextQuarter = new Date(now);
    nextQuarter.setDate(nextQuarter.getDate() + 90);

    const meta = {
      lastUpdated: now.toISOString(),
      nextDue: nextQuarter.toISOString(),
      status: "idle"
    };

    saveMetadata(meta);
    res.json({ success: true, message: "Database metadata and quarterly schedule successfully updated!", ...meta });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Automatically trigger PASS stocks technical refresh every 15 minutes
setInterval(() => {
  nextAutoRefreshTime = new Date(Date.now() + AUTO_REFRESH_INTERVAL_MS).toISOString();
  
  if (techRefreshState.status !== "running") {
    const db = getDbConnection(true);
    db.all(`SELECT ticker, total_debt, total_assets, market_cap, debt_to_equity, sector, current_price, price FROM stock_metrics`, [], (err, rows) => {
      db.close();
      if (err) return;

      const passTickers = (rows || [])
        .filter(s => {
          const comp = evaluateCompliance(s);
          return comp.isCompliant || comp.status === 'PASS';
        })
        .map(s => s.ticker)
        .filter(Boolean);

      if (passTickers.length > 0) {
        techRefreshState = {
          status: "running",
          progress: 0,
          completed: 0,
          total: passTickers.length,
          currentTicker: passTickers[0],
          message: "15-minute auto refresh running...",
          lastUpdated: new Date().toISOString()
        };
        runBatchTechnicalUpdate(passTickers);
      }
    });
  }
}, AUTO_REFRESH_INTERVAL_MS);

module.exports = router;