module.exports = {
  PORT: process.env.PORT || 8080,
  DB_PATH: 'global_radar.db',
  
  THRESHOLDS: {
    MAX_DEBT_TO_ASSETS: 0.33,      // 33% Max Interest-Bearing Debt
    MIN_ILLIQUID_ASSETS: 0.20,     // 20% Min Illiquid/Tangible Assets
    MAX_INTEREST_INCOME: 0.05,     // 5% Max Non-Operating Interest Income
    MAX_PLAUSIBLE_RATIO: 1.0       // 100% Sanity Cap for standard ratios
  },

  // Expanded Business Keywords to catch stealth Banking, Financials, & Cannabis
  EXCLUDED_KEYWORDS: [
    'financial', 'financials', 'banking', 'bank', 'banks', 'insurance', 'credit', 'mortgage',
    'lending', 'thrift', 'capital market', 'investment', 'asset management',
    'cannabis', 'marijuana', 'hemp', 'cbd', 'psychedelic', 'tobacco', 'gambling', 
    'casino', 'casinos', 'alcohol', 'breweries', 'distillers', 'wineries', 'pork', 'adult'
  ]
};
