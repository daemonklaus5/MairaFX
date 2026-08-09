import { useState, useEffect } from 'react';
import { Gauge } from 'lucide-react';

export function VolatilityMonitor({ symbol, timeframe }: { symbol: string, timeframe: string }) {
  const [data, setData] = useState<{ currentAtr: number; avgAtr: number; state: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/volatility/${symbol}/${timeframe}`)
      .then(res => res.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol, timeframe]);

  return (
    <div className="bg-panel rounded-lg border border-gray-800 p-4 shadow-lg w-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5" /> Volatility / ATR
        </h2>
        <span className="text-[9px] text-gray-500 bg-gray-800 px-1 rounded">{timeframe}</span>
      </div>

      {loading ? (
        <div className="animate-pulse h-10 bg-gray-800 rounded w-full" />
      ) : data ? (
        <div className="space-y-2">
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 uppercase">Current ATR</span>
              <span className="text-[11px] font-mono font-bold text-white">{data.currentAtr.toFixed(5)}</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[9px] text-gray-500 uppercase">20-Period Avg</span>
              <span className="text-[11px] font-mono font-bold text-gray-400">{data.avgAtr.toFixed(5)}</span>
            </div>
          </div>
          
          {/* Visual Bar */}
          <div className="h-1.5 w-full bg-gray-800 rounded-full relative overflow-hidden mt-2">
            <div 
              className={`absolute top-0 bottom-0 left-0 transition-all duration-500 ${data.currentAtr > data.avgAtr ? 'bg-orange-500' : 'bg-primary'}`}
              style={{ width: `${Math.min((data.currentAtr / (data.avgAtr * 1.5)) * 100, 100)}%` }}
            />
            {/* Marker for average */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: `${(1 / 1.5) * 100}%` }} />
          </div>
          
          <div className="text-center mt-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              data.state.includes('Expansion') ? 'text-orange-400 bg-orange-400/10' : 
              data.state.includes('Compression') ? 'text-primary bg-primary/10' : 
              'text-gray-300 bg-gray-700'
            }`}>
              {data.state}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">ATR unavailable.</p>
      )}
    </div>
  );
}
