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
  macro: Globe,
};

const tierColor = {
  high: 'text-emerald-400',
  moderate: 'text-yellow-400',
  low: 'text-gray-500',
};

/** LanePanel now only renders when `data` is passed in from the parent (after Analyze). */
export function LanePanel({ data }: { data: LanesResponse | null }) {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-5 text-center gap-2 opacity-50">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 w-full">
          {['Technical', 'Flow', 'Narrative', 'Macro'].map((name) => (
            <div
              key={name}
              className="p-2.5 rounded-md border border-gray-800 bg-gray-800/10 flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-gray-800" />
                <span className="text-[11px] text-gray-700">{name}</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded w-full" />
              <div className="h-1.5 bg-gray-800 rounded w-2/3" />
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-700 mt-1">Hit Analyze to load lane verdicts</p>
      </div>
    );
  }

  const renderLane = (name: string, lane: LaneData) => {
    const Icon = icons[name as keyof typeof icons] || Activity;

    let colorClass = 'text-gray-400 border-gray-700 bg-gray-800/20';
    if (lane.bias === 'bull') colorClass = 'text-bull border-bull/30 bg-bull/5';
    if (lane.bias === 'bear') colorClass = 'text-bear border-bear/30 bg-bear/5';

    return (
      <div key={name} className={`p-2.5 rounded-md border ${colorClass} flex flex-col gap-1.5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 opacity-70" />
            <span className="font-semibold capitalize text-[11px]">{name}</span>
          </div>
          <span className={`text-[10px] uppercase tracking-wide font-medium ${tierColor[lane.tier] || 'text-gray-500'}`}>
            {lane.tier}
          </span>
        </div>
        <div className="text-[10px] text-gray-400 leading-snug">
          {lane.basis}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {Object.entries(data.lanes).map(([name, lane]) => renderLane(name, lane))}
    </div>
  );
}
