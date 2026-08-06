import { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketSocket } from '../hooks/useMarketSocket';

interface ChartProps {
  symbol: string;
  timeframe: string;
}

export function Chart({ symbol, timeframe }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const { candles, currentTick, indicators, isConnected } = useMarketSocket(symbol, timeframe);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      autoSize: true,
    });

    chartRef.current = chart;

    const isJpy = symbol.includes('JPY');
    const precision = isJpy ? 3 : 5;
    const minMove = isJpy ? 0.001 : 0.00001;

    const priceFormat = {
      type: 'price' as const,
      precision: precision,
      minMove: minMove,
    };

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
      priceFormat: priceFormat,
    });
    
    candleSeriesRef.current = candleSeries;

    const ema9 = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceFormat });
    const ema21 = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, priceFormat });
    const ema50 = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 2, priceFormat });
    const ema200 = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 3, priceFormat });

    ema9SeriesRef.current = ema9;
    ema21SeriesRef.current = ema21;
    ema50SeriesRef.current = ema50;
    ema200SeriesRef.current = ema200;

    // Removed redundant initial setData call to rely entirely on the [candles] useEffect

    return () => {
      chart.remove();
    };
  }, [symbol, timeframe]); // Re-init on symbol/timeframe change

  // Set historical data when it arrives
  useEffect(() => {
    if (candles.length > 0 && candleSeriesRef.current) {
      candleSeriesRef.current.setData(candles as any);
    }
  }, [candles]);

  // Update current tick
  useEffect(() => {
    if (currentTick && candleSeriesRef.current) {
      candleSeriesRef.current.update(currentTick as any);
    }
  }, [currentTick]);

  // Update indicators
  useEffect(() => {
    if (indicators && currentTick) {
      if (indicators.ema9) ema9SeriesRef.current?.update({ time: currentTick.time as any, value: indicators.ema9 });
      if (indicators.ema21) ema21SeriesRef.current?.update({ time: currentTick.time as any, value: indicators.ema21 });
      if (indicators.ema50) ema50SeriesRef.current?.update({ time: currentTick.time as any, value: indicators.ema50 });
      if (indicators.ema200) ema200SeriesRef.current?.update({ time: currentTick.time as any, value: indicators.ema200 });
    }
  }, [indicators, currentTick]);

  return (
    <div className="relative w-full h-[350px] md:h-[600px] bg-panel rounded-lg overflow-hidden border border-gray-800">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10 pointer-events-none">
        <div className="flex items-center gap-4 bg-dark/80 px-4 py-2 rounded-md backdrop-blur-sm pointer-events-auto border border-gray-800">
          <span className="font-bold text-lg text-white">{symbol.replace('_', '/')}</span>
          <span className="text-gray-400 font-mono">{timeframe}</span>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-bull' : 'bg-bear'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
        </div>
      </div>
      
      {/* Chart container */}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
