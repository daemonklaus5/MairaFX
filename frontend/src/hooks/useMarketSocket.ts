import { useState, useEffect, useCallback, useRef } from 'react';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Indicators {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  atr: number | null;
}

export function useMarketSocket(symbol: string, timeframe: string) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentTick, setCurrentTick] = useState<Candle | null>(null);
  const [indicators, setIndicators] = useState<Indicators | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.PROD ? window.location.host : 'localhost:3001';
    ws.current = new WebSocket(`${protocol}//${host}`);

    ws.current.onopen = () => {
      setIsConnected(true);
      console.log('Connected to market data socket');
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from market data socket, retrying...');
      setTimeout(connect, 3000);
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'TICK') {
          const tickData = data.data || data;
          if (tickData.symbol === symbol) {
            const TF_MINUTES: Record<string, number> = { '15m': 15, '1H': 60, '4H': 240, '1D': 1440 };
            const minutes = TF_MINUTES[timeframe] || 15;
          const msPerTf = minutes * 60 * 1000;
          
          const tickTimeMs = new Date(tickData.timestamp || tickData.time).getTime();
          const candleStartMs = Math.floor(tickTimeMs / msPerTf) * msPerTf;
          const chartTime = candleStartMs / 1000;

            setCurrentTick(prev => {
              if (!prev || prev.time !== chartTime) return { time: chartTime, open: tickData.price, high: tickData.price, low: tickData.price, close: tickData.price };
              return {
                ...prev,
                close: tickData.price,
                high: Math.max(prev.high, tickData.price),
                low: Math.min(prev.low, tickData.price),
              };
            });
          }
        } else if (data.type === 'INDICATORS' && data.data.symbol === symbol) {
          const tfMap: Record<string, string> = { '15m': 'M15', '1H': 'H1', '4H': 'H4', '1D': 'D' };
          const mappedTf = tfMap[timeframe] || timeframe;
          if (data.data.timeframe === mappedTf) {
            setIndicators(data.data);
          }
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    // Clear old state before fetching new timeframe data
    setCandles([]);
    setCurrentTick(null);
    setIndicators(null);

    // Fetch initial historical candles
    fetch(`/api/candles/${symbol}/${timeframe}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setCandles(data);
        }
      })
      .catch(err => console.error('Failed to fetch initial candles:', err));

    connect();
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  return { candles, currentTick, indicators, isConnected };
}
