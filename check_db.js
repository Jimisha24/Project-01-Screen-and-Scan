const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('global_radar.db');

console.log("\n📊 Current Database Contents ('stock_metrics'):\n");

db.all("SELECT ticker, exchange, price, volume, debt_to_equity, last_updated FROM stock_metrics", [], (err, rows) => {
  if (err) {
    console.error("Error reading database:", err.message);
  } else {
    console.table(rows);
  }
  db.close();
});