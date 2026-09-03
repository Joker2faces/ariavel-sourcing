import { type Db, ObjectId } from 'mongodb';
import type { AuditEvent, AuditAction } from '../types/audit.js';

const COLLECTION = 'audit_events';

export interface AuditQueryFilters {
  eventId?: string;
  action?: AuditAction;
  entityType?: AuditEvent['entityType'];
  limit?: number;
  before?: string; // ISO timestamp cursor — returns events strictly older than this
}

export interface AuditRepository {
  log(
    tenantId: string,
    action: AuditAction,
    entityId: string,
    entityType: AuditEvent['entityType'],
    actorType: AuditEvent['actorType'],
    actorId: string,
    now: string,
    eventId?: string,
    metadata?: Record<string, string | number | boolean>,
  ): Promise<void>;
  /** Most-recent-first, tenant-scoped, optionally filtered. Never returns another tenant's events. */
  query(tenantId: string, filters?: AuditQueryFilters): Promise<AuditEvent[]>;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export function createAuditRepository(db: Db): AuditRepository {
  const col = db.collection<AuditEvent & { _id?: ObjectId }>(COLLECTION);

  return {
    async log(tenantId, action, entityId, entityType, actorType, actorId, now, eventId, metadata) {
      const doc: AuditEvent = {
        id: new ObjectId().toHexString(),
        tenantId,
        action,
        entityId,
        entityType,
        actorType,
        actorId,
        timestamp: now,
        eventId,
        metadata,
      };
      await col.insertOne({ ...doc });
    },

    async query(tenantId, filters = {}) {
      const query: Record<string, unknown> = { tenantId };
      if (filters.eventId) query['eventId'] = filters.eventId;
      if (filters.action) query['action'] = filters.action;
      if (filters.entityType) query['entityType'] = filters.entityType;
      if (filters.before) query['timestamp'] = { $lt: filters.before };

      const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const docs = await col.find(query).sort({ timestamp: -1 }).limit(limit).toArray();
      return docs.map(({ _id, ...rest }) => rest as AuditEvent);
    },
  };
}
