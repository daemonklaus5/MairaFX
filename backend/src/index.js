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
const backtester = require('./jobs/backtester');
const runMigrations = require('./db/migrations');
const cotJob = require('./cot/job');
const AlertManager = require('./alerts/manager');
const { fetchForexNews, fetchEconomicCalendar } = require('./ingestion/finnhub_news');
const dashboardRoutes = require('./api/dashboard_routes');

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

  // Background Job: Pre-calculate AI Lanes for all pairs to prevent UI latency
  const trackedPairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CHF', 'USD_CAD', 'NZD_USD'];
  const trackedTimeframes = ['15m', '1H', '4H', '1D'];
  const lanesCache = new Map();
  
  const cron = require('node-cron');
  
  async function precalculateLanes() {
    console.log('Running background lane calculation...');
    for (const symbol of trackedPairs) {
      for (const tf of trackedTimeframes) {
        try {
          const latestInds = engine.getLatest(symbol, tf);
          const price = latestInds ? latestInds.ema9 : 0;
          const snapshot = await synth.evaluateRuleBased(symbol, tf, price, null);
          lanesCache.set(`${symbol}_${tf}`, snapshot);
        } catch (e) {
          console.error(`Failed to precalculate ${symbol} ${tf}:`, e.message);
        }
      }
    }
  }

  // Run every 5 minutes
  cron.schedule('*/5 * * * *', precalculateLanes);
  // Run once on startup
  setTimeout(precalculateLanes, 5000);

  // Background Job: AI Verdict Resolver
  const resolvePendingVerdicts = require('./jobs/resolver');
  cron.schedule('*/30 * * * *', resolvePendingVerdicts);
  setTimeout(resolvePendingVerdicts, 10000); // Run once shortly after startup

  // Background Job: Historical Data Pipeline Daily Update
  const dataPipeline = require('./jobs/data_pipeline');
  cron.schedule('0 0 * * *', dataPipeline.runDailyUpdate); // Run at midnight every day

  // Dashboard API Routes
  app.use('/api/dashboard', dashboardRoutes(engine));

  // REST API
  app.get('/api/backtest/stats', async (req, res) => {
    try {
      const db = require('./db');
      const runId = req.query.runId;
      
      let whereClause = `WHERE outcome != 'PENDING'`;
      const params = [];
      
      if (runId) {
        whereClause += ` AND run_id = $1`;
        params.push(runId);
      } else {
        whereClause += ` AND source = 'live'`;
      }
      
      const bucketRes = await db.query(`
        SELECT 
          CASE 
            WHEN conviction_score <= 40 THEN '0-40'
            WHEN conviction_score <= 60 THEN '41-60'
            WHEN conviction_score <= 80 THEN '61-80'
            ELSE '81-100'
          END AS bucket,
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('WIN', 'CORRECT_WAIT') THEN 1 ELSE 0 END) as wins
        FROM ai_verdicts
        ${whereClause}
        GROUP BY bucket
      `, params);

      const pairRes = await db.query(`
        SELECT pair, COUNT(*) as total, SUM(CASE WHEN outcome IN ('WIN', 'CORRECT_WAIT') THEN 1 ELSE 0 END) as wins
        FROM ai_verdicts 
        ${whereClause}
        GROUP BY pair
      `, params);

      let waitWhereClause = `WHERE verdict = 'WAIT' AND outcome != 'PENDING'`;
      if (runId) waitWhereClause += ` AND run_id = $1`;
      else waitWhereClause += ` AND source = 'live'`;

      const waitRes = await db.query(`
        SELECT COUNT(*) as total, SUM(CASE WHEN outcome = 'CORRECT_WAIT' THEN 1 ELSE 0 END) as correct
        FROM ai_verdicts 
        ${waitWhereClause}
      `, params);

      const aiVsMechanicalRes = await db.query(`
        SELECT 
          source, 
          COUNT(*) as total, 
          SUM(CASE WHEN outcome IN ('WIN', 'CORRECT_WAIT') THEN 1 ELSE 0 END) as wins,
          AVG(CASE WHEN realized_r > 0 THEN realized_r ELSE NULL END) as avg_win_r,
          AVG(CASE WHEN realized_r <= 0 THEN ABS(realized_r) ELSE NULL END) as avg_loss_r,
          AVG(realized_r) as expectancy_r
        FROM ai_verdicts
        ${whereClause} AND source IN ('backtest', 'backtest_ai', 'backtest_ai_rejected')
        GROUP BY source
      `, params);

      const recentRes = await db.query(`
        SELECT * FROM ai_verdicts 
        ${whereClause} AND verdict != 'WAIT'
        ORDER BY timestamp DESC 
        LIMIT 50
      `, params);

      // We can do confluence factor aggregation in JS
      const confluenceMap = {};
      const resolved = await db.query(`SELECT confluence_factors, outcome FROM ai_verdicts ${whereClause}`, params);
      for (const row of resolved.rows) {
        if (!row.confluence_factors) continue;
        for (const factor of row.confluence_factors) {
          if (!confluenceMap[factor]) confluenceMap[factor] = { total: 0, wins: 0 };
          confluenceMap[factor].total++;
          if (row.outcome === 'WIN' || row.outcome === 'CORRECT_WAIT') {
            confluenceMap[factor].wins++;
          }
        }
      }

      res.json({
        buckets: bucketRes.rows,
        pairs: pairRes.rows,
        wait_accuracy: waitRes.rows[0],
        ai_vs_mechanical: aiVsMechanicalRes.rows,
        recent_verdicts: recentRes.rows,
        confluence_stats: confluenceMap
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/data-pipeline/status', async (req, res) => {
    try {
      const status = await dataPipeline.getStatus();
      res.json(status);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/data-pipeline/trigger-backfill', async (req, res) => {
    try {
      // Fire and forget so it doesn't block the request
      dataPipeline.runHistoricalBackfill().catch(console.error);
      res.json({ message: 'Historical backfill started in the background.' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/data-pipeline/export', async (req, res) => {
    let client;
    try {
      const QueryStream = require('pg-query-stream');
      const db = require('./db');
      
      client = await db.pool.connect();
      const query = new QueryStream('SELECT symbol, timeframe, timestamp, open, high, low, close, volume FROM candles ORDER BY symbol, timeframe, timestamp ASC');
      const stream = client.query(query);
      
      res.header('Content-Type', 'text/csv');
      res.attachment('candles_history.csv');
      res.write('timestamp,symbol,timeframe,open,high,low,close,volume\n');
      
      stream.on('data', (r) => {
        const line = `${new Date(r.timestamp).toISOString()},${r.symbol},${r.timeframe},${r.open},${r.high},${r.low},${r.close},${r.volume}\n`;
        res.write(line);
      });
      
      stream.on('end', () => {
        if (client) client.release();
        res.end();
      });

      stream.on('error', (err) => {
        console.error('Stream error:', err);
        if (client) client.release();
        client = null;
        if (!res.headersSent) res.status(500).json({ error: err.message });
        else res.end();
      });

    } catch (e) {
      if (client) client.release();
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/zones/:symbol/:timeframe', async (req, res) => {
    const zones = await detector.detect(req.params.symbol, req.params.timeframe);
    res.json(zones || {});
  });

  app.get('/api/lanes/:symbol/:timeframe', async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      const cacheKey = `${symbol}_${timeframe}`;
      
      // Serve instantly from cache if available
      if (lanesCache.has(cacheKey)) {
        return res.json(lanesCache.get(cacheKey));
      }
      
      // Fallback to live calculation if cache is missed
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

  // News endpoint – uses GitHub Proxy for ForexFactory Latest Stories
  let newsCache = { data: [], fetchedAt: 0 };
  const NEWS_TTL_MS = 60 * 60 * 1000;

  app.get('/api/news/:symbol', async (req, res) => {
    try {
      const axios = require('axios');
      const now = Date.now();
      if (now - newsCache.fetchedAt < NEWS_TTL_MS && newsCache.data.length > 0) {
        return res.json(newsCache.data);
      }

      // Fetch the raw cached ForexFactory News XML from GitHub (using cache buster)
      const cacheBuster = Date.now();
      const response = await axios.get(`https://raw.githubusercontent.com/daemonklaus5/MairaFX/master/.github/data/ff_news.xml?t=${cacheBuster}`, {
        timeout: 5000
      });

      const { XMLParser } = require('fast-xml-parser');
      const parser = new XMLParser();
      const parsed = parser.parse(response.data);
      
      const items = parsed?.rss?.channel?.item || [];
      const stories = Array.isArray(items) ? items : [items];

      const articles = stories.map((item) => {
        // ForexFactory title format is usually "Source: Headline"
        let source = "ForexFactory";
        let headline = item.title || "";
        
        if (headline.includes(": ")) {
          const parts = headline.split(": ");
          source = parts[0];
          headline = parts.slice(1).join(": ");
        }

        return {
          headline,
          source,
          url: item.link || "",
          datetime: item.pubDate ? new Date(item.pubDate).getTime() / 1000 : Math.floor(Date.now() / 1000),
          relevance: Math.floor(Math.random() * 40) + 60 // Mock relevance score
        };
      }).filter(a => a.headline).slice(0, 5); // Limit to top 5 stories

      newsCache = { data: articles, fetchedAt: now };
      res.json(articles);
    } catch (err) {
      console.error("News API Error:", err.message);
      res.json(newsCache.data); // serve stale on error
    }
  });

  // ── Step-by-step debug endpoint ── helps diagnose which step is failing
  app.get('/api/debug-analyze/:symbol/:timeframe', async (req, res) => {
    const { symbol, timeframe } = req.params;
    const report = {};
    try {
      report.step = 'detector';
      const zones = await detector.detect(symbol, timeframe);
      report.zones_ok = !!zones;
      report.zones_candles = zones ? 'got zones' : 'null (not enough candles)';

      report.step = 'engine';
      const latestInds = engine.getLatest(symbol, timeframe);
      report.indicators_ok = !!latestInds;
      report.indicators = latestInds ? Object.keys(latestInds) : 'none';

      const price = (latestInds ? latestInds.ema9 : 0) || (zones?.currentPrice ?? 0);
      report.price = price;

      report.step = 'technical_lane';
      const techLaneResult = techLane.evaluate(symbol, timeframe, price, zones?.marketStructure ?? null);
      report.technical = techLaneResult;

      report.step = 'flow_lane';
      const flowResult = flowLane.evaluate(symbol);
      report.flow = flowResult;

      report.step = 'narrative_lane';
      const narResult = narrativeLane.evaluate(symbol);
      report.narrative = narResult;

      report.step = 'macro_lane';
      const macroResult = await macroLane.evaluate(symbol);
      report.macro = macroResult;

      report.step = 'evaluateRuleBased';
      const snapshot = await synth.evaluateRuleBased(symbol, timeframe, price, zones);
      report.snapshot = { verdict: snapshot.verdict, confidence: snapshot.confidence };

      report.step = 'done';
      report.ok = true;
      res.json(report);
    } catch (err) {
      report.error = err.message;
      report.stack = err.stack?.split('\n').slice(0, 5).join(' | ');
      res.status(500).json(report);
    }
  });

  // Dedicated endpoint to test the raw Gemini API connection
  app.get('/api/debug-ai', async (req, res) => {
    try {
      const rawKey = process.env.GEMINI_API_KEY || '';
      const apiKeys = rawKey.split(',').map(k => k.trim()).filter(Boolean);
      if (apiKeys.length === 0) return res.status(400).json({ error: 'No GEMINI_API_KEY configured' });
      
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKeys[0]);
      const modelName = req.query.model || 'gemini-3.1-flash-lite';
      const ai = genAI.getGenerativeModel({ model: modelName });
      
      const result = await ai.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Say "hello world" in JSON format like {"msg":"hello world"}' }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      const response = await result.response;
      
      res.json({ success: true, keysFound: apiKeys.length, response: response.text() });
    } catch (err) {
      const rawKey = process.env.GEMINI_API_KEY || '';
      const apiKeys = rawKey.split(',').map(k => k.trim()).filter(Boolean);
      res.status(500).json({
        success: false,
        keysFound: apiKeys.length,
        errorName: err.name,
        errorMessage: err.message,
        errorStatus: err.status,
        rawString: err.toString()
      });
    }
  });
  // --- Backtester Endpoints ---
  app.post('/api/backtest/run', async (req, res) => {
    try {
      const { pairs, timeframe, startDate, endDate, useAi } = req.body;
      const runId = `Offline [${timeframe}] ${new Date().toLocaleTimeString()} - ${pairs.join(', ')}`;
      
      // Fire and forget
      backtester.runBacktest(runId, pairs, timeframe, detector, synth, useAi);
      
      res.json({ success: true, runId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/backtest/progress/:runId', (req, res) => {
    const progress = backtester.getRunProgress(req.params.runId);
    if (!progress) return res.status(404).json({ error: 'Run not found' });
    res.json(progress);
  });

  app.get('/api/backtest/runs', async (req, res) => {
    try {
      const runs = await backtester.getPastRuns();
      res.json(runs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/analyze/:symbol/:timeframe', async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      // DB stores candles as 'M15', 'H1', 'H4', 'D' — matches URL params directly
      const zones = await detector.detect(symbol, timeframe);
      const latestInds = engine.getLatest(symbol, timeframe);
      const price = req.body?.price || (latestInds ? latestInds.ema9 : 0) || (zones?.currentPrice ?? 0);

      // Fetch MTF Zones for alignment
      let mtfZones = { 'D': null, 'H4': null };
      if (timeframe !== 'D') mtfZones['D'] = await detector.detect(symbol, 'D');
      if (timeframe !== 'H4' && timeframe !== 'D') mtfZones['H4'] = await detector.detect(symbol, 'H4');

      // Fetch Economic Calendar for today
      const apiKey = process.env.FINNHUB_API_KEY;
      const econCalendar = apiKey ? await fetchEconomicCalendar(apiKey) : [];

      const mode = req.query.mode || 'strict';
      const snapshot = await synth.evaluateRuleBased(symbol, timeframe, price, zones, latestInds, mtfZones);
      const aiResult = await synth.getAiNarrative(symbol, timeframe, snapshot, zones, mtfZones, econCalendar, mode);

      res.json(aiResult);
    } catch (err) {
      console.error('Analyze error:', err.message, err.stack);
      res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 3).join(' | ') });
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
