const db = require('../db');

class ZoneDetector {
  constructor(engine) {
    this.engine = engine;
  }

  // Find swing highs and lows (N candles on either side)
  findPivots(candles, n = 5) {
    const highs = [];
    const lows = [];

    for (let i = n; i < candles.length - n; i++) {
      let isHigh = true;
      let isLow = true;
      const currentHigh = parseFloat(candles[i].high);
      const currentLow = parseFloat(candles[i].low);

      for (let j = i - n; j <= i + n; j++) {
        if (i === j) continue;
        if (currentHigh <= parseFloat(candles[j].high)) isHigh = false;
        if (currentLow >= parseFloat(candles[j].low)) isLow = false;
      }

      if (isHigh) highs.push({ type: 'swing_high', price: currentHigh, time: candles[i].timestamp, idx: i });
      if (isLow)  lows.push({ type: 'swing_low',  price: currentLow,  time: candles[i].timestamp, idx: i });
    }

    return { highs, lows };
  }

  // Cluster nearby price levels into zones
  clusterZones(prices, tolerancePct = 0.001) {
    if (prices.length === 0) return [];
    prices.sort((a, b) => a.price - b.price);

    const clusters = [];
    let cur = { sum: prices[0].price, touches: 1, min: prices[0].price, max: prices[0].price };

    for (let i = 1; i < prices.length; i++) {
      const p = prices[i].price;
      const avg = cur.sum / cur.touches;
      if (Math.abs(p - avg) / avg <= tolerancePct) {
        cur.sum += p; cur.touches += 1; cur.max = Math.max(cur.max, p);
      } else {
        clusters.push({ price: cur.sum / cur.touches, min: cur.min, max: cur.max, strength: cur.touches });
        cur = { sum: p, touches: 1, min: p, max: p };
      }
    }
    clusters.push({ price: cur.sum / cur.touches, min: cur.min, max: cur.max, strength: cur.touches });
    return clusters.filter(c => c.strength > 1);
  }

  /**
   * ICT Market Structure Analysis
   * Detects BOS, CHoCH, HH/HL vs LH/LL, and premium/discount zone.
   */
  detectMarketStructure(candles, highs, lows) {
    if (highs.length < 2 || lows.length < 2) {
      return { trend: 'ranging', bos: null, choch: false, structure: 'ranging', premiumDiscount: 'discount' };
    }

    const recentHighs = highs.slice(-5);
    const recentLows  = lows.slice(-5);

    // Count HH/HL vs LH/LL sequences
    let bullCount = 0, bearCount = 0;
    for (let i = 1; i < recentHighs.length; i++) {
      if (recentHighs[i].price > recentHighs[i - 1].price) bullCount++; else bearCount++;
    }
    for (let i = 1; i < recentLows.length; i++) {
      if (recentLows[i].price > recentLows[i - 1].price) bullCount++; else bearCount++;
    }

    let trend = 'ranging', structure = 'ranging';
    if (bullCount > bearCount + 1)      { trend = 'bullish'; structure = 'HH/HL'; }
    else if (bearCount > bullCount + 1) { trend = 'bearish'; structure = 'LH/LL'; }

    const lastClose   = parseFloat(candles[candles.length - 1].close);
    const lastHigh    = recentHighs[recentHighs.length - 1];
    const lastLow     = recentLows[recentLows.length - 1];

    // BOS: did last close break the last swing high or low?
    let bos = null;
    if (lastClose > lastHigh.price) {
      bos = { direction: 'bullish', level: lastHigh.price };
    } else if (lastClose < lastLow.price) {
      bos = { direction: 'bearish', level: lastLow.price };
    }

    // CHoCH: BOS against the prevailing trend = potential reversal
    const choch = !!(bos && (
      (trend === 'bullish' && bos.direction === 'bearish') ||
      (trend === 'bearish' && bos.direction === 'bullish')
    ));

    // Premium / Discount Zone (ICT: above midpoint = premium, below = discount)
    const rangeHigh = Math.max(...recentHighs.map(h => h.price));
    const rangeLow  = Math.min(...recentLows.map(l => l.price));
    const midpoint  = (rangeHigh + rangeLow) / 2;
    const premiumDiscount = lastClose >= midpoint ? 'premium' : 'discount';

    return { trend, bos, choch, structure, premiumDiscount, rangeHigh, rangeLow, midpoint };
  }

  /**
   * Liquidity Mapping (ICT)
   * Buy-side liquidity (BSL) = stop clusters ABOVE swing highs / equal highs.
   * Sell-side liquidity (SSL) = stop clusters BELOW swing lows / equal lows.
   */
  detectLiquidity(highs, lows, currentPrice) {
    // Equal highs/lows cluster more tightly than normal S/R — use 0.05% tolerance
    const eqhClusters = this.clusterZones(highs.map(h => ({ price: h.price })), 0.0005);
    const eqlClusters = this.clusterZones(lows.map(l => ({ price: l.price })),  0.0005);

    const pipSize = currentPrice < 10 ? 0.01 : 0.0001; // JPY = 2-dp, others = 4-dp

    const bsl = eqhClusters
      .filter(c => c.price > currentPrice)
      .sort((a, b) => a.price - b.price) // nearest above first
      .slice(0, 3)
      .map(c => ({
        price:    parseFloat(c.price.toFixed(5)),
        strength: c.strength,
        pips:     Math.round((c.price - currentPrice) / pipSize)
      }));

    const ssl = eqlClusters
      .filter(c => c.price < currentPrice)
      .sort((a, b) => b.price - a.price) // nearest below first
      .slice(0, 3)
      .map(c => ({
        price:    parseFloat(c.price.toFixed(5)),
        strength: c.strength,
        pips:     Math.round((currentPrice - c.price) / pipSize)
      }));

    return { bsl, ssl };
  }

