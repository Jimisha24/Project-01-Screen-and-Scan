const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('../config/constants');

const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

const cleanQuery = `
  SELECT ticker, market_cap, pe_ratio, debt_to_equity, ps_ratio, total_revenue
  FROM stock_metrics
  WHERE market_cap IS NOT NULL 
    AND (pe_ratio IS NOT NULL OR ps_ratio IS NOT NULL OR pb_ratio IS NOT NULL)
  ORDER BY market_cap DESC
`;

db.all(cleanQuery, (err, rows) => {
  if (err) {
    console.error("❌ Database Query Error:", err);
  } else {
    console.log(`✨ Total clean, production-ready stocks available for frontend: ${rows.length}`);
    console.log("\n📊 Top 5 sample stocks from clean dataset:");
    console.table(rows.slice(0, 5));
  }
  db.close();
});
