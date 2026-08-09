const db = require('./src/db');
db.query("DELETE FROM ai_verdicts WHERE source = 'backtest'")
  .then(() => {
    console.log("All backtest runs deleted");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
