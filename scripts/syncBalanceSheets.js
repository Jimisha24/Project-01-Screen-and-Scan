const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const YahooFinance = require('yahoo-finance2').default;

// Only use valid notice IDs supported by yahoo-finance2
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey']
});

const { DB_PATH } = require('../config/constants');
const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getNum(val) {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (val && typeof val === 'object' && typeof val.raw === 'number' && !isNaN(val.raw)) return val.raw;
  return null;
}

async function syncFinancials() {
  const query = `
    SELECT ticker FROM stock_metrics 
    WHERE pe_ratio IS NULL 
       OR debt_to_equity IS NULL 
       OR ps_ratio IS NULL
  `;

  db.all(query, async (err, rows) => {
    if (err || !rows) {
      console.error("❌ Database Error:", err);
      process.exit(1);
    }

    if (rows.length === 0) {
      console.log("🎉 All stock metrics and ratios are fully populated!");
      db.close();
      return;
    }

    console.log(`🚀 Syncing remaining ${rows.length} tickers...`);

    for (let i = 0; i < rows.length; i++) {
      let ticker = rows[i].ticker;
      let success = false;
      let retries = 0;

      while (!success && retries < 3) {
        try {
          // Fetch both quote and quoteSummary with validateResult: false
          const [q, summary] = await Promise.all([
            yahooFinance.quote(ticker, {}, { validateResult: false }).catch(() => ({})),
            yahooFinance.quoteSummary(
              ticker,
              { modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'] },
              { validateResult: false }
            ).catch(() => ({}))
          ]);

          const fd = summary?.financialData || {};
          const sd = summary?.summaryDetail || {};
          const ks = summary?.defaultKeyStatistics || {};

          // Raw metrics
          const totalDebt = getNum(fd.totalDebt);
          const totalRevenue = getNum(fd.totalRevenue);
          const marketCap = getNum(q.marketCap) || getNum(sd.marketCap) || getNum(ks.marketCap);
          
          // Extracted Ratios
          let peRatio = getNum(q.trailingPE) || getNum(sd.trailingPE) || getNum(ks.trailingPE) || getNum(q.forwardPE) || getNum(sd.forwardPE);
          let pbRatio = getNum(q.priceToBook) || getNum(ks.priceToBook);
          let psRatio = getNum(q.priceToSales) || getNum(sd.priceToSalesTrailing12Months) || getNum(ks.priceToSales);
          let debtToEquity = getNum(fd.debtToEquity);
          let currentRatio = getNum(fd.currentRatio);
          let quickRatio = getNum(fd.quickRatio);
          let roe = getNum(fd.returnOnEquity);
          let roa = getNum(fd.returnOnAssets);
          let profitMargin = getNum(fd.profitMargins);

          // Fallback manual calculation if P/S is missing
          if (!psRatio && marketCap && totalRevenue && totalRevenue > 0) {
            psRatio = marketCap / totalRevenue;
          }

          db.run(
            `UPDATE stock_metrics 
             SET total_debt = COALESCE(?, total_debt), 
                 total_revenue = COALESCE(?, total_revenue),
                 market_cap = COALESCE(?, market_cap),
                 pe_ratio = COALESCE(?, pe_ratio),
                 pb_ratio = COALESCE(?, pb_ratio),
                 ps_ratio = COALESCE(?, ps_ratio),
                 debt_to_equity = COALESCE(?, debt_to_equity),
                 current_ratio = COALESCE(?, current_ratio),
                 quick_ratio = COALESCE(?, quick_ratio),
                 roe = COALESCE(?, roe),
                 roa = COALESCE(?, roa),
                 profit_margin = COALESCE(?, profit_margin)
             WHERE ticker = ?`,
            [
              totalDebt, totalRevenue, marketCap,
              peRatio, pbRatio, psRatio, debtToEquity,
              currentRatio, quickRatio, roe, roa, profitMargin,
              ticker
            ]
          );

          console.log(`[${i + 1}/${rows.length}] ✅ Synced ${ticker}`);
          success = true;
        } catch (e) {
          if (e.message.includes('Too Many Requests') || e.message.includes('429')) {
            const waitTime = (retries + 1) * 60000;
            console.warn(`⏳ Rate limit hit at ${ticker}. Cooldown for ${waitTime / 1000}s...`);
            await delay(waitTime);
            retries++;
          } else {
            console.warn(`[${i + 1}/${rows.length}] ⚠️ Skipped ${ticker}: ${e.message}`);
            success = true;
          }
        }
      }

      await delay(800);
    }

    console.log("🎉 Complete!");
    db.close();
  });
}

syncFinancials();
