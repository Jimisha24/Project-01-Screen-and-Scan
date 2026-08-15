const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('../config/constants');

const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.get(`SELECT COUNT(*) as total FROM stock_metrics`, (err, row) => {
    console.log(`📊 Total tickers in database: ${row.total}`);
  });

  db.get(`SELECT COUNT(*) as populated FROM stock_metrics WHERE pe_ratio IS NOT NULL OR total_debt IS NOT NULL`, (err, row) => {
    console.log(`✅ Tickers with synced financial metrics: ${row.populated}`);
  });

  db.get(`SELECT COUNT(*) as missing FROM stock_metrics WHERE pe_ratio IS NULL AND total_debt IS NULL`, (err, row) => {
    console.log(`⚠️ Tickers still missing data: ${row.missing}`);
  });
});

db.close();
