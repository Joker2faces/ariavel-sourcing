import { type Db, ObjectId } from 'mongodb';
import type { AuditEvent, AuditAction } from '../types/audit.js';

const COLLECTION = 'audit_events';

export interface AuditRepository {
  log(tenantId: string, action: AuditAction, entityId: string, entityType: AuditEvent['entityType'], actorType: AuditEvent['actorType'], actorId: string, now: string, metadata?: Record<string, string | number | boolean>): Promise<void>;
}

export function createAuditRepository(db: Db): AuditRepository {
  const col = db.collection<AuditEvent & { _id?: ObjectId }>(COLLECTION);

  return {
    async log(tenantId, action, entityId, entityType, actorType, actorId, now, metadata) {
      const doc: AuditEvent = {
        id: new ObjectId().toHexString(),
        tenantId,
        action,
        entityId,
        entityType,
        actorType,
        actorId,
        timestamp: now,
        metadata,
      };
      await col.insertOne({ ...doc });
    },
  };
}
