const { fetchForexNews } = require('../ingestion/finnhub_news');

// Currency code → country/currency names to search in headlines
const CURRENCY_KEYWORDS = {
  USD: ['usd', 'dollar', 'fed', 'federal reserve', 'fomc', 'powell', 'us economy', 'us gdp', 'us inflation', 'us jobs', 'nonfarm'],
  EUR: ['eur', 'euro', 'ecb', 'european central bank', 'lagarde', 'eurozone', 'eu economy'],
  GBP: ['gbp', 'pound', 'sterling', 'boe', 'bank of england', 'bailey', 'uk economy', 'uk gdp', 'uk inflation'],
  JPY: ['jpy', 'yen', 'boj', 'bank of japan', 'ueda', 'japan', 'japanese'],
  AUD: ['aud', 'aussie', 'rba', 'reserve bank of australia', 'australia', 'australian'],
  CAD: ['cad', 'canadian dollar', 'boc', 'bank of canada', 'canada', 'canadian'],
  CHF: ['chf', 'franc', 'snb', 'swiss national bank', 'switzerland', 'swiss'],
  NZD: ['nzd', 'kiwi', 'rbnz', 'reserve bank of new zealand', 'new zealand'],
};

// Bullish keywords (favour the first-mentioned currency)
const BULLISH_WORDS = [
  'rate hike', 'hawkish', 'tightening', 'strong', 'beat', 'beats', 'beats expectations',
  'better than expected', 'surges', 'rally', 'bullish', 'recovery', 'growth',
  'hot inflation', 'higher rates', 'rate increase', 'outperform',
];

// Bearish keywords
const BEARISH_WORDS = [
  'rate cut', 'dovish', 'easing', 'weak', 'miss', 'misses', 'misses expectations',
  'worse than expected', 'falls', 'slump', 'bearish', 'recession', 'contraction',
  'lower rates', 'rate decrease', 'underperform', 'disappoints', 'slowdown',
];

const NEWS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

class NarrativeLane {
  constructor() {
    this._cache = null;
    this._cacheTime = 0;
  }

  /**
   * Fetches recent forex headlines from Finnhub, filters to those mentioning
   * the base or quote currency, then scores bullish/bearish sentiment via
   * keyword matching. Returns a meaningful bias/score for the pair.
   */
  async evaluate(symbol) {
    const [base, quote] = symbol.split('_');
    const apiKey = process.env.FINNHUB_API_KEY;

    if (!apiKey) {
      return { bias: 'mixed', tier: 'low', score: 0, basis: 'No FINNHUB_API_KEY — news unavailable' };
    }

    // Refresh news cache every 10 minutes
    const now = Date.now();
    if (!this._cache || now - this._cacheTime > NEWS_CACHE_TTL_MS) {
      try {
        this._cache = await fetchForexNews(apiKey, 20);
        this._cacheTime = now;
      } catch (err) {
        console.warn('[NarrativeLane] News fetch failed:', err.message);
        this._cache = this._cache || [];
      }
    }

    const articles = this._cache || [];
    if (articles.length === 0) {
      return { bias: 'mixed', tier: 'low', score: 0, basis: 'No recent forex news available' };
    }

    // Keywords to match against for each currency in the pair
    const baseKws  = CURRENCY_KEYWORDS[base]  || [base.toLowerCase()];
    const quoteKws = CURRENCY_KEYWORDS[quote] || [quote.toLowerCase()];

    let score = 0;
    const scoredHeadlines = [];

    for (const article of articles) {
      const headline = (article.headline || '').toLowerCase();

      const mentionsBase  = baseKws.some(kw  => headline.includes(kw));
      const mentionsQuote = quoteKws.some(kw => headline.includes(kw));

      if (!mentionsBase && !mentionsQuote) continue; // not relevant to this pair

      const bullHit = BULLISH_WORDS.find(kw => headline.includes(kw));
      const bearHit = BEARISH_WORDS.find(kw => headline.includes(kw));

      if (!bullHit && !bearHit) continue; // no clear directional signal

      // Determine direction relative to the pair (base/quote)
      // If base currency mentioned + bullish → pair goes up (+)
      // If quote currency mentioned + bullish → pair goes down (−)
      let impact = 0;
      if (bullHit) {
        if (mentionsBase)  impact += 10;
        if (mentionsQuote) impact -= 10;
      }
      if (bearHit) {
        if (mentionsBase)  impact -= 10;
        if (mentionsQuote) impact += 10;
      }

      // Cap per-headline contribution to avoid one headline dominating
      impact = Math.max(-10, Math.min(10, impact));
      score += impact;

      scoredHeadlines.push(
        `${impact > 0 ? '↑' : '↓'} "${article.headline.slice(0, 80)}..." (${impact > 0 ? '+' : ''}${impact})`
      );
    }

    // Cap total score
    score = Math.max(-40, Math.min(40, score));

    const absScore = Math.abs(score);
    const tier = absScore >= 30 ? 'high' : absScore >= 15 ? 'moderate' : 'low';
    const bias = score >= 10 ? 'bull' : score <= -10 ? 'bear' : 'mixed';

    const basis = scoredHeadlines.length > 0
      ? `${scoredHeadlines.length} relevant headlines: ${scoredHeadlines.slice(0, 3).join(' | ')}`
      : `No directional headlines found for ${base}/${quote}`;

    const lastUpdated = new Date(this._cacheTime).toISOString();
    return { bias, tier, score, basis, lastUpdated };
  }
}

module.exports = NarrativeLane;
