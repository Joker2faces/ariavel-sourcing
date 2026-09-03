import { useEffect, useMemo, useState } from 'react';
import type { SourcingEvent } from '../../shared/types/domain';
import type { SourcingEventService } from '../../backend/services/sourcingEventService';
import type { BuyerApiClient } from '../api/buyerApiClient';
import type { AwardScenario, AwardLine } from '../../shared/types/award';
import type { ComparisonSnapshot, NormalizedQuote } from '../../shared/types/bid';

interface Props {
  eventService: SourcingEventService;
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

function fmt(n: number | undefined, decimals = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function AwardWorkspacePage({ eventService, apiClient, serverAvailable }: Props) {
  const [events, setEvents] = useState<SourcingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [scenarios, setScenarios] = useState<AwardScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [scenario, setScenario] = useState<AwardScenario | null>(null);
  const [snapshot, setSnapshot] = useState<ComparisonSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { void eventService.list().then(evts => setEvents(evts.filter(e => e.status !== 'DRAFT' && e.status !== 'CANCELLED'))); }, [eventService]);

  const selectedEvent = useMemo(() => events.find(e => e.id === selectedEventId) ?? null, [events, selectedEventId]);

  useEffect(() => {
    if (!apiClient || !selectedEventId) { setScenarios([]); return; }
    apiClient.listAwardScenarios(selectedEventId).then(setScenarios).catch(() => setError('Could not load award scenarios.'));
  }, [apiClient, selectedEventId]);

  useEffect(() => {
    if (!apiClient || !selectedScenarioId) { setScenario(null); setSnapshot(null); return; }
    let cancelled = false;
    apiClient.getAwardScenario(selectedScenarioId).then(async s => {
      if (cancelled) return;
      setScenario(s);
      const list = await apiClient.listComparisons(s.eventId);
      if (!cancelled) setSnapshot(list.find(c => c.id === s.comparisonSnapshotId) ?? null);
    }).catch(() => { if (!cancelled) setError('Could not load the award scenario.'); });
    return () => { cancelled = true; };
  }, [apiClient, selectedScenarioId]);

  async function createScenario(kind: 'recommended' | 'empty') {
    if (!apiClient || !selectedEvent) return;
    setBusy(true);
    setError('');
    try {
      const latest = await apiClient.getLatestComparison(selectedEvent.id);
      if (!latest) { setError('Build a bid comparison for this event first (Sourcing Events → Comparison tab).'); return; }
      const name = kind === 'recommended' ? `Recommended — ${new Date().toLocaleDateString()}` : `Manual — ${new Date().toLocaleDateString()}`;
      const created = kind === 'recommended'
        ? await apiClient.createRecommendedAwardScenario(selectedEvent.id, selectedEvent.lines, { name, comparisonSnapshotId: latest.id })
        : await apiClient.createEmptyAwardScenario(selectedEvent.id, selectedEvent.lines, { name, comparisonSnapshotId: latest.id });
      setScenarios(s => [created, ...s]);
      setSelectedScenarioId(created.id);
    } catch {
      setError('Could not create the award scenario.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshScenario(updated: AwardScenario) {
    setScenario(updated);
    setScenarios(list => list.map(s => s.id === updated.id ? updated : s));
  }

  async function handleAllocate(lineId: string, supplierId: string, quantity: number, overrideReason?: string) {
    if (!apiClient || !scenario) return;
    setError('');
    try {
      const updated = await apiClient.awardLine(scenario.id, lineId, supplierId, quantity, overrideReason);
      await refreshScenario(updated);
      setNotice('Allocation saved.');
    } catch {
      setError('Could not save the allocation — an override reason may be required for a non-lowest-cost supplier, or the split quantity may exceed what was requested.');
    }
  }

  async function handleRemoveAllocation(lineId: string, supplierId: string) {
    if (!apiClient || !scenario) return;
    const updated = await apiClient.removeAwardLineAllocation(scenario.id, lineId, supplierId).catch(() => null);
    if (updated) await refreshScenario(updated);
  }

  async function handleClearLine(lineId: string) {
    if (!apiClient || !scenario) return;
    const updated = await apiClient.clearAwardLine(scenario.id, lineId).catch(() => null);
    if (updated) await refreshScenario(updated);
  }

  async function handleMarkNoAward(lineId: string) {
    if (!apiClient || !scenario) return;
    const updated = await apiClient.markAwardLineNoAward(scenario.id, lineId).catch(() => null);
    if (updated) await refreshScenario(updated);
  }

  async function handleFinalize() {
    if (!apiClient || !scenario) return;
    setBusy(true);
    setError('');
    try {
      const updated = await apiClient.finalizeAwardScenario(scenario.id);
      await refreshScenario(updated);
      setNotice('Award finalized.');
    } catch (err) {
      setError((err as Error).message?.includes('pending') ? 'Every line must be awarded or explicitly cleared before finalizing.' : 'Could not finalize this award.');
    } finally {
      setBusy(false);
    }
  }

  if (!apiClient) {
    return (
      <div className="content-wrap">
        <div className="page-heading"><div><h1>Awards</h1></div></div>
        <div className="empty-state">
          <h2>Not connected</h2>
          <p>{serverAvailable ? 'Sign in through monday to use the Award Workspace.' : 'The backend is offline — the Award Workspace is unavailable right now.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrap">
      <div className="page-heading">
        <div><h1>Awards</h1><p>Turn a bid comparison into a final supplier award.</p></div>
      </div>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}

      <div className="award-toolbar">
        <select className="settings-select" value={selectedEventId} onChange={e => { setSelectedEventId(e.target.value); setSelectedScenarioId(''); }} aria-label="Select sourcing event">
          <option value="">Select a sourcing event…</option>
          {events.map(e => <option key={e.id} value={e.id}>{e.reference} — {e.title}</option>)}
        </select>
        {selectedEvent && (
          <select className="settings-select" value={selectedScenarioId} onChange={e => setSelectedScenarioId(e.target.value)} aria-label="Select award scenario">
            <option value="">Select a scenario…</option>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}{s.isFinalized ? ' (finalized)' : ''}</option>)}
          </select>
        )}
        {selectedEvent && !scenario && (
          <>
            <button className="secondary-button" disabled={busy} onClick={() => createScenario('recommended')}>+ Recommended scenario</button>
            <button className="secondary-button" disabled={busy} onClick={() => createScenario('empty')}>+ Blank scenario</button>
          </>
        )}
      </div>

      {!selectedEvent && (
        <div className="empty-state"><h2>Choose a sourcing event</h2><p>Select an event above to view or create award scenarios.</p></div>
      )}

      {selectedEvent && !scenario && scenarios.length === 0 && (
        <div className="empty-state"><h2>No award scenarios yet</h2><p>Create a recommended scenario (lowest landed cost per line) or start from a blank one.</p></div>
      )}

      {scenario && (
        <AwardScenarioEditor
          scenario={scenario}
          snapshot={snapshot}
          busy={busy}
          onAllocate={handleAllocate}
          onRemoveAllocation={handleRemoveAllocation}
          onClearLine={handleClearLine}
          onMarkNoAward={handleMarkNoAward}
          onFinalize={handleFinalize}
        />
      )}
    </div>
  );
}

function candidatesForLine(snapshot: ComparisonSnapshot | null, lineId: string): Array<{ quote: NormalizedQuote; landedUnitCost: number }> {
  if (!snapshot) return [];
  return snapshot.normalizedQuotes
    .flatMap(nq => {
      const line = nq.lines.find(l => l.lineId === lineId);
      if (!line || line.isNoBid || line.landedUnitCost == null) return [];
      return [{ quote: nq, landedUnitCost: line.landedUnitCost }];
    })
    .sort((a, b) => a.landedUnitCost - b.landedUnitCost);
}

function AwardScenarioEditor({
  scenario, snapshot, busy, onAllocate, onRemoveAllocation, onClearLine, onMarkNoAward, onFinalize,
}: {
  scenario: AwardScenario;
  snapshot: ComparisonSnapshot | null;
  busy: boolean;
  onAllocate: (lineId: string, supplierId: string, quantity: number, overrideReason?: string) => void;
  onRemoveAllocation: (lineId: string, supplierId: string) => void;
  onClearLine: (lineId: string) => void;
  onMarkNoAward: (lineId: string) => void;
  onFinalize: () => void;
}) {
  const canFinalize = !scenario.isFinalized && scenario.lines.every(l => l.status !== 'PENDING');

  return (
    <div className="award-editor">
      <div className="award-summary-grid">
        <SummaryTile label="Award type" value={scenario.awardType} />
        <SummaryTile label="Total awarded cost" value={fmt(scenario.summary.totalAllocatedCost)} />
        <SummaryTile label="Savings vs. target" value={scenario.summary.totalSavings != null ? `${fmt(scenario.summary.totalSavings)} (${fmt(scenario.summary.savingsPercent, 1)}%)` : '—'} />
        <SummaryTile label="Suppliers" value={String(scenario.summary.supplierCount)} />
      </div>

      <div className="award-lines">
        {scenario.lines.map(line => (
          <AwardLineRow
            key={line.lineId}
            line={line}
            disabled={scenario.isFinalized || busy}
            candidates={candidatesForLine(snapshot, line.lineId)}
            winningSupplierId={snapshot?.lineBestPrices.find(b => b.lineId === line.lineId)?.winningSupplierId}
            onAllocate={(supplierId, quantity, reason) => onAllocate(line.lineId, supplierId, quantity, reason)}
            onRemoveAllocation={supplierId => onRemoveAllocation(line.lineId, supplierId)}
            onClearLine={() => onClearLine(line.lineId)}
            onMarkNoAward={() => onMarkNoAward(line.lineId)}
          />
        ))}
      </div>

      {scenario.isFinalized ? (
        <div className="notice" role="status">Finalized {scenario.finalizedAt ? new Date(scenario.finalizedAt).toLocaleString() : ''} — this award is now immutable.</div>
      ) : (
        <button className="primary-button" disabled={!canFinalize || busy} onClick={onFinalize}>Finalize award</button>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return <div className="award-summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}

function AwardLineRow({
  line, disabled, candidates, winningSupplierId, onAllocate, onRemoveAllocation, onClearLine, onMarkNoAward,
}: {
  line: AwardLine;
  disabled: boolean;
  candidates: Array<{ quote: NormalizedQuote; landedUnitCost: number }>;
  winningSupplierId?: string;
  onAllocate: (supplierId: string, quantity: number, reason?: string) => void;
  onRemoveAllocation: (supplierId: string) => void;
  onClearLine: () => void;
  onMarkNoAward: () => void;
}) {
  const allocatedQty = line.allocations.reduce((s, a) => s + a.quantity, 0);
  const remaining = line.requestedQuantity - allocatedQty;
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState<number>(remaining > 0 ? remaining : line.requestedQuantity);
  const [reason, setReason] = useState('');
  const needsReason = supplierId !== '' && supplierId !== winningSupplierId;

  return (
    <div className={`award-line-row ${line.status === 'AWARDED' ? 'awarded' : line.status === 'NO_AWARD' ? 'no-award' : ''}`}>
      <div className="award-line-head">
        <div>
          <strong>{line.lineDescription}</strong>
          <span className="settings-row-note"> {line.requestedQuantity} {line.unit}{line.targetUnitPrice != null ? ` · target ${fmt(line.targetUnitPrice)}` : ''}</span>
        </div>
        {line.allocations.length > 0 && !disabled && <button className="secondary-button" onClick={onClearLine}>Clear line</button>}
      </div>

      {line.allocations.length > 0 && (
        <ul className="award-allocation-list">
          {line.allocations.map(a => (
            <li key={a.supplierId}>
              <span>{a.supplierName} — {a.quantity} {line.unit} @ {fmt(a.awardedUnitPrice)} {a.awardedCurrency}{a.notes ? ` (${a.notes})` : ''}</span>
              <span className="award-line-cost">{fmt(a.extendedLandedCost)}</span>
              {!disabled && <button className="secondary-button" onClick={() => onRemoveAllocation(a.supplierId)}>Remove</button>}
            </li>
          ))}
        </ul>
      )}

      {!disabled && remaining > 0 && candidates.length > 0 && (
        <div className="award-allocate-form">
          <select className="settings-select" value={supplierId} onChange={e => setSupplierId(e.target.value)} aria-label={`Award supplier for ${line.lineDescription}`}>
            <option value="">Award remaining {remaining} {line.unit} to…</option>
            {candidates.filter(c => !line.allocations.some(a => a.supplierId === c.quote.supplierId)).map(c => (
              <option key={c.quote.supplierId} value={c.quote.supplierId}>
                {c.quote.supplierName} — landed {fmt(c.landedUnitCost)}{c.quote.supplierId === winningSupplierId ? ' (lowest cost)' : ''}
              </option>
            ))}
          </select>
          <input type="number" className="settings-input" style={{ width: 90 }} value={quantity} min={1} max={remaining}
            onChange={e => setQuantity(Number(e.target.value))} aria-label={`Quantity for ${line.lineDescription}`} />
          {needsReason && (
            <input className="settings-input" placeholder="Override reason (required)" value={reason} onChange={e => setReason(e.target.value)} aria-label="Override reason" />
          )}
          <button className="primary-button" disabled={!supplierId || quantity < 1 || quantity > remaining || (needsReason && !reason)}
            onClick={() => { onAllocate(supplierId, quantity, needsReason ? reason : undefined); setSupplierId(''); setReason(''); }}>
            Award
          </button>
        </div>
      )}

      {candidates.length === 0 && line.status === 'PENDING' && (
        <div className="award-no-bid">
          <p className="settings-helper">No supplier bid on this line.</p>
          {!disabled && <button className="secondary-button" onClick={onMarkNoAward}>Mark as no-award</button>}
        </div>
      )}
      {line.status === 'NO_AWARD' && <p className="settings-helper">Marked as no-award.</p>}
    </div>
  );
}
