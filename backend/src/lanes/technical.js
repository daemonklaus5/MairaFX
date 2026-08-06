class TechnicalLane {
  constructor(engine) {
    this.engine = engine;
  }

  evaluate(symbol, timeframe, currentPrice) {
    const indicators = this.engine.getLatest(symbol, timeframe);
    if (!indicators) return { bias: 'mixed', tier: 'low', score: 0, basis: 'No indicator data yet' };

    let score = 0;
    const basis = [];

    // EMA Stack
    if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50 && indicators.ema50 > indicators.ema200) {
      score += 25;
      basis.push('EMA stack aligned bullish (9>21>50>200)');
    } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50 && indicators.ema50 < indicators.ema200) {
      score -= 25;
      basis.push('EMA stack aligned bearish (9<21<50<200)');
    } else {
      basis.push('EMA stack mixed');
    }

    // RSI
    if (indicators.rsi14 >= 50 && indicators.rsi14 <= 70) {
      score += 10;
      basis.push('RSI healthy bullish (50-70)');
    } else if (indicators.rsi14 > 70) {
      score -= 5;
      basis.push('RSI overbought (>70)');
    } else if (indicators.rsi14 < 30) {
      score += 5;
      basis.push('RSI oversold (<30) bounce potential');
    } else if (indicators.rsi14 < 50) {
      score -= 10;
      basis.push('RSI bearish (<50)');
    }

    // Price vs 200 EMA
    if (currentPrice > indicators.ema200) {
      score += 15;
      basis.push('Price above 200 EMA');
    } else {
      score -= 15;
      basis.push('Price below 200 EMA');
    }

    // Trend Regime (ADX)
    if (indicators.adx > 25) {
      basis.push('Trending regime (ADX > 25)');
    } else {
      basis.push('Ranging regime (ADX < 25)');
    }

    // Tier mapping
    let tier = 'low';
    if (Math.abs(score) >= 40) tier = 'high';
    else if (Math.abs(score) >= 20) tier = 'moderate';

    let bias = 'mixed';
    if (score >= 20) bias = 'bull';
    if (score <= -20) bias = 'bear';

    return { bias, tier, score, basis: basis.join(', ') };
  }
}

module.exports = TechnicalLane;
