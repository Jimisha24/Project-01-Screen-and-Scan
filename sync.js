const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const YahooFinance = require('yahoo-finance2').default;

// Initialize YahooFinance and suppress deprecation/survey notices
const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical']
});

const DB_PATH = path.join(__dirname, 'global_radar.db');

function getDbConnection() {
  return new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("❌ Database connection error:", err.message);
  });
}

function parseSafeNum(val, fallback = null) {
  if (val === null || val === undefined || isNaN(val)) return fallback;
  const num = Number(val);
  return isNaN(num) ? fallback : num;
}

// Ensure database table has all necessary compliance columns
function ensureColumnsExist(db) {
  const columns = ['cash_and_equivalents', 'receivables', 'inventory'];
  columns.forEach(col => {
    db.run(`ALTER TABLE stock_metrics ADD COLUMN ${col} REAL`, () => {
      // Ignore errors if column already exists
    });
  });
}

// 4-Tier Strategy for Complete Fundamental Scanning
async function fetchFundamentals(ticker) {
  let totalAssets = null;
  let totalDebt = null;
  let cashAndEquivalents = null;
  let receivables = null;
  let inventory = null;
  let interestIncome = null;
  let totalRevenue = null;

  // Tier 1: Primary - Quarterly fundamentalsTimeSeries
  try {
    let fundResults = await yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: '2022-01-01',
      type: 'quarterly',
      module: 'all'
    });

    // Tier 2: Secondary - Annual fundamentalsTimeSeries
    if (!fundResults || fundResults.length === 0) {
      fundResults = await yahooFinance.fundamentalsTimeSeries(ticker, {
        period1: '2020-01-01',
        type: 'annual',
        module: 'all'
      });
    }

    if (fundResults && fundResults.length > 0) {
      const latest = fundResults[fundResults.length - 1];
      
      totalAssets = parseSafeNum(latest.totalAssets ?? latest.TotalAssets);
      totalDebt = parseSafeNum(latest.totalDebt ?? latest.TotalDebt);
      
      cashAndEquivalents = parseSafeNum(
        latest.cashCashEquivalentsAndShortTermInvestments ?? 
        latest.cashAndCashEquivalents ?? 
        latest.CashAndCashEquivalents
      );

      receivables = parseSafeNum(
        latest.receivables ?? 
        latest.Receivables ?? 
        latest.accountsReceivable ?? 
        latest.AccountsReceivable
      );

      inventory = parseSafeNum(
        latest.inventory ?? 
        latest.Inventory ?? 
        latest.inventories
      );

      const rawInterest = latest.interestIncomeNonOperating ?? 
                          latest.interestIncome ?? 
                          latest.InterestIncome ?? 
                          latest.netInterestIncome;
      interestIncome = parseSafeNum(rawInterest, 0);

      totalRevenue = parseSafeNum(latest.totalRevenue ?? latest.TotalRevenue);
    }
  } catch (e) {
    // Suppress individual timeSeries fetch errors
  }

  // Tier 3: High-level financialData fallback
  if (!totalDebt || !totalRevenue || !cashAndEquivalents) {
    try {
      const summary = await yahooFinance.quoteSummary(ticker, { modules: ['financialData'] });
      if (summary && summary.financialData) {
        if (!totalDebt) totalDebt = parseSafeNum(summary.financialData.totalDebt);
        if (!totalRevenue) totalRevenue = parseSafeNum(summary.financialData.totalRevenue);
        if (!cashAndEquivalents) cashAndEquivalents = parseSafeNum(summary.financialData.totalCash);
      }
    } catch (e) {
      // Suppress quoteSummary error
    }
  }

  // Tier 4: Key statistics fallback
  if (!totalAssets) {
    try {
      const summary = await yahooFinance.quoteSummary(ticker, { modules: ['defaultKeyStatistics'] });
      if (summary && summary.defaultKeyStatistics) {
        const bookVal = parseSafeNum(summary.defaultKeyStatistics.bookValue);
        const shares = parseSafeNum(summary.defaultKeyStatistics.sharesOutstanding);
        if (bookVal && shares) {
          const estEquity = bookVal * shares;
          totalAssets = estEquity + (totalDebt || 0);
        }
      }
    } catch (e) {
      // Suppress keyStats error
    }
  }

  return { totalAssets, totalDebt, cashAndEquivalents, receivables, inventory, interestIncome, totalRevenue };
}

// Sync single ticker record
async function syncSingleTicker(db, ticker) {
  try {
    let quote = null;
    try {
      quote = await yahooFinance.quote(ticker, {}, { validateResult: false });
    } catch (qErr) {
      // Suppress quote fetch error
    }

    const price = quote?.regularMarketPrice || quote?.postMarketPrice || quote?.preMarketPrice || null;
    const marketCap = quote?.marketCap || null;
    const name = quote?.longName || quote?.shortName || ticker;
    const sector = quote?.sector || null;

    const { totalAssets, totalDebt, cashAndEquivalents, receivables, inventory, interestIncome, totalRevenue } = await fetchFundamentals(ticker);

    return new Promise((resolve) => {
      const sql = `
        UPDATE stock_metrics 
        SET current_price = COALESCE(?, current_price),
            market_cap = COALESCE(?, market_cap),
            total_assets = COALESCE(?, total_assets),
            total_debt = COALESCE(?, total_debt),
            cash_and_equivalents = COALESCE(?, cash_and_equivalents),
            receivables = COALESCE(?, receivables),
            inventory = COALESCE(?, inventory),
            interest_income = COALESCE(?, interest_income),
            total_revenue = COALESCE(?, total_revenue),
            name = COALESCE(?, name),
            sector = COALESCE(?, sector)
        WHERE ticker = ?
      `;

      db.run(sql, [price, marketCap, totalAssets, totalDebt, cashAndEquivalents, receivables, inventory, interestIncome, totalRevenue, name, sector, ticker], function (err) {
        if (err) {
          console.error(`❌ DB error updating ${ticker}:`, err.message);
        } else {
          const assetStr = totalAssets ? `$${(totalAssets / 1e9).toFixed(2)}B` : "N/A";
          const debtStr = totalDebt ? `$${(totalDebt / 1e9).toFixed(2)}B` : "N/A";
          const cashStr = cashAndEquivalents ? `$${(cashAndEquivalents / 1e9).toFixed(2)}B` : "N/A";
          console.log(`✅ [SYNCED] ${ticker.padEnd(14)} | Price: $${price || 'N/A'} | Assets: ${assetStr} | Debt: ${debtStr} | Cash: ${cashStr}`);
        }
        resolve();
      });
    });

  } catch (err) {
    console.error(`❌ Global error syncing ${ticker}:`, err.message);
  }
}

// Main Runner
async function runFullSync() {
  console.log("🚀 Starting GlobalRadarPro Clean Sync Engine...\n");
  const db = getDbConnection();
  ensureColumnsExist(db);

  db.all(`SELECT ticker FROM stock_metrics ORDER BY market_cap DESC`, [], async (err, rows) => {
    if (err) {
      console.error("❌ Failed to read stock list:", err.message);
      db.close();
      return;
    }

    const tickers = (rows || []).map(r => r.ticker).filter(Boolean);
    console.log(`📋 Found ${tickers.length} stocks in database to sync.`);

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      process.stdout.write(`[${i + 1}/${tickers.length}] `);
      await syncSingleTicker(db, ticker);
      await new Promise(r => setTimeout(r, 200));
    }

    db.close();
    console.log("\n🎉 Sync process finished successfully!");
  });
}

runFullSync();
