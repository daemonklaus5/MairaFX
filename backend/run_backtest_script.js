require('dotenv').config();
const { runBacktest } = require('./src/jobs/backtester');
const ZoneDetector = require('./src/zones/detector');
const SynthEngine = require('./src/synthesizer/synth');

const detector = new ZoneDetector();
const synth = new SynthEngine();

async function run() {
  console.log("Starting Full Pipeline Backtest for EUR_USD on M15...");
  try {
    await runBacktest('manual_test_1', ['EUR_USD'], 'M15', detector, synth, true);
    console.log("Backtest completed successfully!");
  } catch (e) {
    console.error("Backtest failed:", e);
  } finally {
    process.exit(0);
  }
}

run();
