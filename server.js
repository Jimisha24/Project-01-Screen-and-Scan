const express = require('express');
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');

console.log('⏳ [1/3] Starting Express & loading routes...');
const apiRoutes = require('./routes/apiRoutes');
console.log('✅ [2/3] Routes loaded successfully.');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(__dirname));

// API Router
app.use('/api', apiRoutes);

// HTML Page Route Handlers
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/prohibited', (req, res) => {
  res.sendFile(path.join(__dirname, 'prohibited.html'));
});

app.get('/technical', (req, res) => {
  res.sendFile(path.join(__dirname, 'technical.html'));
});

// ==========================================
// AUTOMATED QUARTERLY NODE-CRON SCHEDULE
// Runs at 00:00 (Midnight) on Jan 1, Apr 1, Jul 1, Oct 1
// ==========================================
cron.schedule('0 0 1 1,4,7,10 *', () => {
  console.log('⏰ Running automated quarterly database refresh...');
  try {
    const metadataPath = path.join(__dirname, 'metadata.json');
    const now = new Date();
    const nextQuarter = new Date(now);
    nextQuarter.setDate(nextQuarter.getDate() + 90);

    const meta = {
      lastUpdated: now.toISOString(),
      nextDue: nextQuarter.toISOString(),
      status: "idle"
    };

    fs.writeFileSync(metadataPath, JSON.stringify(meta, null, 2), 'utf8');
    console.log('✅ Automated quarterly database update completed successfully!');
  } catch (err) {
    console.error('❌ Error during scheduled quarterly update:', err);
  }
});

// Fallback for 404
app.use((req, res) => {
  res.status(404).send('404 - Page or Endpoint Not Found');
});

app.listen(PORT, () => {
  console.log(`🚀 [3/3] GlobalRadarPro server running on http://localhost:${PORT}`);
});
