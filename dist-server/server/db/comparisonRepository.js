const COLLECTION = 'comparison_snapshots';
function strip(doc) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc;
    return rest;
}
export function createComparisonRepository(db) {
    const col = db.collection(COLLECTION);
    return {
        async save(snapshot) {
            await col.replaceOne({ tenantId: snapshot.tenantId, id: snapshot.id }, { ...snapshot }, { upsert: true });
            return snapshot;
        },
        async getById(tenantId, id) {
            const doc = await col.findOne({ tenantId, id });
            return doc ? strip(doc) : null;
        },
        async getLatest(tenantId, eventId) {
            const doc = await col.findOne({ tenantId, eventId }, { sort: { createdAt: -1 } });
            return doc ? strip(doc) : null;
        },
        async listForEvent(tenantId, eventId) {
            const docs = await col.find({ tenantId, eventId }).sort({ createdAt: -1 }).toArray();
            return docs.map(d => strip(d));
        },
    };
}
