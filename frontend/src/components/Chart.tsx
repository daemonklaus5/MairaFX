import { useEffect, useRef } from 'react';

interface ChartProps {
  symbol: string;
  timeframe: string;
  timezone: 'UTC' | 'IST';
}

// Map our internal symbols to TradingView's OANDA format
function toTvSymbol(symbol: string): string {
  return `OANDA:${symbol.replace('_', '')}`;
}

// Map our timeframes to TradingView's interval format
function toTvInterval(timeframe: string): string {
  const map: Record<string, string> = {
    'M1': '1',
    'M5': '5',
    'M15': '15',
    'H1': '60',
    'H4': '240',
    'D': 'D',
  };
  return map[timeframe] || '15';
}

export function Chart({ symbol, timeframe, timezone }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

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
        timezone: timezone === 'IST' ? 'Asia/Kolkata' : 'Etc/UTC',
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
        enabled_features: [],
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
  }, [symbol, timeframe, timezone]);

  return (
    <div className="relative w-full h-full bg-panel rounded-lg overflow-hidden border border-gray-800">
      <div
        id="tradingview-widget"
        ref={containerRef}
        className="w-full h-full"
      />
    </div>
  );
}
