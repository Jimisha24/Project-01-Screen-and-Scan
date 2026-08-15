const fs = require('fs');
const path = require('path');

const tickersDir = path.join(__dirname, 'tickers');
const outputFile = path.join(__dirname, 'tickers.json');

function parseTickerFile(filePath, defaultExchange) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Warning: File not found at ${filePath}. Skipping...`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  // Split by newline, comma, space, or tab
  const rawLines = content.split(/[\r\n,\t ]+/);

  const parsed = [];
  for (let line of rawLines) {
    let cleanSymbol = line.trim().toUpperCase();
    
    // Skip empty lines, headers, or comments
    if (!cleanSymbol || cleanSymbol.startsWith('#') || cleanSymbol === 'SYMBOL' || cleanSymbol === 'TICKER') {
      continue;
    }

    // Format adjustments based on exchange
    if (defaultExchange === 'NSE') {
      if (!cleanSymbol.endsWith('.NS')) {
        cleanSymbol = `${cleanSymbol}.NS`;
      }
    } else if (defaultExchange === 'BSE') {
      if (!cleanSymbol.endsWith('.BO')) {
        cleanSymbol = `${cleanSymbol}.BO`;
      }
    }

    parsed.push({
      symbol: cleanSymbol,
      exchange: defaultExchange
    });
  }

  return parsed;
}

function generateTickers() {
  console.log(`🔍 Scanning tickers folder at: ${tickersDir}`);

  const nasdaqFile = path.join(tickersDir, 'nasdaq_tickers.txt');
  const nyseFile = path.join(tickersDir, 'nyse_tickers.txt');
  const nseFile = path.join(tickersDir, 'nse_tickers.txt');
  const bseFile = path.join(tickersDir, 'bse_tickers.txt'); // Optional if present

  const nasdaqTickers = parseTickerFile(nasdaqFile, 'NASDAQ');
  const nyseTickers = parseTickerFile(nyseFile, 'NYSE');
  const nseTickers = parseTickerFile(nseFile, 'NSE');
  const bseTickers = parseTickerFile(bseFile, 'BSE');

  const allTickers = [
    ...nasdaqTickers,
    ...nyseTickers,
    ...nseTickers,
    ...bseTickers
  ];

  // De-duplicate by symbol
  const uniqueMap = new Map();
  for (const t of allTickers) {
    if (!uniqueMap.has(t.symbol)) {
      uniqueMap.set(t.symbol, t);
    }
  }

  const finalTickers = Array.from(uniqueMap.values());

  console.log(`\n📊 Extraction Summary:`);
  console.log(`   - NASDAQ: ${nasdaqTickers.length} tickers`);
  console.log(`   - NYSE:   ${nyseTickers.length} tickers`);
  console.log(`   - NSE:    ${nseTickers.length} tickers`);
  if (bseTickers.length > 0) console.log(`   - BSE:    ${bseTickers.length} tickers`);
  console.log(`----------------------------------------`);
  console.log(`✅ Total Unique Tickers Saved: ${finalTickers.length}\n`);

  fs.writeFileSync(outputFile, JSON.stringify(finalTickers, null, 2), 'utf8');
  console.log(`💾 Generated tickers.json at: ${outputFile}`);
}

generateTickers();
