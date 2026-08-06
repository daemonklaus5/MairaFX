const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

class MacroLane {
  constructor() {
    // Cache DXY + SPX so the Analyze call stays fast
    this._cache     = null;
    this._cacheTime = 0;
    this._cacheTtl  = 15 * 60 * 1000; // 15 minutes
  }

  async _fetchMacro() {
    const now = Date.now();
    if (this._cache && now - this._cacheTime < this._cacheTtl) {
      return this._cache;
    }

    try {
      // DXY — Dollar Index
      const dxyResult = await yahooFinance.quote('DX-Y.NYB');
      const dxyChange = dxyResult?.regularMarketChangePercent ?? 0;
      const dxyPrice  = dxyResult?.regularMarketPrice ?? null;

      // SPX — Risk sentiment proxy
      const spxResult = await yahooFinance.quote('^GSPC');
      const spxChange = spxResult?.regularMarketChangePercent ?? 0;
      const riskOn    = spxChange >= 0;

      const data = { dxyChange, dxyPrice, spxChange, riskOn };
      this._cache     = data;
      this._cacheTime = now;
      return data;
    } catch (err) {
      console.error('MacroLane: failed to fetch DXY/SPX:', err.message);
      // Return stale cache if available, else fallback
      return this._cache ?? { dxyChange: 0, dxyPrice: null, spxChange: 0, riskOn: true };
    }
  }

  async evaluate(symbol) {
    const { dxyChange, dxyPrice, spxChange, riskOn } = await this._fetchMacro();

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
        score += 15;
        basis.push(`Risk-on (${spxDesc}) — favors base`);
      } else if (symbol === 'USD_JPY') {
        score += 15;
        basis.push(`Risk-on (${spxDesc}) — JPY weakness`);
      } else {
        basis.push(`Risk-on (${spxDesc})`);
      }
    } else {
      if (['AUD_USD', 'EUR_USD', 'GBP_USD'].includes(symbol)) {
        score -= 15;
        basis.push(`Risk-off (${spxDesc}) — hurts base`);
      } else if (symbol === 'USD_JPY') {
        score -= 15;
        basis.push(`Risk-off (${spxDesc}) — JPY strength`);
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
