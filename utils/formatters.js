function normalizeExchange(rawExchange, ticker) {
  if (!rawExchange || rawExchange === "N/A") {
    if (ticker && ticker.endsWith('.NS')) return 'NSE';
    if (ticker && ticker.endsWith('.BO')) return 'BSE';
    return 'N/A';
  }

  const ex = rawExchange.toUpperCase().trim();

  if (['NMS', 'NGS', 'NCM', 'NASDAQ', 'NASDAQGS', 'NASDAQGM', 'XNAS'].includes(ex)) return 'NASDAQ';
  if (['NYQ', 'NYSE', 'NYE', 'XNYS'].includes(ex)) return 'NYSE';
  if (['NSE', 'NSI', 'NATIONAL STOCK EXCHANGE', 'XNSE'].includes(ex) || (ticker && ticker.endsWith('.NS'))) return 'NSE';
  if (['BSE', 'BOM', 'BOMBAY STOCK EXCHANGE', 'XBOM'].includes(ex) || (ticker && ticker.endsWith('.BO'))) return 'BSE';

  return ex;
}

function formatMarketCap(marketCap) {
  const num = parseFloat(marketCap);
  if (isNaN(num) || num <= 0) return "N/A";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function parseSafeNum(val, defaultVal = 0) {
  if (val === null || val === undefined) return defaultVal;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultVal : parsed;
}

module.exports = {
  normalizeExchange,
  formatMarketCap,
  parseSafeNum
};
