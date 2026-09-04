import { useState } from 'react';
import type { ComparisonSnapshot, NormalizedQuote, NormalizedQuoteLine, BidLineException, LineBestPrice } from '../../shared/types/bid';
import type { SourcingLine } from '../../shared/types/domain';

interface Props {
  snapshot: ComparisonSnapshot;
  eventLines: SourcingLine[];
  baseCurrency: string;
  onExportCsv?: () => void;
}

const EXCEPTION_LABEL: Record<BidLineException, string> = {
  NO_BID: 'No bid',
  MISSING_PRICE: 'Missing price',
  MOQ_EXCEEDS_REQUEST: 'MOQ > RFQ qty',
  PARTIAL_QUANTITY: 'Partial qty',
  LATE_DELIVERY: 'Late delivery',
  LONG_LEAD_TIME: 'Long lead time',
  CURRENCY_NOT_NORMALIZED: 'FX missing',
  MISSING_COMMERCIAL_TERMS: 'Terms incomplete',
  EXPIRED_QUOTE: 'Short validity',
  MANUAL_OVERRIDE: 'Override',
};

function fmt(val: number | undefined, decimals = 2): string {
  if (val == null) return '—';
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function pct(val: number | undefined): string {
  if (val == null) return '';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

function ExceptionBadge({ exc }: { exc: BidLineException }) {
  return <span className="bid-exception-badge" title={EXCEPTION_LABEL[exc]}>{exc === 'NO_BID' ? '—' : '!'}</span>;
}

function CellValue({ line, lineId, winningSupplierId, baseCurrency: _bc }: {
  line: NormalizedQuoteLine | undefined;
  lineId: string;
  winningSupplierId: string | undefined;
  baseCurrency: string;
}) {
  if (!line || line.isNoBid) {
    return <span className="bid-cell-no-bid" aria-label="No bid">—</span>;
  }

  const isWinner = winningSupplierId != null && line.lineId === lineId;
  const hasExceptions = line.exceptions.filter(e => e !== 'NO_BID').length > 0;

  return (
    <span className={`bid-cell-value ${isWinner ? 'bid-winner' : ''} ${hasExceptions ? 'bid-has-exception' : ''}`}>
      <span className="bid-landed">{fmt(line.landedUnitCost)}</span>
      {line.fxRate && <span className="bid-fx-indicator" title={`FX: ${fmt(line.fxRate, 4)}`}>fx</span>}
      {line.exceptions.filter(e => e !== 'NO_BID').map(e => <ExceptionBadge key={e} exc={e} />)}
    </span>
  );
}

type MatrixView = 'landed_cost' | 'unit_price' | 'extended_cost';

export function BidMatrix({ snapshot, eventLines, baseCurrency, onExportCsv }: Props) {
  const [view, setView] = useState<MatrixView>('landed_cost');
  const [expandedSupplierId, setExpandedSupplierId] = useState<string | null>(null);
  const [mobileLineIndex, setMobileLineIndex] = useState(0);
  const [mobileExpandedId, setMobileExpandedId] = useState<string | null>(null);

  const { normalizedQuotes, lineBestPrices, supplierScores } = snapshot;

  function getCellValue(line: NormalizedQuoteLine | undefined): number | undefined {
    if (!line || line.isNoBid) return undefined;
    if (view === 'unit_price') return line.normalizedUnitPrice;
    if (view === 'extended_cost') return line.extendedLandedCost;
    return line.landedUnitCost;
  }

  const lineMap = new Map(eventLines.map(l => [l.id, l]));

  return (
    <section className="bid-matrix" aria-label="Bid comparison matrix">
      <div className="bid-matrix-toolbar">
        <div className="bid-matrix-view-tabs" role="group" aria-label="View">
          {(['landed_cost', 'unit_price', 'extended_cost'] as MatrixView[]).map(v => (
            <button
              key={v}
              className={`bid-view-tab ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
              aria-pressed={view === v}
            >
              {v === 'landed_cost' ? 'Landed unit cost' : v === 'unit_price' ? 'Unit price' : 'Extended cost'}
            </button>
          ))}
        </div>
        {onExportCsv && (
          <button className="bid-export-btn" onClick={onExportCsv} aria-label="Export to CSV">
            Export CSV
          </button>
        )}
      </div>

      <div className="bid-matrix-scroll">
        <table className="bid-matrix-table" aria-label={`Bid matrix — ${view.replace('_', ' ')}`}>
          <thead>
            <tr className="bid-header-row">
              <th className="bid-line-header sticky-col" scope="col">Line</th>
              <th className="bid-qty-header sticky-col" scope="col">Qty</th>
              <th className="bid-target-header sticky-col" scope="col">Target</th>
              {normalizedQuotes.map(nq => {
                const score = supplierScores.find(s => s.supplierId === nq.supplierId);
                return (
                  <th key={nq.supplierId} scope="col" className="bid-supplier-header">
                    <button
                      className="bid-supplier-label"
                      onClick={() => setExpandedSupplierId(expandedSupplierId === nq.supplierId ? null : nq.supplierId)}
                      aria-expanded={expandedSupplierId === nq.supplierId}
                    >
                      {nq.supplierName}
                      {nq.status === 'PENDING' && <span className="bid-pending-badge">awaiting</span>}
                    </button>
                    {score && (
                      <div className="bid-score-chip" title={`Evaluation score: ${fmt(score.totalScore, 0)}/100`}>
                        {fmt(score.totalScore, 0)}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {eventLines.map(el => {
              const bestPrice = lineBestPrices.find(b => b.lineId === el.id);
              return (
                <tr key={el.id} className="bid-data-row">
                  <td className="bid-line-desc sticky-col">
                    <span className="bid-sku">{el.sku}</span>
                    <span className="bid-desc">{el.description}</span>
                  </td>
                  <td className="bid-qty sticky-col">
                    {el.quantity.toLocaleString()} {el.unit}
                  </td>
                  <td className="bid-target sticky-col">
                    {el.targetUnitPrice != null
                      ? <span className="bid-target-value">{fmt(el.targetUnitPrice)} {baseCurrency}</span>
                      : <span className="bid-no-target">—</span>}
                  </td>
                  {normalizedQuotes.map(nq => {
                    const line = nq.lines.find(l => l.lineId === el.id);
                    const isWinner = bestPrice?.winningSupplierId === nq.supplierId;
                    const cellVal = getCellValue(line);
                    const targetVal = el.targetUnitPrice;
                    const savingPct = (targetVal != null && cellVal != null && targetVal > 0)
                      ? ((targetVal - cellVal) / targetVal) * 100
                      : undefined;

                    return (
                      <td
                        key={nq.supplierId}
                        className={`bid-data-cell ${isWinner ? 'bid-winner-cell' : ''} ${line?.isNoBid ? 'bid-no-bid-cell' : ''}`}
                      >
                        <CellValue
                          line={line}
                          lineId={el.id}
                          winningSupplierId={isWinner ? nq.supplierId : undefined}
                          baseCurrency={baseCurrency}
                        />
                        {savingPct != null && !line?.isNoBid && (
                          <span className={`bid-saving-pct ${savingPct > 0 ? 'saving' : 'overage'}`}>
                            {pct(savingPct)}
                          </span>
                        )}
                        {expandedSupplierId === nq.supplierId && line && !line.isNoBid && (
                          <div className="bid-cell-detail" aria-label="Line detail">
                            {line.quotedCurrency && line.quotedCurrency !== baseCurrency && (
                              <div>Quoted: {fmt(line.quotedUnitPrice)} {line.quotedCurrency} @ {fmt(line.fxRate, 4)}</div>
                            )}
                            {line.freightAllocation != null && line.freightAllocation > 0 && (
                              <div>Freight alloc: {fmt(line.freightAllocation)}</div>
                            )}
                            {line.quotedLeadTimeDays != null && <div>Lead time: {line.quotedLeadTimeDays}d</div>}
                            {line.quotedMoq != null && <div>MOQ: {line.quotedMoq.toLocaleString()}</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {/* Summary row — total landed cost */}
            <tr className="bid-summary-row">
              <td className="bid-line-desc sticky-col bid-total-label" colSpan={3}>Total landed cost ({baseCurrency})</td>
              {normalizedQuotes.map(nq => (
                <td key={nq.supplierId} className="bid-data-cell bid-total-cell">
                  {nq.totalLandedCost != null
                    ? <strong>{fmt(nq.totalLandedCost, 0)}</strong>
                    : <span>—</span>}
                </td>
              ))}
            </tr>

            {/* Best-price row */}
            <tr className="bid-best-row">
              <td className="bid-line-desc sticky-col bid-best-label" colSpan={3}>Bid rank / status</td>
              {normalizedQuotes.map(nq => {
                const score = supplierScores.find(s => s.supplierId === nq.supplierId);
                const isOverallWinner = snapshot.lineBestPrices.some(b => b.winningSupplierId === nq.supplierId);
                return (
                  <td key={nq.supplierId} className="bid-data-cell bid-rank-cell">
                    {score && <span className="bid-score-large" title="Evaluation score">{fmt(score.totalScore, 0)}<small>/100</small></span>}
                    {isOverallWinner && <span className="bid-leader-badge">Leader</span>}
                    <span className="bid-bid-count">{nq.totalBidLines}/{eventLines.length} lines</span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <MobileBidComparison
        eventLines={eventLines}
        normalizedQuotes={normalizedQuotes}
        lineBestPrices={lineBestPrices}
        supplierScores={supplierScores}
        baseCurrency={baseCurrency}
        lineIndex={mobileLineIndex}
        onLineIndexChange={setMobileLineIndex}
        expandedId={mobileExpandedId}
        onToggleExpanded={id => setMobileExpandedId(prev => prev === id ? null : id)}
      />

      {/* Best price per line summary */}
      <div className="bid-line-summary">
        <h4>Best price by line</h4>
        <div className="bid-line-summary-grid">
          {lineBestPrices.filter(b => b.bidCount > 0).map(b => {
            const el = lineMap.get(b.lineId);
            const winner = normalizedQuotes.find(nq => nq.supplierId === b.winningSupplierId);
            return (
              <div key={b.lineId} className="bid-line-summary-card">
                <div className="bid-ls-line">{el?.description ?? b.lineId}</div>
                <div className="bid-ls-winner">{winner?.supplierName ?? '—'}</div>
                <div className="bid-ls-price">{fmt(b.lowestLandedCost)} {baseCurrency}</div>
                {b.spread != null && <div className="bid-ls-spread">Spread vs 2nd: {b.spread.toFixed(1)}%</div>}
                {b.potentialSavings != null && (
                  <div className={`bid-ls-savings ${b.potentialSavings > 0 ? 'saving' : 'overage'}`}>
                    {b.potentialSavings > 0 ? `Saves ${fmt(b.potentialSavings, 0)} ${baseCurrency}` : `Over target by ${fmt(Math.abs(b.potentialSavings), 0)}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Mobile Bid Comparison ───────────────────────────────────────────────────
// The desktop matrix (supplier columns across, RFQ lines down) doesn't fit a
// phone screen — squeezing it in would mean unreadable 40px-wide columns.
// Instead: pick one RFQ line at a time, see every supplier's bid for just
// that line ranked best-to-worst as a stack of cards.

interface MobileBidComparisonProps {
  eventLines: SourcingLine[];
  normalizedQuotes: NormalizedQuote[];
  lineBestPrices: LineBestPrice[];
  supplierScores: ComparisonSnapshot['supplierScores'];
  baseCurrency: string;
  lineIndex: number;
  onLineIndexChange: (i: number) => void;
  expandedId: string | null;
  onToggleExpanded: (supplierId: string) => void;
}

function MobileBidComparison({
  eventLines, normalizedQuotes, lineBestPrices, supplierScores, baseCurrency,
  lineIndex, onLineIndexChange, expandedId, onToggleExpanded,
}: MobileBidComparisonProps) {
  if (eventLines.length === 0) return null;
  const clampedIndex = Math.min(lineIndex, eventLines.length - 1);
  const line = eventLines[clampedIndex];
  const best = lineBestPrices.find(b => b.lineId === line.id);

  const ranked = normalizedQuotes
    .map(nq => ({ nq, ql: nq.lines.find(l => l.lineId === line.id) }))
    .filter((r): r is { nq: NormalizedQuote; ql: NormalizedQuoteLine } => Boolean(r.ql))
    .sort((a, b) => {
      const aBid = !a.ql.isNoBid && a.ql.landedUnitCost != null;
      const bBid = !b.ql.isNoBid && b.ql.landedUnitCost != null;
      if (aBid && !bBid) return -1;
      if (!aBid && bBid) return 1;
      if (aBid && bBid) return (a.ql.landedUnitCost ?? 0) - (b.ql.landedUnitCost ?? 0);
      return 0;
    });

  return (
    <div className="bid-mobile" aria-label="Mobile bid comparison">
      <div className="bid-mobile-line-nav">
        <button
          className="icon-button" aria-label="Previous line" disabled={clampedIndex === 0}
          onClick={() => onLineIndexChange(clampedIndex - 1)}
        >‹</button>
        <select
          className="bid-mobile-line-select" aria-label="Select RFQ line" value={line.id}
          onChange={e => onLineIndexChange(eventLines.findIndex(l => l.id === e.target.value))}
        >
          {eventLines.map((l, i) => <option key={l.id} value={l.id}>{i + 1}. {l.description}</option>)}
        </select>
        <button
          className="icon-button" aria-label="Next line" disabled={clampedIndex === eventLines.length - 1}
          onClick={() => onLineIndexChange(clampedIndex + 1)}
        >›</button>
      </div>

      <div className="bid-mobile-line-meta">
        <span>{line.quantity.toLocaleString()} {line.unit}</span>
        {line.targetUnitPrice != null && <span>Target {fmt(line.targetUnitPrice)} {baseCurrency}</span>}
        {best?.potentialSavings != null && (
          <span className={best.potentialSavings > 0 ? 'saving' : 'overage'}>
            {best.potentialSavings > 0 ? `Best saves ${fmt(best.potentialSavings, 0)}` : `Best over by ${fmt(Math.abs(best.potentialSavings), 0)}`}
          </span>
        )}
      </div>

      <div className="bid-mobile-cards">
        {ranked.map(({ nq, ql }, rank) => {
          const score = supplierScores.find(s => s.supplierId === nq.supplierId);
          const isWinner = best?.winningSupplierId === nq.supplierId;
          const isExpanded = expandedId === nq.supplierId;
          const realExceptions = ql.exceptions.filter(e => e !== 'NO_BID');

          if (ql.isNoBid) {
            return (
              <div key={nq.supplierId} className="bid-mobile-card no-bid">
                <div className="bid-mobile-card-head">
                  <strong>{nq.supplierName}</strong>
                  <span className="bid-cell-no-bid">NO BID</span>
                </div>
              </div>
            );
          }

          return (
            <div key={nq.supplierId} className={`bid-mobile-card ${isWinner ? 'winner' : ''}`}>
              <div className="bid-mobile-card-head">
                <div>
                  <span className="bid-mobile-rank">#{rank + 1}</span>
                  <strong>{nq.supplierName}</strong>
                  {isWinner && <span className="bid-mobile-best-badge">Best value</span>}
                </div>
                {score && <span className="bid-score-chip">{fmt(score.totalScore, 0)}</span>}
              </div>
              <dl className="bid-mobile-card-grid">
                <div><dt>Quoted</dt><dd>{fmt(ql.quotedUnitPrice)} {ql.quotedCurrency ?? baseCurrency}</dd></div>
                <div><dt>Normalized</dt><dd>{fmt(ql.normalizedUnitPrice)} {baseCurrency}</dd></div>
                <div><dt>Landed</dt><dd className="bid-mobile-landed">{fmt(ql.landedUnitCost)} {baseCurrency}</dd></div>
                <div><dt>Lead time</dt><dd>{ql.quotedLeadTimeDays != null ? `${ql.quotedLeadTimeDays}d` : '—'}</dd></div>
                <div><dt>MOQ</dt><dd>{ql.quotedMoq?.toLocaleString() ?? '—'}</dd></div>
              </dl>
              {realExceptions.length > 0 && (
                <div className="bid-mobile-exceptions">
                  {realExceptions.map(e => <span key={e} className="bid-exception-badge-full">{EXCEPTION_LABEL[e]}</span>)}
                </div>
              )}
              <button className="bid-mobile-details-toggle" aria-expanded={isExpanded} onClick={() => onToggleExpanded(nq.supplierId)}>
                {isExpanded ? 'Hide breakdown' : 'Landed cost breakdown'}
              </button>
              {isExpanded && (
                <div className="bid-mobile-breakdown">
                  <div><span>Quoted unit price</span><span>{fmt(ql.normalizedUnitPrice)}</span></div>
                  {ql.freightAllocation ? <div><span>+ Freight</span><span>{fmt(ql.freightAllocation)}</span></div> : null}
                  {ql.dutyAmount ? <div><span>+ Duty</span><span>{fmt(ql.dutyAmount)}</span></div> : null}
                  {ql.handlingAmount ? <div><span>+ Handling</span><span>{fmt(ql.handlingAmount)}</span></div> : null}
                  {ql.discountAmount ? <div><span>− Discount</span><span>{fmt(Math.abs(ql.discountAmount))}</span></div> : null}
                  <div className="bid-mobile-breakdown-total"><span>Landed unit cost</span><span>{fmt(ql.landedUnitCost)}</span></div>
                  {score && (
                    <div className="bid-mobile-breakdown-score">
                      <span>Evaluation score</span><span>{fmt(score.totalScore, 0)}/100</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {ranked.length === 0 && <p className="bid-mobile-empty">No quotes for this line yet.</p>}
      </div>
    </div>
  );
}

// ── CSV Export ──────────────────────────────────────────────────────────────

export function buildComparisonCsv(snapshot: ComparisonSnapshot, eventLines: SourcingLine[], baseCurrency: string): string {
  const suppliers = snapshot.normalizedQuotes;
  const headers = ['Line ID', 'Description', 'Qty', 'Unit', 'Target Price', ...suppliers.flatMap(nq => [
    `${nq.supplierName} - Unit Price`,
    `${nq.supplierName} - Currency`,
    `${nq.supplierName} - Landed Cost`,
    `${nq.supplierName} - Lead Time`,
    `${nq.supplierName} - Exceptions`,
  ])];

  const rows = eventLines.map(el => {
    const supplierCells = suppliers.flatMap(nq => {
      const line = nq.lines.find(l => l.lineId === el.id);
      if (!line || line.isNoBid) return ['', '', '', '', 'NO_BID'];
      return [
        fmt(line.quotedUnitPrice),
        line.quotedCurrency ?? baseCurrency,
        fmt(line.landedUnitCost),
        line.quotedLeadTimeDays?.toString() ?? '',
        line.exceptions.join(';'),
      ];
    });
    return [el.id, el.description, el.quantity.toString(), el.unit, el.targetUnitPrice?.toString() ?? '', ...supplierCells];
  });

  return [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── FX Rate Form ────────────────────────────────────────────────────────────

interface FxRateFormProps {
  currencies: string[];
  baseCurrency: string;
  rates: Record<string, number>;
  onRateChange: (currency: string, rate: number) => void;
}

export function FxRateForm({ currencies, baseCurrency, rates, onRateChange }: FxRateFormProps) {
  const foreignCurrencies = currencies.filter(c => c !== baseCurrency);
  if (foreignCurrencies.length === 0) return null;

  return (
    <div className="fx-rate-form" aria-label="FX rates">
      <h4>Exchange rates (manual)</h4>
      <p className="fx-rate-note">Rates to convert supplier quotes to {baseCurrency}</p>
      <div className="fx-rate-grid">
        {foreignCurrencies.map(c => (
          <label key={c} className="fx-rate-row">
            <span>1 {c} =</span>
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              value={rates[c] ?? ''}
              onChange={e => onRateChange(c, parseFloat(e.target.value))}
              aria-label={`Exchange rate for ${c} to ${baseCurrency}`}
            />
            <span>{baseCurrency}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Evaluation Panel ────────────────────────────────────────────────────────

interface EvaluationPanelProps {
  snapshot: ComparisonSnapshot;
  onSetTechnicalScore?: (supplierId: string, score: number, comment?: string) => Promise<void>;
}

export function EvaluationPanel({ snapshot, onSetTechnicalScore }: EvaluationPanelProps) {
  const [editing, setEditing] = useState<{ supplierId: string; score: string; comment: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const { supplierScores, evaluationCriteria, normalizedQuotes } = snapshot;

  async function handleSave() {
    if (!editing || !onSetTechnicalScore) return;
    const s = parseFloat(editing.score);
    if (isNaN(s) || s < 0 || s > 100) return;
    setSaving(true);
    try {
      await onSetTechnicalScore(editing.supplierId, s, editing.comment || undefined);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  const sortedScores = [...supplierScores].sort((a, b) => b.totalScore - a.totalScore);

  return (
    <section className="evaluation-panel" aria-label="Supplier evaluation">
      <div className="eval-criteria-legend">
        <h4>Evaluation criteria</h4>
        <div className="eval-criteria-chips">
          {evaluationCriteria.map(c => (
            <span key={c.key} className="eval-criterion-chip">
              {c.label} <strong>{c.weight}%</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="eval-scores-table-wrap">
        <table className="eval-scores-table">
          <thead>
            <tr>
              <th>Supplier</th>
              {evaluationCriteria.map(c => <th key={c.key}>{c.label}</th>)}
              <th>Total score</th>
              {onSetTechnicalScore && <th>Technical score</th>}
            </tr>
          </thead>
          <tbody>
            {sortedScores.map((score, rank) => {
              const nq = normalizedQuotes.find(q => q.supplierId === score.supplierId);
              return (
                <tr key={score.supplierId} className={rank === 0 ? 'eval-leader-row' : ''}>
                  <td className="eval-supplier-name">
                    {rank === 0 && <span className="eval-rank-badge" aria-label="Top ranked">#1</span>}
                    {nq?.supplierName ?? score.supplierId}
                  </td>
                  {evaluationCriteria.map(c => {
                    const criterion = score.criteria.find(sc => sc.key === c.key);
                    return (
                      <td key={c.key} className="eval-criterion-cell">
                        <div className="eval-score-bar-wrap">
                          <div className="eval-score-bar" style={{ width: `${criterion?.normalizedScore ?? 0}%` }} />
                        </div>
                        <span>{fmt(criterion?.normalizedScore, 0)}</span>
                      </td>
                    );
                  })}
                  <td className="eval-total-cell">
                    <strong>{fmt(score.totalScore, 0)}</strong><small>/100</small>
                  </td>
                  {onSetTechnicalScore && (
                    <td className="eval-tech-cell">
                      {editing?.supplierId === score.supplierId ? (
                        <div className="eval-tech-edit">
                          <input
                            type="number" min="0" max="100" step="1"
                            value={editing.score}
                            onChange={e => setEditing(prev => prev ? { ...prev, score: e.target.value } : prev)}
                            aria-label="Technical score"
                          />
                          <input
                            type="text" placeholder="Comment (optional)"
                            value={editing.comment}
                            onChange={e => setEditing(prev => prev ? { ...prev, comment: e.target.value } : prev)}
                            aria-label="Technical score comment"
                          />
                          <div className="eval-tech-actions">
                            <button onClick={handleSave} disabled={saving} className="primary-button">{saving ? '…' : 'Save'}</button>
                            <button onClick={() => setEditing(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="eval-tech-score-btn"
                          onClick={() => setEditing({ supplierId: score.supplierId, score: String(score.manualTechnicalScore ?? ''), comment: score.manualTechnicalComment ?? '' })}
                          aria-label={`Set technical score for ${nq?.supplierName}`}
                        >
                          {score.manualTechnicalScore != null ? `${score.manualTechnicalScore}/100` : 'Set score'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
