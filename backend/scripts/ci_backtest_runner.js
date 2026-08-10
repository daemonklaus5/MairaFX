const { Pool } = require('pg');
const fs = require('fs');

async function run() {
  const webhookUrl = process.env.WEBHOOK_URL;
  let success = false;
  let message = '';
  
  try {
    console.log("Triggering Backtest via API...");
    // 1. Trigger Backtest
    const startRes = await fetch('http://localhost:5000/api/backtest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs: ['EUR_USD'], timeframe: '15m', useAi: true })
    });
    
    if (!startRes.ok) throw new Error(`API Error: ${startRes.status}`);
    const { runId } = await startRes.json();
    console.log(`Backtest started with runId: ${runId}`);

    // 2. Poll for completion
    let isRunning = true;
    while (isRunning) {
      await new Promise(r => setTimeout(r, 5000));
      const progRes = await fetch(`http://localhost:5000/api/backtest/progress/${encodeURIComponent(runId)}`);
      if (progRes.ok) {
        const progress = await progRes.json();
        console.log(`Progress: ${progress.current}/${progress.total} (${progress.status})`);
        if (progress.status !== 'RUNNING') isRunning = false;
      }
    }

    // 3. Query Expectancy from DB
    console.log("Backtest completed. Querying database for expectancy...");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const res = await pool.query(`
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) as losses,
        AVG(CASE WHEN outcome = 'WIN' THEN (outcome_price - entry_price)/abs(entry_price - invalidation_price) ELSE NULL END) as avg_win_r,
        AVG(CASE WHEN outcome = 'LOSS' THEN (entry_price - outcome_price)/abs(entry_price - invalidation_price) ELSE NULL END) as avg_loss_r
      FROM ai_verdicts 
      WHERE run_id = $1
    `, [runId]);
    
    await pool.end();

    const data = res.rows[0];
    const total = parseInt(data.total_trades) || 0;
    const wins = parseInt(data.wins) || 0;
    const losses = parseInt(data.losses) || 0;
    const winRate = total > 0 ? (wins / (wins + losses)) : 0;
    const avgWin = parseFloat(data.avg_win_r) || 0;
    const avgLoss = parseFloat(data.avg_loss_r) || 0;
    
    const expectancy = (winRate * avgWin) - ((1 - winRate) * Math.abs(avgLoss));
    
    const resultObj = { runId, total, wins, losses, winRate, avgWin, avgLoss, expectancy };
    console.log("Final Metrics:", resultObj);
    fs.writeFileSync('backtest_results.json', JSON.stringify(resultObj, null, 2));

    message = `Nightly Backtest Completed! 
Total Trades: ${total}
Win Rate: ${(winRate * 100).toFixed(1)}%
Expectancy: ${expectancy.toFixed(2)} R`;

    if (expectancy < 0) {
      throw new Error(`Expectancy dropped below 0 (${expectancy.toFixed(2)} R). Pipeline failed.`);
    }

    success = true;
    console.log("Pipeline Check Passed.");
  } catch (err) {
    console.error("Pipeline Failed:", err.message);
    message = `Nightly Backtest FAILED ❌
Error: ${err.message}`;
    success = false;
  }

  // Fire Webhook
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message, text: message }) // 'content' for discord, 'text' for slack
      });
      console.log("Webhook fired.");
    } catch (e) {
      console.error("Failed to fire webhook:", e.message);
    }
  }

  process.exit(success ? 0 : 1);
}

run();
