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
        const compareHigh = parseFloat(candles[j].high);
        const compareLow = parseFloat(candles[j].low);
        if (currentHigh <= compareHigh) isHigh = false;
        if (currentLow >= compareLow) isLow = false;
      }

      if (isHigh) highs.push({ type: 'swing_high', price: currentHigh, time: candles[i].timestamp });
      if (isLow) lows.push({ type: 'swing_low', price: currentLow, time: candles[i].timestamp });
    }

    return { highs, lows };
  }

  // Cluster prices within a small percentage tolerance
  clusterZones(prices, tolerancePct = 0.001) {
    if (prices.length === 0) return [];
    
    // Sort ascending by price
    prices.sort((a, b) => a.price - b.price);
    
    const clusters = [];
    let currentCluster = { sum: prices[0].price, touches: 1, min: prices[0].price, max: prices[0].price };
    
    for (let i = 1; i < prices.length; i++) {
      const p = prices[i].price;
      const avg = currentCluster.sum / currentCluster.touches;
      
      if (Math.abs(p - avg) / avg <= tolerancePct) {
        currentCluster.sum += p;
        currentCluster.touches += 1;
        currentCluster.max = Math.max(currentCluster.max, p);
      } else {
        clusters.push({
          price: currentCluster.sum / currentCluster.touches,
          min: currentCluster.min,
          max: currentCluster.max,
          strength: currentCluster.touches
        });
        currentCluster = { sum: p, touches: 1, min: p, max: p };
      }
    }
    
    clusters.push({
      price: currentCluster.sum / currentCluster.touches,
      min: currentCluster.min,
      max: currentCluster.max,
      strength: currentCluster.touches
    });
    
    // Only return stronger zones
    return clusters.filter(c => c.strength > 1);
  }

  findOrderBlocks(candles) {
    // Basic order block detection: last down candle before a strong up move
    // "Strong" move: large body candle or a quick string of same-direction candles
    // This is simplified for V1
    const obs = [];
    for (let i = 2; i < candles.length; i++) {
      const prev = candles[i-1];
      const curr = candles[i];
      const prevOpen = parseFloat(prev.open);
      const prevClose = parseFloat(prev.close);
      const currOpen = parseFloat(curr.open);
      const currClose = parseFloat(curr.close);
      
      const prevIsDown = prevClose < prevOpen;
      const currIsUp = currClose > currOpen;
      const bodySize = Math.abs(currClose - currOpen);
      const avgBody = Math.abs(parseFloat(candles[i-2].open) - parseFloat(candles[i-2].close));
      
      if (prevIsDown && currIsUp && bodySize > avgBody * 2) {
        obs.push({
          type: 'bullish_ob',
          price: parseFloat(prev.low),
          top: prevOpen,
          bottom: parseFloat(prev.low),
          time: prev.timestamp
        });
      }
    }
    return obs;
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
      const candles = result.rows.reverse(); // oldest to newest

      const { highs, lows } = this.findPivots(candles);
      const resistance = this.clusterZones(highs);
      const support = this.clusterZones(lows);
      const orderBlocks = this.findOrderBlocks(candles);

      // Fibonacci golden pockets of most recent big swing
      // (simplified to just last high and last low)
      let fibZone = null;
      if (highs.length > 0 && lows.length > 0) {
        const lastHigh = highs[highs.length - 1].price;
        const lastLow = lows[lows.length - 1].price;
        const diff = lastHigh - lastLow;
        fibZone = {
          type: 'golden_pocket',
          lower: lastLow + diff * 0.618,
          upper: lastLow + diff * 0.65
        };
      }

      return {
        support,
        resistance,
        orderBlocks,
        fibZone
      };
    } catch (err) {
      console.error(`Error in ZoneDetector for ${symbol}:`, err.message);
      return null;
    }
  }
}

module.exports = ZoneDetector;
