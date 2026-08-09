import { useState, useEffect } from 'react';
import { Building2, Flame } from 'lucide-react';

interface CotData {
  netLongPct: number;
  zScore?: number;
  trend?: string;
  date: string;
}

export function CotBadge({ symbol }: { symbol: string }) {
  const [data, setData] = useState<CotData | null>(null);

  useEffect(() => {
    const fetchCot = async () => {
      try {
        const res = await fetch(`/api/cot/${symbol}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error('Failed to fetch COT', e);
      }
    };
    fetchCot();
  }, [symbol]);

  if (!data || data.netLongPct === undefined) {
    return null;
  }

  const isExtreme = data.trend === 'Extreme Long' || data.trend === 'Extreme Short';
  const isLong = data.netLongPct >= 0;

  return (
    <div className="glass-card p-4 w-full flex flex-col flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
        <Building2 className="w-3 h-3 opacity-70" />
        Institutional COT
      </h3>
      
      <div className={`flex items-center justify-between border rounded-md px-3 py-2 transition-colors ${isExtreme ? 'border-orange-500/50 bg-orange-500/5' : 'border-gray-800 bg-gray-900/50'}`}>
        <div className="flex items-center gap-2">
          {isExtreme && <Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse" />}
          <span className={`text-[11px] font-bold ${isLong ? 'text-bull' : 'text-bear'}`}>
            {data.trend && data.trend !== 'Neutral' ? data.trend : (isLong ? 'Net Long' : 'Net Short') + ' ' + Math.abs(data.netLongPct) + '%'}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {data.zScore !== undefined && (
            <span className={`text-[10px] font-mono ${isExtreme ? 'text-orange-400' : 'text-gray-500'}`}>
              Z: {data.zScore > 0 ? '+' : ''}{data.zScore}
            </span>
          )}
          {data.date && (
            <span className="text-[9px] text-gray-600 font-mono">
              {new Date(data.date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
