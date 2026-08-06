import { useState } from 'react';
import type { ReactElement } from 'react';
import { Brain, Target, AlertTriangle, Sparkles, TrendingUp, TrendingDown, Layers } from 'lucide-react';

interface LaneData {
  bias: 'bull' | 'bear' | 'mixed';
  tier: 'high' | 'moderate' | 'low';
  score: number;
  basis: string;
}

interface LiquidityLevel {
  price: number;
  pips: number;
  strength: number;
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
  setup: string | null;
  watch_zone: string;
  invalidation: string[];
  liquidity: {
    bsl: LiquidityLevel[];
    ssl: LiquidityLevel[];
  } | null;
  risk_sizing: string;
  session: string;
  mtf: {
    daily_trend: string;
    h4_trend: string;
  } | null;
  poc: string | null;
  news: {
    event: string;
    impact: string;
    time: string;
  }[] | null;
  cached?: boolean;
  fallback?: boolean;
}

interface Props {
  symbol: string;
  timeframe: string;
  onAnalyzed: (lanes: AiResult['lanes']) => void;
}

const verdictStyle: Record<string, string> = {
  LONG:  'bg-bull/10 border-bull/30 text-bull',
  SHORT: 'bg-bear/10 border-bear/30 text-bear',
  WAIT:  'bg-gray-800/50 border-gray-700 text-gray-300',
};

const verdictIcon: Record<string, ReactElement> = {
  LONG:  <TrendingUp  className="w-5 h-5" />,
  SHORT: <TrendingDown className="w-5 h-5" />,
  WAIT:  <span className="text-base">⏸</span>,
};

