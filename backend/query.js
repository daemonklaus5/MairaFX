require('dotenv').config();
const db = require('./src/db');

async function run() {
  try {
    const res = await db.query(`SELECT verdict, outcome, COUNT(*) as count FROM ai_verdicts WHERE source = 'live_divergence' GROUP BY verdict, outcome`);
    console.log("Divergence Stats:", res.rows);
    
    // Total row count
    const countRes = await db.query(`SELECT COUNT(*) as total FROM ai_verdicts WHERE source = 'live_divergence'`);
    console.log("Total Divergence Rows:", countRes.rows[0].total);

    // Look for overall backtest stats
    const btRes = await db.query(`
      SELECT 
        source,
        COUNT(*) as total_trades,
        SUM(CASE WHEN outcome = 'WIN' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN outcome = 'LOSS' THEN 1 ELSE 0 END) as losses,
        SUM(CASE WHEN outcome = 'TIMEOUT' THEN 1 ELSE 0 END) as timeouts,
        AVG(CASE WHEN outcome = 'WIN' THEN (outcome_price - entry_price)/abs(entry_price - invalidation_price) ELSE NULL END) as avg_win_r,
        AVG(CASE WHEN outcome = 'LOSS' THEN (entry_price - outcome_price)/abs(entry_price - invalidation_price) ELSE NULL END) as avg_loss_r
      FROM ai_verdicts 
      WHERE source LIKE 'backtest%'
      GROUP BY source
    `);
    console.log("Backtest Stats:", btRes.rows);

  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

run();
