import React, { useEffect, useState } from 'react';
import './BacktestPanel.css'; // Optional if we want CSS, but I'll use inline styles or existing tokens

interface BucketStat {
  bucket: string;
  total: number;
  wins: number;
}

interface PairStat {
  pair: string;
  total: number;
  wins: number;
}

interface WaitAccuracy {
  total: number;
  correct: number;
}

interface ConfluenceStat {
  [factor: string]: { total: number; wins: number };
}

interface Verdict {
  verdict_id: string;
  timestamp: string;
  pair: string;
  timeframe: string;
  verdict: string;
  conviction_score: number;
  outcome: string;
  entry_price?: number;
  target_price?: number;
  invalidation_price?: number;
}

interface BacktestStats {
  buckets: BucketStat[];
  pairs: PairStat[];
  wait_accuracy: WaitAccuracy;
  recent_verdicts: Verdict[];
  confluence_stats: ConfluenceStat;
}

const BacktestPanel: React.FC = () => {
  const [stats, setStats] = useState<BacktestStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/backtest/stats')
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch backtest stats:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="backtest-container loading-state">
        <div className="pulse-loader"></div>
        <p>Crunching Historical AI Verdicts...</p>
      </div>
    );
  }

  if (!stats) return <div className="backtest-container">Failed to load data.</div>;

  const calculateWinRate = (wins: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((wins / total) * 100);
  };

  const getOutcomeColor = (outcome: string) => {
    if (outcome === 'WIN' || outcome === 'CORRECT_WAIT') return '#00e676';
    if (outcome === 'LOSS' || outcome === 'MISSED_WAIT') return '#ff1744';
    if (outcome === 'TIMEOUT') return '#ff9800';
    return '#9e9e9e'; // PENDING
  };

  return (
    <div className="backtest-container">
      <header className="backtest-header">
        <h2>AI Performance Ledger</h2>
        <p>Institutional-grade outcome tracking and backtested win-rates.</p>
      </header>

      <div className="stats-grid">
        {/* Win Rate by Conviction Score */}
        <div className="stat-card glass-panel">
          <h3>Win Rate by Conviction</h3>
          <div className="bars-container">
            {stats.buckets.map(b => (
              <div key={b.bucket} className="stat-bar-row">
                <span className="label">Score {b.bucket}</span>
                <div className="bar-bg">
                  <div 
                    className="bar-fill" 
                    style={{ width: `${calculateWinRate(b.wins, b.total)}%`, backgroundColor: '#00e676' }}
                  />
                </div>
                <span className="value">{calculateWinRate(b.wins, b.total)}%</span>
              </div>
            ))}
            {stats.buckets.length === 0 && <span className="empty">No resolved data yet</span>}
          </div>
        </div>

        {/* Win Rate by Pair */}
        <div className="stat-card glass-panel">
          <h3>Win Rate by Pair</h3>
          <div className="bars-container">
            {stats.pairs.map(p => (
              <div key={p.pair} className="stat-bar-row">
                <span className="label">{p.pair}</span>
                <div className="bar-bg">
                  <div 
                    className="bar-fill" 
                    style={{ width: `${calculateWinRate(p.wins, p.total)}%`, backgroundColor: '#2196f3' }}
                  />
                </div>
                <span className="value">{calculateWinRate(p.wins, p.total)}%</span>
              </div>
            ))}
            {stats.pairs.length === 0 && <span className="empty">No resolved data yet</span>}
          </div>
        </div>

        {/* WAIT Accuracy */}
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

        {/* Confluence Factor Edge */}
        <div className="stat-card glass-panel">
          <h3>Confluence Edge</h3>
          <div className="tags-container">
            {Object.entries(stats.confluence_stats || {}).map(([factor, data]) => {
              const wr = calculateWinRate(data.wins, data.total);
              return (
                <div key={factor} className="confluence-tag">
                  <span className="factor-name">{factor}</span>
                  <span className="factor-wr" style={{ color: wr >= 50 ? '#00e676' : '#ff1744' }}>
                    {wr}% ({data.total})
                  </span>
                </div>
              );
            })}
            {Object.keys(stats.confluence_stats || {}).length === 0 && <span className="empty">No data</span>}
          </div>
        </div>
      </div>

      {/* Recent Verdicts Ledger */}
      <div className="ledger-section glass-panel">
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
                  <td style={{ color: v.verdict === 'LONG' ? '#00e676' : v.verdict === 'SHORT' ? '#ff1744' : '#fff' }}>
                    {v.verdict}
                  </td>
                  <td>{v.conviction_score}</td>
                  <td>{v.target_price || '-'}</td>
                  <td>
                    <span 
                      className="outcome-badge" 
                      style={{ 
                        backgroundColor: `${getOutcomeColor(v.outcome)}33`, 
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
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No verdicts recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BacktestPanel;