export function AiVerdictPanel({ symbol, timeframe, onAnalyzed }: Props) {
  const [data, setData]       = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [mode, setMode]       = useState<'strict' | 'aggressive'>('strict');

  const handleAnalyze = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/analyze/${symbol}/${timeframe}?mode=${mode}`, { method: 'POST' });
      if (!res.ok) {
        // Try to get the actual error message from the response body
        let errMsg = `Server error (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.error) errMsg = `${errMsg}: ${errBody.error}`;
          if (errBody?.stack) errMsg += ` | ${errBody.stack}`;
        } catch { /* ignore parse errors */ }
        throw new Error(errMsg);
      }
      const json: AiResult = await res.json();
      setData(json);
      if (json.lanes) onAnalyzed(json.lanes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Check your connection.';
      setError(msg);
    }
    setLoading(false);
  };

  return (
    <div className="bg-panel rounded-lg border border-gray-800 overflow-hidden">

      {/* ── Header bar with Analyze button ── */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h3 className="text-xs font-semibold text-white leading-tight">AI Read</h3>
            <p className="text-[10px] text-gray-500 leading-tight">
              {data && !loading
                ? data.cached ? 'Cached result' : data.fallback ? 'Rule-based fallback' : 'Gemini 2.0 · ICT methodology'
                : 'Direction, conviction & trade setup'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex bg-gray-900 rounded-md p-0.5 border border-gray-800">
            <button
              onClick={() => setMode('strict')}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                mode === 'strict' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Strict
            </button>
            <button
              onClick={() => setMode('aggressive')}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                mode === 'aggressive' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Aggressive
            </button>
          </div>

          <button
            id="analyze-button"
            onClick={handleAnalyze}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shrink-0 ${
            loading
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-primary hover:bg-emerald-400 text-darker shadow-[0_0_12px_rgba(0,209,178,0.25)] hover:shadow-[0_0_22px_rgba(0,209,178,0.45)]'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          {loading ? 'Analyzing…' : data ? 'Re-Analyze' : 'Analyze'}
        </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-bear bg-bear/5 border-b border-bear/10">
          {error}
        </div>
      )}

      {/* ── Loading shimmer ── */}
      {loading && (
        <div className="p-3 space-y-2.5 animate-pulse">
          <div className="h-12 bg-gray-800 rounded-md" />
          <div className="h-8  bg-gray-800 rounded-md" />
          <div className="h-3  bg-gray-800 rounded w-full" />
          <div className="h-3  bg-gray-800 rounded w-4/5" />
          <div className="h-3  bg-gray-800 rounded w-3/5" />
        </div>
      )}

      {/* ── Idle placeholder ── */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center py-6 text-center px-3 gap-2">
          <Sparkles className="w-7 h-7 text-gray-700" />
          <p className="text-[11px] text-gray-600 leading-snug max-w-[200px]">
            ICT-based analysis — structure, liquidity, order blocks & Gemini AI reasoning.
          </p>
        </div>
      )}

      {/* ── Result ── */}
      {data && !loading && (
        <div className="p-3 space-y-3">

          {/* Verdict badge */}
          <div className={`p-3 rounded-md border flex items-center gap-3 ${verdictStyle[data.verdict] || verdictStyle.WAIT}`}>
            <div>{verdictIcon[data.verdict]}</div>
            <div>
              <div className="text-lg font-bold leading-tight">{data.verdict}</div>
              <div className="text-[10px] opacity-60 uppercase tracking-wider">{data.confidence} conviction</div>
            </div>
          </div>

          {/* ICT Setup — the specific trade model */}
          {data.setup && data.setup !== 'No valid ICT entry model present' && (
            <div className="bg-primary/5 border border-primary/20 rounded-md p-2.5">
              <div className="text-[10px] text-primary uppercase tracking-widest font-semibold mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3" /> Setup
              </div>
              <p className="text-[11px] text-gray-200 leading-snug">{data.setup}</p>
            </div>
          )}

          {/* AI Reasoning */}
          <div className="bg-darker rounded-md p-2.5 text-[11px] text-gray-300 leading-relaxed border border-gray-800">
            {data.reasoning}
          </div>

          {/* Institutional Metrics (MTF, POC, Session) */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-gray-800/20 border border-gray-800 rounded-md p-2">
              <span className="text-[9px] text-gray-500 uppercase tracking-widest block mb-0.5">Session</span>
              <span className="text-[10px] text-gray-300 font-medium">{data.session || 'Unknown'}</span>
            </div>
            {data.poc && (
              <div className="bg-gray-800/20 border border-gray-800 rounded-md p-2">
                <span className="text-[9px] text-gray-500 uppercase tracking-widest block mb-0.5">Volume POC</span>
                <span className="text-[10px] text-gray-300 font-mono">{data.poc}</span>
              </div>
            )}
            {data.mtf && (
              <div className="bg-gray-800/20 border border-gray-800 rounded-md p-2 col-span-2 flex justify-between">
                <div>
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest block mb-0.5">1D Trend</span>
                  <span className={`text-[10px] font-medium capitalize ${data.mtf.daily_trend === 'bullish' ? 'text-bull' : data.mtf.daily_trend === 'bearish' ? 'text-bear' : 'text-gray-400'}`}>{data.mtf.daily_trend}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest block mb-0.5">4H Trend</span>
                  <span className={`text-[10px] font-medium capitalize ${data.mtf.h4_trend === 'bullish' ? 'text-bull' : data.mtf.h4_trend === 'bearish' ? 'text-bear' : 'text-gray-400'}`}>{data.mtf.h4_trend}</span>
                </div>
              </div>
            )}
            {data.news && data.news.length > 0 && (
              <div className="bg-orange-400/10 border border-orange-400/20 rounded-md p-2 col-span-2">
                <span className="text-[9px] text-orange-400 uppercase tracking-widest block mb-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> High-Impact News Today
                </span>
                <div className="text-[10px] text-gray-300">
                  {data.news.map((n, i) => (
                    <div key={i} className="truncate">• {n.event} ({new Date(n.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Liquidity Levels */}
          {data.liquidity && (data.liquidity.bsl.length > 0 || data.liquidity.ssl.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Liquidity Pools</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Buy-side liquidity — above */}
                <div className="bg-bull/5 border border-bull/10 rounded-md p-2">
                  <div className="text-[9px] text-bull uppercase tracking-wider mb-1 font-semibold">BSL (above)</div>
                  {data.liquidity.bsl.slice(0, 2).map((l, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-300 font-mono">{l.price.toFixed(5)}</span>
                      <span className="text-[9px] text-gray-600">+{l.pips}p</span>
                    </div>
                  ))}
                </div>
                {/* Sell-side liquidity — below */}
                <div className="bg-bear/5 border border-bear/10 rounded-md p-2">
                  <div className="text-[9px] text-bear uppercase tracking-wider mb-1 font-semibold">SSL (below)</div>
                  {data.liquidity.ssl.slice(0, 2).map((l, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-300 font-mono">{l.price.toFixed(5)}</span>
                      <span className="text-[9px] text-gray-600">-{l.pips}p</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Watch Zone */}
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

          {/* Risk Sizing */}
          {data.risk_sizing && data.risk_sizing !== "N/A" && (
            <div className="flex items-start gap-2">
              <div className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0 flex items-center justify-center font-bold text-[10px] bg-purple-400/20 rounded">R</div>
              <div>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block">Risk & Sizing</span>
                <span className="text-[11px] text-purple-300">{data.risk_sizing}</span>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[9px] text-gray-700 border-t border-gray-800 pt-2">
            AI analysis is probabilistic and for informational purposes only. Not financial advice.
            {data.cached && ' (Cached)'}{data.fallback && ' (Fallback)'}
          </p>
        </div>
      )}
    </div>
  );
}
