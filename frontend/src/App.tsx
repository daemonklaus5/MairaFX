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
  const timeframes = ['15m', '1H', '4H', '1D'];

  return (
    <div className="min-h-screen bg-darker p-4 md:p-6 text-gray-200">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Forex.AI</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <select 
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-panel border border-gray-700 rounded-md px-4 py-2 focus:outline-none focus:border-primary transition-colors"
          >
            {pairs.map(p => <option key={p} value={p}>{p.replace('_', '/')}</option>)}
          </select>
          
          <div className="flex items-center bg-panel border border-gray-700 rounded-md p-1">
            {timeframes.map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1 rounded-sm text-sm font-medium transition-colors ${
                  timeframe === tf ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
          <CotBadge symbol={symbol} />
          <AlertModal symbol={symbol} />
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <Chart symbol={symbol} timeframe={timeframe} />
          {/* Alerts will go here */}
        </div>
        
        <div className="space-y-6">
          <div className="bg-panel rounded-lg border border-gray-800 p-4">
            <h2 className="text-lg font-semibold text-white mb-4">Rule-Based Lanes</h2>
            <LanePanel symbol={symbol} timeframe={timeframe} />
          </div>
          
          <AiVerdictPanel symbol={symbol} timeframe={timeframe} />
        </div>
      </main>
    </div>
  );
}

export default App;
