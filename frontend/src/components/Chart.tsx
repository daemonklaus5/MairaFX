import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

interface ChartProps {
  symbol: string;
  setSymbol: (symbol: string) => void;
  timeframe: string;
  pairs: string[];
}

// Map our internal symbols to TradingView's OANDA format
function toTvSymbol(symbol: string): string {
  return `OANDA:${symbol.replace('_', '')}`;
}

// Map our timeframes to TradingView's interval format
function toTvInterval(timeframe: string): string {
  const map: Record<string, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '1H': '60',
    '4H': '240',
    '1D': 'D',
  };
  return map[timeframe] || '15';
}

export function Chart({ symbol, setSymbol, timeframe, pairs }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Optional: add more standard pairs to search list if desired, or just use core pairs
  const extendedPairs = [...new Set([...pairs, 'USD_CAD', 'USD_CHF', 'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY'])];
  
  const filteredPairs = extendedPairs.filter(p => 
    p.replace('_', '').toLowerCase().includes(searchQuery.replace('_', '').toLowerCase())
  );

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (!(window as any).TradingView || !containerRef.current) return;

      widgetRef.current = new (window as any).TradingView.widget({
        container_id: containerRef.current.id,
        autosize: true,
        symbol: toTvSymbol(symbol),
        interval: toTvInterval(timeframe),
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1', 
        locale: 'en',
        toolbar_bg: '#0b0e14',
        enable_publishing: false,
        allow_symbol_change: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        backgroundColor: '#0b0e14',
        gridColor: 'rgba(42, 46, 57, 0.3)',
        studies: [],
        disabled_features: [
          'use_localstorage_for_settings',
          'header_symbol_search',
          'header_compare',
        ],
        enabled_features: [
          'hide_left_toolbar_by_default',
        ],
        overrides: {
          'mainSeriesProperties.candleStyle.upColor': '#26a69a',
          'mainSeriesProperties.candleStyle.downColor': '#ef5350',
          'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
          'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
          'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
          'paneProperties.background': '#0b0e14',
          'paneProperties.backgroundType': 'solid',
        },
      });
    };

    document.head.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, timeframe]);

  return (
    <div className="flex flex-col w-full h-full bg-[#0b0e14] rounded-lg overflow-hidden border border-gray-800">
      
      {/* Integrated Search Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#0b0e14] z-10 shrink-0">
        <div className="relative">
          <div 
            className={`flex items-center bg-[#131722] border ${isSearching ? 'border-primary' : 'border-gray-700'} rounded shadow-sm px-2.5 py-1.5 w-56 transition-colors`}
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
            <div className="absolute top-full left-0 mt-1 w-full bg-[#131722] border border-gray-700 rounded shadow-xl max-h-[250px] overflow-y-auto z-50">
              {filteredPairs.map(p => (
                <button
                  key={p}
                  onMouseDown={() => {
                    setSymbol(p);
                    setSearchQuery('');
                    setIsSearching(false);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  {p.replace('_', '/')}
                </button>
              ))}
              {filteredPairs.length === 0 && (
                <div className="px-3 py-2.5 text-sm text-gray-500">No pairs found</div>
              )}
            </div>
          )}
        </div>
        
        {/* We can add other chart-specific tools here in the future */}
        <div className="text-xs text-gray-500 font-medium">MairaFX AI Charting</div>
      </div>

      {/* TradingView Widget Container */}
      <div
        id="tradingview-widget"
        ref={containerRef}
        className="flex-1 w-full relative"
      />
    </div>
  );
}
