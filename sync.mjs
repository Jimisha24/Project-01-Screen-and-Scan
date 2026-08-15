import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import yahooFinance from 'yahoo-finance2';

// -------------------------------------------------------------------
// 1. Database Initialization
// -------------------------------------------------------------------
async function initDb() {
  const db = await open({
    filename: 'global_radar.db',
    driver: sqlite3.Database
  });

  // Enable WAL mode for high performance
  await db.exec('PRAGMA journal_mode = WAL;');

  // Create table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS stock_metrics (
      ticker TEXT PRIMARY KEY,
      exchange TEXT,
      price REAL,
      volume INTEGER,
      debt_to_equity REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return db;
}

// -------------------------------------------------------------------
// 2. Configuration & Utilities
// -------------------------------------------------------------------
const TICKERS_TO_SYNC = [
  { symbol: 'AAPL', exchange: 'NASDAQ' },
  { symbol: 'MSFT', exchange: 'NASDAQ' },
  { symbol: 'NVDA', exchange: 'NASDAQ' },
  { symbol: 'RELIANCE.NS', exchange: 'NSE' },
  { symbol: 'TCS.NS', exchange: 'NSE' }
];

const BATCH_SIZE = 3;       // Number of tickers to fetch concurrently
const DELAY_MS = 2000;      // 2-second delay between batches

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// -------------------------------------------------------------------
// 3. Single Ticker Fetcher
// -------------------------------------------------------------------
async function fetchTickerMetrics(tickerObj) {
  const { symbol, exchange } = tickerObj;
  try {
    const quote = await yahooFinance.quoteSummary(symbol, {
      modules: ['price', 'financialData']
    });

    const priceData = quote.price || {};
    const financialData = quote.financialData || {};

    return {
      ticker: symbol,
      exchange: exchange,
      price: priceData.regularMarketPrice ?? null,
      volume: priceData.regularMarketVolume ?? null,
      debt_to_equity: financialData.debtToEquity ?? null
    };
  } catch (error) {
    console.error(`⚠️ [Sync Warning] Failed to fetch ${symbol}: ${error.message}`);
    return null;
  }
}

// -------------------------------------------------------------------
// 4. Batch Sync Engine
// -------------------------------------------------------------------
async function runSync() {
  const db = await initDb();
  console.log(`\n🚀 Starting Local Data Sync at ${new Date().toISOString()}`);

  const batches = chunkArray(TICKERS_TO_SYNC, BATCH_SIZE);
  let totalUpdated = 0;

  const upsertSql = `
    INSERT INTO stock_metrics (ticker, exchange, price, volume, debt_to_equity, last_updated)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(ticker) DO UPDATE SET
      exchange = excluded.exchange,
      price = excluded.price,
      volume = excluded.volume,
      debt_to_equity = excluded.debt_to_equity,
      last_updated = CURRENT_TIMESTAMP
  `;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\nProcessing Batch ${i + 1}/${batches.length}: [${batch.map(b => b.symbol).join(', ')}]`);

    const results = await Promise.all(batch.map((t) => fetchTickerMetrics(t)));
    const validResults = results.filter((res) => res !== null);

    if (validResults.length > 0) {
      await db.exec('BEGIN TRANSACTION;');
      for (const item of validResults) {
        await db.run(upsertSql, [
          item.ticker,
          item.exchange,
          item.price,
          item.volume,
          item.debt_to_equity
        ]);
      }
      await db.exec('COMMIT;');
      totalUpdated += validResults.length;
      console.log(`  ✓ Saved ${validResults.length} record(s) to SQLite.`);
    }

    if (i < batches.length - 1) {
      console.log(`  ⏳ Waiting ${DELAY_MS / 1000}s before next batch...`);
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n✅ Sync Completed! Updated ${totalUpdated} total records.\n`);
  await db.close();
}

runSync().catch(console.error);
