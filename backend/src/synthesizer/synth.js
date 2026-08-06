const { GoogleGenAI } = require('@google/genai');

class Synthesizer {
  constructor(technicalLane, flowLane, narrativeLane, macroLane) {
    this.lanes = {
      technical: technicalLane,
      flow: flowLane,
      narrative: narrativeLane,
      macro: macroLane
    };
    this.cache = new Map();
  }

  evaluateRuleBased(symbol, timeframe, currentPrice, zones) {
    const t = this.lanes.technical.evaluate(symbol, timeframe, currentPrice);
    const f = this.lanes.flow.evaluate(symbol);
    const n = this.lanes.narrative.evaluate(symbol);
    const m = this.lanes.macro.evaluate(symbol);

    let bullScore = 0;
    let bearScore = 0;

    [t, f, n, m].forEach(lane => {
      if (lane.bias === 'bull') bullScore += lane.score;
      if (lane.bias === 'bear') bearScore += Math.abs(lane.score);
    });

    let verdict = 'WAIT';
    let confidence = 'low';

    if (bullScore > bearScore + 40) {
      verdict = 'LONG';
      confidence = bullScore > 80 ? 'high' : 'moderate';
    } else if (bearScore > bullScore + 40) {
      verdict = 'SHORT';
      confidence = bearScore > 80 ? 'high' : 'moderate';
    }

    // Nearest watch zone logic
    let watchZone = 'No clear zone';
    let invalidation = [];

    if (zones && zones.support.length > 0 && verdict === 'LONG') {
      watchZone = `Support at ${zones.support[0].price.toFixed(4)}`;
      invalidation.push(`Close below ${zones.support[0].min.toFixed(4)}`);
    } else if (zones && zones.resistance.length > 0 && verdict === 'SHORT') {
      watchZone = `Resistance at ${zones.resistance[0].price.toFixed(4)}`;
      invalidation.push(`Close above ${zones.resistance[0].max.toFixed(4)}`);
    }

    return {
      verdict,
      confidence,
      lanes: { technical: t, flow: f, narrative: n, macro: m },
      watch_zone: watchZone,
      invalidation
    };
  }

  async getAiNarrative(symbol, snapshot) {
    const cacheKey = `${symbol}_narrative`;
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    // 2 min cache
    if (cached && (now - cached.time < 120000)) {
      return { ...cached.result, cached: true };
    }

    const prompt = `
You are a trading desk analyst. You will be given structured JSON with four
lane scores (technical, flow, narrative, macro), their weighted verdict, and
specific price levels for a forex pair. Output strict JSON matching this
schema: { verdict: "WAIT"|"LONG"|"SHORT", reasoning: string,
watch_zone: string, invalidation: string[] }.

Rules:
- Use ONLY the numbers given in the input JSON. Never invent a price, RSI
  value, or percentage not present in the input.
- Keep reasoning under 80 words.
- No hedging language like "might" or "could possibly" — state the verdict
  plainly; the confidence tier already communicates uncertainty.

Input:
${JSON.stringify(snapshot, null, 2)}
    `;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('No Gemini API key');

      // Initialize the new Google Gen AI SDK
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      const text = response.text;
      const jsonResult = JSON.parse(text);

      const result = {
        verdict: jsonResult.verdict || snapshot.verdict,
        confidence: snapshot.confidence,
        lanes: snapshot.lanes,
        reasoning: jsonResult.reasoning || "AI narrative unavailable.",
        watch_zone: jsonResult.watch_zone || snapshot.watch_zone,
        invalidation: jsonResult.invalidation || snapshot.invalidation
      };

      this.cache.set(cacheKey, { time: now, result });
      return { ...result, cached: false };

    } catch (err) {
      console.error('AI Narrative Error:', err.message);
      return {
        verdict: snapshot.verdict,
        confidence: snapshot.confidence,
        lanes: snapshot.lanes,
        reasoning: "AI commentary is temporarily unavailable. Using rule-based fallback.",
        watch_zone: snapshot.watch_zone,
        invalidation: snapshot.invalidation,
        cached: false,
        fallback: true
      };
    }
  }
}

module.exports = Synthesizer;
