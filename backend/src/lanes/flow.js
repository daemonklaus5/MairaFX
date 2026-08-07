const rateFetcher = require('../ingestion/rate_fetcher');

class FlowLane {
  constructor(cotJob) {
    this.cotJob = cotJob;
  }

  async evaluate(symbol) {
    let score = 0;
    const basis = [];
    const [base, quote] = symbol.split('_');

    // Fetch live central bank rates (24h cached; falls back to hardcoded defaults)
    const rates = await rateFetcher.getRates();

    const baseRate  = rates[base]  ?? 0;
    const quoteRate = rates[quote] ?? 0;
    const diff = baseRate - quoteRate;

    if (diff > 1.0) {
      score += 20;
      basis.push(`Strong positive carry (+${diff.toFixed(2)}% — ${base} ${baseRate}% vs ${quote} ${quoteRate}%)`);
    } else if (diff > 0) {
      score += 10;
      basis.push(`Positive carry (+${diff.toFixed(2)}% — ${base} ${baseRate}% vs ${quote} ${quoteRate}%)`);
    } else if (diff < -1.0) {
      score -= 20;
      basis.push(`Strong negative carry (${diff.toFixed(2)}% — ${base} ${baseRate}% vs ${quote} ${quoteRate}%)`);
    } else if (diff < 0) {
      score -= 10;
      basis.push(`Negative carry (${diff.toFixed(2)}% — ${base} ${baseRate}% vs ${quote} ${quoteRate}%)`);
    } else {
      basis.push(`Neutral carry (${base} ${baseRate}% = ${quote} ${quoteRate}%)`);
    }

    const cotData = this.cotJob ? this.cotJob.getLatest(symbol) : null;

    if (cotData) {
      // Assuming cotData gives net long/short as a percentage of open interest
      if (cotData.netLongPct > 40) {
        score += 20;
        basis.push(`Institutional COT heavily net long (${cotData.netLongPct.toFixed(1)}%)`);
      } else if (cotData.netLongPct > 10) {
        score += 10;
        basis.push(`Institutional COT mildly net long (${cotData.netLongPct.toFixed(1)}%)`);
      } else if (cotData.netShortPct > 40) {
        score -= 20;
        basis.push(`Institutional COT heavily net short (${cotData.netShortPct.toFixed(1)}%)`);
      } else if (cotData.netShortPct > 10) {
        score -= 10;
        basis.push(`Institutional COT mildly net short (${cotData.netShortPct.toFixed(1)}%)`);
      }
    } else {
      basis.push('No COT data available');
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

module.exports = FlowLane;
