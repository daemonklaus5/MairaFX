const db = require('../db');
require('dotenv').config();

const API_KEY = process.env.OANDA_API_KEY;
const BASE_URL = process.env.OANDA_BASE_URL || 'https://api-fxpractice.oanda.com';

const tfMapToOanda = {
  '15m': 'M15',
  '1H': 'H1',
  '4H': 'H4',
  '1D': 'D'
};

const tfMapFromOanda = {
  'M15': '15m',
  'H1': '1H',
  'H4': '4H',
  'D': '1D'
};

const PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF'];
const TIMEFRAMES = ['1H', '4H', '15m'];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function insertCandles(symbol, internalTf, candles) {
  if (!candles || candles.length === 0) return 0;
  
  const placeholders = [];
  const values = [];
  let i = 1;

  for (const c of candles) {
    if (!c.complete) continue;
    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    values.push(
      symbol,
      internalTf,
      c.time,
      parseFloat(c.bid.o),
      parseFloat(c.bid.h),
      parseFloat(c.bid.l),
      parseFloat(c.bid.c),
      c.volume
    );
  }

  if (placeholders.length === 0) return 0;

  // We use DO NOTHING here to silently skip duplicates when overlapping
  const query = `
    INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING
  `;
  
  const res = await db.query(query, values);
  return res.rowCount || 0;
}

// 1. One-Time Backfill Script
async function runHistoricalBackfill(pairs = PAIRS, timeframes = TIMEFRAMES) {
  console.log('[DataPipeline] Starting massive historical backfill...');
  // 3 years cutoff
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 3);
  const cutoffTime = cutoffDate.getTime();

  for (const pair of pairs) {
    for (const tf of timeframes) {
      const oandaTf = tfMapToOanda[tf];
      let toParam = new Date().toISOString();
      let totalInserted = 0;
      let keepFetching = true;

      console.log(`[DataPipeline] Backfilling ${pair} ${tf}...`);

      while (keepFetching) {
        try {
          const url = `${BASE_URL}/v3/instruments/${pair}/candles?granularity=${oandaTf}&count=5000&price=B&to=${encodeURIComponent(toParam)}`;
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Accept-Datetime-Format': 'RFC3339'
            }
          });

          if (!response.ok) {
            console.error(`[DataPipeline] OANDA API Error on ${pair} ${tf}: ${response.status} ${response.statusText}`);
            break;
          }

          const data = await response.json();
          if (!data.candles || data.candles.length === 0) {
            break; // No more data
          }

          const inserted = await insertCandles(pair, tf, data.candles);
          totalInserted += inserted;

          // Update 'toParam' to the timestamp of the earliest candle in this batch
          const earliestCandleTime = new Date(data.candles[0].time);
          toParam = earliestCandleTime.toISOString();

          // Stop if we hit our cutoff
          if (earliestCandleTime.getTime() < cutoffTime) {
            console.log(`[DataPipeline] Reached 3-year cutoff for ${pair} ${tf}.`);
            keepFetching = false;
          } else if (data.candles.length < 5000) {
            // If it returns less than requested count, we've likely hit the absolute limit
            console.log(`[DataPipeline] Exhausted OANDA history for ${pair} ${tf}.`);
            keepFetching = false;
          }

          // Respect rate limits (practice accounts especially)
          await sleep(1000); 

        } catch (err) {
          console.error(`[DataPipeline] Fetch failed for ${pair} ${tf}:`, err.message);
          break;
        }
      }
      console.log(`[DataPipeline] Finished backfilling ${pair} ${tf}. Total new inserted: ${totalInserted}`);
    }
  }
}

