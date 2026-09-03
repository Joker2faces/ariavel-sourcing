export function createInMemoryComparisonRepository() {
    const store = new Map();
    return {
        async save(snapshot) {
            store.set(snapshot.id, { ...snapshot });
            return { ...snapshot };
        },
        async getById(tenantId, id) {
            const doc = store.get(id);
            return doc?.tenantId === tenantId ? { ...doc } : null;
        },
        async getLatest(tenantId, eventId) {
            const matches = [...store.values()]
                .filter(s => s.tenantId === tenantId && s.eventId === eventId)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return matches[0] ? { ...matches[0] } : null;
        },
        async listForEvent(tenantId, eventId) {
            return [...store.values()]
                .filter(s => s.tenantId === tenantId && s.eventId === eventId)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map(s => ({ ...s }));
        },
    };
}
