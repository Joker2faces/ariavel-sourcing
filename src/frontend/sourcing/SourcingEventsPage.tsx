import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SourcingEvent, SourcingEventStatus } from '../../shared/types/domain';
import type { SourcingEventService, SourcingEventFilters } from '../../backend/services/sourcingEventService';
import type { RuntimeCapabilities } from '../../backend/runtime/runtimeCapabilities';
import { fullCapabilities } from '../../backend/runtime/runtimeCapabilities';
import { isClosingSoon, isOverdue, formatDeadlineDisplay } from '../../shared/utils/deadline';
import { CreateEventWizard } from './CreateEventWizard';
import { EventDetailDrawer } from './EventDetailDrawer';

const STATUS_LABEL: Record<SourcingEventStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_INVITATION: 'Ready for Invitation',
  CANCELLED: 'Cancelled',
};

function EventStatus({ status }: { status: SourcingEventStatus }) {
  return <span className={`rfq-status rfq-status-${status.toLowerCase().replace(/_/g, '-')}`}>{STATUS_LABEL[status]}</span>;
}

function DeadlineBadge({ deadline }: { deadline: string | undefined }) {
  if (!deadline) return <span className="deadline-none">—</span>;
  const overdue = isOverdue(deadline);
  const closing = isClosingSoon(deadline);
  const cls = overdue ? 'deadline-overdue' : closing ? 'deadline-closing' : '';
  return <span className={cls}>{formatDeadlineDisplay(deadline)}{overdue ? ' (overdue)' : closing ? ' (soon)' : ''}</span>;
}

