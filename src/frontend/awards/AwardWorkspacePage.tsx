import { useEffect, useMemo, useState } from 'react';
import type { SourcingEvent } from '../../shared/types/domain';
import type { SourcingEventService } from '../../backend/services/sourcingEventService';
import type { BuyerApiClient } from '../api/buyerApiClient';
import type { AwardScenario, AwardLine } from '../../shared/types/award';
import type { ComparisonSnapshot, NormalizedQuote } from '../../shared/types/bid';
import { KpiCard } from '../components/KpiCard';
import { StatusChip, type ChipTone } from '../components/StatusChip';
import { RowActions } from '../components/RowActions';

interface Props {
  eventService: SourcingEventService;
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

function fmt(n: number | undefined, decimals = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function AwardWorkspacePage({ eventService, apiClient }: Props) {
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
    // apiClient is only ever null when there is no monday session to derive a
    // buyer JWT from (local development without monday context) — a real
    // deployed build with no monday context never reaches this page at all
    // (see App.tsx's STANDALONE_NO_CONTEXT handling). This is never a
    // "backend offline" condition, so it must never say that.
    return (
      <div className="content-wrap">
        <div className="page-heading"><div><h1>Awards</h1></div></div>
        <div className="empty-state">
          <h2>Sign in through monday to continue</h2>
          <p>The Award Workspace needs your monday session to authenticate as a buyer.</p>
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
          <>
            <button className="secondary-button" disabled={busy} onClick={() => createScenario('recommended')}>+ Recommended scenario</button>
            <button className="secondary-button" disabled={busy} onClick={() => createScenario('empty')}>+ Blank scenario</button>
            {scenario && <button className="secondary-button" onClick={() => setSelectedScenarioId('')}>← Back to scenarios</button>}
          </>
        )}
      </div>

      {!selectedEvent && (
        <div className="empty-state"><h2>Choose a sourcing event</h2><p>Select an event above to view or create award scenarios.</p></div>
      )}

      {selectedEvent && !scenario && (
        scenarios.length === 0 ? (
          <div className="empty-state"><h2>No award scenarios yet</h2><p>Create a recommended scenario (lowest landed cost per line) or start from a blank one.</p></div>
        ) : (
          <>
            <div className="kpi-row kpi-row-4" aria-label="Award scenario summary">
              <KpiCard icon="clipboard" label="Draft scenarios" value={scenarios.filter(s => !s.isFinalized).length} tone="neutral" />
              <KpiCard icon="check" label="Finalized awards" value={scenarios.filter(s => s.isFinalized).length} tone="success" />
              <KpiCard icon="trophy" label="Awarded value" value={fmt(scenarios.filter(s => s.isFinalized).reduce((sum, s) => sum + s.summary.totalAllocatedCost, 0), 0)} tone="info" />
              <KpiCard icon="grid" label="Estimated savings" value={fmt(scenarios.filter(s => s.isFinalized).reduce((sum, s) => sum + (s.summary.totalSavings ?? 0), 0), 0)} tone="warning" />
            </div>
            <div className="rfq-panel">
              <div className="rfq-table-wrap">
                <table className="rfq-table">
                  <thead>
                    <tr>
                      <th>Scenario</th><th>Status</th><th>Suppliers</th><th>Award value</th><th>Savings</th><th>Updated</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map(s => (
                      <tr key={s.id}>
                        <td><button className="supplier-link" onClick={() => setSelectedScenarioId(s.id)}>{s.name}</button></td>
                        <td><StatusChip label={s.isFinalized ? 'Finalized' : 'Draft'} tone={s.isFinalized ? 'success' : 'neutral'} /></td>
                        <td className="num">{s.summary.supplierCount}</td>
                        <td className="num">{fmt(s.summary.totalAllocatedCost, 0)}</td>
                        <td className="num">{s.summary.totalSavings != null ? `${fmt(s.summary.totalSavings, 0)} (${fmt(s.summary.savingsPercent, 1)}%)` : '—'}</td>
                        <td>{new Date(s.updatedAt).toLocaleDateString()}</td>
                        <td><RowActions primaryLabel="Open" onPrimary={() => setSelectedScenarioId(s.id)} ariaLabelSuffix={s.name} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )
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
  const [confirming, setConfirming] = useState(false);
  const overriddenLines = scenario.lines.filter(l => l.isManualOverride);

  return (
    <div className="award-editor">
      <div className="kpi-row kpi-row-4" aria-label="Scenario summary">
        <KpiCard icon="clipboard" label="Award type" value={scenario.awardType === 'SPLIT' ? 'Split' : scenario.awardType === 'LINE' ? 'Per line' : 'Whole'} tone="neutral" />
        <KpiCard icon="trophy" label="Total awarded cost" value={fmt(scenario.summary.totalAllocatedCost, 0)} tone="info" />
        <KpiCard icon="check" label="Savings vs. target" value={scenario.summary.totalSavings != null ? `${fmt(scenario.summary.totalSavings, 0)} (${fmt(scenario.summary.savingsPercent, 1)}%)` : '—'} tone="success" />
        <KpiCard icon="users" label="Suppliers" value={scenario.summary.supplierCount} tone="neutral" />
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
        <button className="primary-button" disabled={!canFinalize || busy} onClick={() => setConfirming(true)}>Finalize award</button>
      )}

      {confirming && (
        <div className="portal-modal-overlay" role="presentation">
          <div className="portal-modal award-finalize-modal" role="dialog" aria-modal="true" aria-label="Confirm award finalization">
            <h2>Finalize this award?</h2>
            <p>Once finalized, allocations cannot be changed. This is a consequential, audited action.</p>
            <dl className="award-finalize-summary">
              <div><dt>Winning suppliers</dt><dd>{scenario.summary.supplierCount}</dd></div>
              <div><dt>Total awarded cost</dt><dd>{fmt(scenario.summary.totalAllocatedCost, 0)}</dd></div>
              <div><dt>Savings vs. target</dt><dd>{scenario.summary.totalSavings != null ? `${fmt(scenario.summary.totalSavings, 0)} (${fmt(scenario.summary.savingsPercent, 1)}%)` : '—'}</dd></div>
              <div><dt>Manual overrides</dt><dd>{overriddenLines.length}</dd></div>
            </dl>
            {overriddenLines.length > 0 && (
              <div className="award-override-banner" role="note">
                {overriddenLines.length} line{overriddenLines.length === 1 ? '' : 's'} awarded to a supplier other than the lowest landed cost. Rationale is preserved in the audit trail.
              </div>
            )}
            <div className="portal-modal-actions">
              <button className="secondary-button" onClick={() => setConfirming(false)} disabled={busy}>Go back</button>
              <button className="primary-button" onClick={() => { setConfirming(false); onFinalize(); }} disabled={busy}>{busy ? 'Finalizing…' : 'Finalize award'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  const allocatedPct = line.requestedQuantity > 0 ? Math.min(100, (allocatedQty / line.requestedQuantity) * 100) : 0;
  const [supplierId, setSupplierId] = useState('');
  const [quantity, setQuantity] = useState<number>(remaining > 0 ? remaining : line.requestedQuantity);
  const [reason, setReason] = useState('');
  const needsReason = supplierId !== '' && supplierId !== winningSupplierId;
  const statusTone: ChipTone = line.status === 'AWARDED' ? 'success' : line.status === 'NO_AWARD' ? 'neutral' : 'warning';
  const statusLabel = line.status === 'AWARDED' ? 'Awarded' : line.status === 'NO_AWARD' ? 'No award' : 'Pending';

  return (
    <div className={`award-line-row ${line.status === 'AWARDED' ? 'awarded' : line.status === 'NO_AWARD' ? 'no-award' : ''}`}>
      <div className="award-line-head">
        <div>
          <strong>{line.lineDescription}</strong>
          <span className="settings-row-note"> {line.requestedQuantity} {line.unit}{line.targetUnitPrice != null ? ` · target ${fmt(line.targetUnitPrice)}` : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusChip label={statusLabel} tone={statusTone} />
          {line.allocations.length > 0 && !disabled && <button className="secondary-button" onClick={onClearLine}>Clear line</button>}
        </div>
      </div>

      {line.status !== 'NO_AWARD' && (
        <div className="award-progress" aria-label={`Allocated ${allocatedQty} of ${line.requestedQuantity} ${line.unit}`}>
          <div className="award-progress-track"><div className="award-progress-fill" style={{ width: `${allocatedPct}%` }} /></div>
          <span className="award-progress-label">Allocated {allocatedQty.toLocaleString()} / {line.requestedQuantity.toLocaleString()} · {allocatedPct.toFixed(0)}%{remaining > 0 ? ` · Remaining ${remaining.toLocaleString()}` : ''}</span>
        </div>
      )}

      {line.isManualOverride && (
        <div className="award-override-banner" role="note">
          <strong>Manual override</strong> — differs from the lowest-landed-cost recommendation.
          {line.overrideReason && <span> Reason: {line.overrideReason}</span>}
        </div>
      )}

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
