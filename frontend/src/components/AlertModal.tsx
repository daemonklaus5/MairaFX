import { useState, useEffect } from 'react';
import { Bell, BellPlus, X } from 'lucide-react';

interface Alert {
  id: number;
  symbol: string;
  condition_type: string;
  target_value: number;
  is_active: boolean;
}

export function AlertModal({ symbol }: { symbol: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [target, setTarget] = useState('');
  const [condition, setCondition] = useState('PRICE_ABOVE');

  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) setAlerts(await res.json());
    } catch (e) {}
  };

  useEffect(() => {
    if (isOpen) fetchAlerts();
  }, [isOpen]);

  const handleCreate = async () => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          condition_type: condition,
          target_value: parseFloat(target)
        })
      });
      if (res.ok) {
        setTarget('');
        fetchAlerts();
      }
    } catch (e) {}
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center p-2 rounded-md bg-panel border border-gray-700 hover:border-primary text-gray-400 hover:text-white transition-colors"
        title="Manage Alerts"
      >
        <Bell className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-gray-800 rounded-lg w-full max-w-md p-6 shadow-2xl relative">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              Alerts for {symbol.replace('_', '/')}
            </h2>

            <div className="mb-6 space-y-3">
              <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Active Alerts</h3>
              {alerts.filter(a => a.symbol === symbol).length === 0 ? (
                <div className="text-sm text-gray-400 italic">No active alerts.</div>
              ) : (
                <ul className="space-y-2">
                  {alerts.filter(a => a.symbol === symbol).map(a => (
                    <li key={a.id} className="flex justify-between items-center text-sm bg-darker p-2 rounded border border-gray-800">
                      <span className="text-gray-300">
                        {a.condition_type === 'PRICE_ABOVE' ? 'Crosses Above' : 'Crosses Below'}
                      </span>
                      <span className="font-mono text-white">{a.target_value}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-gray-800 pt-6">
              <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold mb-4">Create New Alert</h3>
              
              <div className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Condition</label>
                    <select 
                      value={condition} 
                      onChange={e => setCondition(e.target.value)}
                      className="bg-darker border border-gray-700 rounded-md px-3 py-2.5 text-sm text-white w-full focus:outline-none focus:border-primary transition-colors"
                    >
                      <option value="PRICE_ABOVE">Crosses Above</option>
                      <option value="PRICE_BELOW">Crosses Below</option>
                    </select>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Target Price</label>
                    <input 
                      type="number" 
                      value={target}
                      onChange={e => setTarget(e.target.value)}
                      placeholder="e.g. 1.1550"
                      className="bg-darker border border-gray-700 rounded-md px-3 py-2.5 text-sm text-white w-full font-mono focus:outline-none focus:border-primary transition-colors"
                      step="0.0001"
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-end gap-3 pt-2">
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCreate}
                    disabled={!target}
                    className="flex items-center justify-center gap-2 bg-primary hover:bg-emerald-400 text-darker font-bold px-6 py-2 rounded-md disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <BellPlus className="w-4 h-4" />
                    Add Alert
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
