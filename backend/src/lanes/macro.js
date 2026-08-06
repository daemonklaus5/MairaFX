class MacroLane {
  // Simplified for V1: static logic
  evaluate(symbol, dxyChange = 0, riskOn = true) {
    let score = 0;
    const basis = [];
    const isUsdQuote = symbol.endsWith('_USD');
    const isUsdBase = symbol.startsWith('USD_');

    if (dxyChange > 0.5) { // DXY up strongly
      if (isUsdQuote) { score -= 20; basis.push('Strong DXY headwind'); }
      if (isUsdBase) { score += 20; basis.push('Strong DXY tailwind'); }
    } else if (dxyChange < -0.5) { // DXY down strongly
      if (isUsdQuote) { score += 20; basis.push('Strong DXY tailwind'); }
      if (isUsdBase) { score -= 20; basis.push('Strong DXY headwind'); }
    } else {
      basis.push('DXY neutral');
    }

    if (riskOn) {
      // Risk on favors EUR, GBP, AUD, hurts USD, JPY
      if (symbol === 'AUD_USD' || symbol === 'EUR_USD' || symbol === 'GBP_USD') {
        score += 15;
        basis.push('Risk-on environment favors base');
      }
      if (symbol === 'USD_JPY') {
        score += 15;
        basis.push('Risk-on environment hurts safe-haven JPY');
      }
    } else {
      // Risk off
      if (symbol === 'AUD_USD' || symbol === 'EUR_USD' || symbol === 'GBP_USD') {
        score -= 15;
        basis.push('Risk-off environment hurts base');
      }
      if (symbol === 'USD_JPY') {
        score -= 15;
        basis.push('Risk-off environment favors safe-haven JPY');
      }
    }

    let tier = 'low';
    if (Math.abs(score) >= 30) tier = 'high';
    else if (Math.abs(score) >= 15) tier = 'moderate';

    let bias = 'mixed';
    if (score >= 15) bias = 'bull';
    if (score <= -15) bias = 'bear';

    return { bias, tier, score, basis: basis.join(', ') };
  }
}

module.exports = MacroLane;
