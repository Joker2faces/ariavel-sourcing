import type { AuditRepository } from './auditRepository.js';
import type { AuditEvent } from '../types/audit.js';
import { randomBytes } from 'crypto';

export function createInMemoryAuditRepository(): AuditRepository & { getAll(): AuditEvent[] } {
  const events: AuditEvent[] = [];
  return {
    async log(tenantId, action, entityId, entityType, actorType, actorId, now, metadata) {
      events.push({ id: randomBytes(8).toString('hex'), tenantId, action, entityId, entityType, actorType, actorId, timestamp: now, metadata });
    },
    getAll() { return [...events]; },
  };
}
