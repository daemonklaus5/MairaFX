const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const { EMA, RSI, ADX } = require('technicalindicators');

const activeRuns = new Map();

async function runBacktest(runId, pairs, timeframe, detector, synth, useAi = false) {
  try {
    const runInfo = { status: 'RUNNING', total: 0, current: 0, pairs: pairs.length };
    activeRuns.set(runId, runInfo);

    console.log(`[Backtester] Starting run ${runId} for ${pairs.join(', ')} on ${timeframe}`);

    for (const pair of pairs) {
      console.log(`[Backtester] Loading candles for ${pair}...`);
      const candlesRes = await db.query(
        `SELECT timestamp, open, high, low, close, volume FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY timestamp ASC`,
        [pair, timeframe]
      );
      const candles = candlesRes.rows;
      if (candles.length < 500) {
        console.warn(`[Backtester] Not enough candles for ${pair}. Skipping.`);
        continue;
      }

      runInfo.total += candles.length - 500;
      
      const pipSize = pair.includes('JPY') ? 0.01 : 0.0001;
      const spreadCost = 1.5 * pipSize; // simulated 1.5 pip spread
      const TIMEOUT_BARS = 200; // max bars to wait before TIMEOUT

      const pendingVerdicts = [];
      let aiCallsCount = 0;

      for (let i = 500; i < candles.length; i++) {
        runInfo.current++;
        
        // Every 500 bars, resolve pending verdicts to keep memory low
        if (i % 500 === 0 && pendingVerdicts.length > 0) {
          await resolvePending(pendingVerdicts, candles, i, spreadCost);
        }

        const slice = candles.slice(i - 500, i + 1);
        const currentCandle = slice[slice.length - 1];
        const currentPrice = parseFloat(currentCandle.close);

        // 1. Calculate indicators for the slice
        const closes = slice.map(c => parseFloat(c.close));
        const highs = slice.map(c => parseFloat(c.high));
        const lows = slice.map(c => parseFloat(c.low));

        const ema9 = EMA.calculate({ period: 9, values: closes });
        const ema21 = EMA.calculate({ period: 21, values: closes });
        const ema50 = EMA.calculate({ period: 50, values: closes });
        const ema200 = EMA.calculate({ period: 200, values: closes });
        const rsi14 = RSI.calculate({ period: 14, values: closes });
        const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });

        const customIndicators = {
          ema9: ema9.length ? ema9[ema9.length - 1] : null,
          ema21: ema21.length ? ema21[ema21.length - 1] : null,
          ema50: ema50.length ? ema50[ema50.length - 1] : null,
          ema200: ema200.length ? ema200[ema200.length - 1] : null,
          rsi14: rsi14.length ? rsi14[rsi14.length - 1] : null,
          adx: adx.length && adx[adx.length - 1].adx ? adx[adx.length - 1].adx : null
        };

        // 2. Run Detector
        const zones = await detector.detect(pair, timeframe, slice);
        if (!zones) continue;

        // 3. Run Synthesis
        const snapshot = await synth.evaluateRuleBased(pair, timeframe, currentPrice, zones, customIndicators);
        
        if (snapshot.verdict !== 'WAIT') {
          // Calculate valid entry/target/invalidation floats
          const spreadCost = (pair.includes('JPY') ? 1.5 : 1.5) * pipSize;
          const slippage = 0.5 * pipSize;
          const totalCost = spreadCost + slippage;
          
          let entry = snapshot.mech_entry;
          if (snapshot.verdict === 'LONG') {
            entry = entry + totalCost;
          } else if (snapshot.verdict === 'SHORT') {
            entry = entry - totalCost;
          }
          
          let target = snapshot.mech_target;
          let invalidation = snapshot.mech_invalidation;

          if (target && invalidation) {
            let factors = Object.values(snapshot.lanes).flatMap(l => l.basis.split(', '));
            if (snapshot.fallback_target_used) factors.push('Fallback Target');

            // Push to pending queue
            pendingVerdicts.push({
              verdict_id: uuidv4(),
              pair,
              timeframe,
              timestamp: currentCandle.timestamp,
              verdict: snapshot.verdict,
              conviction_score: snapshot.confidence === 'high' ? 85 : 60,
              entry_price: entry,
              target_price: target,
              invalidation_price: invalidation,
              confluence_factors: JSON.stringify(factors),
              full_json_snapshot: JSON.stringify({}),
              full_ai_output: 'Mechanical backtest execution',
              outcome: 'PENDING',
              source: 'backtest',
              run_id: runId,
              startIndex: i
            });

            if (useAi && aiCallsCount < 200) {
              aiCallsCount++;
              let mtfZones = { 'D': null, 'H4': null };
              
              if (timeframe !== 'D') {
                const dRes = await db.query(`SELECT timestamp, open, high, low, close, volume FROM candles WHERE symbol = $1 AND timeframe = 'D' AND timestamp <= $2 ORDER BY timestamp DESC LIMIT 100`, [pair, currentCandle.timestamp]);
                if (dRes.rows.length > 50) mtfZones['D'] = await detector.detect(pair, 'D', dRes.rows.reverse());
              }
              if (timeframe !== 'H4' && timeframe !== 'D') {
                const h4Res = await db.query(`SELECT timestamp, open, high, low, close, volume FROM candles WHERE symbol = $1 AND timeframe = 'H4' AND timestamp <= $2 ORDER BY timestamp DESC LIMIT 100`, [pair, currentCandle.timestamp]);
                if (h4Res.rows.length > 50) mtfZones['H4'] = await detector.detect(pair, 'H4', h4Res.rows.reverse());
              }

              const aiResult = await synth.getAiNarrative(pair, timeframe, snapshot, zones, mtfZones, []);
              
              if (aiResult.verdict !== 'WAIT') {
                pendingVerdicts.push({
                  verdict_id: uuidv4(),
                  pair, timeframe, timestamp: currentCandle.timestamp,
                  verdict: aiResult.verdict,
                  conviction_score: aiResult.conviction_score || 0,
                  entry_price: entry, target_price: target, invalidation_price: invalidation,
                  confluence_factors: JSON.stringify([]),
                  full_json_snapshot: JSON.stringify(aiResult),
                  full_ai_output: 'Gemini Backtest Confirmed',
                  outcome: 'PENDING',
                  source: 'backtest_ai',
                  run_id: runId,
                  startIndex: i
                });
              } else {
                pendingVerdicts.push({
                  verdict_id: uuidv4(),
                  pair, timeframe, timestamp: currentCandle.timestamp,
                  verdict: 'WAIT',
                  conviction_score: aiResult.conviction_score || 0,
                  entry_price: entry, target_price: target, invalidation_price: invalidation,
                  confluence_factors: JSON.stringify([]),
                  full_json_snapshot: JSON.stringify(aiResult),
                  full_ai_output: 'Gemini Backtest Downgraded',
                  outcome: 'CORRECT_WAIT',
                  outcome_price: entry,
                  outcome_timestamp: currentCandle.timestamp,
                  source: 'backtest_ai_rejected',
                  run_id: runId,
                  startIndex: i
                });
              }
            }
          }
        }
      }

      // Final resolve for this pair
      await resolvePending(pendingVerdicts, candles, candles.length, spreadCost);
    }

    runInfo.status = 'COMPLETED';
    console.log(`[Backtester] Run ${runId} COMPLETED.`);
  } catch (err) {
    console.error(`[Backtester] Error in run ${runId}:`, err);
    activeRuns.set(runId, { status: 'FAILED', error: err.message });
  }
}

