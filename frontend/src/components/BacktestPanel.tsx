import React, { useEffect, useState } from 'react';
import './BacktestPanel.css';

interface BucketStat { bucket: string; total: number; wins: number; }
interface PairStat { pair: string; total: number; wins: number; }
interface WaitAccuracy { total: number; correct: number; }
interface ConfluenceStat { [factor: string]: { total: number; wins: number }; }
interface Verdict {
  verdict_id: string; timestamp: string; pair: string; timeframe: string;
  verdict: string; conviction_score: number; outcome: string;
  entry_price?: number; target_price?: number; invalidation_price?: number;
}

interface BacktestStats {
  buckets: BucketStat[]; pairs: PairStat[]; wait_accuracy: WaitAccuracy;
  ai_vs_mechanical?: { source: string; total: number; wins: number; avg_win_r: string; avg_loss_r: string; expectancy_r: string }[];
  recent_verdicts: Verdict[]; confluence_stats: ConfluenceStat;
}

interface PipelineStatus {
  symbol: string; timeframe: string; total_rows: string;
  earliest: string; latest: string;
}

type TabState = 'analytics' | 'ledger' | 'pipeline';

const BacktestPanel: React.FC = () => {
  const [stats, setStats] = useState<BacktestStats | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfillTriggered, setBackfillTriggered] = useState(false);

  // Backtest states
  const [runs, setRuns] = useState<string[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    pairs: 'EUR_USD, GBP_USD, USD_JPY',
    timeframe: 'H1',
    useAi: false
  });
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);

  // UI State
  const [activeTab, setActiveTab] = useState<TabState>('analytics');

  const fetchStats = (runId: string) => {
    setLoading(true);
    const url = runId ? `/api/backtest/stats?runId=${encodeURIComponent(runId)}` : '/api/backtest/stats';
    fetch(url)
      .then(res => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch('/api/data-pipeline/status').then(res => res.json()).then(setPipelineStatus);
    fetch('/api/backtest/runs').then(res => res.json()).then(setRuns);
    fetchStats(selectedRun);
  }, []);

  useEffect(() => {
    fetchStats(selectedRun);
  }, [selectedRun]);

  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(() => {
      fetch(`/api/backtest/progress/${encodeURIComponent(activeRunId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            setActiveRunId(null);
            fetch('/api/backtest/runs').then(res => res.json()).then(setRuns);
            setSelectedRun(activeRunId); // Auto-switch to the newly completed run
          }
          setProgress(data);
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRunId]);

  const triggerBackfill = () => {
    setBackfillTriggered(true);
    fetch('/api/data-pipeline/trigger-backfill', { method: 'POST' }).catch(console.error);
  };

  const handleRunBacktest = async () => {
    setShowModal(false);
    setProgress({ status: 'STARTING', current: 0, total: 100 });
    const pairsArr = modalConfig.pairs.split(',').map(p => p.trim()).filter(Boolean);
    const res = await fetch('/api/backtest/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...modalConfig, pairs: pairsArr })
    });
    const data = await res.json();
    if (data.runId) setActiveRunId(data.runId);
  };

  if (loading && !stats) {
    return (
      <div className="backtest-container loading-state">
        <div className="pulse-loader"></div>
        <p>Crunching Historical AI Verdicts...</p>
      </div>
    );
  }

  if (!stats) return <div className="backtest-container">Failed to load data.</div>;

  const calculateWinRate = (wins: number | string, total: number | string) => {
    const w = Number(wins);
    const t = Number(total);
    if (t === 0 || isNaN(t) || isNaN(w)) return 0;
    return Math.round((w / t) * 100);
  };

  const getOutcomeColor = (outcome: string) => {
    if (outcome === 'WIN' || outcome === 'CORRECT_WAIT') return '#00e676';
    if (outcome === 'LOSS' || outcome === 'MISSED_WAIT') return '#ff1744';
    if (outcome === 'TIMEOUT') return '#ff9800';
    return '#9e9e9e'; // PENDING
  };

  // Top Level KPIs
  const totalTrades = stats.buckets.reduce((acc, b) => acc + parseInt(b.total.toString()), 0);
  const totalWins = stats.buckets.reduce((acc, b) => acc + parseInt(b.wins.toString()), 0);
  const overallWinRate = calculateWinRate(totalWins, totalTrades);
  
  let bestPair = { pair: '-', wr: 0 };
  stats.pairs.forEach(p => {
    const wr = calculateWinRate(p.wins, p.total);
    if (wr > bestPair.wr && p.total > 0) {
      bestPair = { pair: p.pair, wr };
    }
  });

  const waitAccuracy = calculateWinRate(stats.wait_accuracy?.correct || 0, stats.wait_accuracy?.total || 0);

  return (
    <div className="backtest-container" style={{ position: 'relative' }}>
      
      {/* Progress Overlay */}
      {activeRunId && progress && (
        <div className="progress-overlay">
          <h2 className="progress-title">Running Simulation...</h2>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
          <p className="progress-text">{progress.current.toLocaleString()} / {progress.total.toLocaleString()} Candles Processed</p>
          <p className="progress-status">{progress.status}</p>
        </div>
      )}

      {/* Configuration Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h3>Configure Offline Backtest</h3>
            <p className="helper-text modal-helper">Execute purely mechanical SMC engine rules instantly over local history.</p>
            
            <label className="modal-label">Pairs (comma separated)</label>
            <input type="text" className="modal-input" value={modalConfig.pairs} onChange={e => setModalConfig({...modalConfig, pairs: e.target.value})} />
            
            <label className="modal-label">Timeframe</label>
            <select className="modal-select" value={modalConfig.timeframe} onChange={e => setModalConfig({...modalConfig, timeframe: e.target.value})}>
              <option value="M15">M15</option>
              <option value="H1">H1</option>
              <option value="H4">H4</option>
              <option value="D">D</option>
            </select>
            
            <div className="modal-label" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={modalConfig.useAi} onChange={e => setModalConfig({...modalConfig, useAi: e.target.checked})} />
              Full Pipeline Backtest (Uses Gemini API, Max 200/pair)
            </div>

            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-neon" onClick={handleRunBacktest}>Start Engine</button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL HEADER */}
      <header className="global-header">
        <div className="header-titles">
          <h2>Performance Engine</h2>
          <p>Analyze mechanical setups and AI synthesis metrics over time.</p>
        </div>
        <div className="header-controls">
          <select className="run-selector" value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)}>
            <option value="">Live Tracking (Forward Test)</option>
            {runs.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <button className="btn btn-primary btn-neon" onClick={() => setShowModal(true)}>
            Run Offline Backtest
          </button>
        </div>
      </header>

      {/* TOP LEVEL KPIs */}
      <div className="kpi-banner">
        <div className="kpi-card glass-panel">
          <span className="kpi-title">Total Positions</span>
          <span className="kpi-value">{totalTrades.toLocaleString()}</span>
        </div>
        <div className="kpi-card glass-panel">
          <span className="kpi-title">Overall Win Rate</span>
          <span className="kpi-value highlight-green">{overallWinRate}%</span>
        </div>
        <div className="kpi-card glass-panel">
          <span className="kpi-title">Best Pair</span>
          <span className="kpi-value highlight-blue">{bestPair.pair} <span className="kpi-sub">({bestPair.wr}%)</span></span>
        </div>
        <div className="kpi-card glass-panel">
          <span className="kpi-title">WAIT Accuracy</span>
          <span className="kpi-value">{waitAccuracy}%</span>
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="tabs-nav">
        <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
          Deep Analytics
        </button>
        <button className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`} onClick={() => setActiveTab('ledger')}>
          Trade Ledger
        </button>
        <button className={`tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`} onClick={() => setActiveTab('pipeline')}>
          Data Lake Pipeline
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className="tab-content">

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="stats-grid slide-in">
            <div className="stat-card glass-panel">
              <h3>Win Rate by Conviction</h3>
              <div className="bars-container">
                {stats.buckets.map(b => (
                  <div key={b.bucket} className="stat-bar-row">
                    <span className="label">Score {b.bucket}</span>
                    <div className="bar-bg">
                      <div 
                        className="bar-fill bg-neon-green" 
                        style={{ width: `${calculateWinRate(b.wins, b.total)}%` }}
                      />
                    </div>
                    <span className="value">{calculateWinRate(b.wins, b.total)}% <span className="sub">({b.total})</span></span>
                  </div>
                ))}
              </div>
            </div>

            {stats.ai_vs_mechanical && stats.ai_vs_mechanical.length > 0 && (
              <div className="stat-card glass-panel" style={{ gridColumn: '1 / -1' }}>
                <h3>AI vs Mechanical Edge Comparison</h3>
                <div className="bars-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {(() => {
                    const mech = stats.ai_vs_mechanical.find(s => s.source === 'backtest') || { wins: 0, total: 0, expectancy_r: '0', avg_win_r: '0', avg_loss_r: '0' };
                    const aiConf = stats.ai_vs_mechanical.find(s => s.source === 'backtest_ai') || { wins: 0, total: 0, expectancy_r: '0', avg_win_r: '0', avg_loss_r: '0' };
                    const aiRej = stats.ai_vs_mechanical.find(s => s.source === 'backtest_ai_rejected') || { wins: 0, total: 0 };
                    
                    const formatR = (val: string | undefined) => val ? Number(val).toFixed(2) : '0.00';
                    
                    return (
                      <>
                        <div className="stat-bar-row" style={{ flexDirection: 'column', alignItems: 'flex-start', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                          <span className="label" style={{ marginBottom: '8px', width: '100%' }}>Mechanical-Only Trades</span>
                          <div className="bar-bg" style={{ width: '100%', marginBottom: '8px' }}>
                            <div className="bar-fill bg-orange-400" style={{ width: `${calculateWinRate(mech.wins, mech.total)}%` }} />
                          </div>
                          <span className="value">{calculateWinRate(mech.wins, mech.total)}% Win Rate <span className="sub">({mech.wins}/{mech.total} Hits)</span></span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px', width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                            <div>
                              <span className="sub" style={{ display: 'block', fontSize: '9px' }}>EXPECTANCY</span>
                              <span className="value" style={{ color: Number(mech.expectancy_r) >= 0 ? '#00e676' : '#ff1744' }}>{formatR(mech.expectancy_r)}R</span>
                            </div>
                            <div>
                              <span className="sub" style={{ display: 'block', fontSize: '9px' }}>AVG W / L</span>
                              <span className="value">{formatR(mech.avg_win_r)}R / {formatR(mech.avg_loss_r)}R</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="stat-bar-row" style={{ flexDirection: 'column', alignItems: 'flex-start', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                          <span className="label" style={{ marginBottom: '8px', width: '100%', color: '#00e676' }}>Gemini-Confirmed Trades</span>
                          <div className="bar-bg" style={{ width: '100%', marginBottom: '8px' }}>
                            <div className="bar-fill bg-neon-green" style={{ width: `${calculateWinRate(aiConf.wins, aiConf.total)}%` }} />
                          </div>
                          <span className="value">{calculateWinRate(aiConf.wins, aiConf.total)}% Win Rate <span className="sub">({aiConf.wins}/{aiConf.total} Hits)</span></span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px', width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                            <div>
                              <span className="sub" style={{ display: 'block', fontSize: '9px' }}>EXPECTANCY</span>
                              <span className="value" style={{ color: Number(aiConf.expectancy_r) >= 0 ? '#00e676' : '#ff1744' }}>{formatR(aiConf.expectancy_r)}R</span>
                            </div>
                            <div>
                              <span className="sub" style={{ display: 'block', fontSize: '9px' }}>AVG W / L</span>
                              <span className="value">{formatR(aiConf.avg_win_r)}R / {formatR(aiConf.avg_loss_r)}R</span>
                            </div>
                          </div>
                          {aiRej.total > 0 && <span className="sub" style={{ marginTop: '12px', color: '#ff9800', width: '100%', textAlign: 'center' }}>AI intercepted and rejected {aiRej.total} bad setups.</span>}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}

            <div className="stat-card glass-panel">
              <h3>Win Rate by Pair</h3>
              <div className="bars-container">
                {stats.pairs.map(p => (
                  <div key={p.pair} className="stat-bar-row">
                    <span className="label">{p.pair}</span>
                    <div className="bar-bg">
                      <div 
                        className="bar-fill bg-neon-blue" 
                        style={{ width: `${calculateWinRate(p.wins, p.total)}%` }}
                      />
                    </div>
                    <span className="value">{calculateWinRate(p.wins, p.total)}%</span>
                  </div>
                ))}
                {stats.pairs.length === 0 && <span className="empty">No resolved data yet</span>}
              </div>
            </div>

            <div className="stat-card glass-panel flex-center">
              <h3>WAIT Accuracy</h3>
              <div className="radial-progress">
                <span className="huge-number">
                  {calculateWinRate(stats.wait_accuracy?.correct || 0, stats.wait_accuracy?.total || 0)}%
                </span>
                <span className="subtext">({stats.wait_accuracy?.correct || 0} / {stats.wait_accuracy?.total || 0} Correct Waits)</span>
              </div>
              <p className="helper-text">Avoided fake-outs / chopped markets.</p>
            </div>

            <div className="stat-card glass-panel">
              <h3>Confluence Edge</h3>
              <div className="tags-container">
                {Object.entries(stats.confluence_stats || {}).map(([factor, data]) => {
                  const wr = calculateWinRate(data.wins, data.total);
                  return (
                    <div key={factor} className="confluence-tag">
                      <span className="factor-name">{factor}</span>
                      <span className={`factor-wr ${wr >= 50 ? 'text-green' : 'text-red'}`}>
                        {wr}% ({data.total})
                      </span>
                    </div>
                  );
                })}
                {Object.keys(stats.confluence_stats || {}).length === 0 && <span className="empty">No data</span>}
              </div>
            </div>
          </div>
        )}

        {/* LEDGER TAB */}
        {activeTab === 'ledger' && (
          <div className="ledger-section glass-panel slide-in full-width">
            <h3>Recent Verdicts Ledger</h3>
            <div className="table-responsive">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pair</th>
                    <th>Verdict</th>
                    <th>Conviction</th>
                    <th>Target</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_verdicts.map(v => (
                    <tr key={v.verdict_id}>
                      <td>{new Date(v.timestamp).toLocaleString()}</td>
                      <td><span className="badge pair-badge">{v.pair}</span> <span className="badge tf-badge">{v.timeframe}</span></td>
                      <td style={{ color: v.verdict === 'LONG' ? '#00e676' : v.verdict === 'SHORT' ? '#ff1744' : '#fff', fontWeight: 600 }}>
                        {v.verdict}
                      </td>
                      <td>{v.conviction_score}</td>
                      <td className="font-mono">{v.target_price || '-'}</td>
                      <td>
                        <span 
                          className="outcome-badge" 
                          style={{ 
                            backgroundColor: `${getOutcomeColor(v.outcome)}15`, 
                            color: getOutcomeColor(v.outcome),
                            border: `1px solid ${getOutcomeColor(v.outcome)}`
                          }}
                        >
                          {v.outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {stats.recent_verdicts.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }}>No verdicts recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PIPELINE TAB */}
        {activeTab === 'pipeline' && (
          <div className="pipeline-section glass-panel slide-in full-width">
            <div className="pipeline-header">
              <div>
                <h3>Data Lake Pipeline</h3>
                <p className="helper-text">Historical OHLCV data synchronized with OANDA for offline quant backtesting.</p>
              </div>
              <div className="pipeline-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={triggerBackfill}
                  disabled={backfillTriggered}
                >
                  {backfillTriggered ? 'Backfilling in BG...' : 'Run Massive Backfill'}
                </button>
                <a href="/api/data-pipeline/export" className="btn btn-secondary">
                  Export to CSV
                </a>
              </div>
            </div>

            <div className="table-responsive">
              <table className="ledger-table pipeline-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Timeframe</th>
                    <th>Total Candles</th>
                    <th>Earliest Record</th>
                    <th>Latest Record</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineStatus && pipelineStatus.map(p => (
                    <tr key={`${p.symbol}_${p.timeframe}`}>
                      <td><span className="badge pair-badge">{p.symbol}</span></td>
                      <td><span className="badge tf-badge">{p.timeframe}</span></td>
                      <td className="font-mono text-profit">
                        {parseInt(p.total_rows).toLocaleString()}
                      </td>
                      <td className="text-muted">{new Date(p.earliest).toLocaleDateString()}</td>
                      <td className="text-muted">{new Date(p.latest).toLocaleString()}</td>
                    </tr>
                  ))}
                  {(!pipelineStatus || pipelineStatus.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '3rem' }}>No candle data exists in the lake.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default BacktestPanel;