// 2. Daily Update Job
async function runDailyUpdate() {
  console.log('[DataPipeline] Running daily candle update job...');
  
  // Find all unique pair/timeframe combos currently in the DB
  const groupsRes = await db.query(`SELECT DISTINCT symbol, timeframe FROM candles`);
  const groups = groupsRes.rows;

  for (const { symbol, timeframe } of groups) {
    const oandaTf = tfMapToOanda[timeframe];
    if (!oandaTf) continue;

    // Get the latest timestamp for this group
    const maxRes = await db.query(`SELECT MAX(timestamp) as latest FROM candles WHERE symbol = $1 AND timeframe = $2`, [symbol, timeframe]);
    const latestTime = maxRes.rows[0]?.latest;

    if (!latestTime) continue;

    // We pull from 2 days BEFORE the latest time to ensure overlap/gap filling
    const fromDate = new Date(latestTime);
    fromDate.setDate(fromDate.getDate() - 2);
    const fromIso = fromDate.toISOString();

    try {
      const url = `${BASE_URL}/v3/instruments/${symbol}/candles?granularity=${oandaTf}&from=${encodeURIComponent(fromIso)}&price=B`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept-Datetime-Format': 'RFC3339'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const inserted = await insertCandles(symbol, timeframe, data.candles);
        
        if (data.candles && data.candles.length === 0) {
          console.warn(`[DataPipeline] ZERO candles returned for ${symbol} ${timeframe} since ${fromIso}`);
        } else if (inserted > 0) {
          console.log(`[DataPipeline] Daily update: Inserted ${inserted} new candles for ${symbol} ${timeframe}`);
        }
      }
    } catch (e) {
      console.error(`[DataPipeline] Daily update failed for ${symbol} ${timeframe}:`, e.message);
    }
    
    await sleep(500); // Be polite
  }

  // After updates, run gap detection and retention
  await detectAllGaps();
  await enforceRetention();
}

// 3. Gap Detection
async function detectGaps(symbol, timeframe) {
  // Define expected max gap size based on timeframe (excluding weekends)
  let expectedMaxGapMs = 0;
  if (timeframe === '15m') expectedMaxGapMs = 15 * 60 * 1000 * 2; // 30m max acceptable (some illiquid periods)
  if (timeframe === '1H') expectedMaxGapMs = 60 * 60 * 1000 * 2; // 2h max acceptable
  if (timeframe === '4H') expectedMaxGapMs = 4 * 60 * 60 * 1000 * 2; // 8h max acceptable
  if (timeframe === '1D') expectedMaxGapMs = 24 * 60 * 60 * 1000 * 2;

  if (expectedMaxGapMs === 0) return [];

  const gaps = [];
  const res = await db.query(
    `SELECT timestamp FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY timestamp ASC`,
    [symbol, timeframe]
  );
  const rows = res.rows;

  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i-1].timestamp);
    const curr = new Date(rows[i].timestamp);
    const diffMs = curr.getTime() - prev.getTime();

    if (diffMs > expectedMaxGapMs) {
      // Check if it's a weekend gap (Friday evening to Sunday evening)
      // Fri = 5, Sat = 6, Sun = 0
      const isWeekend = (prev.getUTCDay() === 5 || prev.getUTCDay() === 6) && (curr.getUTCDay() === 0 || curr.getUTCDay() === 1);
      
      if (!isWeekend) {
        gaps.push({ from: prev.toISOString(), to: curr.toISOString(), diffHours: (diffMs / 3600000).toFixed(1) });
      }
    }
  }
  
  if (gaps.length > 0) {
    console.warn(`[DataPipeline] Gap Alert for ${symbol} ${timeframe}: ${gaps.length} non-weekend gaps detected.`);
  }
  return gaps;
}

async function detectAllGaps() {
  const groupsRes = await db.query(`SELECT DISTINCT symbol, timeframe FROM candles`);
  const allGaps = {};
  for (const { symbol, timeframe } of groupsRes.rows) {
    const gaps = await detectGaps(symbol, timeframe);
    if (gaps.length > 0) {
      allGaps[`${symbol}_${timeframe}`] = gaps;
    }
  }
  return allGaps;
}

// 4. Retention Policy
async function enforceRetention() {
  console.log('[DataPipeline] Enforcing retention policy...');
  // 12 months for small timeframes
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  const cutoffIso = cutoffDate.toISOString();

  // Only prune M15 and smaller (we want to keep H1, H4, D indefinitely)
  try {
    const res = await db.query(
      `DELETE FROM candles WHERE timeframe = '15m' AND timestamp < $1`,
      [cutoffIso]
    );
    if (res.rowCount > 0) {
      console.log(`[DataPipeline] Pruned ${res.rowCount} old 15m candles to save storage.`);
    }
  } catch (err) {
    console.error(`[DataPipeline] Failed to enforce retention:`, err.message);
  }
}

// Helper for UI Status
async function getStatus() {
  const counts = await db.query(`
    SELECT symbol, timeframe, COUNT(*) as total_rows, MIN(timestamp) as earliest, MAX(timestamp) as latest
    FROM candles
    GROUP BY symbol, timeframe
    ORDER BY symbol, timeframe
  `);
  
  // Doing a full gap detect on every status request is too slow for 100k+ rows.
  // We'll just return the counts, the daily cron handles gap logging.
  return counts.rows;
}

module.exports = {
  runHistoricalBackfill,
  runDailyUpdate,
  detectAllGaps,
  enforceRetention,
  getStatus
};
