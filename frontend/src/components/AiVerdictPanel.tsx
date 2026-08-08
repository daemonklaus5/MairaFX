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
  confidence: 'high' | 'moderate' | 'low' | 'Low' | 'Medium' | 'High';
  lanes: {
    technical: LaneData;
    flow: LaneData;
    narrative: LaneData;
    macro: LaneData;
  };
  // 8-section structured fields
  market_structure_read?: string | null;
  liquidity_context?: string | null;
  session_timing?: string | null;
  confluence_check?: string | null;
  thesis?: string | null;
  weakest_point?: string | null;
  overview?: string | null;
  overview_confidence_score?: number | null;
  // Legacy/fallback
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
  timezone: 'UTC' | 'IST';
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

export function AiVerdictPanel({ symbol, timeframe, timezone, onAnalyzed }: Props) {
  const [data, setData]       = useState<AiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [mode, setMode]       = useState<'strict' | 'aggressive'>('strict');
  
  // Track what the current data is actually for
  const [analyzedContext, setAnalyzedContext] = useState<{symbol: string, timeframe: string, mode: string} | null>(null);

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
      setAnalyzedContext({ symbol, timeframe, mode });
      if (json.lanes) onAnalyzed(json.lanes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Check your connection.';
      setError(msg);
    }
    setLoading(false);
  };

  const isStale = analyzedContext && (analyzedContext.symbol !== symbol || analyzedContext.timeframe !== timeframe || analyzedContext.mode !== mode);

  return (
    <div className="bg-panel rounded-lg border border-gray-800 overflow-hidden">

      {/* ── Header bar with Analyze button ── */}
      <div className="p-3 border-b border-gray-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary shrink-0" />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs font-semibold text-white leading-tight">AI Read</h3>
              {analyzedContext && !loading && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${isStale ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-800 text-gray-300'}`}>
                  {analyzedContext.symbol.replace('_', '/')} {analyzedContext.timeframe} {analyzedContext.mode === 'aggressive' ? '🔥' : ''}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-500 leading-tight mt-0.5">
              {data && !loading
                ? data.cached ? 'Cached result' : data.fallback ? 'Rule-based fallback' : 'Gemini 2.0 · ICT methodology'
                : 'Direction, conviction & trade setup'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            id="analyze-button"
            onClick={handleAnalyze}
            disabled={loading}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 w-full rounded-md text-xs font-bold transition-all ${
              loading
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : isStale
                  ? 'bg-orange-500 hover:bg-orange-400 text-darker shadow-[0_0_12px_rgba(249,115,22,0.25)] hover:shadow-[0_0_22px_rgba(249,115,22,0.45)]'
                  : 'bg-primary hover:bg-emerald-400 text-darker shadow-[0_0_12px_rgba(0,209,178,0.25)] hover:shadow-[0_0_22px_rgba(0,209,178,0.45)]'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {loading ? 'Analyzing…' : isStale ? 'Update Analysis' : data ? 'Re-Analyze' : 'Analyze'}
          </button>

          <div className="flex bg-gray-900 rounded-md p-0.5 border border-gray-800 w-full">
            <button
              onClick={() => setMode('strict')}
              className={`flex-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                mode === 'strict' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Strict
            </button>
            <button
              onClick={() => setMode('aggressive')}
              className={`flex-1 px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                mode === 'aggressive' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Aggressive
            </button>
          </div>
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

          {/* Verdict + Confidence badge */}
          <div className={`p-3 rounded-md border flex items-center gap-3 ${verdictStyle[data.verdict] || verdictStyle.WAIT}`}>
            <div>{verdictIcon[data.verdict]}</div>
            <div className="flex-1">
              <div className="text-lg font-bold leading-tight">{data.verdict}</div>
              <div className="text-[10px] opacity-60 uppercase tracking-wider">{data.confidence} conviction</div>
            </div>
            {data.overview_confidence_score != null && (
              <div className="flex flex-col items-center shrink-0">
                <div className={`text-2xl font-black tabular-nums ${data.overview_confidence_score >= 70 ? 'text-primary' : data.overview_confidence_score >= 45 ? 'text-orange-400' : 'text-gray-500'}`}>
                  {data.overview_confidence_score}
                </div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">/ 100</div>
              </div>
            )}
          </div>

          {/* Fallback Reasoning */}
          {data.fallback && data.reasoning && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-3 text-orange-200 text-xs">
              <span className="font-bold uppercase tracking-wider block mb-1">Fallback Mode</span>
              {data.reasoning}
            </div>
          )}

          {/* Overview */}
          {data.overview && (
            <div className="bg-darker border border-gray-800 rounded-md p-2.5">
              <div className="text-[9px] text-primary uppercase tracking-widest font-bold mb-1.5">Overview</div>
              <p className="text-[11px] text-gray-200 leading-relaxed">{data.overview}</p>
            </div>
          )}

          {/* Divider */}
          {(data.market_structure_read || data.liquidity_context || data.session_timing || data.confluence_check || data.thesis) && (
            <div className="border-t border-gray-800/70 pt-1">
              <p className="text-[9px] text-gray-600 uppercase tracking-widest font-semibold mb-2">Structured Breakdown</p>
              <div className="space-y-2">

                {/* 1. Market Structure Read */}
                {data.market_structure_read && (
                  <div className="bg-gray-900/60 border border-gray-800 rounded-md p-2.5">
                    <div className="text-[9px] text-blue-400 uppercase tracking-widest font-bold mb-1">1. Market Structure Read</div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{data.market_structure_read}</p>
                  </div>
                )}

                {/* 2. Liquidity Context */}
                {data.liquidity_context && (
                  <div className="bg-gray-900/60 border border-gray-800 rounded-md p-2.5">
                    <div className="text-[9px] text-cyan-400 uppercase tracking-widest font-bold mb-1">2. Liquidity Context</div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{data.liquidity_context}</p>
                  </div>
                )}

                {/* 3. Session / Timing */}
                {data.session_timing && (
                  <div className="bg-gray-900/60 border border-gray-800 rounded-md p-2.5">
                    <div className="text-[9px] text-yellow-400 uppercase tracking-widest font-bold mb-1">3. Session / Timing</div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{data.session_timing}</p>
                  </div>
                )}

                {/* 4. Confluence Check */}
                {data.confluence_check && (
                  <div className="bg-gray-900/60 border border-gray-800 rounded-md p-2.5">
                    <div className="text-[9px] text-violet-400 uppercase tracking-widest font-bold mb-1">4. Confluence Check</div>
                    <p className="text-[11px] text-gray-300 leading-relaxed">{data.confluence_check}</p>
                  </div>
                )}

                {/* 5. Thesis */}
                {data.thesis && (
                  <div className="bg-primary/5 border border-primary/20 rounded-md p-2.5">
                    <div className="text-[9px] text-primary uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> 5. Thesis
                    </div>
                    <p className="text-[11px] text-gray-200 leading-relaxed">{data.thesis}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ICT Setup */}
          {data.setup && data.setup !== 'No valid ICT entry model present' && (
            <div className="bg-gray-800/40 border border-gray-700 rounded-md p-2.5">
              <div className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3" /> 6. Setup / Entry Model
              </div>
              <p className="text-[11px] text-gray-200 leading-snug">{data.setup}</p>
            </div>
          )}

          {/* Watch Zone + Invalidation */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800/30 border border-gray-800 rounded-md p-2">
              <div className="flex items-center gap-1 mb-1">
                <Target className="w-3 h-3 text-blue-400 shrink-0" />
                <span className="text-[9px] text-gray-500 uppercase tracking-wider">Watch Zone</span>
              </div>
              <span className="text-[11px] text-gray-200">{data.watch_zone}</span>
            </div>
            {data.invalidation?.length > 0 && (
              <div className="bg-gray-800/30 border border-gray-800 rounded-md p-2">
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider">7. Invalidation</span>
                </div>
                <ul className="text-[11px] text-gray-200 space-y-0.5">
                  {data.invalidation.map((inv, i) => <li key={i}>• {inv}</li>)}
                </ul>
              </div>
            )}
          </div>

          {/* Weakest Point */}
          {data.weakest_point && (
            <div className="flex items-start gap-2 bg-orange-400/5 border border-orange-400/15 rounded-md p-2.5">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-[9px] text-orange-400 uppercase tracking-widest font-bold block mb-0.5">7b. Weakest Point</span>
                <span className="text-[11px] text-gray-300">{data.weakest_point}</span>
              </div>
            </div>
          )}

          {/* MTF Alignment */}
          {data.mtf && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800/20 border border-gray-800 rounded-md p-2">
                <span className="text-[9px] text-gray-500 uppercase tracking-widest block mb-0.5">1D Trend</span>
                <span className={`text-[10px] font-medium capitalize ${data.mtf.daily_trend === 'bullish' ? 'text-bull' : data.mtf.daily_trend === 'bearish' ? 'text-bear' : 'text-gray-400'}`}>{data.mtf.daily_trend}</span>
              </div>
              <div className="bg-gray-800/20 border border-gray-800 rounded-md p-2">
                <span className="text-[9px] text-gray-500 uppercase tracking-widest block mb-0.5">4H Trend</span>
                <span className={`text-[10px] font-medium capitalize ${data.mtf.h4_trend === 'bullish' ? 'text-bull' : data.mtf.h4_trend === 'bearish' ? 'text-bear' : 'text-gray-400'}`}>{data.mtf.h4_trend}</span>
              </div>
            </div>
          )}

          {/* POC + Session */}
          <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Liquidity Pools */}
          {data.liquidity && (data.liquidity.bsl.length > 0 || data.liquidity.ssl.length > 0) && (
            <div className="space-y-1.5">
              <p className="text-[9px] text-gray-500 uppercase tracking-widest">Liquidity Pools</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-bull/5 border border-bull/10 rounded-md p-2">
                  <div className="text-[9px] text-bull uppercase tracking-wider mb-1 font-semibold">BSL (above)</div>
                  {data.liquidity.bsl.slice(0, 2).map((l, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-300 font-mono">{l.price.toFixed(5)}</span>
                      <span className="text-[9px] text-gray-600">+{l.pips}p</span>
                    </div>
                  ))}
                </div>
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

          {/* Risk Sizing */}
          {data.risk_sizing && data.risk_sizing !== "N/A" && (
            <div className="flex items-start gap-2">
              <div className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0 flex items-center justify-center font-bold text-[10px] bg-purple-400/20 rounded">R</div>
              <div>
                <span className="text-[9px] text-gray-500 uppercase tracking-wider block">Risk & Sizing</span>
                <span className="text-[11px] text-purple-300">{data.risk_sizing}</span>
              </div>
            </div>
          )}

          {/* High-Impact News */}
          {data.news && data.news.length > 0 && (
            <div className="bg-orange-400/10 border border-orange-400/20 rounded-md p-2">
              <span className="text-[9px] text-orange-400 uppercase tracking-widest block mb-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> High-Impact News Today
              </span>
              <div className="text-[10px] text-gray-300">
                {data.news.map((n, i) => (
                  <div key={i} className="truncate">• {n.event} ({new Date(n.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', timeZone: timezone === 'IST' ? 'Asia/Kolkata' : 'UTC'})})</div>
                ))}
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
