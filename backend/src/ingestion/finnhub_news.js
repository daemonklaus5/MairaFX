const https = require('https');

/**
 * Fetches forex-related news from Finnhub free news API.
 * Returns top N articles sorted by newest first.
 */
async function fetchForexNews(apiKey, limit = 10) {
  return new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const articles = JSON.parse(raw);
          if (!Array.isArray(articles)) {
            resolve([]);
            return;
          }
          // Sort newest first, take limit
          const sorted = articles
            .sort((a, b) => b.datetime - a.datetime)
            .slice(0, limit)
            .map((a, i) => ({
              headline: a.headline,
              source: a.source,
              url: a.url,
              datetime: a.datetime,
              // Rough relevance score: decay with position but boost recency
              relevance: Math.max(30, 80 - i * 5),
            }));
          resolve(sorted);
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchEconomicCalendar(apiKey) {
  return new Promise((resolve, reject) => {
    const url = `https://finnhub.io/api/v1/economic?token=${apiKey}`;
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const events = JSON.parse(raw);
          if (!Array.isArray(events.economicCalendar)) {
            resolve([]);
            return;
          }
          
          // Filter for high impact events (impact === 'high' or impact === 3) occurring today
          const today = new Date().toISOString().split('T')[0];
          const highImpact = events.economicCalendar.filter(e => 
            (e.impact === 'high' || e.impact === 3 || e.impact === 'High') && 
            e.time.startsWith(today)
          ).map(e => ({
            event: e.event,
            country: e.country,
            time: e.time,
            impact: e.impact,
            estimate: e.estimate,
            actual: e.actual
          }));
          
          resolve(highImpact);
        } catch (e) {
          resolve([]); // Fallback to empty on error
        }
      });
      res.on('error', () => resolve([]));
    }).on('error', () => resolve([]));
  });
}

module.exports = { fetchForexNews, fetchEconomicCalendar };
