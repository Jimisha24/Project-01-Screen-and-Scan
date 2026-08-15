const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { DB_PATH } = require('../config/constants');

const dbFile = path.isAbsolute(DB_PATH) ? DB_PATH : path.join(__dirname, '..', DB_PATH);
const db = new sqlite3.Database(dbFile);

const columnsToAdd = [
  'total_debt REAL',
  'total_revenue REAL',
  'market_cap REAL',
  'pe_ratio REAL',
  'pb_ratio REAL',
  'ps_ratio REAL',
  'debt_to_equity REAL',
  'current_ratio REAL',
  'quick_ratio REAL',
  'roe REAL',
  'roa REAL',
  'profit_margin REAL'
];

db.serialize(() => {
  console.log("🛠️ Checking database schema for ratio columns...");
  
  columnsToAdd.forEach((colDef) => {
    const colName = colDef.split(' ')[0];
    db.run(`ALTER TABLE stock_metrics ADD COLUMN ${colDef}`, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log(`ℹ️ Column '${colName}' already exists.`);
        } else {
          console.error(`❌ Error adding '${colName}':`, err.message);
        }
      } else {
        console.log(`✅ Added column '${colName}' to stock_metrics.`);
      }
    });
  });
});

db.close(() => console.log("🎉 Migration completed!"));
