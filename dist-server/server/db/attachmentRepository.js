const COLLECTION = 'attachments';
function strip(doc) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc;
    return rest;
}
export function createAttachmentRepository(db) {
    const col = db.collection(COLLECTION);
    return {
        async create(attachment) {
            await col.insertOne({ ...attachment });
            return attachment;
        },
        async getById(tenantId, id) {
            const doc = await col.findOne({ tenantId, id });
            return doc ? strip(doc) : null;
        },
        async listForEntity(tenantId, entityType, entityId) {
            const docs = await col.find({ tenantId, entityType: entityType, entityId, status: { $ne: 'DELETED' } }).sort({ uploadedAt: -1 }).toArray();
            return docs.map(d => strip(d));
        },
        async updateStatus(tenantId, id, status) {
            const result = await col.findOneAndUpdate({ tenantId, id }, { $set: { status } }, { returnDocument: 'after' });
            return result ? strip(result) : null;
        },
    };
}
