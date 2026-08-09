const express = require('express');
const db = require('../db');

module.exports = function(engine) {
  const router = express.Router();

  // 1. Retail Sentiment (Mocked for now)
  router.get('/sentiment', (req, res) => {
    const pairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CHF', 'USD_CAD', 'NZD_USD'];
    const minute = new Date().getMinutes();
    
    const results = pairs.map(symbol => {
      const base = (symbol.charCodeAt(0) + symbol.charCodeAt(1)) % 100;
      let longPercent = (base + minute) % 100;
      
      if (longPercent < 20) longPercent += 20;
      if (longPercent > 80) longPercent -= 20;
      
      return {
        symbol,
        longPercent: Math.round(longPercent),
        shortPercent: Math.round(100 - longPercent)
      };
    });

    res.json({
      data: results,
      source: "Mock Broker API (Placeholder)"
    });
  });

  // 2. Currency Strength Heatmap
  router.get('/strength', async (req, res) => {
    try {
      // Get the last 24h performance of our internal pairs
      const { rows } = await db.query(`
        WITH RankedCandles AS (
          SELECT symbol, close, timestamp,
                 ROW_NUMBER() OVER(PARTITION BY symbol ORDER BY timestamp DESC) as rn
          FROM candles
          WHERE timeframe = 'H1'
        ),
        CurrentPrices AS (
          SELECT symbol, close as current_price FROM RankedCandles WHERE rn = 1
        ),
        PastPrices AS (
          SELECT symbol, close as past_price FROM RankedCandles WHERE rn = 24
        )
        SELECT c.symbol, c.current_price, p.past_price, 
               ((c.current_price - p.past_price) / p.past_price) * 100 as pct_change
        FROM CurrentPrices c
        JOIN PastPrices p ON c.symbol = p.symbol
      `);

      // Calculate individual currency strengths (Base vs Quote)
      const strengths = { USD: 0, EUR: 0, GBP: 0, JPY: 0, AUD: 0, CAD: 0, CHF: 0, NZD: 0 };
      
      rows.forEach(row => {
        const [base, quote] = row.symbol.split('_');
        const change = parseFloat(row.pct_change);
        
        if (strengths[base] !== undefined) strengths[base] += change;
        if (strengths[quote] !== undefined) strengths[quote] -= change;
      });

      // Normalize and sort
      const sortedStrengths = Object.entries(strengths)
        .map(([currency, score]) => ({ currency, score: score * 10 })) // Multiply for better visual spread
        .sort((a, b) => b.score - a.score);

      res.json(sortedStrengths);
    } catch (e) {
      console.error('Strength calculation error:', e);
      // Fallback if DB is empty or still backfilling
      res.json([
        { currency: 'USD', score: 2.5 },
        { currency: 'EUR', score: 1.2 },
        { currency: 'GBP', score: -0.5 },
        { currency: 'JPY', score: -3.2 }
      ]);
    }
  });

  // 3. Volatility Monitor
  router.get('/volatility/:symbol/:timeframe', (req, res) => {
    const { symbol, timeframe } = req.params;
    const latest = engine.getLatest(symbol, timeframe);
    
    if (!latest || !latest.atr) {
      return res.json({ currentAtr: 0, avgAtr: 0, state: 'Unknown' });
    }

    // Since we don't store historical ATR arrays in memory easily accessible here,
    // we will simulate the 20-period average ATR based on the current ATR for demonstration.
    // In a full production env, we'd query the DB for the last 20 ATRs.
    
    // For now, let's use the current ATR and create a slight oscillation to demonstrate UI
    const currentAtr = parseFloat(latest.atr);
    
    // Deterministic fake historical avg ATR based on minute to show both Expansion/Compression
    const minute = new Date().getMinutes();
    const factor = 0.8 + ((minute % 10) * 0.05); // oscillates between 0.8 and 1.25
    const avgAtr = currentAtr * factor;
    
    let state = 'Normal';
    if (currentAtr > avgAtr * 1.2) state = 'Expansion (High Volatility)';
    else if (currentAtr < avgAtr * 0.8) state = 'Compression (Building)';
    else state = 'Normal / Ranging';

    res.json({
      currentAtr,
      avgAtr,
      state
    });
  });

  // 4. Economic Calendar
  router.get('/calendar', async (req, res) => {
    // Ideally we hit Finnhub here: https://finnhub.io/api/v1/calendar/economic?token=XYZ
    // But since calendar data is often restricted or spotty on free tiers,
    // we'll return a robust mock of today's high-impact events for demonstration.
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Generate timestamps for today (UTC)
    const time1 = new Date(`${todayStr}T13:30:00Z`).getTime();
    const time2 = new Date(`${todayStr}T14:00:00Z`).getTime();
    const time3 = new Date(`${todayStr}T18:00:00Z`).getTime();

    const mockEvents = [
      {
        id: 1,
        time: time1,
        country: 'US',
        event: 'Core CPI m/m',
        impact: 'High',
        previous: '0.2%',
        estimate: '0.3%',
        actual: now.getTime() > time1 ? '0.4%' : null
      },
      {
        id: 2,
        time: time2,
        country: 'US',
        event: 'ISM Manufacturing PMI',
        impact: 'High',
        previous: '49.1',
        estimate: '49.5',
        actual: now.getTime() > time2 ? '48.9' : null
      },
      {
        id: 3,
        time: time3,
        country: 'US',
        event: 'FOMC Meeting Minutes',
        impact: 'High',
        previous: '-',
        estimate: '-',
        actual: null
      }
    ];

    res.json(mockEvents);
  });

  return router;
};
