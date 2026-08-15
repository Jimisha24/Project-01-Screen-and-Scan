const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { DB_PATH } = require('../config/constants');

const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

const query = `
  SELECT COUNT(*) AS missing_count 
  FROM stock_metrics 
  WHERE market_cap IS NULL 
     OR (pe_ratio IS NULL AND ps_ratio IS NULL AND pb_ratio IS NULL)
`;

db.get(query, (err, row) => {
  if (err) {
    console.error("❌ Database Query Error:", err);
  } else {
    console.log(`📊 True missing tickers (no market cap AND no valuation ratios): ${row.missing_count}`);
  }
  db.close();
});
