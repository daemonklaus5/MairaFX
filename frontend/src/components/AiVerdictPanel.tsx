import { useState } from 'react';
import { Brain, Target, AlertTriangle } from 'lucide-react';

interface LaneData {
  bias: 'bull' | 'bear' | 'mixed';
  tier: 'high' | 'moderate' | 'low';
  score: number;
  basis: string;
}

interface SynthResult {
  verdict: 'WAIT' | 'LONG' | 'SHORT';
  confidence: 'high' | 'moderate' | 'low';
  lanes: {
    technical: LaneData;
    flow: LaneData;
    narrative: LaneData;
    macro: LaneData;
  };
}

interface AiResult extends SynthResult {
  reasoning: string;
  watch_zone: string;
  invalidation: string[];
  cached?: boolean;
}

export function AiVerdictPanel({ symbol, timeframe }: { symbol: string, timeframe: string }) {
  const [data, setData] = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      // Mock API call to our backend
      const res = await fetch(`/api/analyze/${symbol}/${timeframe}`, { method: 'POST' });
      if (!res.ok) throw new Error('API Error');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError('Failed to fetch AI analysis');
    }
    setLoading(false);
  };

  if (!data && !loading) {
    return (
      <div className="bg-panel rounded-lg border border-gray-800 p-6 flex flex-col items-center justify-center text-center space-y-4">
        <Brain className="w-12 h-12 text-gray-600" />
        <div>
          <h3 className="text-lg font-semibold text-white">Get an AI Read</h3>
          <p className="text-gray-400 text-sm mt-1">Direction, conviction, and a trade setup if one's available.</p>
        </div>
        <button 
          onClick={handleAnalyze}
          className="bg-primary hover:bg-emerald-400 text-darker font-bold py-2 px-6 rounded-md transition-colors"
        >
          Analyze Live State
        </button>
      </div>
    );
  }

  return (
    <div className="bg-panel rounded-lg border border-gray-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          AI Narrative
          {loading && <span className="text-sm text-gray-500 animate-pulse">Analyzing...</span>}
        </h3>
        <button 
          onClick={handleAnalyze}
          disabled={loading}
          className="text-primary hover:text-emerald-400 text-sm font-medium disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && <div className="text-bear text-sm">{error}</div>}

      {data && (
        <>
          <div className={`p-4 rounded-md border ${
            data.verdict === 'LONG' ? 'bg-bull/10 border-bull/20 text-bull' : 
            data.verdict === 'SHORT' ? 'bg-bear/10 border-bear/20 text-bear' : 
            'bg-gray-800/50 border-gray-700 text-gray-300'
          }`}>
            <div className="text-2xl font-bold mb-1">{data.verdict}</div>
            <div className="text-sm opacity-80">{data.confidence.toUpperCase()} CONVICTION</div>
          </div>

          <div className="bg-darker rounded p-4 text-sm text-gray-300 leading-relaxed border border-gray-800">
            {data.reasoning}
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Target className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-400 text-xs uppercase tracking-wider block">Watch Zone</span>
                <span className="text-sm text-gray-200">{data.watch_zone}</span>
              </div>
            </div>
            
            {data.invalidation.length > 0 && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                <div>
                  <span className="text-gray-400 text-xs uppercase tracking-wider block">Invalidation</span>
                  <ul className="text-sm text-gray-200">
                    {data.invalidation.map((inv, i) => <li key={i}>{inv}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </div>
          
          <div className="text-xs text-gray-600 mt-4 border-t border-gray-800 pt-2">
            AI-generated analysis is probabilistic and for informational purposes only. Not financial advice. {data.cached && '(Cached)'}
          </div>
        </>
      )}
    </div>
  );
}
