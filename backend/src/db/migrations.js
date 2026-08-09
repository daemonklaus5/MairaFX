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

      CREATE TABLE IF NOT EXISTS ai_verdicts (
        verdict_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMPTZ NOT NULL,
        pair VARCHAR(20) NOT NULL,
        timeframe VARCHAR(10) NOT NULL,
        verdict VARCHAR(10) NOT NULL,
        conviction_score INTEGER,
        entry_price NUMERIC,
        invalidation_price NUMERIC,
        target_price NUMERIC,
        confluence_factors JSONB,
        full_json_snapshot JSONB,
        full_ai_output TEXT,
        outcome VARCHAR(20) DEFAULT 'PENDING',
        outcome_price NUMERIC,
        outcome_timestamp TIMESTAMPTZ,
        source VARCHAR(20) DEFAULT 'live',
        run_id VARCHAR(100)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_verdicts_pair_pending ON ai_verdicts(pair) WHERE outcome = 'PENDING';
      CREATE INDEX IF NOT EXISTS idx_ai_verdicts_timestamp ON ai_verdicts(timestamp DESC);

      ALTER TABLE candles DROP CONSTRAINT IF EXISTS chk_canonical_tf;
      ALTER TABLE candles ADD CONSTRAINT chk_canonical_tf CHECK (timeframe IN ('M5', 'M15', 'H1', 'H4', 'D'));

      ALTER TABLE ai_verdicts DROP CONSTRAINT IF EXISTS chk_canonical_tf_ai;
      ALTER TABLE ai_verdicts ADD CONSTRAINT chk_canonical_tf_ai CHECK (timeframe IN ('M5', 'M15', 'H1', 'H4', 'D'));

      -- Add new columns safely
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_verdicts' AND column_name='source') THEN
              ALTER TABLE ai_verdicts ADD COLUMN source VARCHAR(20) DEFAULT 'live';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_verdicts' AND column_name='run_id') THEN
              ALTER TABLE ai_verdicts ADD COLUMN run_id VARCHAR(100);
          END IF;
      END $$;
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
