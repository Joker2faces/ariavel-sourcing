import { ObjectId } from 'mongodb';
const COLLECTION = 'audit_events';
export function createAuditRepository(db) {
    const col = db.collection(COLLECTION);
    return {
        async log(tenantId, action, entityId, entityType, actorType, actorId, now, metadata) {
            const doc = {
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
