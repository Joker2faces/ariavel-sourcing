import { useState } from 'react';
import type { SourcingEvent, SourcingEventStatus } from '../../shared/types/domain';
import type { SourcingEventService } from '../../backend/services/sourcingEventService';
import type { RuntimeCapabilities } from '../../backend/runtime/runtimeCapabilities';
import { formatDeadlineDisplay, isOverdue, isClosingSoon } from '../../shared/utils/deadline';

const STATUS_LABEL: Record<SourcingEventStatus, string> = {
  DRAFT: 'Draft',
  READY_FOR_INVITATION: 'Ready for Invitation',
  CANCELLED: 'Cancelled',
};

export function EventDetailDrawer({
  event,
  service,
  capabilities: _capabilities,
  onClose,
  onEdit,
  onStatusChange,
}: {
  event: SourcingEvent;
  service: SourcingEventService;
  capabilities?: RuntimeCapabilities;
  onClose: () => void;
  onEdit?: () => void;
  onStatusChange?: (status: SourcingEventStatus) => void;
}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'lines' | 'suppliers'>('overview');
  const { valid: readyValid } = service.validateReady(event);

  const deadlineClass = event.deadline
    ? isOverdue(event.deadline) ? 'deadline-overdue' : isClosingSoon(event.deadline) ? 'deadline-closing' : ''
    : '';

  return (
    <div className="drawer-backdrop" role="dialog" aria-modal="true" aria-label={`Sourcing event ${event.reference}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <div>
            <h2>{event.reference}</h2>
            <p style={{ margin: '2px 0 0', color: '#667286', fontSize: 13 }}>{event.title}</p>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="drawer-body">
          <div className="detail-hero">
            <div>
              <span className={`rfq-status rfq-status-${event.status.toLowerCase().replace(/_/g, '-')}`}>{STATUS_LABEL[event.status]}</span>
              {event.deadline && <span className={`deadline-badge ${deadlineClass}`} style={{ marginLeft: 10 }}>{formatDeadlineDisplay(event.deadline)}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {onEdit && <button className="secondary-button" onClick={onEdit}>Edit</button>}
              {onStatusChange && event.status === 'DRAFT' && readyValid && (
                <button className="primary-button" onClick={() => onStatusChange('READY_FOR_INVITATION')}>Mark Ready</button>
              )}
              {onStatusChange && event.status === 'READY_FOR_INVITATION' && (
                <button className="secondary-button" onClick={() => onStatusChange('DRAFT')}>Back to Draft</button>
              )}
              {onStatusChange && event.status !== 'CANCELLED' && (
                <button className="secondary-button" style={{ color: '#a31e2a' }} onClick={() => onStatusChange('CANCELLED')}>Cancel Event</button>
              )}
            </div>
          </div>

          <nav className="detail-tabs" role="tablist" aria-label="Event details sections">
            {(['overview', 'lines', 'suppliers'] as const).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`detail-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'overview' ? 'Overview' : tab === 'lines' ? `Lines (${event.lines.length})` : `Suppliers (${event.supplierSelections.length})`}
              </button>
            ))}
          </nav>

          {activeTab === 'overview' && (
            <div>
              <div className="detail-section">
                <h4>Identity</h4>
                <dl>
                  <DItem label="Reference" value={event.reference} />
                  <DItem label="Currency" value={event.currency} />
                  {event.category && <DItem label="Category" value={event.category} />}
                  <DItem label="Owner" value={event.ownerName ?? event.ownerUserId} />
                </dl>
              </div>
              {event.deadline && (
                <div className="detail-section">
                  <h4>Dates</h4>
                  <dl>
                    <DItem label="Deadline" value={formatDeadlineDisplay(event.deadline)} />
                    {event.targetDeliveryDate && <DItem label="Target Delivery" value={formatDeadlineDisplay(event.targetDeliveryDate)} />}
                  </dl>
                </div>
              )}
              {event.description && (
                <div className="detail-section">
                  <h4>Description</h4>
                  <p style={{ margin: 0, color: '#334056', fontSize: 14, lineHeight: 1.5 }}>{event.description}</p>
                </div>
              )}
              {event.internalNotes && (
                <div className="detail-section">
                  <h4>Internal Notes</h4>
                  <p style={{ margin: 0, color: '#334056', fontSize: 14, lineHeight: 1.5 }}>{event.internalNotes}</p>
                </div>
              )}
              <div className="detail-section">
                <h4>Audit</h4>
                <dl>
                  <DItem label="Created" value={formatDeadlineDisplay(event.createdAt)} />
                  <DItem label="Updated" value={formatDeadlineDisplay(event.updatedAt)} />
                </dl>
              </div>
            </div>
          )}

          {activeTab === 'lines' && (
            <div>
              {event.lines.length === 0
                ? <div className="empty-state compact"><h2>No line items</h2><p>Edit the event to add line items.</p></div>
                : <table className="rfq-detail-table">
                  <thead><tr><th>#</th><th>Description</th><th>SKU</th><th>Qty</th><th>Unit</th><th>Target Price</th></tr></thead>
                  <tbody>
                    {event.lines.map((l, i) => (
                      <tr key={l.id}>
                        <td>{i + 1}</td>
                        <td>{l.description}{l.specification && <><br /><small style={{ color: '#778' }}>{l.specification}</small></>}</td>
                        <td>{l.sku ?? '—'}</td>
                        <td>{l.quantity}</td>
                        <td>{l.unit}</td>
                        <td>{l.targetUnitPrice !== undefined ? l.targetUnitPrice.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
            </div>
          )}

          {activeTab === 'suppliers' && (
            <div>
              {event.supplierSelections.length === 0
                ? <div className="empty-state compact"><h2>No suppliers selected</h2><p>Edit the event to select suppliers.</p></div>
                : <ul className="detail-supplier-list">
                  {event.supplierSelections.map(s => (
                    <li key={s.supplierId} className="detail-supplier-item">
                      <strong>{s.supplierNameSnapshot}</strong>
                      {s.supplierCodeSnapshot && <small> · {s.supplierCodeSnapshot}</small>}
                      {s.emailSnapshot
                        ? <div style={{ fontSize: 12, color: '#667286', marginTop: 2 }}>{s.emailSnapshot}</div>
                        : <div style={{ fontSize: 12, color: '#a75d05', marginTop: 2 }}>⚠ No email on file at time of selection</div>}
                    </li>
                  ))}
                </ul>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
