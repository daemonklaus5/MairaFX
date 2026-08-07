const yahooFinance = require('yahoo-finance2').default;

class MacroLane {
  constructor() {
    this._cache     = null;
    this._cacheTime = 0;
    this._cacheTtl  = 15 * 60 * 1000; // 15 minutes
  }

  async _fetchMacro() {
    const now = Date.now();
    if (this._cache && now - this._cacheTime < this._cacheTtl) {
      return this._cache;
    }

    // Hard 6s timeout — Yahoo Finance can hang indefinitely
    const withTimeout = (promise, ms) =>
      Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Yahoo timeout')), ms))]);

    try {
      yahooFinance.suppressNotices(['yahooSurvey']);

      const [dxy, spx] = await Promise.all([
        withTimeout(yahooFinance.quote('DX-Y.NYB'), 6000).catch(() => null),
        withTimeout(yahooFinance.quote('^GSPC'),    6000).catch(() => null),
      ]);

      const data = {
        dxyChange: dxy?.regularMarketChangePercent ?? 0,
        dxyPrice:  dxy?.regularMarketPrice ?? null,
        spxChange: spx?.regularMarketChangePercent ?? 0,
        riskOn:    (spx?.regularMarketChangePercent ?? 0) >= 0,
      };

      this._cache     = data;
      this._cacheTime = now;
      return data;
    } catch (err) {
      console.error('MacroLane._fetchMacro error:', err.message);
      return this._cache ?? { dxyChange: 0, dxyPrice: null, spxChange: 0, riskOn: true };
    }
  }

  async evaluate(symbol) {
    let dxyChange = 0, dxyPrice = null, spxChange = 0, riskOn = true;

    try {
      const macro = await this._fetchMacro();
      dxyChange = macro.dxyChange;
      dxyPrice  = macro.dxyPrice;
      spxChange = macro.spxChange;
      riskOn    = macro.riskOn;
    } catch (err) {
      console.error('MacroLane.evaluate fetch error:', err.message);
      // Use neutral fallback — don't crash the analysis
    }

    let score = 0;
    const basis = [];
    const isUsdQuote = symbol.endsWith('_USD');
    const isUsdBase  = symbol.startsWith('USD_');

    // ── DXY Direction ──
    const dxyLabel = dxyPrice ? ` (DXY ${dxyPrice.toFixed(2)})` : '';
    if (dxyChange > 0.3) {
      if (isUsdQuote) { score -= 20; basis.push(`DXY up ${dxyChange.toFixed(2)}%${dxyLabel} — headwind`); }
      if (isUsdBase)  { score += 20; basis.push(`DXY up ${dxyChange.toFixed(2)}%${dxyLabel} — tailwind`); }
    } else if (dxyChange < -0.3) {
      if (isUsdQuote) { score += 20; basis.push(`DXY down ${dxyChange.toFixed(2)}%${dxyLabel} — tailwind`); }
      if (isUsdBase)  { score -= 20; basis.push(`DXY down ${dxyChange.toFixed(2)}%${dxyLabel} — headwind`); }
    } else {
      basis.push(`DXY flat (${dxyChange.toFixed(2)}%${dxyLabel})`);
    }

    // ── SPX / Risk Sentiment ──
    const spxDesc = `SPX ${spxChange >= 0 ? '+' : ''}${spxChange.toFixed(2)}%`;
    if (riskOn) {
      if (['AUD_USD', 'EUR_USD', 'GBP_USD'].includes(symbol)) {
        score += 15; basis.push(`Risk-on (${spxDesc}) — favors base`);
      } else if (symbol === 'USD_JPY') {
        score += 15; basis.push(`Risk-on (${spxDesc}) — JPY weakness`);
      } else {
        basis.push(`Risk-on (${spxDesc})`);
      }
    } else {
      if (['AUD_USD', 'EUR_USD', 'GBP_USD'].includes(symbol)) {
        score -= 15; basis.push(`Risk-off (${spxDesc}) — hurts base`);
      } else if (symbol === 'USD_JPY') {
        score -= 15; basis.push(`Risk-off (${spxDesc}) — JPY strength`);
      } else {
        basis.push(`Risk-off (${spxDesc})`);
      }
    }

    const absScore = Math.abs(score);
    const tier = absScore >= 30 ? 'high' : absScore >= 15 ? 'moderate' : 'low';
    const bias = score >= 15 ? 'bull' : score <= -15 ? 'bear' : 'mixed';

    return { bias, tier, score, basis: basis.join(', ') };
  }
}

module.exports = MacroLane;
