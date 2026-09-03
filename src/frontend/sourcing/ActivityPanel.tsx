import { useEffect, useMemo, useState } from 'react';
import type { SourcingEvent } from '../../shared/types/domain';
import type { BuyerApiClient } from '../api/buyerApiClient';
import type { AuditEvent } from '../../server/types/audit';

interface Props {
  event: SourcingEvent;
  apiClient: BuyerApiClient | null;
  serverAvailable: boolean;
}

const ACTION_LABEL: Record<string, string> = {
  INVITATION_CREATED: 'Invitation created',
  INVITATION_OPENED: 'Invitation opened',
  INVITATION_REVOKED: 'Invitation revoked',
  INVITATION_REGENERATED: 'Invitation regenerated',
  INVITATION_EXPIRED: 'Invitation expired',
  QUOTE_DRAFT_SAVED: 'Quote draft saved',
  QUOTE_SUBMITTED: 'Quote submitted',
  AWARD_SCENARIO_CREATED: 'Award scenario created',
  AWARD_LINE_SET: 'Line awarded',
  AWARD_LINE_CLEARED: 'Line award cleared',
  AWARD_SCENARIO_FINALIZED: 'Award finalized',
};

function actorLabel(e: AuditEvent): string {
  return e.actorType === 'supplier' ? `Supplier ${e.actorId}` : `Buyer user ${e.actorId}`;
}

export function ActivityPanel({ event, apiClient }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState<'ALL' | 'buyer' | 'supplier'>('ALL');

  useEffect(() => {
    if (!apiClient) { setLoading(false); return; }
    let cancelled = false;
    apiClient.listAuditEvents(event.id)
      .then(evts => { if (!cancelled) setEvents(evts); })
      .catch(() => { if (!cancelled) setError('Could not load activity.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiClient, event.id]);

  const actions = useMemo(() => [...new Set(events.map(e => e.action))], [events]);
  const filtered = useMemo(() => events
    .filter(e => !actionFilter || e.action === actionFilter)
    .filter(e => actorFilter === 'ALL' || e.actorType === actorFilter), [events, actionFilter, actorFilter]);

  async function handleExport() {
    if (!apiClient) return;
    const blob = await apiClient.exportAuditCsv(event.id).catch(() => null);
    if (!blob) { setError('Could not export the audit log.'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${event.reference}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (!apiClient) {
    // Only reachable with no monday session (local dev without monday
    // context) — a real deployed build with no context never gets here at
    // all (see App.tsx). Never say "backend offline" — it isn't.
    return (
      <div className="empty-state compact">
        <h2>Sign in through monday to continue</h2>
        <p>Activity history needs your monday session to authenticate as a buyer.</p>
      </div>
    );
  }

  if (loading) return <p>Loading activity…</p>;

  return (
    <div className="activity-panel">
      {error && <div className="notice notice-error" role="alert">{error}</div>}

      <div className="activity-toolbar">
        <select className="settings-select" value={actionFilter} onChange={e => setActionFilter(e.target.value)} aria-label="Filter by action">
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
        </select>
        <select className="settings-select" value={actorFilter} onChange={e => setActorFilter(e.target.value as 'ALL' | 'buyer' | 'supplier')} aria-label="Filter by actor">
          <option value="ALL">Everyone</option>
          <option value="buyer">Buyer</option>
          <option value="supplier">Supplier</option>
        </select>
        <button className="secondary-button" onClick={handleExport}>Export CSV</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state compact"><h2>No activity yet</h2><p>Actions on this event will appear here.</p></div>
      ) : (
        <ul className="activity-list">
          {filtered.map(e => (
            <li key={e.id} className="activity-item">
              <span className="activity-time">{new Date(e.timestamp).toLocaleString()}</span>
              <span className="activity-action">{ACTION_LABEL[e.action] ?? e.action}</span>
              <span className="activity-actor">{actorLabel(e)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
