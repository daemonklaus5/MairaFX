const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../db');

class Synthesizer {
  constructor(technicalLane, flowLane, narrativeLane, macroLane) {
    this.lanes = {
      technical: technicalLane,
      flow:      flowLane,
      narrative: narrativeLane,
      macro:     macroLane
    };
    this.cache = new Map();
  }

  /**
   * Evaluate all rule-based lanes and produce a rule-based verdict.
   * All lanes are now async (FlowLane fetches live rates, NarrativeLane fetches news).
   * Each lane has an 8s hard timeout — a hung lane falls back to neutral, never blocks.
   */
  async evaluateRuleBased(symbol, timeframe, currentPrice, zones, customIndicators = null, mtfZones = null) {
    const marketStructure = zones?.marketStructure ?? null;
    const LANE_FALLBACK = { bias: 'mixed', tier: 'low', score: 0, basis: 'Lane unavailable' };

    // Per-lane hard timeout: if a lane hangs (e.g. Yahoo Finance), fall back cleanly
    const withLaneTimeout = (promise, name) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out`)), 8000))
    ]);

    // Run all four lanes in parallel — each settles independently within 8s
    const [tRes, fRes, nRes, mRes] = await Promise.allSettled([
      withLaneTimeout(Promise.resolve().then(() => this.lanes.technical.evaluate(symbol, timeframe, currentPrice, marketStructure, customIndicators)), 'TechnicalLane'),
      withLaneTimeout(this.lanes.flow.evaluate(symbol),      'FlowLane'),
      withLaneTimeout(this.lanes.narrative.evaluate(symbol), 'NarrativeLane'),
      withLaneTimeout(this.lanes.macro.evaluate(symbol),     'MacroLane'),
    ]);

    const t = tRes.status === 'fulfilled' ? tRes.value : (console.error('TechnicalLane error:', tRes.reason?.message), LANE_FALLBACK);
    const f = fRes.status === 'fulfilled' ? fRes.value : (console.error('FlowLane error:',     fRes.reason?.message), LANE_FALLBACK);
    const n = nRes.status === 'fulfilled' ? nRes.value : (console.error('NarrativeLane error:', nRes.reason?.message), LANE_FALLBACK);
    const m = mRes.status === 'fulfilled' ? mRes.value : (console.error('MacroLane error:',     mRes.reason?.message), LANE_FALLBACK);

    let bullScore = 0, bearScore = 0;
    [t, f, n, m].forEach(lane => {
      if (lane.bias === 'bull') bullScore += lane.score;
      if (lane.bias === 'bear') bearScore += Math.abs(lane.score);
    });

    // MTF Structural Penalty (Hard-enforced before verdict)
    if (mtfZones) {
      const dailyTrend = mtfZones['D']?.marketStructure?.trend;
      const h4Trend = mtfZones['H4']?.marketStructure?.trend;
      
      // If higher timeframes are bearish, penalize LONGs
      if (dailyTrend === 'bearish' || h4Trend === 'bearish') {
        bullScore = Math.max(0, bullScore - 30);
      }
      
      // If higher timeframes are bullish, penalize SHORTs
      if (dailyTrend === 'bullish' || h4Trend === 'bullish') {
        bearScore = Math.max(0, bearScore - 30);
      }
    }

    let verdict = 'WAIT', confidence = 'low';
    if      (bullScore > bearScore + 40) { verdict = 'LONG';  confidence = bullScore > 80 ? 'high' : 'moderate'; }
    else if (bearScore > bullScore + 40) { verdict = 'SHORT'; confidence = bearScore > 80 ? 'high' : 'moderate'; }

    let watch_zone   = 'No clear zone';
    let invalidation = [];

    try {
      if (zones?.support?.length > 0 && verdict === 'LONG') {
        watch_zone = `Support at ${zones.support[0].price.toFixed(5)}`;
        invalidation.push(`Close below ${zones.support[0].min.toFixed(5)}`);
      } else if (zones?.resistance?.length > 0 && verdict === 'SHORT') {
        watch_zone = `Resistance at ${zones.resistance[0].price.toFixed(5)}`;
        invalidation.push(`Close above ${zones.resistance[0].max.toFixed(5)}`);
      }
    } catch (err) { console.error('Watch zone error:', err.message); }

    const point_differential = Math.abs(bullScore - bearScore);
    return { verdict, confidence, point_differential, lanes: { technical: t, flow: f, narrative: n, macro: m }, watch_zone, invalidation };
  }

  /**
   * Build a rich ICT-aware context object to pass to Gemini.
   */
  _buildIctContext(zones, snapshot, mtfZones, econCalendar) {
    const ctx = {
      rule_based_verdict:    snapshot.verdict,
      rule_based_confidence: snapshot.confidence,
      lane_verdicts:         snapshot.lanes,
    };

    if (!zones) return ctx;

    // 1. Multi-Timeframe Alignment
    if (mtfZones) {
      ctx.mtf_alignment = {
        daily_trend: mtfZones['D']?.marketStructure?.trend || 'unknown',
        h4_trend:    mtfZones['H4']?.marketStructure?.trend || 'unknown',
      };
    }

    // 2. High-Impact Economic Calendar
    if (econCalendar && econCalendar.length > 0) {
      ctx.upcoming_high_impact_news = econCalendar;
    }

    // 3. Real-Time Kill Zones (UTC)
    const utcHour = new Date().getUTCHours();
    if (utcHour >= 7 && utcHour < 10) ctx.current_session = "London Open Killzone (High Volatility)";
    else if (utcHour >= 12 && utcHour < 15) ctx.current_session = "New York Open Killzone (High Volatility)";
    else if (utcHour >= 0 && utcHour < 6) ctx.current_session = "Asian Range (Consolidation)";
    else ctx.current_session = "Between Killzones (Moderate Volatility)";

    ctx.current_price = zones.currentPrice;

    // 4. Volume Profile — POC is now { price, source } or null
    if (zones.volumePOC) {
      const poc = zones.volumePOC;
      // Support both old bare-number shape and new {price, source} shape
      const pocPrice  = typeof poc === 'object' ? poc.price  : poc;
      const pocSource = typeof poc === 'object' ? poc.source : 'volume';
      ctx.volume_point_of_control = `${pocPrice.toFixed(5)} (${pocSource === 'price_activity' ? 'price-activity proxy' : 'volume-weighted'})`;
    }

    if (zones.marketStructure) {
      const ms = zones.marketStructure;
      ctx.market_structure = {
        trend:            ms.trend,
        structure_type:   ms.structure,          // HH/HL, LH/LL, or ranging
        choch_detected:   ms.choch,              // Change of Character (reversal warning)
        bos:              ms.bos,                // Break of Structure (trend continuation)
        price_zone:       ms.premiumDiscount,    // 'premium' or 'discount'
        range_high:       ms.rangeHigh?.toFixed(5),
        range_low:        ms.rangeLow?.toFixed(5),
        range_midpoint:   ms.midpoint?.toFixed(5),
      };
    }

    if (zones.liquidity) {
      ctx.liquidity_pools = {
        buy_side_liquidity:  zones.liquidity.bsl.slice(0, 2).map(l => ({
          price: l.price, pips_away: l.pips, strength: l.strength
        })),
        sell_side_liquidity: zones.liquidity.ssl.slice(0, 2).map(l => ({
          price: l.price, pips_away: l.pips, strength: l.strength
        })),
      };
    }

    const unmitigatedOBs = (zones.orderBlocks || []).filter(ob => !ob.mitigated).slice(-2);
    if (unmitigatedOBs.length > 0) {
      ctx.unmitigated_order_blocks = unmitigatedOBs.map(ob => ({
        type:   ob.type,    // 'bullish_ob' or 'bearish_ob'
        top:    ob.top?.toFixed(5),
        bottom: ob.bottom?.toFixed(5),
      }));
    }

    if (zones.fvgs) {
      ctx.fair_value_gaps = {
        bullish: zones.fvgs.bullish.slice(-2).map(f => ({ top: f.top?.toFixed(5), bottom: f.bottom?.toFixed(5), size_pips: Math.round(f.size / 0.0001) })),
        bearish: zones.fvgs.bearish.slice(-2).map(f => ({ top: f.top?.toFixed(5), bottom: f.bottom?.toFixed(5), size_pips: Math.round(f.size / 0.0001) })),
      };
    }

    if (zones.fibZone) {
      ctx.fibonacci_golden_pocket = {
        lower: zones.fibZone.lower?.toFixed(5),
        upper: zones.fibZone.upper?.toFixed(5),
      };
    }

    if (zones.support?.length)    ctx.nearest_support    = zones.support.slice(-2).map(s => ({ price: s.price?.toFixed(5), strength: s.strength }));
    if (zones.resistance?.length) ctx.nearest_resistance = zones.resistance.slice(0, 2).map(r => ({ price: r.price?.toFixed(5), strength: r.strength }));

    return ctx;
  }

  /**
   * Call Gemini with the full ICT context and return an institutional-grade narrative.
   */
  async getAiNarrative(symbol, timeframe, snapshot, zones, mtfZones, econCalendar, mode = 'strict') {
    const cacheKey = `${symbol}_${timeframe}_narrative_${mode}`;
    const cached   = this.cache.get(cacheKey);
    const now      = Date.now();

    // 15-minute cache — prevents hammering the API on every Analyze click
    if (cached && (now - cached.time < 900_000)) {
      return { ...cached.result, cached: true };
    }

    if (!zones) {
      return {
        verdict: snapshot.verdict,
        confidence: snapshot.confidence,
        lanes: snapshot.lanes,
        reasoning: "AI commentary unavailable: Market data is currently missing or pending for this pair. Waiting for tick data.",
        setup: null,
        watch_zone: "Pending data",
        invalidation: [],
        risk_sizing: "N/A",
        liquidity: null,
        cached: false,
        fallback: true
      };
    }

    const ictContext = this._buildIctContext(zones, snapshot, mtfZones, econCalendar);

    // Calculate Confluence Count programmatically
    let confluenceCount = 0;
    
    // 1. MTF Alignment
    if (snapshot.verdict === 'LONG' && (mtfZones?.['D']?.marketStructure?.trend === 'bullish' || mtfZones?.['H4']?.marketStructure?.trend === 'bullish')) confluenceCount++;
    if (snapshot.verdict === 'SHORT' && (mtfZones?.['D']?.marketStructure?.trend === 'bearish' || mtfZones?.['H4']?.marketStructure?.trend === 'bearish')) confluenceCount++;
    
    // 2. Killzone Active
    if (ictContext.current_session?.includes('Killzone')) confluenceCount++;
    
    // 3. Unmitigated OB/FVG
    if (ictContext.unmitigated_order_blocks?.length > 0 || ictContext.fair_value_gaps?.bullish?.length > 0 || ictContext.fair_value_gaps?.bearish?.length > 0) confluenceCount++;
    
    // 4. Liquidity Pools
    if (ictContext.liquidity_pools?.buy_side_liquidity?.length > 0 || ictContext.liquidity_pools?.sell_side_liquidity?.length > 0) confluenceCount++;

    const point_differential = snapshot.point_differential || 0;
    const calculatedScore = Math.min(100, Math.round((point_differential * 0.6) + (confluenceCount * 10)));

    const isWait = snapshot.verdict === 'WAIT';
    
    let gateInstructions = '';
    let verdictSchema = '';

    if (isWait) {
      gateInstructions = `HARD GATE: The mechanical engine has evaluated this setup and concluded there is no edge (Verdict: WAIT). 
You are strictly FORBIDDEN from calling a direction. Your job is purely to provide market commentary and context summary. Do NOT attempt to invent a trade.`;
    } else {
      gateInstructions = `HARD GATE: The mechanical engine has flagged a ${snapshot.verdict} setup. 
Your job is to validate or downgrade this verdict. You may output "${snapshot.verdict}" to confirm the setup, or "WAIT" to downgrade it if the context is poor or contradictory. You may NEVER flip the trade to the opposite direction, and you may NEVER upgrade a WAIT.`;
      verdictSchema = `\n  "verdict": "${snapshot.verdict}" | "WAIT",`;
    }

    const modeInstructions = mode === 'aggressive'
      ? `AGGRESSIVE SCALPER MODE:
- Ignore the Daily/4H MTF alignment if there is a clear 15m/1H setup.
- You only need 1 or 2 ICT factors to align (e.g., a simple liquidity sweep or FVG fill).
- Take setups even if they are counter-trend.`
      : `STRICT INSTITUTIONAL MODE:
- MULTI-TIMEFRAME ALIGNMENT: Do not validate if Daily/4H trend is strongly contradictory.
- CONFLUENCE: Only validate when at least 3 ICT factors align (MTF + liquidity + OB/FVG). Otherwise downgrade to WAIT.`;

    const prompt = `
You are a senior institutional trader and quant analyst reviewing a live forex setup.
You think in Smart Money Concepts (liquidity sweeps, BOS/CHoCH, order blocks, fair value gaps, premium/discount zones), institutional order flow logic (accumulation/manipulation/distribution, stop hunts, session-based liquidity targeting), and algo-level reasoning (statistical edge, confluence weighting, invalidation conditions).

Reason about WHY price is doing what it's doing from a structural and liquidity standpoint FIRST, then use the indicator data as confirming or contradicting evidence.
CRITICAL: The Technical Lane and Market Structure data are your PRIMARY sources of truth. If Narrative or Macro news contradicts a crystal clear technical setup, prioritize the Technical setup unless the news is an imminent Tier 1 event (e.g., NFP, CPI). Do not let random news headlines distract from objective price action.

${modeInstructions}
${gateInstructions}

Output ONLY strict JSON with EXACTLY these keys:
{${verdictSchema}
  "confidence": "Low" | "Medium" | "High",
  "market_structure_read": "<Current trend/range state, last confirmed BOS or CHoCH, key swing highs/lows in play. MUST include exact prices for structure levels — 2-3 sentences>",
  "liquidity_context": "<Where resting liquidity likely sits (equal highs/lows, prior session highs/lows), whether recent PA looks like a sweep, accumulation, or manipulation phase. MUST cite exact prices and pip distances from the data — 2-3 sentences>",
  "session_timing": "<Which session is active, whether this aligns with typical institutional activity windows for this pair. MUST cite the specific hours or session name from the data — 1-2 sentences>",
  "confluence_check": "<How the indicator data (RSI, BB, VWAP, MTF) either supports or contradicts the structural read. Explicitly flag any disagreement. MUST cite the exact indicator values/scores from the data — 2-3 sentences>",
  "thesis": "<Directional bias with confidence level and the full reasoning chain behind it. MUST cite exact target prices and invalidation prices — 3-4 sentences>",
  "setup": "<Specific ICT entry model or IF/THEN pending scenario if WAIT — must never be null or empty>",
  "watch_zone": "<Exact price level or zone to watch for entry>",
  "invalidation": ["<exact price level or condition that breaks this thesis>", "<second invalidation>"],
  "weakest_point": "<One line on the weakest part of this read — what you are least confident about>",
  "overview": "<Summarize what you believe is happening right now and what could potentially happen in the near future. MUST cite key price levels and current price — 3-4 sentences>",
  "conviction_score_explanation": "<Explain why the algorithmic conviction score is exactly ${calculatedScore}/100. Explicitly mention the mechanical point differential of ${point_differential.toFixed(1)} and the ${confluenceCount} confluence factors (e.g. MTF alignment, Killzones, OBs/FVGs, Liquidity) that contributed to this score. — 2-3 sentences>",
  "risk_sizing": "<e.g. 'Risk 35 pips (1% = 0.28 Lots per $10k)' or N/A if WAIT>",
  "entry_price_num": <float or null if WAIT>,
  "invalidation_price_num": <float or null if WAIT>,
  "target_price_num": <float or null if WAIT>
}

Additional rules:
- MANDATORY NUMERICAL CITATIONS: Every single prose section (market_structure_read, liquidity_context, session_timing, confluence_check, thesis, overview) MUST explicitly cite actual numbers (exact prices, RSI values, pip distances, hours, score values, etc.) provided in the Market Data Input. Vague qualitative statements without numerical backing are strictly forbidden.
- PIP DISTANCE RULE: When stating how far price is from any level (liquidity pool, EMA, POC, invalidation, etc.), always calculate distance in pips using: distance_in_pips = abs(price_A - price_B) / pip_size, where pip_size = 0.0001 for standard pairs (e.g. EUR/USD, GBP/USD) and 0.01 for JPY pairs. Never state a pip distance without performing this exact division. Double-check the result is a realistic pip value (typically single to low-triple digits for intraday ranges) before including it.
- ECONOMIC CALENDAR: If high-impact news is imminent, default to WAIT unless setup is pristine.
- KILL ZONES: Entries are highest probability during London or NY Killzones. Flag Asian Range breakouts as low-probability.
- VOLUME POC: Price is drawn to the Point of Control — use as magnet target or S/R.
- PREMIUM / DISCOUNT: Never go long in premium or short in discount without extreme confluence.
- PENDING SETUPS: If verdict is WAIT, the 'setup' field MUST contain a strict 'If [condition], THEN [action targeting X]' scenario.
- Be direct and specific. No hedging language. Write as a senior trader briefing a junior.

Market Data Input:
${JSON.stringify(ictContext, null, 2)}
`;

    try {
      const rawKey = process.env.GEMINI_API_KEY || '';
      let availableKeys = rawKey.split(',').map(k => k.trim()).filter(Boolean);
      if (availableKeys.length === 0) throw new Error('No GEMINI_API_KEY configured');
      
      // Helper to call Gemini with automatic key rotation on 429
      const callGemini = async () => {
        if (availableKeys.length === 0) throw new Error('All available Gemini API keys exhausted (429)');
        
        // Pick a random key from the available pool
        const keyIndex = Math.floor(Math.random() * availableKeys.length);
        const apiKey = availableKeys[keyIndex];
        const genAI = new GoogleGenerativeAI(apiKey);
        const ai = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

        try {
          // Tell it to output JSON
          const result = await ai.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          });
          const response = await result.response;
          return { text: response.text() };
        } catch (err) {
          const is429 = err?.status === 429 || (err?.message || '').includes('429') || (err?.message || '').includes('quota');
          if (is429) {
            console.log(`Gemini 429 on key ending in ${apiKey.slice(-4)} — removing from pool and retrying...`);
            // Remove the exhausted key from the pool
            availableKeys.splice(keyIndex, 1);
            // Wait 2 seconds before retrying with a new key
            await new Promise(r => setTimeout(r, 2000));
            return callGemini(); 
          }
          throw err;
        }
      };

      const response = await callGemini();

      const jsonResult = JSON.parse(response.text);

      let finalVerdict = jsonResult.verdict || snapshot.verdict;
      
      // HARD GATE Server-Side Enforcement
      if (snapshot.verdict === 'WAIT' && finalVerdict !== 'WAIT') {
        console.warn(`[Hard Gate] Gemini attempted to override mechanical WAIT with ${finalVerdict}. Forcefully downgrading to WAIT.`);
        finalVerdict = 'WAIT';
      } else if (snapshot.verdict !== 'WAIT' && finalVerdict !== snapshot.verdict && finalVerdict !== 'WAIT') {
        console.warn(`[Hard Gate] Gemini attempted to flip mechanical ${snapshot.verdict} to ${finalVerdict}. Forcefully downgrading to WAIT.`);
        finalVerdict = 'WAIT';
      }

      const result = {
        verdict:     finalVerdict,
        confidence:  jsonResult.confidence  || snapshot.confidence,
        lanes:       snapshot.lanes,

        // New 8-section structured fields
        market_structure_read: jsonResult.market_structure_read || null,
        liquidity_context:     jsonResult.liquidity_context     || null,
        session_timing:        jsonResult.session_timing        || null,
        confluence_check:      jsonResult.confluence_check      || null,
        thesis:                jsonResult.thesis                || null,
        weakest_point:         jsonResult.weakest_point         || null,
        overview:              jsonResult.overview              || null,
        overview_confidence_score: calculatedScore,
        conviction_score_explanation: jsonResult.conviction_score_explanation || null,
        entry_price_num: jsonResult.entry_price_num ?? null,
        invalidation_price_num: jsonResult.invalidation_price_num ?? null,
        target_price_num: jsonResult.target_price_num ?? null,

        // Legacy/compatible fields
        reasoning:   jsonResult.thesis || jsonResult.reasoning  || 'AI narrative unavailable.',
        setup:       jsonResult.setup       || null,
        watch_zone:  jsonResult.watch_zone  || snapshot.watch_zone,
        invalidation: jsonResult.invalidation || snapshot.invalidation,
        risk_sizing: jsonResult.risk_sizing || "N/A",
        
        // Expose new metrics for frontend
        session:     ictContext.current_session,
        mtf:         ictContext.mtf_alignment,
        poc:         ictContext.volume_point_of_control,
        news:        ictContext.upcoming_high_impact_news,
        liquidity:   zones?.liquidity ?? null,
      };

      // Write-on-Verdict Logic
      if (result.verdict) {
        try {
          const confluenceFactors = [
            result.market_structure_read ? "Market Structure" : null,
            result.liquidity_context ? "Liquidity Context" : null,
            result.session_timing ? "Session Timing" : null,
            result.confluence_check ? "Indicator Confluence" : null
          ].filter(Boolean);

          await db.query(
            `INSERT INTO ai_verdicts (
              timestamp, pair, timeframe, verdict, conviction_score,
              entry_price, invalidation_price, target_price,
              confluence_factors, full_json_snapshot, full_ai_output
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              new Date(now).toISOString(),
              symbol,
              timeframe,
              result.verdict,
              result.overview_confidence_score || 0,
              result.entry_price_num,
              result.invalidation_price_num,
              result.target_price_num,
              JSON.stringify(confluenceFactors),
              JSON.stringify(ictContext),
              JSON.stringify(jsonResult)
            ]
          );
        } catch (dbErr) {
          console.error('Failed to log AI verdict to DB:', dbErr.message);
        }
      }

      this.cache.set(cacheKey, { time: now, result });
      return { ...result, cached: false };

    } catch (err) {
      // Log the full error so it appears in Render logs
      console.error('AI Narrative Error:', err.message || err, '\nStatus:', err.status, '\nDetails:', JSON.stringify(err.errorDetails || err.response || ''));
      const errReason = err.message ? `(${err.message.slice(0, 80)})` : '';
      return {
        verdict:      snapshot.verdict,
        confidence:   snapshot.confidence,
        lanes:        snapshot.lanes,
        reasoning:    `AI commentary unavailable ${errReason}. Rule-based verdict active.`,
        setup:        null,
        watch_zone:   snapshot.watch_zone,
        invalidation: snapshot.invalidation,
        risk_sizing:  "N/A",
        liquidity:    zones?.liquidity ?? null,
        cached:       false,
        fallback:     true,
      };
    }
  }
}

module.exports = Synthesizer;
