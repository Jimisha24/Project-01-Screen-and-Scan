const { THRESHOLDS, EXCLUDED_KEYWORDS } = require('../config/constants');
const { parseSafeNum } = require('../utils/formatters');

/**
 * Normalizes raw ratio input.
 */
function normalizeRatio(rawVal) {
  if (rawVal === null || rawVal === undefined || rawVal === '' || rawVal === 'N/A') {
    return null;
  }
  let val = parseSafeNum(rawVal, -1);
  if (val < 0) return null;

  if (val > THRESHOLDS.MAX_PLAUSIBLE_RATIO && val <= 100) {
    val = val / 100;
  } else if (val > 100) {
    val = 1.0; 
  }
  return val;
}

/**
 * Checks for prohibited sector keywords.
 */
function checkSectorViolation(row) {
  const textToScan = [
    row.ticker,
    row.name,
    row.company_name,
    row.company,
    row.sector,
    row.industry,
    row.description,
    row.summary,
    row.business_summary
  ].filter(Boolean).join(' ').toLowerCase();

  for (const keyword of EXCLUDED_KEYWORDS) {
    if (textToScan.includes(keyword.toLowerCase())) {
      return `Prohibited Sector/Keyword (${keyword.toUpperCase()})`;
    }
  }
  return null;
}

/**
 * Calculates real company metrics from raw balance sheet items if available.
 */
function evaluateCompliance(row, customThresholds = {}) {
  const maxDebt = customThresholds.maxDebt ?? THRESHOLDS.MAX_DEBT_TO_ASSETS;
  const minIlliquid = customThresholds.minIlliquid ?? THRESHOLDS.MIN_ILLIQUID_ASSETS;
  const maxInterest = customThresholds.maxInterest ?? THRESHOLDS.MAX_INTEREST_INCOME;

  // Extract raw financial values
  const totalAssets = parseSafeNum(row.total_assets ?? row.totalAssets ?? row.assets, 0);
  const totalDebt = parseSafeNum(row.total_debt ?? row.totalDebt ?? row.short_long_term_debt ?? row.debt, 0);
  const cashEquiv = parseSafeNum(row.cash_and_equivalents ?? row.cashAndEquivalents ?? row.liquid_assets ?? row.cash, 0);
  const illiquidVal = parseSafeNum(row.tangible_assets ?? row.illiquid_assets_val ?? row.illiquid_assets, 0);
  const interestVal = parseSafeNum(row.interest_income_val ?? row.interestIncome ?? row.interest_income, 0);
  const totalRevenue = parseSafeNum(row.total_revenue ?? row.totalRevenue ?? row.revenue, 0);

  // 1. Debt Ratio
  let debt = normalizeRatio(row.debt_to_assets ?? row.debt_assets ?? row.debt_ratio);
  // Detect mock defaults (15.5%) or calculate from balance sheet
  if (debt === null || Math.abs(debt - 0.155) < 0.0001 || debt === 0) {
    if (totalAssets > 0 && totalDebt >= 0) {
      debt = totalDebt / totalAssets;
    } else {
      debt = null;
    }
  }

  // 2. Illiquid Assets Ratio
  let illiquid = normalizeRatio(row.illiquid_assets_ratio ?? row.illiquid_ratio);
  // Detect mock defaults (35.0%) or calculate from balance sheet
  if (illiquid === null || Math.abs(illiquid - 0.35) < 0.0001 || illiquid === 0) {
    if (totalAssets > 0) {
      if (illiquidVal > 0) {
        illiquid = illiquidVal / totalAssets;
      } else if (cashEquiv >= 0 && totalAssets >= cashEquiv) {
        illiquid = (totalAssets - cashEquiv) / totalAssets;
      } else {
        illiquid = null;
      }
    } else {
      illiquid = null;
    }
  }

  // 3. Interest Income Ratio
  let interest = normalizeRatio(row.interest_income_ratio ?? row.interest_ratio);
  // Detect mock defaults (1.2%) or calculate from revenue
  if (interest === null || Math.abs(interest - 0.012) < 0.0001 || interest === 0) {
    if (totalRevenue > 0 && interestVal >= 0) {
      interest = interestVal / totalRevenue;
    } else if (totalRevenue > 0) {
      interest = 0; // Standard fallback if revenue exists and zero interest recorded
    } else {
      interest = null;
    }
  }

  // Business activity check
  const sectorViolation = checkSectorViolation(row);

  const reasons = [];
  let isReview = false;

  if (sectorViolation) {
    reasons.push(sectorViolation);
  }

  if (debt === null || illiquid === null) {
    isReview = true;
    reasons.push("Missing Balance Sheet Data for Full Ratio Assessment");
  } else {
    if (debt > maxDebt) reasons.push(`Excessive Debt (${(debt * 100).toFixed(2)}% > ${(maxDebt * 100).toFixed(0)}%)`);
    if (illiquid < minIlliquid) reasons.push(`Low Illiquid Assets (${(illiquid * 100).toFixed(2)}% < ${(minIlliquid * 100).toFixed(0)}%)`);
    if (interest !== null && interest > maxInterest) reasons.push(`High Interest Income (${(interest * 100).toFixed(2)}% > ${(maxInterest * 100).toFixed(0)}%)`);
  }

  let status = "PASS";
  if (sectorViolation || reasons.some(r => r.includes("Excessive") || r.includes("Low Illiquid") || r.includes("High Interest"))) {
    status = "FAIL";
  } else if (isReview) {
    status = "REVIEW";
  }

  return {
    isCompliant: status === "PASS",
    status,
    reasons: reasons.join(" | ") || "Compliant",
    metrics: { debt, illiquid, interest }
  };
}

module.exports = {
  checkSectorViolation,
  evaluateCompliance,
  normalizeRatio
};
