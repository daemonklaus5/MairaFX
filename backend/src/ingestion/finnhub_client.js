const axios = require('axios');
const WebSocket = require('ws');
const db = require('../db');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

class FinnhubClient {
  constructor(wsManager, candleBuilder, alertManager) {
    this.wsManager = wsManager;
    this.candleBuilder = candleBuilder;
    this.alertManager = alertManager;
    this.apiKey = process.env.FINNHUB_API_KEY;
    this.wsUrl = `wss://ws.finnhub.io?token=${this.apiKey}`;
    
    // Internal symbols we care about
    this.internalPairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD'];
    
    // Map internal pairs to Finnhub symbols (e.g. OANDA:EUR_USD)
    this.finnhubPairs = this.internalPairs.map(p => `OANDA:${p}`);
    
    this.ws = null;
    this.reconnectTimeout = null;
  }

  async init() {
    if (!this.apiKey) {
      console.error('FINNHUB_API_KEY missing in .env. Data ingestion disabled.');
      return;
    }

    console.log('Initializing Finnhub client and backfilling data...');
    await this.backfillAll();
    this.connectWs();
  }

  async backfillAll() {
    // We map our timeframes to Yahoo Finance intervals
    const resolutionMap = {
      'M15': '15m',
      'H1': '60m',
      'D': '1d'
    };

    const to = new Date();
    // Yahoo allows up to 60 days for 15m/60m intervals
    const from = new Date(to.getTime() - (59 * 24 * 60 * 60 * 1000));

    for (const symbol of this.internalPairs) {
      // Map EUR_USD to EURUSD=X
      const yahooSym = symbol.replace('_', '') + '=X';
      
      for (const [tf, interval] of Object.entries(resolutionMap)) {
        try {
          const queryOptions = { period1: from, period2: to, interval: interval };
          const result = await yahooFinance.chart(yahooSym, queryOptions);
          
          if (result && result.quotes && result.quotes.length > 0) {
            const values = [];
            const placeholders = [];
            let i = 1;
            
            for (const q of result.quotes) {
              if (q.open === null || q.close === null) continue;
              
              const minutes = tf === '15m' || tf === 'M15' ? 15 : tf === '1H' || tf === 'H1' ? 60 : tf === '4H' || tf === 'H4' ? 240 : 1440;
              const msPerTf = minutes * 60 * 1000;
              const roundedTimeMs = Math.floor(new Date(q.date).getTime() / msPerTf) * msPerTf;
              
              const time = new Date(roundedTimeMs).toISOString();
              placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
              values.push(symbol, tf, time, q.open, q.high, q.low, q.close, q.volume || 0);
            }
            
            if (values.length > 0) {
              const query = `
                INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
                VALUES ${placeholders.join(', ')}
                ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING
              `;
              await db.query(query, values);
              console.log(`Backfilled ${result.quotes.length} candles for ${symbol} ${tf}`);
              
              if (this.candleBuilder && this.candleBuilder.engine) {
                this.candleBuilder.engine.recompute(symbol, tf);
              }
            }
          }
        } catch (e) {
          console.error(`Failed to backfill ${symbol} ${tf}:`, e.message);
        }
      }
    }
  }

  connectWs() {
    if (this.ws) {
      this.ws.terminate();
    }

    console.log('Connecting to Finnhub WebSocket stream...');
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('Connected to Finnhub WebSocket.');
      // Subscribe to all symbols
      for (const sym of this.finnhubPairs) {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      }
    });

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'trade' && msg.data) {
          for (const trade of msg.data) {
            // trade format: { p: price, s: symbol, t: timestamp, v: volume }
            // e.g. s = 'OANDA:EUR_USD'
            const internalSym = trade.s.replace('OANDA:', '');
            
            if (this.internalPairs.includes(internalSym)) {
              const tick = {
                symbol: internalSym,
                price: trade.p,
                time: new Date(trade.t).toISOString(),
                timestamp: new Date(trade.t).toISOString()
              };

              if (this.wsManager) {
                this.wsManager.broadcast({ type: 'TICK', data: tick });
              }
              
              if (this.candleBuilder) {
                this.candleBuilder.processTick(tick);
              }

              if (this.alertManager) {
                this.alertManager.checkPriceAlerts(tick);
              }
            }
          }
        } else if (msg.type === 'ping') {
           // Finnhub sends pings, no action needed
        }
      } catch (err) {
        // parsing error or format error
      }
    });

    this.ws.on('close', () => {
      console.log('Finnhub WebSocket closed. Reconnecting in 5s...');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('Finnhub WebSocket error:', err.message);
      this.ws.terminate();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connectWs();
    }, 5000);
  }
}

module.exports = FinnhubClient;
