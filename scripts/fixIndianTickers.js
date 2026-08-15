const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('../config/constants');

const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

const indianTickers = [
  'RELIANCE', 'CIPLA', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'TCS', 
  'INFY', 'BHARTIARTL', 'ITC', 'LTIM', 'TATAMOTORS', 'TATASTEEL'
];

db.serialize(() => {
  console.log("🛠️ Checking and resolving unsuffixed Indian tickers...");

  indianTickers.forEach(baseTicker => {
    const suffixedTicker = `${baseTicker}.NS`;

    // 1. Check if unsuffixed ticker exists
    db.get(`SELECT ticker FROM stock_metrics WHERE ticker = ?`, [baseTicker], (err, row) => {
      if (row) {
        // 2. Check if suffixed ticker already exists in database
        db.get(`SELECT ticker FROM stock_metrics WHERE ticker = ?`, [suffixedTicker], (err, suffixedRow) => {
          if (suffixedRow) {
            console.log(`🗑️ '${suffixedTicker}' already exists. Deleting duplicate '${baseTicker}'...`);
            db.run(`DELETE FROM stock_metrics WHERE ticker = ?`, [baseTicker]);
          } else {
            console.log(`🔄 Updating '${baseTicker}' -> '${suffixedTicker}'`);
            db.run(`UPDATE stock_metrics SET ticker = ? WHERE ticker = ?`, [suffixedTicker, baseTicker]);
          }
        });
      }
    });
  });
});

setTimeout(() => {
  console.log("✅ Done resolving Indian tickers!");
  db.close();
}, 2000);
