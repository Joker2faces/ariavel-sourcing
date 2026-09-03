import type { AuditRepository, AuditQueryFilters } from './auditRepository.js';
import type { AuditEvent } from '../types/audit.js';
import { randomBytes } from 'crypto';

const DEFAULT_LIMIT = 200;

export function createInMemoryAuditRepository(): AuditRepository & { getAll(): AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    async log(tenantId, action, entityId, entityType, actorType, actorId, now, eventId, metadata) {
      events.push({ id: randomBytes(8).toString('hex'), tenantId, action, entityId, entityType, actorType, actorId, timestamp: now, eventId, metadata });
    },
    async query(tenantId, filters: AuditQueryFilters = {}) {
      let matches = events.filter(e => e.tenantId === tenantId);
      if (filters.eventId) matches = matches.filter(e => e.eventId === filters.eventId);
      if (filters.action) matches = matches.filter(e => e.action === filters.action);
      if (filters.entityType) matches = matches.filter(e => e.entityType === filters.entityType);
      if (filters.before) matches = matches.filter(e => e.timestamp < filters.before!);
      return matches
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, filters.limit ?? DEFAULT_LIMIT)
        .map(e => ({ ...e }));
    },
    getAll() { return [...events]; },
  };
}
