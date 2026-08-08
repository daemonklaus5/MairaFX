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

export default function App() {
  const [symbol, setSymbol] = useState('EUR_USD');
  const [timeframe, setTimeframe] = useState('15m');
  const [laneData, setLaneData] = useState<LanesState | null>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'analysis'>('chart');

  // We can expand this list later, but for now stick to the core 4
  const pairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD'];
  const timeframes = ['1m', '5m', '15m', '1H', '4H', '1D'];

  useEffect(() => {
    setLaneData(null);
    fetch(`/api/lanes/${symbol}/${timeframe}`)
      .then(res => res.json())
      .then(data => setLaneData(data))
      .catch(console.error);
  }, [symbol, timeframe]);

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

          {/* 2-Button Toggle */}
          <div className="flex bg-gray-900 rounded-md p-0.5 border border-gray-700">
            <button
              onClick={() => setActiveTab('chart')}
              className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
                activeTab === 'chart' ? 'bg-primary text-darker shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Chart
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
                activeTab === 'analysis' ? 'bg-primary text-darker shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Analysis
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
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

            <AlertModal symbol={symbol} />
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
        
        {/* --- CHART TAB --- */}
        <div className={`w-full lg:flex-1 h-[400px] lg:h-auto lg:overflow-hidden p-3 md:p-4 shrink-0 ${activeTab === 'chart' ? 'block' : 'hidden'}`}>
          {/* We pass setSymbol and pairs down to Chart for the custom search overlay */}
          <Chart symbol={symbol} setSymbol={setSymbol} timeframe={timeframe} pairs={pairs} />
        </div>

        <div
          className={`w-full lg:w-[300px] xl:w-[320px] shrink-0 lg:overflow-y-auto lg:border-l border-t lg:border-t-0 border-gray-800 p-3 space-y-3 text-sm bg-darker/50 ${activeTab === 'chart' ? 'block' : 'hidden'}`}
          style={{ scrollbarGutter: 'stable' }}
        >
          <AiVerdictPanel symbol={symbol} timeframe={timeframe} onAnalyzed={handleAnalyzed} />
          <div className="bg-panel rounded-lg border border-gray-800 p-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-2.5">
              Rule-Based Lanes
            </h2>
            <LanePanel data={laneData} />
          </div>
        </div>


        {/* --- ANALYSIS TAB --- */}
        <div className={`w-full lg:flex-1 h-[200px] lg:h-auto flex-col items-center justify-center p-8 ${activeTab === 'analysis' ? 'flex' : 'hidden'}`}>
          <div className="text-center opacity-30">
            <h2 className="text-2xl font-bold tracking-widest">ANALYSIS TOOLS</h2>
            <p className="mt-2 text-sm uppercase tracking-widest">Coming Soon</p>
          </div>
        </div>

        <div
          className={`w-full lg:w-[300px] xl:w-[320px] shrink-0 lg:overflow-y-auto lg:border-l border-t lg:border-t-0 border-gray-800 p-3 space-y-3 text-sm bg-darker/50 ${activeTab === 'analysis' ? 'block' : 'hidden'}`}
          style={{ scrollbarGutter: 'stable' }}
        >
          {/* COT Badge moved to the top of Analysis pane */}
          <CotBadge symbol={symbol} />
          <KeyDriversPanel symbol={symbol} />
        </div>

      </div>
    </div>
  );
}
