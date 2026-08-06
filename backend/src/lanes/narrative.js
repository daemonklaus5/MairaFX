class NarrativeLane {
  // Simplified for V1: Uses a mocked/static state until ForexFactory RSS is parsed
  evaluate(symbol, recentEvents = []) {
    let score = 0;
    const basis = [];

    if (recentEvents.length === 0) {
      return { bias: 'mixed', tier: 'low', score: 0, basis: 'No recent tier-1 events' };
    }

    for (const event of recentEvents) {
      if (event.impact === 'High') {
        if (event.sentiment === 'positive') score += 15;
        if (event.sentiment === 'negative') score -= 15;
        basis.push(`${event.title} (${event.sentiment})`);
      }
    }

    let tier = 'low';
    if (Math.abs(score) >= 30) tier = 'high';
    else if (Math.abs(score) >= 15) tier = 'moderate';

    let bias = 'mixed';
    if (score >= 15) bias = 'bull';
    if (score <= -15) bias = 'bear';

    return { bias, tier, score, basis: basis.join(', ') || 'Neutral news flow' };
  }
}

module.exports = NarrativeLane;
