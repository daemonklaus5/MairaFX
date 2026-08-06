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
const { fetchForexNews } = require('./ingestion/finnhub_news');

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
    try {
      const { symbol, timeframe } = req.params;
      const latestInds = engine.getLatest(symbol, timeframe);
      const price = latestInds ? latestInds.ema9 : 0;
      const snapshot = await synth.evaluateRuleBased(symbol, timeframe, price, null);
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
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

  // News endpoint – uses Finnhub free forex news feed
  let newsCache = { data: [], fetchedAt: 0 };
  const NEWS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  app.get('/api/news/:symbol', async (req, res) => {
    try {
      const now = Date.now();
      if (now - newsCache.fetchedAt < NEWS_TTL_MS && newsCache.data.length > 0) {
        return res.json(newsCache.data);
      }
      const apiKey = process.env.FINNHUB_API_KEY;
      if (!apiKey) {
        // Fallback: return empty so frontend shows gracefully
        return res.json([]);
      }
      const articles = await fetchForexNews(apiKey, 10);
      newsCache = { data: articles, fetchedAt: now };
      res.json(articles);
    } catch (err) {
      console.error('News fetch error:', err.message);
      res.json(newsCache.data); // serve stale on error
    }
  });

  app.post('/api/analyze/:symbol/:timeframe', async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      // DB stores candles as '15m', '1H', '4H', '1D' — matches URL params directly
      const zones = await detector.detect(symbol, timeframe);
      const latestInds = engine.getLatest(symbol, timeframe);
      const price = req.body?.price || (latestInds ? latestInds.ema9 : 0) || (zones?.currentPrice ?? 0);

      const snapshot = await synth.evaluateRuleBased(symbol, timeframe, price, zones);
      const aiResult = await synth.getAiNarrative(symbol, snapshot, zones);

      res.json(aiResult);
    } catch (err) {
      console.error('Analyze error:', err.message);
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
