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

    // ── EMA Stack & Vector Math ──
    let { ema9, ema21, ema50, ema200, rsi14, adx } = indicators;
    ema9 = ema9 ? parseFloat(ema9) : null;
    ema21 = ema21 ? parseFloat(ema21) : null;
    ema50 = ema50 ? parseFloat(ema50) : null;
    ema200 = ema200 ? parseFloat(ema200) : null;
    rsi14 = rsi14 ? parseFloat(rsi14) : null;
    adx = adx ? parseFloat(adx) : null;

    if (ema9 && ema21 && ema50 && ema200) {
      // Calculate distance/slope between fast and slow to determine momentum vs ranging
      const spread = Math.abs(ema9 - ema50) / ema50;
      
      if (spread < 0.0005) { // 0.05% spread means EMAs are tightly wound
        basis.push('EMAs tightly compressed (Ranging Market)');
      } else {
        if (ema9 > ema21 && ema21 > ema50 && ema50 > ema200) {
          score += 25;
          basis.push('EMA stack strong bullish (sloping up)');
        } else if (ema9 < ema21 && ema21 < ema50 && ema50 < ema200) {
          score -= 25;
          basis.push('EMA stack strong bearish (sloping down)');
        } else {
          basis.push('EMA stack mixed (transitioning)');
        }
      }
    }

    // ── ADX Regime (Trend Strength) ──
    const isTrending = adx !== null && adx > 25;
    if (adx !== null) {
      basis.push(isTrending ? `Strong Trend (ADX ${adx.toFixed(1)})` : `Weak/Ranging (ADX ${adx.toFixed(1)})`);
    }

    // ── RSI + Trend Context ──
    if (rsi14 !== null) {
      if (isTrending) {
        // In strong trends, RSI stays overbought/oversold. Don't fade it!
        if (rsi14 > 70) {
          score += 10;
          basis.push(`RSI heavily overbought (${rsi14.toFixed(1)}) — Trend Continuation`);
        } else if (rsi14 < 30) {
          score -= 10;
          basis.push(`RSI heavily oversold (${rsi14.toFixed(1)}) — Trend Continuation`);
        } else {
          basis.push(`RSI neutral (${rsi14.toFixed(1)})`);
        }
      } else {
        // In ranging markets, fade the extremes
        if (rsi14 >= 50 && rsi14 <= 70)    { score += 10; basis.push(`RSI bullish (${rsi14.toFixed(1)})`); }
        else if (rsi14 > 70)               { score -= 15; basis.push(`RSI overbought (${rsi14.toFixed(1)}) — Mean Reversion Risk`); }
        else if (rsi14 < 30)               { score += 15; basis.push(`RSI oversold (${rsi14.toFixed(1)}) — Bounce Potential`); }
        else                               { score -= 10; basis.push(`RSI bearish (${rsi14.toFixed(1)})`); }
      }
    }

    // ── Price vs 200 EMA ──
    if (ema200) {
      const dist200 = Math.abs(currentPrice - ema200) / ema200;
      if (dist200 > 0.005) { // 0.5% away
        basis.push(currentPrice > ema200 ? 'Price overextended above 200 EMA' : 'Price overextended below 200 EMA');
      } else {
        if (currentPrice > ema200) { score += 15; basis.push('Price above 200 EMA'); }
        else                       { score -= 15; basis.push('Price below 200 EMA'); }
      }
    }

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
