import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';

interface CalEvent {
  id: number;
  time: number;
  country: string;
  event: string;
  impact: string;
  previous: string;
  estimate: string;
  actual: string | null;
}

export function EconomicCalendar({ timezone }: { timezone: 'UTC' | 'IST' }) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/calendar')
      .then(res => res.json())
      .then(d => {
        setEvents(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="glass-card p-4 w-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> High-Impact Events
        </h2>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-2">
              <div className="h-4 w-8 bg-gray-800 rounded" />
              <div className="h-4 w-full bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((e) => {
            const isPast = e.actual !== null;
            return (
              <div key={e.id} className={`p-2 rounded border ${isPast ? 'bg-gray-800/30 border-gray-800' : 'bg-gray-800/60 border-gray-700'}`}>
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400 w-10">
                      {new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: timezone === 'IST' ? 'Asia/Kolkata' : 'UTC' })}
                    </span>
                    <span className="text-[10px] font-bold text-orange-400 bg-orange-400/10 px-1 rounded">{e.country}</span>
                    <span className="text-[11px] font-medium text-gray-200">{e.event}</span>
                  </div>
                </div>
                <div className="flex gap-4 mt-1.5 ml-14">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-gray-500 uppercase">Forecast</span>
                    <span className="text-[10px] font-mono text-gray-300">{e.estimate}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-gray-500 uppercase">Previous</span>
                    <span className="text-[10px] font-mono text-gray-300">{e.previous}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-gray-500 uppercase">Actual</span>
                    <span className={`text-[10px] font-mono font-bold ${e.actual ? 'text-primary' : 'text-gray-500'}`}>
                      {e.actual || '--'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {events.length === 0 && <p className="text-[11px] text-gray-500 text-center py-2">No high impact events today.</p>}
        </div>
      )}
    </div>
  );
}
