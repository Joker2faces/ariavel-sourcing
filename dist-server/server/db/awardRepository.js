const COLLECTION = 'award_scenarios';
function strip(doc) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc;
    return rest;
}
export function createAwardRepository(db) {
    const col = db.collection(COLLECTION);
    return {
        async save(scenario) {
            await col.replaceOne({ tenantId: scenario.tenantId, id: scenario.id }, { ...scenario }, { upsert: true });
            return scenario;
        },
        async getById(tenantId, id) {
            const doc = await col.findOne({ tenantId, id });
            return doc ? strip(doc) : null;
        },
        async listForEvent(tenantId, eventId) {
            const docs = await col.find({ tenantId, eventId }).sort({ createdAt: -1 }).toArray();
            return docs.map(d => strip(d));
        },
        async getFinalized(tenantId, eventId) {
            const doc = await col.findOne({ tenantId, eventId, isFinalized: true });
            return doc ? strip(doc) : null;
        },
    };
}
