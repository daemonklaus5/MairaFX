import { useState, useEffect } from 'react';
import { ExternalLink, Radio } from 'lucide-react';

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  datetime: number;
  relevance: number;
}

function relevanceDot(score: number) {
  if (score >= 70) return 'bg-emerald-400';
  if (score >= 50) return 'bg-yellow-400';
  return 'bg-rose-500';
}

function timeAgo(unix: number): string {
  const diff = Math.floor((Date.now() / 1000 - unix) / 60);
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function KeyDriversPanel({ symbol, timezone }: { symbol: string; timezone: 'UTC' | 'IST' }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchNews = async () => {
    try {
      const res = await fetch(`/api/news/${symbol}`);
      if (res.ok) {
        const data = await res.json();
        setNews(data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch news', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    // Refresh every 5 minutes
    const interval = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  return (
    <div className="bg-panel rounded-lg border border-gray-800 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          Key Drivers
        </h2>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          <span className="text-[10px] text-gray-500">
            {lastUpdated ? `Updated ${timeAgo(lastUpdated.getTime() / 1000)}` : 'Live'}
          </span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-700 mt-1.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-gray-800 rounded w-full" />
                <div className="h-3 bg-gray-800 rounded w-3/4" />
                <div className="h-2.5 bg-gray-800 rounded w-1/3 mt-1" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && news.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
          <Radio className="w-6 h-6 text-gray-700" />
          <p className="text-xs text-gray-600">No news available right now</p>
        </div>
      )}

      {/* News list */}
      {!loading && news.length > 0 && (
        <ul className="space-y-0">
          {news.map((item, i) => (
            <li key={i} className="group">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 py-2.5 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 rounded px-1 transition-colors"
              >
                {/* Relevance dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${relevanceDot(item.relevance)}`}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-snug text-gray-300 group-hover:text-white transition-colors line-clamp-2">
                    {item.headline}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-600 uppercase tracking-wide">
                      {item.source}
                    </span>
                    <span className="text-[10px] text-gray-700">·</span>
                    <span className="text-[10px] text-gray-600">
                      rel {item.relevance}
                    </span>
                    <span className="text-[10px] text-gray-700">·</span>
                    <span className="text-[10px] text-gray-600">
                      {timeAgo(item.datetime)}
                    </span>
                  </div>
                </div>

                {/* External link icon */}
                <ExternalLink className="w-3 h-3 text-gray-700 group-hover:text-gray-500 shrink-0 mt-1 transition-colors" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
