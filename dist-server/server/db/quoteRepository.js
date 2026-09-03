import { ObjectId } from 'mongodb';
const COLLECTION = 'supplier_quotes';
function strip(doc) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = doc;
    return rest;
}
export function createQuoteRepository(db) {
    const col = db.collection(COLLECTION);
    return {
        async upsertDraft(tenantId, invitationId, eventId, supplierId, supplierNameSnapshot, input, now) {
            const existing = await col.findOne({ tenantId, invitationId, status: 'DRAFT' });
            if (existing) {
                const result = await col.findOneAndUpdate({ tenantId, invitationId, status: 'DRAFT' }, { $set: { ...input, updatedAt: now }, $inc: { version: 1 } }, { returnDocument: 'after' });
                return strip(result);
            }
            const doc = {
                id: new ObjectId().toHexString(),
                tenantId,
                invitationId,
                eventId,
                supplierId,
                supplierNameSnapshot,
                status: 'DRAFT',
                lines: input.lines,
                commercialTerms: input.commercialTerms,
                paymentTerms: input.paymentTerms,
                validityDays: input.validityDays,
                supplierNotes: input.supplierNotes,
                version: 1,
                createdAt: now,
                updatedAt: now,
            };
            await col.insertOne({ ...doc });
            return doc;
        },
        async submit(tenantId, invitationId, now) {
            const result = await col.findOneAndUpdate({ tenantId, invitationId, status: 'DRAFT' }, { $set: { status: 'SUBMITTED', submittedAt: now, updatedAt: now }, $inc: { version: 1 } }, { returnDocument: 'after' });
            return result ? strip(result) : null;
        },
        async findByInvitation(tenantId, invitationId) {
            const doc = await col.findOne({ tenantId, invitationId });
            return doc ? strip(doc) : null;
        },
        async listForEvent(tenantId, eventId) {
            const docs = await col.find({ tenantId, eventId }).sort({ updatedAt: -1 }).toArray();
            return docs.map(d => strip(d));
        },
        async findById(tenantId, id) {
            const doc = await col.findOne({ tenantId, id });
            return doc ? strip(doc) : null;
        },
    };
}
