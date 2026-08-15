const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical']
});

const DB_PATH = path.join(__dirname, 'global_radar.db');

function parseSafeNum(val, fallback = null) {
  if (val === null || val === undefined || isNaN(val)) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

async function runCatchup() {
  const db = new sqlite3.Database(DB_PATH);
  
  // Select only tickers that failed or have missing metrics
  db.all(`SELECT ticker FROM stock_metrics WHERE current_price IS NULL OR total_assets IS NULL`, async (err, rows) => {
    if (err) {
      console.error("❌ DB Query Error:", err.message);
      db.close();
      return;
    }

    const tickers = (rows || []).map(r => r.ticker).filter(Boolean);
    console.log(`🔍 Found ${tickers.length} tickers with missing data. Starting catch-up scan...\n`);

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      try {
        const quote = await yahooFinance.quote(ticker, {}, { validateResult: false }).catch(() => null);
        const price = quote?.regularMarketPrice || quote?.postMarketPrice || quote?.preMarketPrice || null;
        const marketCap = quote?.marketCap || null;

        let totalAssets = null, totalDebt = null, cashAndEquivalents = null;
        try {
          const fund = await yahooFinance.fundamentalsTimeSeries(ticker, { period1: '2022-01-01', type: 'quarterly', module: 'all' });
          if (fund && fund.length > 0) {
            const latest = fund[fund.length - 1];
            totalAssets = parseSafeNum(latest.totalAssets ?? latest.TotalAssets);
            totalDebt = parseSafeNum(latest.totalDebt ?? latest.TotalDebt);
            cashAndEquivalents = parseSafeNum(latest.cashCashEquivalentsAndShortTermInvestments ?? latest.cashAndCashEquivalents);
          }
        } catch (e) {}

        const sql = `
          UPDATE stock_metrics 
          SET current_price = COALESCE(?, current_price),
              market_cap = COALESCE(?, market_cap),
              total_assets = COALESCE(?, total_assets),
              total_debt = COALESCE(?, total_debt),
              cash_and_equivalents = COALESCE(?, cash_and_equivalents)
          WHERE ticker = ?
        `;

        await new Promise((res) => {
          db.run(sql, [price, marketCap, totalAssets, totalDebt, cashAndEquivalents, ticker], () => res());
        });

        console.log(`[${i + 1}/${tickers.length}] 🔄 ${ticker.padEnd(12)} | Price: $${price || 'N/A'}`);
      } catch (e) {}

      // 500ms delay to respect Yahoo Finance rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    db.close();
    console.log("\n🎉 Catch-up sync completed!");
  });
}

runCatchup();
