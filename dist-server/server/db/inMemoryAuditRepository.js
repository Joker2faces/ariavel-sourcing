import { randomBytes } from 'crypto';
export function createInMemoryAuditRepository() {
    const events = [];
    return {
        async log(tenantId, action, entityId, entityType, actorType, actorId, now, metadata) {
            events.push({ id: randomBytes(8).toString('hex'), tenantId, action, entityId, entityType, actorType, actorId, timestamp: now, metadata });
        },
        getAll() { return [...events]; },
    };
}