export function SourcingEventsPage({
  service,
  capabilities = fullCapabilities,
  onCreateEvent,
}: {
  service: SourcingEventService;
  capabilities?: RuntimeCapabilities;
  onCreateEvent?: () => void;
}) {
  const [events, setEvents] = useState<SourcingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<SourcingEventStatus | ''>('');
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDeadline, setFilterDeadline] = useState('');
  const [selected, setSelected] = useState<SourcingEvent | undefined>();
  const [showWizard, setShowWizard] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SourcingEvent | undefined>();

  const feedback = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const filters: SourcingEventFilters = {
        search, status: filterStatus, currency: filterCurrency, category: filterCategory,
        deadlineState: filterDeadline as SourcingEventFilters['deadlineState'],
      };
      setEvents(await service.list(filters));
    } catch { setError('Could not load sourcing events. Try again.'); }
    finally { setLoading(false); }
  }, [service, search, filterStatus, filterCurrency, filterCategory, filterDeadline]);

  useEffect(() => { void load(); }, [load]);

  const options = useMemo(() => ({
    currencies: [...new Set(events.map(e => e.currency).filter(Boolean))].sort(),
    categories: [...new Set(events.map(e => e.category).filter((c): c is string => Boolean(c)))].sort(),
  }), [events]);

  const reset = () => { setSearch(''); setFilterStatus(''); setFilterCurrency(''); setFilterCategory(''); setFilterDeadline(''); };

  const handleCancel = async (event: SourcingEvent) => {
    try {
      await service.changeStatus(event.id, 'CANCELLED', event.ownerUserId);
      feedback('Sourcing event cancelled.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel event.');
    }
  };

  const handleCreated = async () => {
    setShowWizard(false);
    feedback('Sourcing event saved as draft.');
    await load();
  };

  const handleUpdated = async () => {
    setEditingEvent(undefined);
    feedback('Sourcing event updated.');
    await load();
    if (selected) {
      const refreshed = await service.get(selected.id);
      if (refreshed) setSelected(refreshed);
    }
  };

  const canEdit = capabilities.canEditAriavelSuppliers;

  const summary = useMemo(() => {
    const all = events;
    const now = new Date();
    return {
      draft: all.filter(e => e.status === 'DRAFT').length,
      ready: all.filter(e => e.status === 'READY_FOR_INVITATION').length,
      closingSoon: all.filter(e => e.status !== 'CANCELLED' && e.deadline && isClosingSoon(e.deadline, now)).length,
      cancelled: all.filter(e => e.status === 'CANCELLED').length,
    };
  }, [events]);

  if (showWizard || editingEvent) {
    return (
      <CreateEventWizard
        service={service}
        editingEvent={editingEvent}
        onDone={editingEvent ? handleUpdated : handleCreated}
        onCancel={() => { setShowWizard(false); setEditingEvent(undefined); }}
      />
    );
  }

  return (
    <div className="content-wrap rfq-content">
      <div className="page-heading">
        <div>
          <h1>Sourcing Events</h1>
          <p>Create and manage supplier sourcing events and RFQs.</p>
        </div>
        {canEdit && (
          <button className="primary-button" onClick={() => { setShowWizard(true); onCreateEvent?.(); }}>
            + Create sourcing event
          </button>
        )}
      </div>

      <section className="rfq-summary" aria-label="Event summary">
        <SummaryCard label="Draft" value={summary.draft} tone="blue" />
        <SummaryCard label="Ready for Invitation" value={summary.ready} tone="green" />
        <SummaryCard label="Closing Soon" value={summary.closingSoon} tone="orange" />
        <SummaryCard label="Cancelled" value={summary.cancelled} tone="grey" />
      </section>

      {notice ? <div className="notice" role="status">{notice}</div> : null}
      {error ? <div className="error-banner" role="alert">{error}</div> : null}

      <div className="rfq-controls" aria-label="Event filters">
        <label className="search-field">
          <span className="sr-only">Search events</span>
          <input type="search" aria-label="Search events" placeholder="Search reference, title, category…" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
        <label>
          <span>Status</span>
          <select aria-label="Status" value={filterStatus} onChange={e => setFilterStatus(e.target.value as SourcingEventStatus | '')}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          <span>Currency</span>
          <select aria-label="Currency" value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)}>
            <option value="">All currencies</option>
            {options.currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select aria-label="Category" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {options.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span>Deadline</span>
          <select aria-label="Deadline state" value={filterDeadline} onChange={e => setFilterDeadline(e.target.value)}>
            <option value="">All deadlines</option>
            <option value="upcoming">Upcoming</option>
            <option value="closing_soon">Closing soon</option>
            <option value="overdue">Overdue</option>
            <option value="none">No deadline</option>
          </select>
        </label>
        <button className="reset-button" onClick={reset}>Reset filters</button>
      </div>

      {loading ? (
        <div className="supplier-skeleton" aria-label="Loading events" aria-busy="true"><div /><div /><div /></div>
      ) : events.length === 0 ? (
        (search || filterStatus || filterCurrency || filterCategory || filterDeadline) ? (
          <div className="empty-state compact">
            <h2>No sourcing events match your filters.</h2>
            <p>Adjust the search or clear the current filters.</p>
            <button className="secondary-button" onClick={reset}>Reset filters</button>
          </div>
        ) : (
          <div className="empty-state">
            <h2>No sourcing events yet</h2>
            <p>Create your first sourcing event to start managing RFQs.</p>
            {canEdit && <button className="primary-button" onClick={() => setShowWizard(true)}>Create sourcing event</button>}
          </div>
        )
      ) : (
        <div className="rfq-panel">
          <div className="rfq-table-wrap">
            <table className="rfq-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Lines</th>
                  <th>Suppliers</th>
                  <th>Currency</th>
                  <th>Owner</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id}>
                    <td className="rfq-ref">{event.reference}</td>
                    <td><button className="supplier-link" onClick={() => setSelected(event)}>{event.title}</button>{event.category && <small>{event.category}</small>}</td>
                    <td><EventStatus status={event.status} /></td>
                    <td><DeadlineBadge deadline={event.deadline} /></td>
                    <td>{event.lines.length}</td>
                    <td>{event.supplierSelections.length}</td>
                    <td>{event.currency}</td>
                    <td>{event.ownerName ?? event.ownerUserId}</td>
                    <td>{formatDeadlineDisplay(event.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button aria-label={`Open ${event.reference}`} onClick={() => setSelected(event)}>Open</button>
                        {canEdit && event.status !== 'CANCELLED' && (
                          <button aria-label={`Edit ${event.reference}`} onClick={() => setEditingEvent(event)}>Edit</button>
                        )}
                        {canEdit && event.status !== 'CANCELLED' && (
                          <button aria-label={`Cancel ${event.reference}`} onClick={() => void handleCancel(event)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rfq-cards">
            {events.map(event => (
              <article key={event.id} className="rfq-card">
                <div className="rfq-card-head">
                  <div>
                    <button className="supplier-link" onClick={() => setSelected(event)}>{event.title}</button>
                    <small>{event.reference}{event.category ? ` · ${event.category}` : ''}</small>
                  </div>
                  <EventStatus status={event.status} />
                </div>
                <dl>
                  <div><dt>Deadline</dt><dd><DeadlineBadge deadline={event.deadline} /></dd></div>
                  <div><dt>Currency</dt><dd>{event.currency}</dd></div>
                  <div><dt>Lines</dt><dd>{event.lines.length}</dd></div>
                  <div><dt>Suppliers</dt><dd>{event.supplierSelections.length}</dd></div>
                </dl>
                <div className="row-actions">
                  <button aria-label={`Open ${event.reference}`} onClick={() => setSelected(event)}>Open</button>
                  {canEdit && event.status !== 'CANCELLED' && (
                    <button aria-label={`Edit ${event.reference}`} onClick={() => setEditingEvent(event)}>Edit</button>
                  )}
                  {canEdit && event.status !== 'CANCELLED' && (
                    <button aria-label={`Cancel ${event.reference}`} onClick={() => void handleCancel(event)}>Cancel</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <EventDetailDrawer
          event={selected}
          service={service}
          capabilities={capabilities}
          onClose={() => setSelected(undefined)}
          onEdit={canEdit && selected.status !== 'CANCELLED' ? () => { setEditingEvent(selected); setSelected(undefined); } : undefined}
          onStatusChange={async (status) => {
            try {
              const updated = await service.changeStatus(selected.id, status, selected.ownerUserId);
              setSelected(updated);
              await load();
              feedback(status === 'READY_FOR_INVITATION' ? 'Event marked ready for invitation.' : status === 'CANCELLED' ? 'Event cancelled.' : 'Event status updated.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not update status.');
            }
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
