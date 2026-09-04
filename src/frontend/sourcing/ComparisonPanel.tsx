import { useEffect, useState } from 'react';
import type { SourcingEvent } from '../../shared/types/domain';
import type { ComparisonSnapshot, FreightAllocationPolicy } from '../../shared/types/bid';
import type { BuyerApiClient } from '../api/buyerApiClient';
import { BidMatrix, EvaluationPanel } from './BidMatrix';

interface Props {
  event: SourcingEvent;
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

interface FxRow { currency: string; rate: string }

export function ComparisonPanel({ event, apiClient }: Props) {
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null);
  const [history, setHistory] = useState<ComparisonSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [showBuildForm, setShowBuildForm] = useState(false);
  const [view, setView] = useState<'matrix' | 'evaluation'>('matrix');

  const [baseCurrency, setBaseCurrency] = useState(event.currency);
  const [freightPolicy, setFreightPolicy] = useState<FreightAllocationPolicy>('PROPORTIONAL_TO_LINE_VALUE');
  const [fxRows, setFxRows] = useState<FxRow[]>([{ currency: event.currency, rate: '1' }]);

  useEffect(() => {
    if (!apiClient) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([apiClient.getLatestComparison(event.id), apiClient.listComparisons(event.id)])
      .then(([latest, list]) => {
        if (cancelled) return;
        setSnapshot(latest);
        setHistory(list);
      })
      .catch(() => { if (!cancelled) setError('Could not load the bid comparison.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiClient, event.id]);

  async function handleBuild() {
    if (!apiClient) return;
    setBuilding(true);
    setError('');
    try {
      const fxRates: Record<string, number> = {};
      for (const row of fxRows) {
        const n = Number(row.rate);
        if (row.currency && Number.isFinite(n) && n > 0) fxRates[row.currency.toUpperCase()] = n;
      }
      const built = await apiClient.buildComparison(event.id, event.lines, {
        baseCurrency, freightAllocationPolicy: freightPolicy, fxRates,
      });
      setSnapshot(built);
      setHistory(h => [built, ...h]);
      setShowBuildForm(false);
    } catch {
      setError('Could not build the comparison. Check that FX rates are provided for every quoted currency.');
    } finally {
      setBuilding(false);
    }
  }

  async function handleSetTechnicalScore(supplierId: string, score: number, comment?: string) {
    if (!apiClient || !snapshot) return;
    const updated = await apiClient.setManualTechnicalScore(snapshot.id, supplierId, score, comment);
    setSnapshot(updated);
  }

  if (!apiClient) {
    // Only reachable with no monday session (local dev without monday
    // context) — a real deployed build with no context never gets here at
    // all (see App.tsx). Never say "backend offline" — it isn't.
    return (
      <div className="empty-state compact">
        <h2>Sign in through monday to continue</h2>
        <p>Bid comparison needs your monday session to authenticate as a buyer.</p>
      </div>
    );
  }

  if (loading) return <p>Loading comparison…</p>;

  return (
    <div className="comparison-panel">
      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <div className="comparison-toolbar">
        {snapshot && (
          <div className="bid-matrix-view-tabs" role="group" aria-label="Comparison view">
            <button className={`bid-view-tab ${view === 'matrix' ? 'active' : ''}`} aria-pressed={view === 'matrix'} onClick={() => setView('matrix')}>Bid Matrix</button>
            <button className={`bid-view-tab ${view === 'evaluation' ? 'active' : ''}`} aria-pressed={view === 'evaluation'} onClick={() => setView('evaluation')}>Evaluation</button>
          </div>
        )}
        {history.length > 0 && <span className="settings-row-note">{history.length} snapshot{history.length !== 1 ? 's' : ''} saved</span>}
        <button className="primary-button" onClick={() => setShowBuildForm(v => !v)}>
          {snapshot ? 'Rebuild comparison' : 'Build comparison'}
        </button>
      </div>

      {showBuildForm && (
        <div className="settings-card" style={{ marginBottom: 16 }}>
          <h3 className="settings-card-title">New comparison snapshot</h3>
          <div className="settings-row">
            <div className="settings-row-label"><span>Base currency</span></div>
            <div className="settings-row-value">
              <input className="settings-input" value={baseCurrency} onChange={e => setBaseCurrency(e.target.value.toUpperCase())} aria-label="Base currency" />
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><span>Freight allocation</span></div>
            <div className="settings-row-value">
              <select className="settings-select" value={freightPolicy} onChange={e => setFreightPolicy(e.target.value as FreightAllocationPolicy)} aria-label="Freight allocation policy">
                <option value="PROPORTIONAL_TO_LINE_VALUE">Proportional to line value</option>
                <option value="EQUAL_PER_LINE">Equal per line</option>
                <option value="MANUAL">Manual (set per supplier)</option>
              </select>
            </div>
          </div>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="settings-row-label"><span>FX rates to {baseCurrency}</span><span className="settings-row-note">1 unit of currency = this many {baseCurrency}. Include every currency suppliers quoted in.</span></div>
            {fxRows.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input className="settings-input" style={{ width: 90 }} placeholder="USD" value={row.currency}
                  onChange={e => setFxRows(rows => rows.map((r, ri) => ri === i ? { ...r, currency: e.target.value.toUpperCase() } : r))} aria-label={`FX currency ${i + 1}`} />
                <input className="settings-input" type="number" step="0.0001" placeholder="rate" value={row.rate}
                  onChange={e => setFxRows(rows => rows.map((r, ri) => ri === i ? { ...r, rate: e.target.value } : r))} aria-label={`FX rate ${i + 1}`} />
                <button className="secondary-button" onClick={() => setFxRows(rows => rows.filter((_, ri) => ri !== i))} aria-label={`Remove FX row ${i + 1}`}>Remove</button>
              </div>
            ))}
            <button className="secondary-button" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={() => setFxRows(rows => [...rows, { currency: '', rate: '' }])}>+ Add currency</button>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <button className="primary-button" disabled={building} onClick={handleBuild}>{building ? 'Building…' : 'Build snapshot'}</button>
          </div>
        </div>
      )}

      {!snapshot && !showBuildForm && (
        <div className="empty-state compact">
          <h2>No comparison yet</h2>
          <p>Build a comparison once suppliers have submitted quotes.</p>
        </div>
      )}

      {snapshot && view === 'matrix' && (
        <BidMatrix snapshot={snapshot} eventLines={event.lines} baseCurrency={snapshot.baseCurrency} />
      )}
      {snapshot && view === 'evaluation' && (
        <EvaluationPanel snapshot={snapshot} onSetTechnicalScore={handleSetTechnicalScore} />
      )}
    </div>
  );
}
