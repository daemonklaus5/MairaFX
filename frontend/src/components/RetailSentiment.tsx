import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface SentimentData {
  symbol: string;
  longPercent: number;
  shortPercent: number;
}

export function RetailSentiment() {
  const [data, setData] = useState<{ data: SentimentData[]; source: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/dashboard/sentiment')
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-panel rounded-lg border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Retail Sentiment
        </h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse h-4 bg-gray-800 rounded w-full" />
          ))}
        </div>
      ) : data && data.data ? (
        <div className="space-y-3">
          {data.data.map(item => (
            <div key={item.symbol} className="space-y-1">
              <div className="flex justify-between items-end">
                <span className="text-[10px] font-bold text-gray-300">{item.symbol.replace('_', '/')}</span>
                <div className="flex gap-2 text-[9px] font-bold">
                  <span className="text-bear">S {item.shortPercent}%</span>
                  <span className="text-bull">L {item.longPercent}%</span>
                </div>
              </div>
              <div className="h-1.5 w-full flex rounded-full overflow-hidden bg-gray-800">
                <div className="h-full bg-bear transition-all duration-500" style={{ width: `${item.shortPercent}%` }} />
                <div className="h-full bg-bull transition-all duration-500" style={{ width: `${item.longPercent}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[8px] text-gray-500 text-right mt-2 pt-2 border-t border-gray-800/50">Data from {data.source}</p>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">Sentiment unavailable.</p>
      )}
    </div>
  );
}
