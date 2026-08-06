const https = require('https');
const db = require('../db');
require('dotenv').config();

const API_KEY = process.env.OANDA_API_KEY;
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID;
const BASE_URL = process.env.OANDA_BASE_URL || 'https://api-fxpractice.oanda.com';
const STREAM_URL = process.env.OANDA_STREAM_URL || 'https://stream-fxpractice.oanda.com';
const PAIRS = (process.env.FOREX_PAIRS || 'EUR_USD,GBP_USD,USD_JPY,AUD_USD').split(',');
const TIMEFRAMES = ['M15', 'H1', 'H4', 'D']; 

// Map OANDA timeframes to our internal ones
const tfMap = {
  'M15': '15m',
  'H1': '1H',
  'H4': '4H',
  'D': '1D'
};

class OandaClient {
  constructor(wsManager, candleBuilder, alertManager) {
    this.wsManager = wsManager;
    this.candleBuilder = candleBuilder;
    this.alertManager = alertManager;
    this.reconnectDelay = 1000;
  }

  async init() {
    if (!API_KEY || !ACCOUNT_ID) {
      console.warn('OANDA_API_KEY or OANDA_ACCOUNT_ID missing. Data ingestion disabled.');
      return;
    }
    console.log(`Initializing OANDA client for pairs: ${PAIRS.join(', ')}`);
    
    // Backfill historical data
    for (const pair of PAIRS) {
      for (const tf of TIMEFRAMES) {
        await this.backfill(pair, tf, 500);
      }
    }

    // Seed the CandleBuilder with current incomplete candles
    await this.seedCurrentCandles();

    // Start streaming
    this.startStreaming();
  }

  async seedCurrentCandles() {
    if (!this.candleBuilder) return;
    for (const pair of PAIRS) {
      for (const tf of TIMEFRAMES) {
        try {
          const url = `${BASE_URL}/v3/instruments/${pair}/candles?granularity=${tf}&count=1&price=B&includeFirst=true`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Accept-Datetime-Format': 'RFC3339'
            }
          });
          if (!response.ok) continue;
          const data = await response.json();
          if (!data.candles || data.candles.length === 0) continue;
          
          // Get the last candle (which should be the current incomplete one)
          const candle = data.candles[data.candles.length - 1];
          if (candle.complete) continue; // Only seed incomplete candles
          
          const internalTf = tfMap[tf];
          const key = `${pair}_${internalTf}`;
          this.candleBuilder.currentCandles[key] = {
            symbol: pair,
            timeframe: internalTf,
            timestamp: candle.time,
            open: parseFloat(candle.bid.o),
            high: parseFloat(candle.bid.h),
            low: parseFloat(candle.bid.l),
            close: parseFloat(candle.bid.c),
            volume: candle.volume || 1
          };
          console.log(`Seeded live candle for ${pair} ${internalTf}`);
        } catch (err) {
          // Non-critical, live ticks will create the candle anyway
        }
      }
    }
  }

  async backfill(symbol, tf, count = 500) {
    try {
      const url = `${BASE_URL}/v3/instruments/${symbol}/candles?granularity=${tf}&count=${count}&price=B`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept-Datetime-Format': 'RFC3339'
        }
      });
      
      if (!response.ok) {
        throw new Error(`OANDA REST error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.candles) return;

      const internalTf = tfMap[tf];
      const placeholders = [];
      const values = [];
      let i = 1;

      for (const candle of data.candles) {
        if (!candle.complete) continue;
        
        placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
        values.push(
          symbol,
          internalTf,
          candle.time,
          parseFloat(candle.bid.o),
          parseFloat(candle.bid.h),
          parseFloat(candle.bid.l),
          parseFloat(candle.bid.c),
          candle.volume
        );
      }

      if (placeholders.length > 0) {
        const query = `
          INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (symbol, timeframe, timestamp) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume
        `;
        await db.query(query, values);
      }
      console.log(`Backfilled ${data.candles.length} candles for ${symbol} ${internalTf}`);
    } catch (err) {
      console.error(`Failed to backfill ${symbol} ${tf}:`, err.message);
    }
  }

  startStreaming() {
    console.log('Connecting to OANDA stream...');
    const url = `${STREAM_URL}/v3/accounts/${ACCOUNT_ID}/pricing/stream?instruments=${PAIRS.join('%2C')}`;
    
    const options = {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`Stream connection failed: ${res.statusCode} ${res.statusMessage}`);
        res.resume();
        this.scheduleReconnect();
        return;
      }

      console.log('OANDA stream connected');
      this.reconnectDelay = 1000; // Reset backoff

      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'PRICE') {
              this.handlePriceTick(data);
            }
          } catch (e) {
            // Partial chunk or parse error, ignore
          }
        }
      });

      res.on('end', () => {
        console.log('OANDA stream ended');
        this.scheduleReconnect();
      });
    });

    req.on('error', (e) => {
      console.error(`OANDA stream error: ${e.message}`);
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    console.log(`Reconnecting to OANDA in ${this.reconnectDelay}ms...`);
    setTimeout(() => this.startStreaming(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000); // Max 60s
  }

  handlePriceTick(data) {
    // data.bids[0].price, data.asks[0].price
    if (!data.bids || !data.asks || !data.bids.length || !data.asks.length) return;
    
    const bid = parseFloat(data.bids[0].price);
    const ask = parseFloat(data.asks[0].price);
    const mid = (bid + ask) / 2;

    const tick = {
      type: 'TICK',
      symbol: data.instrument,
      price: bid,
      timestamp: data.time
    };
    
    if (this.wsManager) {
      this.wsManager.broadcast(tick);
    }
    
    if (this.candleBuilder) {
      this.candleBuilder.processTick(tick);
    }

    if (this.alertManager) {
      this.alertManager.checkPriceAlerts(tick);
    }
  }
}

module.exports = OandaClient;
