const db = require('./index');

async function runMigrations() {
  console.log('Running database migrations...');
  
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS candles (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        timeframe VARCHAR(10) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        open NUMERIC NOT NULL,
        high NUMERIC NOT NULL,
        low NUMERIC NOT NULL,
        close NUMERIC NOT NULL,
        volume NUMERIC NOT NULL,
        UNIQUE (symbol, timeframe, timestamp)
      );

      CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf ON candles(symbol, timeframe, timestamp DESC);

      CREATE TABLE IF NOT EXISTS indicators (
        symbol VARCHAR(20) NOT NULL,
        timeframe VARCHAR(10) NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        ema9 NUMERIC,
        ema21 NUMERIC,
        ema50 NUMERIC,
        ema200 NUMERIC,
        rsi14 NUMERIC,
        bb_upper NUMERIC,
        bb_middle NUMERIC,
        bb_lower NUMERIC,
        atr NUMERIC,
        adx NUMERIC,
        PRIMARY KEY (symbol, timeframe)
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        condition_type VARCHAR(50) NOT NULL,
        target_value NUMERIC,
        target_string VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    
    
    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Error running migrations', err);
  }
}

// If run directly
if (require.main === module) {
  runMigrations().then(() => process.exit(0));
}

module.exports = runMigrations;
