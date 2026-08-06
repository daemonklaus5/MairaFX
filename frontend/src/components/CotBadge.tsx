import { useState, useEffect } from 'react';
import { Building2 } from 'lucide-react';

interface CotData {
  netLongPct: number;
  netShortPct: number;
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

  if (!data || (data.netLongPct === undefined && data.netShortPct === undefined)) {
    return null;
  }

  const netPos = data.netLongPct - data.netShortPct;
  const isLong = netPos >= 0;

  return (
    <div className="flex items-center gap-2 bg-panel border border-gray-800 rounded-md px-3 py-1.5 text-sm">
      <Building2 className="w-4 h-4 text-gray-500" />
      <span className="text-gray-400">Inst. COT:</span>
      <span className={`font-bold ${isLong ? 'text-bull' : 'text-bear'}`}>
        {isLong ? 'Net Long' : 'Net Short'} {Math.abs(netPos)}%
      </span>
      {data.date && <span className="text-xs text-gray-600 ml-2 border-l border-gray-700 pl-2">{new Date(data.date).toLocaleDateString()}</span>}
    </div>
  );
}
