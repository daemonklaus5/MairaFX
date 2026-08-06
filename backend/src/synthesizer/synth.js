const { GoogleGenAI } = require('@google/genai');

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
   * Now async because MacroLane.evaluate() fetches live DXY/SPX.
   */
  async evaluateRuleBased(symbol, timeframe, currentPrice, zones) {
    const marketStructure = zones?.marketStructure ?? null;
    const LANE_FALLBACK = { bias: 'mixed', tier: 'low', score: 0, basis: 'Lane unavailable' };

    // Evaluate each lane independently — a single failure returns a neutral fallback
    let t = LANE_FALLBACK, f = LANE_FALLBACK, n = LANE_FALLBACK, m = LANE_FALLBACK;

    try { t = this.lanes.technical.evaluate(symbol, timeframe, currentPrice, marketStructure); }
    catch (err) { console.error('TechnicalLane error:', err.message); }

    try { f = this.lanes.flow.evaluate(symbol); }
    catch (err) { console.error('FlowLane error:', err.message); }

    try { n = this.lanes.narrative.evaluate(symbol); }
    catch (err) { console.error('NarrativeLane error:', err.message); }

    try { m = await this.lanes.macro.evaluate(symbol); }
    catch (err) { console.error('MacroLane error:', err.message); }

    let bullScore = 0, bearScore = 0;
    [t, f, n, m].forEach(lane => {
      if (lane.bias === 'bull') bullScore += lane.score;
      if (lane.bias === 'bear') bearScore += Math.abs(lane.score);
    });

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

    return { verdict, confidence, lanes: { technical: t, flow: f, narrative: n, macro: m }, watch_zone, invalidation };
  }

  /**
   * Build a rich ICT-aware context object to pass to Gemini.
   */
  _buildIctContext(zones, snapshot) {
    const ctx = {
      rule_based_verdict:    snapshot.verdict,
      rule_based_confidence: snapshot.confidence,
      lane_verdicts:         snapshot.lanes,
    };

    if (!zones) return ctx;

    ctx.current_price = zones.currentPrice;

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

    const unmitigatedOBs = (zones.orderBlocks || []).filter(ob => !ob.mitigated).slice(-4);
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
  async getAiNarrative(symbol, snapshot, zones) {
    const cacheKey = `${symbol}_narrative`;
    const cached   = this.cache.get(cacheKey);
    const now      = Date.now();

    // 15-minute cache — prevents hammering the API on every Analyze click
    if (cached && (now - cached.time < 900_000)) {
      return { ...cached.result, cached: true };
    }

    const ictContext = this._buildIctContext(zones, snapshot);

    const prompt = `
You are a professional institutional forex trader who trades using the ICT (Inner Circle Trader) methodology.
You are given structured market data and must produce a concise, high-conviction trading analysis.

Output ONLY strict JSON matching this schema (no extra keys):
{
  "verdict": "WAIT" | "LONG" | "SHORT",
  "reasoning": "<string — max 100 words, ICT language>",
  "setup": "<string — specific entry model, e.g. 'Bearish OB retest at 1.1521 targeting SSL at 1.1468'>",
  "watch_zone": "<string — specific price level or zone to watch>",
  "invalidation": ["<string>", "<string>"]
}

ICT Analytical Framework (apply strictly):
1. LIQUIDITY FIRST: Price is always seeking liquidity. Identify where BSL or SSL clusters sit and whether price is being drawn toward them.
2. PREMIUM / DISCOUNT: In a premium zone (price > midpoint), favor short entries. In a discount zone, favor long entries. Never go long in premium or short in discount without extreme confluence.
3. ORDER BLOCKS: An unmitigated OB is a high-probability entry zone. A bullish OB is the last bearish candle before a strong bullish impulse. A bearish OB is the last bullish candle before a strong bearish impulse.
4. FAIR VALUE GAPS (FVG): Price returns to fill imbalances. An active FVG is a magnet for price.
5. MARKET STRUCTURE: BOS (Break of Structure) confirms trend continuation. CHoCH (Change of Character) warns of a reversal — reduce conviction significantly.
6. KILL ZONES: London Open (06:00–09:00 UTC) and NY Open (12:00–15:00 UTC) are the highest-probability times for entries. Flag if we are currently in a kill zone.
7. CONFLUENCE: Only call LONG or SHORT when at least 3 ICT factors align (structure + liquidity target + OB or FVG + session). Otherwise call WAIT.
8. LANGUAGE: Never use "might", "could possibly", "potentially". State analysis plainly. The confidence tier communicates uncertainty.
9. SETUP FIELD: Must be a concrete trade description — entry zone, target, and type of model (OB retest, FVG fill, liquidity sweep, etc.). If WAIT, set setup to "No valid ICT entry model present".

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
        const ai = new GoogleGenAI({ apiKey });

        try {
          return await ai.models.generateContent({
            model:    'gemini-2.0-flash-lite',
            contents: prompt,
            config:   { responseMimeType: 'application/json' },
          });
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

      const result = {
        verdict:     jsonResult.verdict     || snapshot.verdict,
        confidence:  snapshot.confidence,
        lanes:       snapshot.lanes,
        reasoning:   jsonResult.reasoning   || 'AI narrative unavailable.',
        setup:       jsonResult.setup       || null,
        watch_zone:  jsonResult.watch_zone  || snapshot.watch_zone,
        invalidation: jsonResult.invalidation || snapshot.invalidation,
        // Expose liquidity for the frontend display
        liquidity:   zones?.liquidity ?? null,
      };

      this.cache.set(cacheKey, { time: now, result });
      return { ...result, cached: false };

    } catch (err) {
      const is429 = err?.status === 429 || (err?.message || '').includes('429') || (err?.message || '').includes('quota');
      console.error('AI Narrative Error:', err.message || err, '\nStatus:', err.status);
      const errReason = is429
        ? '(Rate limit — wait a moment and try again)'
        : err.message ? `(${err.message.slice(0, 80)})` : '';
      return {
        verdict:      snapshot.verdict,
        confidence:   snapshot.confidence,
        lanes:        snapshot.lanes,
        reasoning:    `AI commentary unavailable ${errReason}. Rule-based verdict active.`,
        setup:        null,
        watch_zone:   snapshot.watch_zone,
        invalidation: snapshot.invalidation,
        liquidity:    zones?.liquidity ?? null,
        cached:       false,
        fallback:     true,
      };
    }
  }
}

module.exports = Synthesizer;
