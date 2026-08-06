import { useState } from 'react';
import { Brain, Target, AlertTriangle, Sparkles } from 'lucide-react';

interface LaneData {
  bias: 'bull' | 'bear' | 'mixed';
  tier: 'high' | 'moderate' | 'low';
  score: number;
  basis: string;
}

interface AiResult {
  verdict: 'WAIT' | 'LONG' | 'SHORT';
  confidence: 'high' | 'moderate' | 'low';
  lanes: {
    technical: LaneData;
    flow: LaneData;
    narrative: LaneData;
    macro: LaneData;
  };
  reasoning: string;
  watch_zone: string;
  invalidation: string[];
  cached?: boolean;
}

interface Props {
  symbol: string;
  timeframe: string;
  /** Called after a successful analyze — passes lane data up to App for LanePanel */
  onAnalyzed: (lanes: AiResult['lanes']) => void;
}

const verdictStyle: Record<string, string> = {
  LONG: 'bg-bull/10 border-bull/20 text-bull',
  SHORT: 'bg-bear/10 border-bear/20 text-bear',
  WAIT: 'bg-gray-800/50 border-gray-700 text-gray-300',
};

export function AiVerdictPanel({ symbol, timeframe, onAnalyzed }: Props) {
  const [data, setData] = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/analyze/${symbol}/${timeframe}`, { method: 'POST' });
      if (!res.ok) throw new Error('API Error');
      const json: AiResult = await res.json();
      setData(json);
      // Propagate lane data up so LanePanel can render
      if (json.lanes) onAnalyzed(json.lanes);
    } catch {
      setError('Failed to fetch AI analysis. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="bg-panel rounded-lg border border-gray-800 overflow-hidden">
      {/* ── Analyze button header ── */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h3 className="text-xs font-semibold text-white leading-tight">AI Read</h3>
            {!data && !loading && (
              <p className="text-[10px] text-gray-500 leading-tight">Direction, conviction &amp; setup</p>
            )}
            {data && !loading && (
              <p className="text-[10px] text-gray-500 leading-tight">
                {data.cached ? 'Cached result' : 'Fresh analysis'}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shrink-0 ${
            loading
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-primary hover:bg-emerald-400 text-darker shadow-[0_0_12px_rgba(0,209,178,0.25)] hover:shadow-[0_0_20px_rgba(0,209,178,0.4)]'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          {loading ? 'Analyzing…' : data ? 'Re-Analyze' : 'Analyze'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-bear bg-bear/5 border-b border-bear/10">
          {error}
        </div>
      )}

      {/* ── Loading shimmer ── */}
      {loading && (
        <div className="p-3 space-y-2 animate-pulse">
          <div className="h-10 bg-gray-800 rounded-md" />
          <div className="h-3 bg-gray-800 rounded w-full" />
          <div className="h-3 bg-gray-800 rounded w-4/5" />
          <div className="h-3 bg-gray-800 rounded w-3/5" />
        </div>
      )}

      {/* ── Idle placeholder (no data yet) ── */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center py-6 text-center px-3 gap-1.5">
          <Sparkles className="w-7 h-7 text-gray-700" />
          <p className="text-[11px] text-gray-600 leading-snug">
            Get a direction, conviction score, and a trade setup when one's available.
          </p>
        </div>
      )}

      {/* ── Result ── */}
      {data && !loading && (
        <div className="p-3 space-y-3">
          {/* Verdict badge */}
          <div className={`p-3 rounded-md border ${verdictStyle[data.verdict] || verdictStyle.WAIT}`}>
            <div className="text-xl font-bold">{data.verdict}</div>
            <div className="text-[10px] opacity-70 mt-0.5 uppercase tracking-wider">
              {data.confidence} conviction
            </div>
          </div>

          {/* Reasoning */}
          <div className="bg-darker rounded-md p-3 text-[11px] text-gray-300 leading-relaxed border border-gray-800">
            {data.reasoning}
          </div>

          {/* Watch zone */}
          <div className="flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Watch Zone</span>
              <span className="text-[11px] text-gray-200">{data.watch_zone}</span>
            </div>
          </div>

          {/* Invalidation */}
          {data.invalidation?.length > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Invalidation</span>
                <ul className="text-[11px] text-gray-200 space-y-0.5">
                  {data.invalidation.map((inv, i) => <li key={i}>• {inv}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[9px] text-gray-700 border-t border-gray-800 pt-2">
            AI-generated analysis is probabilistic and for informational purposes only. Not financial advice.{data.cached && ' (Cached)'}
          </p>
        </div>
      )}
    </div>
  );
}
