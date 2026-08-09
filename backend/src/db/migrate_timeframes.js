const db = require('./index');

async function migrate() {
  console.log('Starting timeframe migration...');

  try {
    // 1. Report before counts
    const beforeRes = await db.query(`SELECT timeframe, COUNT(*) as count FROM candles GROUP BY timeframe ORDER BY timeframe`);
    console.log('Row counts BEFORE migration:');
    beforeRes.rows.forEach(r => console.log(`  ${r.timeframe}: ${r.count} rows`));

    // 2. Perform upsert-merge
    console.log('Merging old timeframe labels into canonical formats...');
    await db.query(`
      INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
      SELECT 
        symbol, 
        CASE timeframe
          WHEN '15m' THEN 'M15'
          WHEN '1H' THEN 'H1'
          WHEN '4H' THEN 'H4'
          WHEN '1D' THEN 'D'
          WHEN '5m' THEN 'M5'
        END,
        timestamp, open, high, low, close, volume
      FROM candles
      WHERE timeframe IN ('15m', '1H', '4H', '1D', '5m')
      ON CONFLICT (symbol, timeframe, timestamp) DO NOTHING;
    `);

    // 3. Delete old labels
    console.log('Deleting deprecated timeframe rows...');
    const deleteRes = await db.query(`
      DELETE FROM candles 
      WHERE timeframe IN ('15m', '1H', '4H', '1D', '5m')
    `);
    console.log(`Deleted ${deleteRes.rowCount} deprecated rows.`);

    // 4. Report after counts
    const afterRes = await db.query(`SELECT timeframe, COUNT(*) as count FROM candles GROUP BY timeframe ORDER BY timeframe`);
    console.log('Row counts AFTER migration:');
    afterRes.rows.forEach(r => console.log(`  ${r.timeframe}: ${r.count} rows`));

    // 5. Migrate ai_verdicts table just in case there are pending verdicts
    const verdictRes = await db.query(`
      UPDATE ai_verdicts 
      SET timeframe = CASE timeframe
          WHEN '15m' THEN 'M15'
          WHEN '1H' THEN 'H1'
          WHEN '4H' THEN 'H4'
          WHEN '1D' THEN 'D'
          WHEN '5m' THEN 'M5'
        END
      WHERE timeframe IN ('15m', '1H', '4H', '1D', '5m')
    `);
    console.log(`Updated ${verdictRes.rowCount} rows in ai_verdicts.`);

    console.log('Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
