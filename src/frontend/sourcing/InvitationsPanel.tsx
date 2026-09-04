import { useState, useEffect, useCallback } from 'react';
import type { SourcingEvent, SourcingSupplierSelection } from '../../shared/types/domain';
import type { SupplierInvitation } from '../../server/types/invitation';
import type { SupplierQuote } from '../../server/types/quote';
import type { BuyerApiClient } from '../api/buyerApiClient';
import { StatusChip, type ChipTone } from '../components/StatusChip';

const POLL_INTERVAL_MS = 20_000;

function portalUrl(token: string): string {
  return `${window.location.origin}/portal?token=${token}`;
}

function invitationMessage(event: SourcingEvent, supplierName: string, token: string, expiresAt?: string): string {
  const expiry = expiresAt ? ` This link expires on ${new Date(expiresAt).toLocaleDateString()}.` : '';
  return `Hi ${supplierName},\n\nYou're invited to submit a quote for ${event.reference} — ${event.title}.\n\nPlease use this secure link to review the request and submit your quote: ${portalUrl(token)}${expiry}\n\nThanks,\nAriavel Sourcing`;
}

const STATUS_LABEL: Record<SupplierInvitation['status'], string> = {
  CREATED: 'Invitation generated',
  OPENED: 'Opened',
  SUBMITTED: 'Submitted',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
};

const STATUS_TONE: Record<SupplierInvitation['status'], ChipTone> = {
  CREATED: 'info',
  OPENED: 'warning',
  SUBMITTED: 'success',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
};

