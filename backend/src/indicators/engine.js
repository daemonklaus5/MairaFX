const { EMA, RSI, BollingerBands, ATR, ADX } = require('technicalindicators');
const db = require('../db');

class IndicatorEngine {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.state = {}; // in-memory state keyed by "symbol_tf"
  }

  async loadState() {
    try {
      const result = await db.query('SELECT * FROM indicators');
      for (const row of result.rows) {
        this.state[`${row.symbol}_${row.timeframe}`] = row;
      }
      console.log(`Loaded ${result.rows.length} indicator states from DB`);
    } catch (e) {
      console.error('Failed to load indicator state:', e.message);
    }
  }

  async recompute(symbol, timeframe) {
    try {
      // Fetch last 500 candles ordered by time ASC
      const result = await db.query(
        `SELECT timestamp, open, high, low, close, volume 
         FROM candles 
         WHERE symbol = $1 AND timeframe = $2 
         ORDER BY timestamp DESC 
         LIMIT 500`,
        [symbol, timeframe]
      );
      
      if (result.rows.length < 50) return; // not enough data

      // Reverse to chronological order for calculation
      const candles = result.rows.reverse();

      const closes = candles.map(c => parseFloat(c.close));
      const highs = candles.map(c => parseFloat(c.high));
      const lows = candles.map(c => parseFloat(c.low));

      const ema9 = EMA.calculate({ period: 9, values: closes });
      const ema21 = EMA.calculate({ period: 21, values: closes });
      const ema50 = EMA.calculate({ period: 50, values: closes });
      const ema200 = EMA.calculate({ period: 200, values: closes });
      const rsi14 = RSI.calculate({ period: 14, values: closes });
      const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
      const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
      const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });

      const lastCandle = candles[candles.length - 1];
      const indicators = {
        symbol,
        timeframe,
        timestamp: lastCandle.timestamp,
        ema9: ema9.length ? ema9[ema9.length - 1] : null,
        ema21: ema21.length ? ema21[ema21.length - 1] : null,
        ema50: ema50.length ? ema50[ema50.length - 1] : null,
        ema200: ema200.length ? ema200[ema200.length - 1] : null,
        rsi14: rsi14.length ? rsi14[rsi14.length - 1] : null,
        bb_upper: bb.length ? bb[bb.length - 1].upper : null,
        bb_middle: bb.length ? bb[bb.length - 1].middle : null,
        bb_lower: bb.length ? bb[bb.length - 1].lower : null,
        atr: atr.length ? atr[atr.length - 1] : null,
        adx: adx.length && adx[adx.length - 1].adx ? adx[adx.length - 1].adx : null
      };

      this.state[`${symbol}_${timeframe}`] = indicators;
      console.log(`Successfully recomputed indicators for ${symbol} ${timeframe}`);

      // Persist to Postgres
      await db.query(`
        INSERT INTO indicators (
          symbol, timeframe, timestamp, ema9, ema21, ema50, ema200, rsi14, bb_upper, bb_middle, bb_lower, atr, adx
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) ON CONFLICT (symbol, timeframe) DO UPDATE SET
          timestamp = EXCLUDED.timestamp,
          ema9 = EXCLUDED.ema9,
          ema21 = EXCLUDED.ema21,
          ema50 = EXCLUDED.ema50,
          ema200 = EXCLUDED.ema200,
          rsi14 = EXCLUDED.rsi14,
          bb_upper = EXCLUDED.bb_upper,
          bb_middle = EXCLUDED.bb_middle,
          bb_lower = EXCLUDED.bb_lower,
          atr = EXCLUDED.atr,
          adx = EXCLUDED.adx
      `, [
        indicators.symbol, indicators.timeframe, indicators.timestamp,
        indicators.ema9, indicators.ema21, indicators.ema50, indicators.ema200,
        indicators.rsi14, indicators.bb_upper, indicators.bb_middle, indicators.bb_lower,
        indicators.atr, indicators.adx
      ]);

      if (this.wsManager) {
        this.wsManager.broadcast({
          type: 'INDICATORS',
          data: indicators
        });
      }
    } catch (err) {
      console.error(`Error computing indicators for ${symbol} ${timeframe}:`, err.message);
    }
  }

  getLatest(symbol, timeframe) {
    return this.state[`${symbol}_${timeframe}`];
  }
}

module.exports = IndicatorEngine;
