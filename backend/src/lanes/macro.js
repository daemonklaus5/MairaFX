const https = require('https');

class MacroLane {
  constructor() {
    this._cache     = null;
    this._cacheTime = 0;
    this._cacheTtl  = 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Fetch a Yahoo Finance quote for a symbol using a direct HTTPS call.
   * Returns regularMarketChangePercent or 0 on any failure.
   */
  _fetchYahooQuote(symbol) {
    return new Promise((resolve) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketChangePercent,regularMarketPrice`;
      const options = {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 5000,
      };
      const req = https.get(url, options, (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);
            const result = json?.quoteResponse?.result?.[0];
            resolve({
              changePercent: result?.regularMarketChangePercent ?? 0,
              price:         result?.regularMarketPrice ?? null,
            });
          } catch {
            resolve({ changePercent: 0, price: null });
          }
        });
      });
      req.on('error', () => resolve({ changePercent: 0, price: null }));
      req.on('timeout', () => { req.destroy(); resolve({ changePercent: 0, price: null }); });
    });
  }

  async _fetchMacro() {
    const now = Date.now();
    if (this._cache && now - this._cacheTime < this._cacheTtl) {
      return this._cache;
    }

    try {
      // Fetch DXY and SPX in parallel with 5-sec timeout each
      const [dxy, spx] = await Promise.all([
        this._fetchYahooQuote('DX-Y.NYB'),
        this._fetchYahooQuote('%5EGSPC'),  // ^GSPC URL-encoded
      ]);

      const data = {
        dxyChange: dxy.changePercent,
        dxyPrice:  dxy.price,
        spxChange: spx.changePercent,
        riskOn:    spx.changePercent >= 0,
      };

      this._cache     = data;
      this._cacheTime = now;
      return data;
    } catch (err) {
      console.error('MacroLane._fetchMacro error:', err.message);
      // Return stale cache if available, else neutral fallback
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
