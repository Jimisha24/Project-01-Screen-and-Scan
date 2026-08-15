const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { evaluateCompliance } = require('./services/complianceEngine');

const DB_PATH = path.join(__dirname, 'global_radar.db');
const db = new sqlite3.Database(DB_PATH);

console.log("🔍 Executing GlobalRadarPro Sync Audit...\n");

db.all(`SELECT * FROM stock_metrics`, [], (err, rows) => {
  if (err) {
    console.error("❌ Audit failed to read stock_metrics:", err.message);
    db.close();
    return;
  }

  const stocks = rows || [];
  let compliantCount = 0;
  let nonCompliantCount = 0;
  let reviewCount = 0;

  stocks.forEach((s) => {
    const comp = evaluateCompliance(s);
    if (comp.status === 'PASS' || comp.isCompliant) {
      compliantCount++;
    } else if (comp.status === 'FAIL' || comp.status === 'PROHIBITED') {
      nonCompliantCount++;
    } else {
      reviewCount++;
    }
  });

  console.log(`📊 Total Stocks in DB: ${stocks.length}`);
  console.log(`✅ Financially Compliant: ${compliantCount}`);
  console.log(`❌ Non-Compliant / Prohibited: ${nonCompliantCount}`);
  console.log(`⚠️ Needs Review (Null Metrics): ${reviewCount}\n`);

  // Safe check for latest updates
  db.all(`SELECT ticker, current_price, total_assets, total_debt FROM stock_metrics WHERE total_assets IS NOT NULL ORDER BY market_cap DESC LIMIT 5`, [], (err2, sampleRows) => {
    if (!err2 && sampleRows && sampleRows.length > 0) {
      console.log("📌 Sample Compliant / Hydrated Stocks in DB:");
      sampleRows.forEach(r => {
        const assetsB = (r.total_assets / 1e9).toFixed(2);
        const debtB = r.total_debt ? (r.total_debt / 1e9).toFixed(2) : "0.00";
        console.log(`   • ${r.ticker.padEnd(12)} | Price: $${r.current_price} | Assets: $${assetsB}B | Debt: $${debtB}B`);
      });
    }

    db.close();
    console.log("\n🎉 Audit completed successfully.");
  });
});