  /**
   * Fair Value Gap (FVG) Detection
   * 3-candle imbalance pattern: gap between candle[i-2].high and candle[i].low (bullish)
   * or candle[i-2].low and candle[i].high (bearish).
   */
  detectFVGs(candles) {
    const bullish = [], bearish = [];
    const startIdx = Math.max(2, candles.length - 150); // only last 150 candles

    for (let i = startIdx; i < candles.length; i++) {
      const c0 = candles[i - 2];
      const c1 = candles[i - 1];
      const c2 = candles[i];

      const c0High = parseFloat(c0.high), c0Low = parseFloat(c0.low);
      const c2High = parseFloat(c2.high), c2Low = parseFloat(c2.low);
      const c1Open = parseFloat(c1.open), c1Close = parseFloat(c1.close);

      // Bullish FVG: gap between c0's high and c2's low, strong bullish middle candle
      if (c0High < c2Low && c1Close > c1Open) {
        bullish.push({ top: c2Low, bottom: c0High, midpoint: (c2Low + c0High) / 2, formed: c1.timestamp, size: c2Low - c0High });
      }
      // Bearish FVG
      if (c0Low > c2High && c1Close < c1Open) {
        bearish.push({ top: c0Low, bottom: c2High, midpoint: (c0Low + c2High) / 2, formed: c1.timestamp, size: c0Low - c2High });
      }
    }

    const lastClose = parseFloat(candles[candles.length - 1].close);

    // Active FVGs = not yet fully filled
    const activeBullish = bullish.filter(f => lastClose >= f.bottom && lastClose <= f.top * 1.01).slice(-3);
    const activeBearish = bearish.filter(f => lastClose <= f.top   && lastClose >= f.bottom * 0.99).slice(-3);

    return { bullish: activeBullish, bearish: activeBearish };
  }

  /**
   * Enhanced Order Block Detection
   * Bullish OB: last bearish candle before a strong bullish impulse.
   * Bearish OB: last bullish candle before a strong bearish impulse.
   * Marks as "mitigated" if price has returned into the OB body.
   */
  findOrderBlocks(candles) {
    const obs = [];
    const lastClose = parseFloat(candles[candles.length - 1].close);

    for (let i = 2; i < candles.length; i++) {
      const prev = candles[i - 1];
      const curr = candles[i];

      const prevOpen = parseFloat(prev.open), prevClose = parseFloat(prev.close);
      const currOpen = parseFloat(curr.open), currClose = parseFloat(curr.close);
      const prevHigh = parseFloat(prev.high), prevLow = parseFloat(prev.low);
      const currHigh = parseFloat(curr.high);

      const prevIsDown = prevClose < prevOpen;
      const prevIsUp   = prevClose > prevOpen;
      const currIsUp   = currClose > currOpen;
      const currIsDown = currClose < currOpen;

      const impulsiveBody = Math.abs(currClose - currOpen);
      const avgBody = i >= 3
        ? (Math.abs(parseFloat(candles[i-2].open) - parseFloat(candles[i-2].close)) + impulsiveBody) / 2
        : impulsiveBody;

      // Bullish OB
      if (prevIsDown && currIsUp && impulsiveBody > avgBody * 1.3) {
        const top = prevOpen, bottom = prevLow;
        obs.push({ type: 'bullish_ob', top, bottom, price: (top + bottom) / 2, time: prev.timestamp, mitigated: lastClose < top && lastClose > bottom });
      }

      // Bearish OB
      if (prevIsUp && currIsDown && impulsiveBody > avgBody * 1.3) {
        const top = prevHigh, bottom = prevOpen;
        obs.push({ type: 'bearish_ob', top, bottom, price: (top + bottom) / 2, time: prev.timestamp, mitigated: lastClose > bottom && lastClose < top });
      }
    }

    // Return last 6 OBs (most recent)
    return obs.slice(-6);
  }

  async detect(symbol, timeframe) {
    try {
      const result = await db.query(
        `SELECT timestamp, open, high, low, close 
         FROM candles 
         WHERE symbol = $1 AND timeframe = $2 
         ORDER BY timestamp DESC 
         LIMIT 500`,
        [symbol, timeframe]
      );

      if (result.rows.length < 50) return null;
      const candles = result.rows.reverse(); // oldest → newest

      const currentPrice = parseFloat(candles[candles.length - 1].close);
      const { highs, lows } = this.findPivots(candles);

      const resistance      = this.clusterZones(highs);
      const support         = this.clusterZones(lows);
      const orderBlocks     = this.findOrderBlocks(candles);
      const marketStructure = this.detectMarketStructure(candles, highs, lows);
      const liquidity       = this.detectLiquidity(highs, lows, currentPrice);
      const fvgs            = this.detectFVGs(candles);

      // Fibonacci golden pocket (last major swing)
      let fibZone = null;
      if (highs.length > 0 && lows.length > 0) {
        const lastHigh = highs[highs.length - 1].price;
        const lastLow  = lows[lows.length - 1].price;
        const diff = lastHigh - lastLow;
        fibZone = { type: 'golden_pocket', lower: lastLow + diff * 0.618, upper: lastLow + diff * 0.65 };
      }

      return { support, resistance, orderBlocks, fibZone, marketStructure, liquidity, fvgs, currentPrice };
    } catch (err) {
      console.error(`ZoneDetector error for ${symbol}:`, err.message);
      return null;
    }
  }
}

module.exports = ZoneDetector;
