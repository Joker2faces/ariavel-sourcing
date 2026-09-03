import { ObjectId } from 'mongodb';
const COLLECTION = 'supplier_invitations';
function strip(doc) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc;
    return rest;
}
export function createInvitationRepository(db) {
    const col = db.collection(COLLECTION);
    return {
        async create(tenantId, input, tokenHash, createdByUserId, now) {
            // tenantId/createdByUserId placed AFTER spread to guarantee JWT-derived values always win
            const doc = {
                ...input,
                id: new ObjectId().toHexString(),
                tenantId,
                tokenHash,
                status: 'CREATED',
                createdAt: now,
                updatedAt: now,
                createdByUserId,
            };
            await col.insertOne({ ...doc });
            return doc;
        },
        async findById(tenantId, id) {
            const doc = await col.findOne({ tenantId, id });
            return doc ? strip(doc) : null;
        },
        async findByTokenHash(tokenHash) {
            const doc = await col.findOne({ tokenHash });
            return doc ? strip(doc) : null;
        },
        async listForEvent(tenantId, eventId) {
            const docs = await col.find({ tenantId, eventId }).sort({ createdAt: -1 }).toArray();
            return docs.map(d => strip(d));
        },
        async updateStatus(tenantId, id, status, extra, now) {
            const result = await col.findOneAndUpdate({ tenantId, id }, { $set: { status, updatedAt: now, ...extra } }, { returnDocument: 'after' });
            return result ? strip(result) : null;
        },
        async replaceToken(tenantId, id, newTokenHash, userId, now) {
            const result = await col.findOneAndUpdate({ tenantId, id }, { $set: { tokenHash: newTokenHash, regeneratedAt: now, regeneratedByUserId: userId, updatedAt: now } }, { returnDocument: 'after' });
            return result ? strip(result) : null;
        },
    };
}
