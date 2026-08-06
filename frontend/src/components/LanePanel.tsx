import { useState, useEffect } from 'react';
import { Activity, Wind, BookOpen, Globe } from 'lucide-react';

interface LaneData {
  bias: 'bull' | 'bear' | 'mixed';
  tier: 'high' | 'moderate' | 'low';
  score: number;
  basis: string;
}

interface LanesResponse {
  lanes: {
    technical: LaneData;
    flow: LaneData;
    narrative: LaneData;
    macro: LaneData;
  };
}

const icons = {
  technical: Activity,
  flow: Wind,
  narrative: BookOpen,
  macro: Globe
};

export function LanePanel({ symbol, timeframe }: { symbol: string, timeframe: string }) {
  const [data, setData] = useState<LanesResponse | null>(null);

  useEffect(() => {
    // In a real app this would also update via WebSockets on candle close
    const fetchLanes = async () => {
      try {
        const res = await fetch(`/api/lanes/${symbol}/${timeframe}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (e) {
        console.error('Failed to fetch lanes', e);
      }
    };
    
    fetchLanes();
    const interval = setInterval(fetchLanes, 10000); // Polling for demo
    return () => clearInterval(interval);
  }, [symbol, timeframe]);

  if (!data) {
    return <div className="text-gray-500 text-sm animate-pulse">Loading lanes...</div>;
  }

  const renderLane = (name: string, lane: LaneData) => {
    const Icon = icons[name as keyof typeof icons] || Activity;
    
    let colorClass = 'text-gray-400 border-gray-700 bg-gray-800/20';
    if (lane.bias === 'bull') colorClass = 'text-bull border-bull/30 bg-bull/5';
    if (lane.bias === 'bear') colorClass = 'text-bear border-bear/30 bg-bear/5';

    return (
      <div key={name} className={`p-3 rounded-md border ${colorClass} flex flex-col gap-2`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 opacity-70" />
            <span className="font-semibold capitalize text-sm">{name}</span>
          </div>
          <span className="text-xs uppercase tracking-wide opacity-80">{lane.tier}</span>
        </div>
        <div className="text-xs text-gray-400 line-clamp-2">
          {lane.basis}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
      {Object.entries(data.lanes).map(([name, lane]) => renderLane(name, lane))}
    </div>
  );
}
