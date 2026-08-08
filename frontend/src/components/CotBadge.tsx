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
    <div className={`flex items-center gap-2 bg-panel border rounded-md px-3 py-1.5 text-sm transition-colors ${isExtreme ? 'border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]' : 'border-gray-800'}`}>
      <Building2 className={`w-4 h-4 ${isExtreme ? 'text-orange-400' : 'text-gray-500'}`} />
      <span className="text-gray-400">Inst. COT:</span>
      
      {isExtreme && <Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse" />}
      
      <span className={`font-bold ${isLong ? 'text-bull' : 'text-bear'}`}>
        {data.trend && data.trend !== 'Neutral' ? data.trend : (isLong ? 'Net Long' : 'Net Short') + ' ' + Math.abs(data.netLongPct) + '%'}
      </span>
      
      {data.zScore !== undefined && (
        <span className={`text-xs font-mono ml-1 ${isExtreme ? 'text-orange-300' : 'text-gray-500'}`}>
          (Z: {data.zScore > 0 ? '+' : ''}{data.zScore})
        </span>
      )}

      {data.date && (
        <span className="text-[10px] text-gray-600 ml-2 border-l border-gray-700 pl-2">
          {new Date(data.date).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
