const db = require('../db');
const cron = require('node-cron');

const TF_MINUTES = {
  'M15': 15,
  'H1': 60,
  'H4': 240,
  'D': 1440
};

class CandleBuilder {
  constructor(engine) {
    this.engine = engine;
    this.currentCandles = {}; // keyed by symbol_timeframe
    
    // Check for expired candles exactly on the minute
    cron.schedule('* * * * *', () => {
      this.checkStaleCandles();
    });
  }

  async checkStaleCandles() {
    const nowMs = Date.now();
    for (const [key, candle] of Object.entries(this.currentCandles)) {
      const minutes = TF_MINUTES[candle.timeframe];
      const msPerTf = minutes * 60 * 1000;
      const candleStartMs = new Date(candle.timestamp).getTime();
      
      // If the current time has passed the end of this candle's period
      if (nowMs >= candleStartMs + msPerTf) {
        // Force close it
        await this.closeCandle(candle);
        
        // Generate a flat dummy candle for the new current period to prevent data gaps
        const newStartMs = Math.floor(nowMs / msPerTf) * msPerTf;
        this.currentCandles[key] = {
          symbol: candle.symbol,
          timeframe: candle.timeframe,
          timestamp: new Date(newStartMs).toISOString(),
          open: candle.close,
          high: candle.close,
          low: candle.close,
          close: candle.close,
          volume: 0 // Zero volume filler
        };
      }
    }
  }

  processTick(tick) {
    // tick: { symbol, price, timestamp, time }
    const date = new Date(tick.timestamp || tick.time);
    const tickTimeMs = date.getTime();

    for (const [tf, minutes] of Object.entries(TF_MINUTES)) {
      const msPerTf = minutes * 60 * 1000;
      // Calculate the start time of the current timeframe block
      const candleStartMs = Math.floor(tickTimeMs / msPerTf) * msPerTf;
      const key = `${tick.symbol}_${tf}`;

      const current = this.currentCandles[key];

      if (!current) {
        // Init new candle
        this.currentCandles[key] = {
          symbol: tick.symbol,
          timeframe: tf,
          timestamp: new Date(candleStartMs).toISOString(),
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: 1
        };
      } else {
        const currentStartMs = new Date(current.timestamp).getTime();
        
        if (candleStartMs > currentStartMs) {
          // Timeframe crossed, close the previous candle and save
          this.closeCandle(current);

          // Init new candle for this tick
          this.currentCandles[key] = {
            symbol: tick.symbol,
            timeframe: tf,
            timestamp: new Date(candleStartMs).toISOString(),
            open: tick.price,
            high: tick.price,
            low: tick.price,
            close: tick.price,
            volume: 1
          };
        } else {
          // Update current candle
          current.high = Math.max(current.high, tick.price);
          current.low = Math.min(current.low, tick.price);
          current.close = tick.price;
          current.volume += 1;
        }
      }
    }
  }

  async closeCandle(candle) {
    try {
      await db.query(`
        INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (symbol, timeframe, timestamp) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume
      `, [
        candle.symbol,
        candle.timeframe,
        candle.timestamp,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      ]);

      if (this.engine) {
        await this.engine.recompute(candle.symbol, candle.timeframe);
      }
    } catch (err) {
      console.error(`Error closing candle ${candle.symbol} ${candle.timeframe}:`, err.message);
    }
  }
}

module.exports = CandleBuilder;
