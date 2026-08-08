import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export function SessionVisualizer() {
  const [currentHourUTC, setCurrentHourUTC] = useState(new Date().getUTCHours() + new Date().getUTCMinutes() / 60);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentHourUTC(now.getUTCHours() + now.getUTCMinutes() / 60);
    }, 60000); // update every minute
    return () => clearInterval(interval);
  }, []);

  const sessions = [
    { name: 'Sydney', start: 21, end: 6, color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
    { name: 'Tokyo', start: 0, end: 9, color: 'bg-violet-500/20 text-violet-400 border-violet-500/50' },
    { name: 'London', start: 8, end: 17, color: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
    { name: 'New York', start: 13, end: 22, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' },
  ];

  return (
    <div className="bg-panel rounded-lg border border-gray-800 p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Market Sessions
        </h2>
        <span className="text-[9px] text-gray-500 bg-gray-800 px-1 rounded">UTC</span>
      </div>

      <div className="relative h-32 border-l border-gray-700 ml-2 mt-2">
        {/* Timeline ticks */}
        {[0, 6, 12, 18, 24].map((h) => (
          <div key={h} className="absolute w-full border-t border-gray-800/50 flex items-center" style={{ top: `${(h / 24) * 100}%` }}>
            <span className="absolute -left-6 text-[8px] text-gray-600 w-4 text-right">{h}h</span>
          </div>
        ))}
        
        {/* Sessions */}
        {sessions.map((s) => {
          let top = (s.start / 24) * 100;
          let height = ((s.end - s.start) / 24) * 100;
          
          if (s.start > s.end) {
            // crosses midnight, simplify for visualizer by splitting
            return (
              <div key={s.name}>
                <div 
                  className={`absolute left-2 right-2 border-l-2 rounded-r flex items-center px-2 text-[9px] font-bold tracking-wider ${s.color}`}
                  style={{ top: `${top}%`, height: `${((24 - s.start) / 24) * 100}%` }}
                >
                  {s.name}
                </div>
                <div 
                  className={`absolute left-2 right-2 border-l-2 rounded-r flex items-center px-2 text-[9px] font-bold tracking-wider ${s.color}`}
                  style={{ top: `0%`, height: `${(s.end / 24) * 100}%` }}
                >
                </div>
              </div>
            );
          }

          return (
            <div 
              key={s.name}
              className={`absolute left-2 right-2 border-l-2 rounded-r flex items-center px-2 text-[9px] font-bold tracking-wider ${s.color}`}
              style={{ top: `${top}%`, height: `${height}%` }}
            >
              {s.name}
            </div>
          );
        })}

        {/* Current Time Marker */}
        <div 
          className="absolute left-0 right-0 border-t-2 border-primary z-20"
          style={{ top: `${(currentHourUTC / 24) * 100}%` }}
        >
          <div className="absolute -right-1 -top-1.5 w-2.5 h-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(0,209,178,0.8)]" />
        </div>
      </div>
    </div>
  );
}
