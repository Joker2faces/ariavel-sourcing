export function createInMemoryAwardRepository() {
    const store = new Map();
    return {
        async save(scenario) {
            store.set(scenario.id, { ...scenario });
            return { ...scenario };
        },
        async getById(tenantId, id) {
            const doc = store.get(id);
            return doc?.tenantId === tenantId ? { ...doc } : null;
        },
        async listForEvent(tenantId, eventId) {
            return [...store.values()]
                .filter(s => s.tenantId === tenantId && s.eventId === eventId)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map(s => ({ ...s }));
        },
        async getFinalized(tenantId, eventId) {
            const scenario = [...store.values()].find(s => s.tenantId === tenantId && s.eventId === eventId && s.isFinalized);
            return scenario ? { ...scenario } : null;
        },
    };
}
