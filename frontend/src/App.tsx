import { useState } from 'react';
import { Chart } from './components/Chart';
import { AiVerdictPanel } from './components/AiVerdictPanel';
import { LanePanel } from './components/LanePanel';
import { CotBadge } from './components/CotBadge';
import { AlertModal } from './components/AlertModal';
import { Activity } from 'lucide-react';

function App() {
  const [symbol, setSymbol] = useState('EUR_USD');
  const [timeframe, setTimeframe] = useState('15m');

  const pairs = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD'];
  const timeframes = ['1m', '5m', '15m', '1H', '4H', '1D'];

  return (
    <div className="h-screen flex flex-col bg-darker text-gray-200 overflow-hidden">
      {/* Sticky Header - never scrolls */}
      <header className="shrink-0 sticky top-0 z-50 bg-darker/95 backdrop-blur-md border-b border-gray-800 px-3 py-2 md:px-6 md:py-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            <h1 className="text-lg md:text-2xl font-bold tracking-tight text-white">MairaFX<span className="text-primary">.ai</span></h1>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            <select 
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="bg-panel border border-gray-700 rounded-md px-2 py-1.5 md:px-4 md:py-2 text-sm md:text-base focus:outline-none focus:border-primary transition-colors"
            >
              {pairs.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
            </select>
            
            <div className="flex items-center bg-panel border border-gray-700 rounded-md p-0.5 md:p-1">
              {timeframes.map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 md:px-3 md:py-1 rounded-sm text-xs md:text-sm font-medium transition-colors ${
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
        {/* Mobile-only COT badge row */}
        <div className="block md:hidden mt-2">
          <CotBadge symbol={symbol} />
        </div>
      </header>

      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto p-3 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
          <div className="lg:col-span-3 space-y-4 md:space-y-6">
            <Chart symbol={symbol} timeframe={timeframe} />
          </div>
          
          <div className="space-y-4 md:space-y-6">
            <div className="bg-panel rounded-lg border border-gray-800 p-3 md:p-4">
              <h2 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4">Rule-Based Lanes</h2>
              <LanePanel symbol={symbol} timeframe={timeframe} />
            </div>
            
            <AiVerdictPanel symbol={symbol} timeframe={timeframe} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