interface Props {
  event: SourcingEvent;
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

export function InvitationsPanel({ event, apiClient, serverAvailable }: Props) {
  const [invitations, setInvitations] = useState<SupplierInvitation[]>([]);
  const [quotes, setQuotes] = useState<SupplierQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [portalTokens, setPortalTokens] = useState<Record<string, string>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!apiClient) return;
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const [invs, qs] = await Promise.all([
        apiClient.listInvitations(event.id),
        apiClient.listQuotes(event.id),
      ]);
      setInvitations(invs);
      setQuotes(qs);
      setLastUpdated(new Date());
    } catch {
      if (!opts.silent) setError('Failed to load invitations');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [apiClient, event.id]);

  useEffect(() => { load(); }, [load]);

  // Bounded, visibility-aware polling — pauses when the tab/drawer isn't visible,
  // so buyers see supplier activity (opened/submitted) without a manual reload,
  // and without polling storms while the page is backgrounded.
  useEffect(() => {
    if (!apiClient) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [apiClient, load]);

  async function sendInvitation(supplier: SourcingSupplierSelection) {
    if (!apiClient) return;
    setError(null);
    try {
      const { invitation, portalToken } = await apiClient.createInvitation(event.id, {
        eventReference: event.reference,
        eventTitleSnapshot: event.title,
        supplierId: supplier.supplierId,
        supplierNameSnapshot: supplier.supplierNameSnapshot,
        supplierEmailSnapshot: supplier.emailSnapshot ?? '',
        supplierCodeSnapshot: supplier.supplierCodeSnapshot,
        linesSnapshot: event.lines.map(l => ({
          lineId: l.id, description: l.description, quantity: l.quantity, unit: l.unit, specification: l.specification,
        })),
      });
      setInvitations(prev => [invitation, ...prev]);
      setPortalTokens(prev => ({ ...prev, [invitation.id]: portalToken }));
    } catch {
      setError('Failed to send invitation');
    }
  }

  async function revoke(id: string) {
    if (!apiClient) return;
    try {
      const updated = await apiClient.revokeInvitation(id);
      setInvitations(prev => prev.map(i => i.id === id ? updated : i));
    } catch {
      setError('Failed to revoke invitation');
    }
  }

  async function regenerate(id: string) {
    if (!apiClient) return;
    setRegeneratingId(id);
    try {
      const { invitation, portalToken } = await apiClient.regenerateInvitation(id);
      setInvitations(prev => prev.map(i => i.id === id ? invitation : i));
      setPortalTokens(prev => ({ ...prev, [id]: portalToken }));
    } catch {
      setError('Failed to regenerate link');
    } finally {
      setRegeneratingId(null);
    }
  }

  function copyLink(invId: string, token: string) {
    navigator.clipboard.writeText(portalUrl(token)).catch(() => undefined);
    setCopiedId(invId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function copyMessage(inv: SupplierInvitation, token: string) {
    navigator.clipboard.writeText(invitationMessage(event, inv.supplierNameSnapshot, token, inv.expiresAt)).catch(() => undefined);
    setCopiedMessageId(inv.id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  }

  function mailtoHref(inv: SupplierInvitation, token: string): string {
    const subject = `Quote request: ${event.reference} — ${event.title}`;
    const body = invitationMessage(event, inv.supplierNameSnapshot, token, inv.expiresAt);
    return `mailto:${encodeURIComponent(inv.supplierEmailSnapshot)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (!apiClient) {
    // Only reachable with no monday session (local dev without monday
    // context) — a real deployed build with no context never gets here at
    // all (see App.tsx). Never say "server not available" — the server is
    // fine, there's just no buyer session to authenticate with here.
    return (
      <div className="empty-state compact">
        <h2>Sign in through monday to continue</h2>
        <p>Invitation management needs your monday session to authenticate as a buyer.</p>
      </div>
    );
  }

  if (!serverAvailable) {
    // apiClient exists (we're inside monday with a session) but the health
    // check failed — this IS a genuine backend-unavailable condition.
    return (
      <div className="empty-state compact">
        <h2>Backend unavailable</h2>
        <p>The Ariavel server isn't responding right now. Try reloading in a moment.</p>
      </div>
    );
  }

  if (event.status === 'DRAFT') {
    return (
      <div className="empty-state compact">
        <h2>Event is in Draft</h2>
        <p>Mark the event as Ready for Invitation before sending invitations.</p>
      </div>
    );
  }

  const uninvited = event.supplierSelections.filter(
    s => !invitations.some(i => i.supplierId === s.supplierId && i.status !== 'REVOKED'),
  );

  const quoteByInv = new Map(quotes.map(q => [q.invitationId, q]));

  return (
    <div className="inv-panel">
      {error && <div className="form-error" role="alert">{error}</div>}

      {uninvited.length > 0 && (
        <div className="inv-section">
          <h4>Not yet invited ({uninvited.length})</h4>
          <ul className="inv-pending-list">
            {uninvited.map(s => (
              <li key={s.supplierId} className="inv-pending-row">
                <span>
                  <strong>{s.supplierNameSnapshot}</strong>
                  {s.emailSnapshot
                    ? <small style={{ color: '#667286', marginLeft: 6 }}>{s.emailSnapshot}</small>
                    : <small style={{ color: '#a75d05', marginLeft: 6 }}>⚠ No email</small>}
                </span>
                <button
                  className="primary-button small"
                  onClick={() => sendInvitation(s)}
                  disabled={loading || !s.emailSnapshot}
                  title={!s.emailSnapshot ? 'Supplier has no email on file' : undefined}
                >
                  Generate invitation link
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="inv-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h4>Invitations ({invitations.length})</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastUpdated && <span className="settings-row-note">Last updated {lastUpdated.toLocaleTimeString()}</span>}
            <button className="secondary-button small" onClick={() => load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        </div>
        {invitations.length === 0 && !loading && (
          <p style={{ color: '#667286', fontSize: 13 }}>No invitations sent yet.</p>
        )}
        <ul className="inv-list">
          {invitations.map(inv => {
            const quote = quoteByInv.get(inv.id);
            const token = portalTokens[inv.id];
            const canDeliver = !!token && inv.status !== 'REVOKED' && inv.status !== 'EXPIRED';
            return (
              <li key={inv.id} className="inv-row">
                <div className="inv-row-info">
                  <strong>{inv.supplierNameSnapshot}</strong>
                  <small style={{ color: '#667286', marginLeft: 6 }}>{inv.supplierEmailSnapshot}</small>
                  <StatusChip label={STATUS_LABEL[inv.status]} tone={STATUS_TONE[inv.status]} />
                  {inv.openedAt && <small className="settings-row-note">First opened {new Date(inv.openedAt).toLocaleDateString()}</small>}
                  {inv.expiresAt && <small className="settings-row-note">Expires {new Date(inv.expiresAt).toLocaleDateString()}</small>}
                </div>
                {quote && <QuoteSummaryBadge quote={quote} lineCount={event.lines.length} />}
                <div className="inv-row-actions">
                  {inv.status !== 'REVOKED' && inv.status !== 'SUBMITTED' && inv.status !== 'EXPIRED' && (
                    <>
                      <button
                        className="secondary-button small"
                        onClick={() => regenerate(inv.id)}
                        disabled={regeneratingId === inv.id}
                      >
                        {regeneratingId === inv.id ? 'Regenerating…' : 'New link'}
                      </button>
                      <button className="secondary-button small danger" onClick={() => revoke(inv.id)}>
                        Revoke
                      </button>
                    </>
                  )}
                </div>
                {canDeliver ? (
                  <div className="inv-delivery-banner">
                    <span className="settings-badge badge-neutral">Link generated — not automatically sent</span>
                    <button className="secondary-button small" onClick={() => copyLink(inv.id, token)}>
                      {copiedId === inv.id ? 'Copied!' : 'Copy link'}
                    </button>
                    <button className="secondary-button small" onClick={() => copyMessage(inv, token)}>
                      {copiedMessageId === inv.id ? 'Copied!' : 'Copy invitation message'}
                    </button>
                    <a className="secondary-button small" href={mailtoHref(inv, token)}>Open email draft</a>
                  </div>
                ) : (inv.status === 'CREATED' || inv.status === 'OPENED') && (
                  // The raw token is only ever known right after create/regenerate — it is
                  // hashed at rest and never re-shown for security. After a reload there is
                  // no way to recover the original link, so say so instead of silently
                  // showing nothing.
                  <div className="inv-delivery-banner">
                    <span className="settings-row-note">The invitation link was already generated for this supplier and isn't stored in plain text. Use "New link" to get a fresh copyable link (this invalidates the previous one).</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// A compact quote-inbox summary inline with each invitation, rather than a
// separate Quotes tab duplicating the same per-supplier list — coverage,
// currency and commercial completeness at a glance without leaving this tab.
function QuoteSummaryBadge({ quote, lineCount }: { quote: SupplierQuote; lineCount: number }) {
  const quotedLines = quote.lines.filter(l => l.unitPrice != null);
  const noBidCount = quote.lines.length - quotedLines.length;
  const currencies = [...new Set(quotedLines.map(l => l.currency).filter((c): c is string => Boolean(c)))];
  const hasCommercialTerms = Boolean(quote.commercialTerms && quote.paymentTerms);

  return (
    <div className="inv-quote-summary">
      <StatusChip label={quote.status === 'SUBMITTED' ? 'Quote submitted' : 'Quote draft'} tone={quote.status === 'SUBMITTED' ? 'success' : 'neutral'} />
      <span className="settings-row-note">
        {quotedLines.length}/{lineCount} lines quoted
        {noBidCount > 0 ? ` · ${noBidCount} no-bid` : ''}
        {currencies.length > 0 ? ` · ${currencies.join(', ')}` : ''}
        {!hasCommercialTerms ? ' · terms incomplete' : ''}
        {quote.submittedAt ? ` · submitted ${new Date(quote.submittedAt).toLocaleDateString()}` : ''}
      </span>
    </div>
  );
}
