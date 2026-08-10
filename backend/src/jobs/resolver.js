const db = require('../db');
require('dotenv').config();

const API_KEY = process.env.OANDA_API_KEY;
const BASE_URL = process.env.OANDA_BASE_URL || 'https://api-fxpractice.oanda.com';

async function resolvePendingVerdicts() {
  console.log('[Resolver] Starting batched outcome resolver...');
  let totalApiCalls = 0;

  try {
    // Group all PENDING verdicts by pair and timeframe
    const pendingRes = await db.query(`
      SELECT pair, timeframe, MIN(timestamp) as earliest_time
      FROM ai_verdicts
      WHERE outcome = 'PENDING'
      GROUP BY pair, timeframe
    `);

    const groups = pendingRes.rows;
    if (groups.length === 0) {
      console.log('[Resolver] No pending verdicts to resolve.');
      return;
    }

    for (const group of groups) {
      const { pair, timeframe, earliest_time } = group;
      const oandaTf = timeframe;

      // Fetch all verdicts for this group
      const verdictsRes = await db.query(
        `SELECT * FROM ai_verdicts WHERE pair = $1 AND timeframe = $2 AND outcome = 'PENDING' ORDER BY timestamp ASC`,
        [pair, timeframe]
      );
      const verdicts = verdictsRes.rows;

      // Make exactly ONE OANDA API call for this group
      const fromTime = new Date(earliest_time).toISOString();
      // OANDA needs RFC3339 format, ISOString usually works but we can encode it
      const url = `${BASE_URL}/v3/instruments/${pair}/candles?granularity=${oandaTf}&from=${encodeURIComponent(fromTime)}&price=B`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept-Datetime-Format': 'RFC3339'
        }
      });
      totalApiCalls++;

      if (!response.ok) {
        console.error(`[Resolver] Failed to fetch candles for ${pair}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (!data.candles || data.candles.length === 0) continue;

      const candles = data.candles;

      // Resolve each verdict against this single batch of candles
      for (const verdict of verdicts) {
        let outcome = 'PENDING';
        let outcome_price = null;
        let outcome_timestamp = null;

        const vTime = new Date(verdict.timestamp).getTime();
        // Filter candles that occurred AFTER the verdict
        const subsequentCandles = candles.filter(c => new Date(c.time).getTime() > vTime);
        
        if (subsequentCandles.length === 0) continue;

        if (verdict.verdict === 'LONG' || verdict.verdict === 'SHORT') {
          const target = parseFloat(verdict.target_price);
          const inval = parseFloat(verdict.invalidation_price);
          
          if (!target || !inval) {
            outcome = 'TIMEOUT'; // Cannot resolve without targets
          } else {
            for (const c of subsequentCandles) {
              const h = parseFloat(c.bid.h);
              const l = parseFloat(c.bid.l);
              
              if (verdict.verdict === 'LONG') {
                if (l <= inval) {
                  outcome = 'LOSS'; outcome_price = inval; outcome_timestamp = c.time; break;
                } else if (h >= target) {
                  outcome = 'WIN'; outcome_price = target; outcome_timestamp = c.time; break;
                }
              } else {
                if (h >= inval) {
                  outcome = 'LOSS'; outcome_price = inval; outcome_timestamp = c.time; break;
                } else if (l <= target) {
                  outcome = 'WIN'; outcome_price = target; outcome_timestamp = c.time; break;
                }
              }
            }

            // Timeout check: 48 candles
            if (outcome === 'PENDING' && subsequentCandles.length >= 48) {
              outcome = 'TIMEOUT';
              outcome_price = parseFloat(subsequentCandles[47].bid.c);
              outcome_timestamp = subsequentCandles[47].time;
            }
          }
        } else if (verdict.verdict === 'WAIT') {
          // Check for missed move after 8 hours (approx 32 M15 candles)
          // Default pip threshold for missed move: 30 pips
          const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;
          const entry = parseFloat(verdict.entry_price) || (subsequentCandles[0] ? parseFloat(subsequentCandles[0].bid.o) : null);
          
          if (entry && subsequentCandles.length >= 32) {
            let maxMove = 0;
            const candlesToCheck = subsequentCandles.slice(0, 32); // Check first 8 hours
            for (const c of candlesToCheck) {
              const h = parseFloat(c.bid.h);
              const l = parseFloat(c.bid.l);
              maxMove = Math.max(maxMove, Math.abs(h - entry), Math.abs(entry - l));
            }
            
            const pipsMoved = maxMove / pipSize;
            if (pipsMoved > 30) {
              outcome = 'MISSED_WAIT';
            } else {
              outcome = 'CORRECT_WAIT';
            }
            outcome_price = entry;
            outcome_timestamp = candlesToCheck[candlesToCheck.length - 1].time;
          }
        }

        if (outcome !== 'PENDING') {
          let realized_r = null;
          if (outcome !== 'CORRECT_WAIT' && outcome !== 'MISSED_WAIT') {
            const risk = Math.abs(parseFloat(verdict.entry_price) - parseFloat(verdict.invalidation_price));
            let reward = 0;
            if (verdict.verdict === 'LONG') {
              reward = outcome_price - parseFloat(verdict.entry_price);
            } else if (verdict.verdict === 'SHORT') {
              reward = parseFloat(verdict.entry_price) - outcome_price;
            }
            if (risk > 0) realized_r = reward / risk;
            else realized_r = 0;
          }

          await db.query(
            `UPDATE ai_verdicts SET outcome = $1, outcome_price = $2, outcome_timestamp = $3, realized_r = $4 WHERE verdict_id = $5`,
            [outcome, outcome_price, outcome_timestamp, realized_r, verdict.verdict_id]
          );
        }
      }
    }
    
    console.log(`[Resolver] Finished. Made ${totalApiCalls} batched API calls.`);
  } catch (err) {
    console.error('[Resolver] Error resolving verdicts:', err);
  }
}

module.exports = resolvePendingVerdicts;
