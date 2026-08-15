/**
 * GlobalRadarPro - SMC Engine with OB Touch & Sweep Detection
 */

function safeParseOHLC(data) {
  if (!data) return [];
  let arr = data;
  if (typeof data === 'string') {
    try {
      arr = JSON.parse(data);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .map(bar => {
      if (!bar) return null;
      const open = parseFloat(bar.open);
      const high = parseFloat(bar.high);
      const low = parseFloat(bar.low);
      const close = parseFloat(bar.close);
      const volume = parseFloat(bar.volume || 0);

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) return null;

      return {
        date: bar.date || bar.datetime || new Date().toISOString(),
        open,
        high,
        low,
        close,
        volume: isNaN(volume) ? 0 : volume
      };
    })
    .filter(Boolean);
}

function resampleHourlyTo4H(hourlyOHLC) {
  const clean = safeParseOHLC(hourlyOHLC);
  if (clean.length === 0) return [];
  if (clean.length < 4) return clean;

  const result = [];
  let currentGroup = [];

  clean.forEach((bar) => {
    currentGroup.push(bar);
    if (currentGroup.length === 4) {
      result.push({
        date: currentGroup[0].date,
        open: currentGroup[0].open,
        high: Math.max(...currentGroup.map(b => b.high)),
        low: Math.min(...currentGroup.map(b => b.low)),
        close: currentGroup[currentGroup.length - 1].close,
        volume: currentGroup.reduce((sum, b) => sum + b.volume, 0)
      });
      currentGroup = [];
    }
  });

  if (currentGroup.length > 0) {
    result.push({
      date: currentGroup[0].date,
      open: currentGroup[0].open,
      high: Math.max(...currentGroup.map(b => b.high)),
      low: Math.min(...currentGroup.map(b => b.low)),
      close: currentGroup[currentGroup.length - 1].close,
      volume: currentGroup.reduce((sum, b) => sum + b.volume, 0)
    });
  }

  return result;
}

function resampleDailyOHLC(dailyOHLC, targetTf) {
  const clean = safeParseOHLC(dailyOHLC);
  if (clean.length === 0) return [];

  const grouped = {};

  clean.forEach(bar => {
    const dateObj = new Date(bar.date);
    if (isNaN(dateObj.getTime())) return;

    let groupKey = '';
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth();

    if (targetTf === 'Weekly') {
      const d = new Date(dateObj);
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setUTCDate(diff));
      groupKey = `${monday.getUTCFullYear()}-${monday.getUTCMonth() + 1}-${monday.getUTCDate()}`;
    } else if (targetTf === 'Monthly') {
      groupKey = `${year}-${month + 1}`;
    } else if (targetTf === '3M') {
      const quarter = Math.floor(month / 3) + 1;
      groupKey = `${year}-Q${quarter}`;
    } else {
      return;
    }

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      };
    } else {
      grouped[groupKey].high = Math.max(grouped[groupKey].high, bar.high);
      grouped[groupKey].low = Math.min(grouped[groupKey].low, bar.low);
      grouped[groupKey].close = bar.close;
      grouped[groupKey].volume += bar.volume;
    }
  });

  return Object.values(grouped);
}

function findMajorDealingRange(ohlc) {
  const clean = safeParseOHLC(ohlc);
  if (clean.length < 4) return null;

  let swingHigh = -Infinity;
  let swingLow = Infinity;

  const lookback = Math.min(100, clean.length);
  const startIdx = clean.length - lookback;

  for (let i = startIdx; i < clean.length; i++) {
    const bar = clean[i];
    if (bar.high > swingHigh) swingHigh = bar.high;
    if (bar.low < swingLow) swingLow = bar.low;
  }

  if (swingHigh === -Infinity || swingLow === Infinity || swingHigh <= swingLow) {
    return null;
  }

  const range = swingHigh - swingLow;
  const equilibrium = swingLow + (range * 0.50);
  const ote618 = swingLow + (range * 0.618);
  const ote790 = swingLow + (range * 0.790);

  return {
    swingHigh,
    swingLow,
    range,
    equilibrium,
    oteMin: ote618,
    oteMax: ote790
  };
}

