import { useState, useEffect } from 'react';
import { Chart } from './components/Chart';
import { AiVerdictPanel } from './components/AiVerdictPanel';
import { LanePanel } from './components/LanePanel';
import { KeyDriversPanel } from './components/KeyDriversPanel';
import { CotBadge } from './components/CotBadge';
import { AlertModal } from './components/AlertModal';

interface LaneData {
  bias: 'bull' | 'bear' | 'mixed';
  tier: 'high' | 'moderate' | 'low';
  score: number;
  basis: string;
}

interface LanesState {
  lanes: {
    technical: LaneData;
    flow: LaneData;
    narrative: LaneData;
    macro: LaneData;
  };
}

function App() {
  const [symbol, setSymbol] = useState('EUR_USD');
  const [timeframe, setTimeframe] = useState('15m');
  const [laneData, setLaneData] = useState<LanesState | null>(null);

  const pairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD'];
  const timeframes = ['1m', '5m', '15m', '1H', '4H', '1D'];

  // Reset lane data when symbol or timeframe changes
  useEffect(() => {
    // Auto-fetch rule-based lanes immediately on change
    setLaneData(null);
    fetch(`/api/lanes/${symbol}/${timeframe}`)
      .then(res => res.json())
      .then(data => setLaneData(data))
      .catch(console.error);
  }, [symbol, timeframe]);

  // Called by AiVerdictPanel after a successful analyze
  const handleAnalyzed = (lanes: LanesState['lanes']) => {
    setLaneData({ lanes });
  };

  return (
    <div className="h-screen flex flex-col bg-darker text-gray-200 overflow-hidden">

      {/* ── Sticky Header ── */}
      <header className="shrink-0 z-50 bg-darker/95 backdrop-blur-md border-b border-gray-800 px-3 py-2 md:px-6 md:py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="MairaFX Logo" className="h-8 md:h-10 object-contain" />
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white hidden md:block">
              MairaFX<span className="text-primary">.ai</span>
            </h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-panel border border-gray-700 rounded-md px-2 py-1.5 md:px-4 md:py-2 text-sm focus:outline-none focus:border-primary transition-colors"
            >
              {pairs.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
            </select>

            <div className="flex items-center bg-panel border border-gray-700 rounded-md p-0.5 md:p-1">
              {timeframes.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 md:px-3 md:py-1 rounded-sm text-xs font-medium transition-colors ${
                    timeframe === tf ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="hidden md:block">
              <CotBadge symbol={symbol} />
            </div>
            <AlertModal symbol={symbol} />
          </div>
        </div>

        {/* Mobile COT badge */}
        <div className="block md:hidden mt-2">
          <CotBadge symbol={symbol} />
        </div>
      </header>

      {/* ── Body: chart on top on mobile, side-by-side on desktop ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">

        {/* Left: Chart — fills remaining height, never scrolls */}
        <div className="w-full lg:flex-1 h-[400px] lg:h-auto lg:overflow-hidden p-3 md:p-4 shrink-0">
          <Chart symbol={symbol} timeframe={timeframe} />
        </div>

        {/* Right: Sidebar — independent scroll */}
        <div
          className="w-full lg:w-[300px] xl:w-[320px] shrink-0 lg:overflow-y-auto lg:border-l border-t lg:border-t-0 border-gray-800 p-3 space-y-3 text-sm bg-darker/50"
          style={{ scrollbarGutter: 'stable' }}
        >
          {/* 1. AI Read / Analyze button */}
          <AiVerdictPanel
            symbol={symbol}
            timeframe={timeframe}
            onAnalyzed={handleAnalyzed}
          />

          {/* 2. Rule-Based Lanes (populated after Analyze) */}
          <div className="bg-panel rounded-lg border border-gray-800 p-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">
              Rule-Based Lanes
            </h2>
            <LanePanel data={laneData} />
          </div>

          {/* 3. Key Drivers — live news */}
          <KeyDriversPanel symbol={symbol} />
        </div>
      </div>
    </div>
  );
}

export default App;