async function resolvePending(verdicts, candles, currentIndex, spreadCost) {
  if (verdicts.length === 0) return;

  const toInsert = [];

  for (let i = verdicts.length - 1; i >= 0; i--) {
    const v = verdicts[i];
    let resolved = false;

    if (v.outcome !== 'PENDING') {
      toInsert.push(v);
      verdicts.splice(i, 1);
      continue;
    }

    // Check future candles
    for (let j = v.startIndex + 1; j < Math.min(candles.length, v.startIndex + 200); j++) {
      if (j > currentIndex) break; // haven't simulated this far yet

      const c = candles[j];
      const high = parseFloat(c.high);
      const low = parseFloat(c.low);
      const close = parseFloat(c.close);
      
      const pipSize = v.pair.includes('JPY') ? 0.01 : 0.0001;
      const slippage = 0.5 * pipSize;

      if (v.verdict === 'LONG') {
        if (low <= v.invalidation_price) {
          v.outcome = 'LOSS';
          v.outcome_price = v.invalidation_price - slippage;
          v.outcome_timestamp = c.timestamp;
          resolved = true;
          break;
        } else if (high >= v.target_price) {
          v.outcome = 'WIN';
          v.outcome_price = v.target_price - spreadCost;
          v.outcome_timestamp = c.timestamp;
          resolved = true;
          break;
        }
      } else if (v.verdict === 'SHORT') {
        if (high >= v.invalidation_price) {
          v.outcome = 'LOSS';
          v.outcome_price = v.invalidation_price + slippage;
          v.outcome_timestamp = c.timestamp;
          resolved = true;
          break;
        } else if (low <= v.target_price) {
          v.outcome = 'WIN';
          v.outcome_price = v.target_price + spreadCost;
          v.outcome_timestamp = c.timestamp;
          resolved = true;
          break;
        }
      }
    }

    if (resolved || currentIndex - v.startIndex >= 200) {
      if (!resolved) {
        v.outcome = 'TIMEOUT';
        v.outcome_price = parseFloat(candles[Math.min(candles.length - 1, v.startIndex + 200)].close);
        v.outcome_timestamp = candles[Math.min(candles.length - 1, v.startIndex + 200)].timestamp;
      }
      
      if (v.outcome !== 'CORRECT_WAIT' && v.outcome !== 'MISSED_WAIT') {
        const risk = Math.abs(v.entry_price - v.invalidation_price);
        let reward = 0;
        if (v.verdict === 'LONG') {
          reward = v.outcome_price - v.entry_price;
        } else if (v.verdict === 'SHORT') {
          reward = v.entry_price - v.outcome_price;
        }
        
        if (risk > 0) {
          v.realized_r = reward / risk;
        } else {
          v.realized_r = 0;
        }
      } else {
        v.realized_r = null;
      }
      
      toInsert.push(v);
      verdicts.splice(i, 1);
    }
  }

  // Bulk insert
  if (toInsert.length > 0) {
    const placeholders = [];
    const values = [];
    let idx = 1;

    for (const v of toInsert) {
      placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      values.push(
        v.verdict_id, v.timestamp, v.pair, v.timeframe, v.verdict, v.conviction_score,
        v.entry_price, v.invalidation_price, v.target_price, v.confluence_factors,
        v.full_json_snapshot, v.full_ai_output, v.outcome, v.outcome_price, v.outcome_timestamp,
        v.source, v.run_id, v.realized_r
      );
    }

    const query = `
      INSERT INTO ai_verdicts (
        verdict_id, timestamp, pair, timeframe, verdict, conviction_score,
        entry_price, invalidation_price, target_price, confluence_factors,
        full_json_snapshot, full_ai_output, outcome, outcome_price, outcome_timestamp,
        source, run_id, realized_r
      ) VALUES ${placeholders.join(', ')}
    `;

    try {
      await db.query(query, values);
    } catch (err) {
      console.error('[Backtester] Bulk insert failed:', err.message);
    }
  }
}

function getRunProgress(runId) {
  return activeRuns.get(runId) || null;
}

async function getPastRuns() {
  const res = await db.query(`SELECT DISTINCT run_id FROM ai_verdicts WHERE source = 'backtest'`);
  return res.rows.map(r => r.run_id).filter(Boolean);
}

module.exports = {
  runBacktest,
  getRunProgress,
  getPastRuns
};
