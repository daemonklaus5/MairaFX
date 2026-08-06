const express = require('express');
const http = require('http');
const path = require('path');
require('dotenv').config();

const WebSocketManager = require('./api/ws_manager');
const FinnhubClient = require('./ingestion/finnhub_client');
const OandaClient = require('./ingestion/oanda_client');
const CandleBuilder = require('./ingestion/candle_builder');
const IndicatorEngine = require('./indicators/engine');
const ZoneDetector = require('./zones/detector');
const TechnicalLane = require('./lanes/technical');
const FlowLane = require('./lanes/flow');
const NarrativeLane = require('./lanes/narrative');
const MacroLane = require('./lanes/macro');
const Synthesizer = require('./synthesizer/synth');
const runMigrations = require('./db/migrations');
const cotJob = require('./cot/job');
const AlertManager = require('./alerts/manager');

const app = express();
const server = http.createServer(app);
const wsManager = new WebSocketManager(server);

app.use(express.json());

app.get('/health', (req, res) => res.send({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  await runMigrations();
  
  const engine = new IndicatorEngine(wsManager);
  await engine.loadState();
  const candleBuilder = new CandleBuilder(engine);
  const alertManager = new AlertManager(wsManager);
  await alertManager.loadAlerts();
  
  if (process.env.OANDA_API_KEY && process.env.OANDA_ACCOUNT_ID) {
    console.log('OANDA keys detected. Using OANDA for high-quality historical and live data.');
    const oandaClient = new OandaClient(wsManager, candleBuilder, alertManager);
    await oandaClient.init();
  } else {
    console.log('No OANDA keys found. Falling back to Finnhub + Yahoo Finance for data.');
    const finnhubClient = new FinnhubClient(wsManager, candleBuilder, alertManager);
    await finnhubClient.init();
  }

  const detector = new ZoneDetector(engine);
  
  cotJob.start();

  const techLane = new TechnicalLane(engine);
  const flowLane = new FlowLane(cotJob);
  const narrativeLane = new NarrativeLane();
  const macroLane = new MacroLane();
  const synth = new Synthesizer(techLane, flowLane, narrativeLane, macroLane);
  
  // REST API
  app.get('/api/zones/:symbol/:timeframe', async (req, res) => {
    const zones = await detector.detect(req.params.symbol, req.params.timeframe);
    res.json(zones || {});
  });

  app.get('/api/lanes/:symbol/:timeframe', async (req, res) => {
    const tfMap = { '15m': 'M15', '1H': 'H1', '4H': 'H4', '1D': 'D' };
    const dbTimeframe = tfMap[req.params.timeframe] || req.params.timeframe;

    // Current price mock - in reality fetch latest tick
    const latestInds = engine.getLatest(req.params.symbol, dbTimeframe);
    const price = latestInds ? latestInds.ema9 : 0; 
    const snapshot = synth.evaluateRuleBased(req.params.symbol, dbTimeframe, price, null);
    res.json(snapshot);
  });

  app.get('/api/cot/:symbol', (req, res) => {
    res.json(cotJob.getLatest(req.params.symbol) || {});
  });

  app.get('/api/candles/:symbol/:timeframe', async (req, res) => {
    try {
      const db = require('./db');
      const { rows } = await db.query(
        `SELECT * FROM candles WHERE symbol = $1 AND timeframe = $2 ORDER BY timestamp ASC`,
        [req.params.symbol, req.params.timeframe]
      );
      
      const mapped = rows.map(r => ({
        time: Math.floor(new Date(r.timestamp).getTime() / 1000),
        open: parseFloat(r.open),
        high: parseFloat(r.high),
        low: parseFloat(r.low),
        close: parseFloat(r.close)
      }));
      
      res.json(mapped);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/alerts', async (req, res) => {
    res.json(alertManager.activeAlerts);
  });

  app.post('/api/alerts', async (req, res) => {
    try {
      const alert = await alertManager.addAlert(req.body);
      res.json(alert);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/analyze/:symbol/:timeframe', async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      const zones = await detector.detect(symbol, timeframe);
      const latestInds = engine.getLatest(symbol, timeframe);
      const price = req.body?.price || (latestInds ? latestInds.ema9 : 0);
      
      const snapshot = synth.evaluateRuleBased(symbol, timeframe, price, zones);
      const aiResult = await synth.getAiNarrative(symbol, snapshot);
      
      res.json(aiResult);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Serve static frontend in production
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));

  // Catch-all route to serve React index.html for client-side routing
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });

  server.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
  });
}

bootstrap().catch(console.error);