function evaluateTimeframeInstitutional(ohlcRaw, timeframe, proximityPct = 10, freshOnly = true) {
  try {
    const ohlc = safeParseOHLC(ohlcRaw);
    if (ohlc.length < 4) return null;

    const currentPrice = ohlc[ohlc.length - 1].close;
    if (!currentPrice || currentPrice <= 0) return null;

    const dealingRange = findMajorDealingRange(ohlc);
    const scanRange = Math.min(60, ohlc.length - 3);
    let bestSetup = null;

    const startIdx = Math.max(1, ohlc.length - scanRange);

    for (let i = startIdx; i < ohlc.length - 2; i++) {
      const c0 = ohlc[i - 1]; 
      const c1 = ohlc[i];     
      const c2 = ohlc[i + 1]; 
      const c3 = ohlc[i + 2]; 

      if (!c0 || !c1 || !c2 || !c3) continue;

      const isC1Bearish = c1.close < c1.open;
      const takesC0Low = c1.low < c0.low; // CRITERIA 1: Order block (c1) swept low of c0
      const hasFVG = c3.low > c1.high;

      if (isC1Bearish && takesC0Low && hasFVG) {
        const obFloor = c1.low;
        const obTop = c1.high;
        const fvgLow = c1.high;
        const fvgHigh = c3.low;

        let invalidCount = 0;
        for (let j = i + 3; j < ohlc.length; j++) {
          if (ohlc[j].close < obFloor) invalidCount++;
        }

        const maxAllowedInvalid = (timeframe === 'Weekly' || timeframe === 'Monthly' || timeframe === '3M') ? 1 : 0;
        if (invalidCount > maxAllowedInvalid) continue;

        const effectiveProx = Math.max(proximityPct || 10, 10);
        const proxUpper = obTop * (1 + effectiveProx / 100);
        const isNearOB = currentPrice >= (obFloor * 0.90) && currentPrice <= proxUpper;

        if (isNearOB) {
          let touchStr = "None";
          let touchHigh = null;
          let touchLow = null;
          let touchCandleColor = null;
          let isTouchLatest = false;
          let touchedIndex = -1;

          for (let j = i + 3; j < ohlc.length; j++) {
            const candle = ohlc[j];
            const touchesOB = candle.low <= obTop && candle.high >= obFloor;

            if (touchesOB) {
              touchedIndex = j;
              touchHigh = candle.high;
              touchLow = candle.low;
              touchCandleColor = candle.close >= candle.open ? "Green" : "Red";
              touchStr = `$${candle.low.toFixed(2)} - $${candle.high.toFixed(2)} (${touchCandleColor})`;
              
              if (j === ohlc.length - 1) {
                isTouchLatest = true;
              }
              break;
            }
          }

          // CRITERIA 2: Reject if touch occurred before the latest candle
          if (freshOnly && touchedIndex !== -1 && !isTouchLatest) {
            continue;
          }

          const proxVal = ((currentPrice - obTop) / obTop) * 100;

          bestSetup = {
            timeframe,
            zone: `$${obFloor.toFixed(2)} - $${obTop.toFixed(2)}`,
            fvgRange: `$${fvgLow.toFixed(2)} - $${fvgHigh.toFixed(2)}`,
            obFloor,
            obTop,
            fvgLow,
            fvgHigh,
            firstTouchStr: touchStr,
            firstTouchHigh: touchHigh,
            firstTouchLow: touchLow,
            firstTouchColor: touchCandleColor,
            isTouchLatest,
            proximityVal: proxVal,
            proximityStr: `${proxVal.toFixed(2)}%`
          };
        }
      }
    }

    if (!bestSetup) return null;

    let inDiscount = false;
    let inOTE = false;
    let zoneTag = "Premium Zone";
    let zoneCode = "PREMIUM";

    if (dealingRange) {
      inDiscount = currentPrice <= dealingRange.equilibrium;
      inOTE = currentPrice >= dealingRange.oteMin && currentPrice <= dealingRange.oteMax;

      if (inOTE) {
        zoneTag = "🎯 OTE Zone (61.8% - 79%)";
        zoneCode = "OTE";
      } else if (inDiscount) {
        zoneTag = "🟢 Discount Zone (< 50%)";
        zoneCode = "DISCOUNT";
      } else {
        zoneTag = "🔴 Premium Zone (> 50%)";
        zoneCode = "PREMIUM";
      }
    }

    bestSetup.inDiscount = inDiscount;
    bestSetup.inOTE = inOTE;
    bestSetup.zoneTag = zoneTag;
    bestSetup.zoneCode = zoneCode;

    return bestSetup;
  } catch (err) {
    console.error(`Error in evaluateTimeframeInstitutional (${timeframe}):`, err);
    return null;
  }
}

function evaluateAllTimeframesInstitutional(dailyRaw, fourHourRaw, weeklyRaw, monthlyRaw, threeMonthRaw, proximityPct = 10, freshOnly = true) {
  const matches = [];

  try {
    const clean4H = safeParseOHLC(fourHourRaw);
    if (clean4H.length >= 4) {
      const match4H = evaluateTimeframeInstitutional(clean4H, '4H', proximityPct, freshOnly);
      if (match4H) matches.push(match4H);
    }

    const cleanDaily = safeParseOHLC(dailyRaw);
    if (cleanDaily.length >= 4) {
      const matchDaily = evaluateTimeframeInstitutional(cleanDaily, 'Daily', proximityPct, freshOnly);
      if (matchDaily) matches.push(matchDaily);

      const cleanWeekly = safeParseOHLC(weeklyRaw);
      const wData = (cleanWeekly.length >= 4) ? cleanWeekly : resampleDailyOHLC(cleanDaily, 'Weekly');
      const matchWeekly = evaluateTimeframeInstitutional(wData, 'Weekly', proximityPct, freshOnly);
      if (matchWeekly) matches.push(matchWeekly);

      const cleanMonthly = safeParseOHLC(monthlyRaw);
      const mData = (cleanMonthly.length >= 4) ? cleanMonthly : resampleDailyOHLC(cleanDaily, 'Monthly');
      const matchMonthly = evaluateTimeframeInstitutional(mData, 'Monthly', proximityPct, freshOnly);
      if (matchMonthly) matches.push(matchMonthly);

      const clean3M = safeParseOHLC(threeMonthRaw);
      const qData = (clean3M.length >= 4) ? clean3M : resampleDailyOHLC(cleanDaily, '3M');
      const match3M = evaluateTimeframeInstitutional(qData, '3M', proximityPct, freshOnly);
      if (match3M) matches.push(match3M);
    }
  } catch (err) {
    console.error("Error evaluating all timeframes:", err);
  }

  return matches;
}

module.exports = {
  findMajorDealingRange,
  resampleHourlyTo4H,
  resampleDailyOHLC,
  evaluateTimeframeInstitutional,
  evaluateAllTimeframesInstitutional
};
