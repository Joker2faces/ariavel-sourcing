import type { AuditRepository, AuditQueryFilters } from '../db/auditRepository.js';
import type { AuditEvent } from '../types/audit.js';

export interface AuditService {
  listEvents(tenantId: string, filters?: AuditQueryFilters): Promise<AuditEvent[]>;
  exportCsv(tenantId: string, filters?: AuditQueryFilters): Promise<string>;
}

const CSV_HEADERS = ['timestamp', 'action', 'entityType', 'entityId', 'eventId', 'actorType', 'actorId', 'metadata'] as const;

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function toCsvRow(event: AuditEvent): string {
  const metadata = event.metadata ? JSON.stringify(event.metadata) : '';
  return [
    event.timestamp, event.action, event.entityType, event.entityId, event.eventId ?? '', event.actorType, event.actorId, metadata,
  ].map(csvEscape).join(',');
}

export function createAuditService(auditRepo: AuditRepository): AuditService {
  return {
    async listEvents(tenantId, filters) {
      return auditRepo.query(tenantId, filters);
    },

    async exportCsv(tenantId, filters) {
      // No secrets, token hashes, or raw payload dumps ever appear in audit metadata
      // (see the values actually written in invitationService/quoteService/etc.),
      // so a straight CSV render of stored events is safe to export as-is.
      const events = await auditRepo.query(tenantId, { ...filters, limit: filters?.limit ?? 5000 });
      return [CSV_HEADERS.join(','), ...events.map(toCsvRow)].join('\n');
    },
  };
}
