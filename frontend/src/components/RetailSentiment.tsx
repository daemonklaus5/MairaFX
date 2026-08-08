import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

export function RetailSentiment({ symbol }: { symbol: string }) {
  const [data, setData] = useState<{ longPercent: number; shortPercent: number; source: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/sentiment/${symbol}`)
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  return (
    <div className="bg-panel rounded-lg border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Retail Sentiment
        </h2>
      </div>

      {loading ? (
        <div className="animate-pulse h-8 bg-gray-800 rounded w-full" />
      ) : data ? (
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-bold">
            <span className="text-bear">Shorts {data.shortPercent}%</span>
            <span className="text-bull">Longs {data.longPercent}%</span>
          </div>
          <div className="h-2 w-full flex rounded-full overflow-hidden bg-gray-800">
            <div className="h-full bg-bear transition-all duration-500" style={{ width: `${data.shortPercent}%` }} />
            <div className="h-full bg-bull transition-all duration-500" style={{ width: `${data.longPercent}%` }} />
          </div>
          <p className="text-[9px] text-gray-500 text-right">Data from {data.source}</p>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">Sentiment unavailable.</p>
      )}
    </div>
  );
}
