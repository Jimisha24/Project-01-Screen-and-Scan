const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('global_radar.db');

db.all("SELECT ticker, debt_to_assets, illiquid_assets_ratio, interest_income_ratio, exchange, price FROM stock_metrics LIMIT 10", [], (err, rows) => {
  if (err) {
    console.error("Database error:", err.message);
  } else {
    console.log("📊 Sample stock_metrics records from DB:");
    console.dir(rows);
  }
  db.close();
});
