const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('global_radar.db');

async function main() {
  console.log('📦 Opening database global_radar.db...');

  // Ensure 'name' column exists
  await new Promise((resolve) => {
    db.run("ALTER TABLE stock_metrics ADD COLUMN name TEXT", () => resolve());
  });

  const tickerPath = path.join(__dirname, 'tickers.json');
  if (!fs.existsSync(tickerPath)) {
    console.error('❌ tickers.json missing. Run python fetch_tickers.py first!');
    db.close();
    return;
  }

  const rawData = fs.readFileSync(tickerPath, 'utf8');
  const parsed = JSON.parse(rawData);
  const nameMap = {};

  if (Array.isArray(parsed)) {
    parsed.forEach(item => {
      if (item.ticker && item.name) {
        nameMap[item.ticker.toUpperCase()] = item.name;
      }
    });
  }

  console.log(`📄 Loaded ${Object.keys(nameMap).length} company mappings from tickers.json`);

  const rows = await new Promise((resolve, reject) => {
    db.all("SELECT ticker FROM stock_metrics", [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  console.log(`🔍 Updating ${rows.length} tickers in database...`);
  let updatedCount = 0;

  db.serialize(() => {
    const stmt = db.prepare("UPDATE stock_metrics SET name = ? WHERE UPPER(ticker) = ?");
    
    for (const r of rows) {
      const t = (r.ticker || '').toUpperCase();
      // Look up raw ticker or ticker without suffix (e.g. 20MICRONS.NS -> 20MICRONS)
      const baseTicker = t.split('.')[0];
      const companyName = nameMap[t] || nameMap[baseTicker];

      if (companyName) {
        stmt.run(companyName, t);
        updatedCount++;
      }
    }
    
    stmt.finalize(() => {
      console.log(`\n🎉 Successfully updated ${updatedCount} company names in global_radar.db!`);
      db.close();
    });
  });
}

main();
