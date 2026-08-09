import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Chart } from './components/Chart';
import { AiVerdictPanel } from './components/AiVerdictPanel';
import { LanePanel } from './components/LanePanel';
import { KeyDriversPanel } from './components/KeyDriversPanel';
import { CotBadge } from './components/CotBadge';
import { AlertModal } from './components/AlertModal';
import { RetailSentiment } from './components/RetailSentiment';
import { CurrencyHeatmap } from './components/CurrencyHeatmap';
import { EconomicCalendar } from './components/EconomicCalendar';
import { VolatilityMonitor } from './components/VolatilityMonitor';
import { SessionVisualizer } from './components/SessionVisualizer';
import BacktestPanel from './components/BacktestPanel';

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
  const [timeframe, setTimeframe] = useState('M15');
  const [laneData, setLaneData] = useState<LanesState | null>(null);
  const [activeTab, setActiveTab] = useState<'chart' | 'analysis' | 'backtest'>('chart');
  const [timezone, setTimezone] = useState<'UTC' | 'IST'>('UTC');

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // We can expand this list later, but for now stick to the core 4 + a few extended pairs
  const basePairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD'];
  const extendedPairs = [...new Set([...basePairs, 'USD_CAD', 'USD_CHF', 'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY'])];
  
  const filteredPairs = extendedPairs.filter(p => 
    p.replace('_', '').toLowerCase().includes(searchQuery.replace('_', '').toLowerCase())
  );

  const timeframes = ['M1', 'M5', 'M15', 'H1', 'H4', 'D'];
  const displayTf = (tf: string) => tf.startsWith('M') ? tf.substring(1) + 'm' : tf === 'D' ? '1D' : tf;

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
    <div className="h-screen flex flex-col text-gray-200 overflow-hidden bg-transparent">
      {/* ── Floating Header ── */}
      <header className="shrink-0 z-50 glass-card mx-2 md:mx-4 mt-2 md:mt-4 px-3 py-2 md:px-6 md:py-3 mb-2 md:mb-4">
        <div className="flex items-center justify-between gap-2 h-10 relative">
          
          {/* LEFT: Logo */}
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="MairaFX Logo" className="h-8 md:h-10 object-contain" />
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-white hidden md:block">
              MairaFX<span className="text-primary">.ai</span>
            </h1>
          </div>

          {/* CENTER: Fixed Toggle */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex bg-black/40 rounded-md p-1 border border-gray-700/50 shadow-sm z-20 backdrop-blur-md">
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
            <button
              onClick={() => setActiveTab('backtest')}
              className={`px-4 py-1.5 rounded text-xs font-bold transition-colors ${
                activeTab === 'backtest' ? 'bg-primary text-darker shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Backtest
            </button>
          </div>

          {/* RIGHT: Tools (Search, Timeframes, Alerts) */}
          <div className="flex items-center gap-3 md:gap-4 ml-auto">
            
            {/* Timezone Toggle */}
            <div className="flex bg-gray-900 rounded-md p-0.5 border border-gray-800 hidden md:flex">
              <button
                onClick={() => setTimezone('UTC')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  timezone === 'UTC' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                UTC
              </button>
              <button
                onClick={() => setTimezone('IST')}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  timezone === 'IST' ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                IST
              </button>
            </div>

            {activeTab === 'chart' && (
              <>
                {/* Global Search Overlay */}
                <div className="relative z-50 hidden md:block">
                  <div 
                    className={`flex items-center bg-gray-900 border ${isSearching ? 'border-primary' : 'border-gray-700'} rounded-md px-3 py-1.5 w-48 transition-colors`}
                  >
                    <Search className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                    <input 
                      type="text"
                      placeholder={symbol.replace('_', '/')}
                      value={searchQuery}
                      onFocus={() => setIsSearching(true)}
                      onBlur={() => setTimeout(() => setIsSearching(false), 200)}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent text-sm text-white focus:outline-none w-full font-bold placeholder-white"
                    />
                  </div>

                  {isSearching && (
                    <div className="absolute top-full right-0 mt-1 w-full bg-gray-900 border border-gray-700 rounded-md shadow-xl max-h-[250px] overflow-y-auto">
                      {filteredPairs.map(p => (
                        <button
                          key={p}
                          onMouseDown={() => {
                            setSymbol(p);
                            setSearchQuery('');
                            setIsSearching(false);
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                        >
                          {p.replace('_', '/')}
                        </button>
                      ))}
                      {filteredPairs.length === 0 && (
                        <div className="px-3 py-2 text-sm text-gray-500">No pairs found</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Timeframes */}
                <div className="flex items-center bg-panel border border-gray-700 rounded-md p-0.5 md:p-1">
                  {timeframes.map(tf => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`px-2 py-1 md:px-3 md:py-1 rounded-sm text-xs font-medium transition-colors ${
                        timeframe === tf ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {displayTf(tf)}
                    </button>
                  ))}
                </div>

                {/* Alerts */}
                <AlertModal symbol={symbol} />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden relative">
        
        {/* --- CHART TAB --- */}
        <div className={`w-full lg:flex-1 h-[400px] lg:h-auto lg:overflow-hidden p-3 md:p-4 shrink-0 ${activeTab === 'chart' ? 'block' : 'hidden'}`}>
          <Chart symbol={symbol} timeframe={timeframe} timezone={timezone} />
        </div>

        <div
          className={`w-full lg:w-[300px] xl:w-[320px] shrink-0 lg:overflow-y-auto lg:border-l border-t lg:border-t-0 border-gray-800 p-3 space-y-3 text-sm bg-darker/50 ${activeTab === 'chart' ? 'block' : 'hidden'}`}
          style={{ scrollbarGutter: 'stable' }}
        >
          <AiVerdictPanel symbol={symbol} timeframe={timeframe} timezone={timezone} onAnalyzed={handleAnalyzed} />
        </div>


        {/* --- ANALYSIS TAB --- */}
        <div className={`w-full h-full p-4 md:p-6 overflow-y-auto bg-transparent ${activeTab === 'analysis' ? 'block' : 'hidden'}`}>
          <div className="max-w-[1800px] w-full mx-auto flex flex-col gap-4">
            
            {/* Top Banner: Rule-Based Lanes */}
            <div className="w-full">
              <LanePanel data={laneData} />
            </div>

            {/* Grid for Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              
              {/* Column 1: Sentiment & Key Drivers */}
              <div className="flex flex-col gap-4">
                <CotBadge symbol={symbol} />
                <RetailSentiment />
                <KeyDriversPanel symbol={symbol} />
              </div>

              {/* Column 2: Market Conditions */}
              <div className="flex flex-col gap-4">
                <CurrencyHeatmap />
                <VolatilityMonitor symbol={symbol} timeframe={timeframe} />
                <SessionVisualizer />
              </div>

              {/* Column 3: Macro */}
              <div className="flex flex-col gap-4">
                <EconomicCalendar timezone={timezone} />
              </div>

            </div>
          </div>
        </div>

        {/* --- BACKTEST TAB --- */}
        <div className={`w-full h-full overflow-y-auto bg-transparent ${activeTab === 'backtest' ? 'block' : 'hidden'}`}>
          <BacktestPanel />
        </div>

      </div>
    </div>
  );
}
