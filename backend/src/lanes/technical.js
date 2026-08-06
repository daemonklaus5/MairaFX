class TechnicalLane {
  constructor(engine) {
    this.engine = engine;
  }

  /**
   * Returns the current ICT trading session and whether we're in a kill zone.
   * Kill zones are London Open (06:00–09:00 UTC) and NY Open (12:00–15:00 UTC).
   */
  getSession() {
    const utcHour = new Date().getUTCHours();
    const utcMin  = new Date().getUTCMinutes();
    const t = utcHour + utcMin / 60;

    if (t >= 6 && t < 9)   return { session: 'London Open',  killZone: true };
    if (t >= 9 && t < 12)  return { session: 'London',       killZone: false };
    if (t >= 12 && t < 15) return { session: 'NY Open',      killZone: true };
    if (t >= 15 && t < 17) return { session: 'London Close', killZone: false };
    if (t >= 17 && t < 21) return { session: 'NY',           killZone: false };
    return { session: 'Asian', killZone: false };
  }

  evaluate(symbol, timeframe, currentPrice, marketStructure = null) {
    const indicators = this.engine.getLatest(symbol, timeframe);
    if (!indicators) {
      return { bias: 'mixed', tier: 'low', score: 0, basis: 'No indicator data yet' };
    }

    let score = 0;
    const basis = [];

    // ── EMA Stack ──
    let { ema9, ema21, ema50, ema200, rsi14, adx } = indicators;
    ema9 = ema9 ? parseFloat(ema9) : null;
    ema21 = ema21 ? parseFloat(ema21) : null;
    ema50 = ema50 ? parseFloat(ema50) : null;
    ema200 = ema200 ? parseFloat(ema200) : null;
    rsi14 = rsi14 ? parseFloat(rsi14) : null;
    adx = adx ? parseFloat(adx) : null;

    if (ema9 && ema21 && ema50 && ema200) {
      if (ema9 > ema21 && ema21 > ema50 && ema50 > ema200) {
        score += 25;
        basis.push('EMA stack bullish (9>21>50>200)');
      } else if (ema9 < ema21 && ema21 < ema50 && ema50 < ema200) {
        score -= 25;
        basis.push('EMA stack bearish (9<21<50<200)');
      } else {
        basis.push('EMA stack mixed');
      }
    }

    // ── RSI ──
    if (rsi14 !== null) {
      if (rsi14 >= 50 && rsi14 <= 70)    { score += 10; basis.push(`RSI bullish (${rsi14.toFixed(1)})`); }
      else if (rsi14 > 70)               { score -= 5;  basis.push(`RSI overbought (${rsi14.toFixed(1)})`); }
      else if (rsi14 < 30)               { score += 5;  basis.push(`RSI oversold (${rsi14.toFixed(1)}) — bounce potential`); }
      else                               { score -= 10; basis.push(`RSI bearish (${rsi14.toFixed(1)})`); }
    }

    // ── Price vs 200 EMA ──
    if (ema200) {
      if (currentPrice > ema200) { score += 15; basis.push('Price above 200 EMA'); }
      else                       { score -= 15; basis.push('Price below 200 EMA'); }
    }

    // ── ADX regime ──
    if (adx !== null)  basis.push(adx > 25 ? `Trending (ADX ${adx.toFixed(1)})` : `Ranging (ADX ${adx.toFixed(1)})`);

    // ── ICT Market Structure alignment ──
    if (marketStructure) {
      const { trend, structure, choch, premiumDiscount, bos } = marketStructure;

      if (trend === 'bullish') {
        score += 15;
        basis.push(`Structure bullish (${structure})`);
      } else if (trend === 'bearish') {
        score -= 15;
        basis.push(`Structure bearish (${structure})`);
      }

      if (choch) {
        basis.push('CHoCH detected — trend reversal signal');
        score = Math.round(score * 0.5); // reduce conviction on reversal warning
      }

      if (bos) {
        basis.push(`BOS ${bos.direction} @ ${bos.level.toFixed(5)}`);
        if (bos.direction === 'bullish') score += 10;
        else score -= 10;
      }

      // Premium zone = look for shorts; discount = look for longs
      basis.push(`Price in ${premiumDiscount} zone`);
      if (premiumDiscount === 'premium' && score > 0) {
        basis.push('Caution: overbought position within premium zone');
      }
      if (premiumDiscount === 'discount' && score < 0) {
        basis.push('Caution: oversold within discount zone');
      }
    }

    // ── Session & Kill Zone ──
    const { session, killZone } = this.getSession();
    basis.push(`Session: ${session}${killZone ? ' ⚡ Kill Zone' : ''}`);
    if (killZone) score = Math.round(score * 1.1); // amplify during high-probability windows

    // ── Final tier/bias ──
    const absScore = Math.abs(score);
    const tier = absScore >= 40 ? 'high' : absScore >= 20 ? 'moderate' : 'low';
    const bias = score >= 20 ? 'bull' : score <= -20 ? 'bear' : 'mixed';

    return { bias, tier, score, basis: basis.join(', ') };
  }
}

module.exports = TechnicalLane;
