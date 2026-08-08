import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';

interface Strength {
  currency: string;
  score: number;
}

export function CurrencyHeatmap() {
  const [data, setData] = useState<Strength[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/strength')
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
          <Activity className="w-3.5 h-3.5" /> Currency Strength
        </h2>
        <span className="text-[9px] text-gray-500">24H</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse h-4 bg-gray-800 rounded w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.map((item) => (
            <div key={item.currency} className="flex items-center gap-2">
              <span className={`w-8 text-[10px] font-bold ${item.score > 0 ? 'text-bull' : item.score < 0 ? 'text-bear' : 'text-gray-400'}`}>
                {item.currency}
              </span>
              <div className="flex-1 h-3 bg-gray-800/50 rounded flex items-center relative overflow-hidden">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-700 z-10" />
                
                {/* Bar */}
                {item.score > 0 ? (
                  <div 
                    className="h-full bg-bull/50 absolute left-1/2" 
                    style={{ width: `${Math.min(item.score * 5, 50)}%` }} 
                  />
                ) : (
                  <div 
                    className="h-full bg-bear/50 absolute right-1/2" 
                    style={{ width: `${Math.min(Math.abs(item.score) * 5, 50)}%` }} 
                  />
                )}
              </div>
              <span className="w-6 text-right text-[9px] text-gray-500 font-mono">
                {item.score > 0 ? '+' : ''}{item.score.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
