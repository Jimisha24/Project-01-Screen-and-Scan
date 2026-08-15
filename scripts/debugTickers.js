const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const { DB_PATH } = require('../config/constants');
const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

const testTickers = ['AAPL', 'MSFT', 'RELIANCE.NS', 'RELIANCE', 'CIPLA.NS', 'CIPLA'];

async function debug() {
  console.log("🔍 Checking Database Entries & Yahoo API response...\n");

  for (const ticker of testTickers) {
    // 1. Check DB
    db.get(`SELECT * FROM stock_metrics WHERE ticker = ? OR ticker = ?`, [ticker, ticker.toLowerCase()], async (err, row) => {
      if (!row) {
        console.log(`❌ DB Record for '${ticker}': NOT FOUND IN DB`);
      } else {
        console.log(`📊 DB Record for '${ticker}': PE=${row.pe_ratio}, DebtToEquity=${row.debt_to_equity}, PS=${row.ps_ratio}, MarketCap=${row.market_cap}`);
      }

      // 2. Fetch directly from Yahoo
      try {
        const q = await yahooFinance.quote(ticker);
        const sum = await yahooFinance.quoteSummary(ticker, { modules: ['financialData', 'summaryDetail', 'defaultKeyStatistics'] }, { validateResult: false });

        const pe = q.trailingPE || sum?.summaryDetail?.trailingPE || sum?.summaryDetail?.forwardPE;
        const mc = q.marketCap || sum?.summaryDetail?.marketCap;
        const d2e = sum?.financialData?.debtToEquity;

        console.log(`🌐 Yahoo API response for '${ticker}': PE=${pe}, MarketCap=${mc}, DebtToEquity=${d2e}\n`);
      } catch (e) {
        console.log(`⚠️ Yahoo API error for '${ticker}': ${e.message}\n`);
      }
    });
  }
}

debug();
