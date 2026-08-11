import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface SentimentData {
  symbol: string;
  longPercent: number;
  shortPercent: number;
}

export function RetailSentiment() {
  const [data, setData] = useState<SentimentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/sentiment')
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to fetch sentiment');
        return json;
      })
      .then(d => {
        setData(d.data || []);
        setLoading(false);
      })
      .catch(err => {
        setApiError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="glass-card p-4 w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Retail Sentiment
        </h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse flex flex-col gap-1">
              <div className="h-3 w-12 bg-gray-800 rounded" />
              <div className="h-1.5 w-full bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      ) : apiError ? (
        <div className="p-3 border border-red-500/20 bg-red-500/10 rounded flex flex-col items-center justify-center text-center space-y-2 mt-2">
          <Users className="w-6 h-6 text-red-400/50" />
          <p className="text-xs text-red-400/80 leading-relaxed">
            {apiError}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.slice(0, 5).map(item => (
            <div key={item.symbol} className="flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-medium">
                <span className="text-gray-300">{item.symbol.replace('_', '/')}</span>
                <div className="flex gap-2">
                  <span className="text-emerald-400">{item.longPercent}% L</span>
                  <span className="text-rose-400">{item.shortPercent}% S</span>
                </div>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500/80 transition-all duration-1000" style={{ width: `${item.longPercent}%` }} />
                <div className="h-full bg-rose-500/80 transition-all duration-1000" style={{ width: `${item.shortPercent}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
