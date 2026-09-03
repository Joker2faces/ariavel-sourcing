export function createInMemoryAttachmentRepository() {
    const store = new Map();
    return {
        async create(attachment) {
            store.set(attachment.id, { ...attachment });
            return { ...attachment };
        },
        async getById(tenantId, id) {
            const doc = store.get(id);
            return doc?.tenantId === tenantId ? { ...doc } : null;
        },
        async listForEntity(tenantId, entityType, entityId) {
            return [...store.values()]
                .filter(a => a.tenantId === tenantId && a.entityType === entityType && a.entityId === entityId && a.status !== 'DELETED')
                .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
                .map(a => ({ ...a }));
        },
        async updateStatus(tenantId, id, status) {
            const doc = store.get(id);
            if (!doc || doc.tenantId !== tenantId)
                return null;
            const updated = { ...doc, status };
            store.set(id, updated);
            return { ...updated };
        },
    };
}
