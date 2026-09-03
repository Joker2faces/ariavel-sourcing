import { type Db, ObjectId } from 'mongodb';
import type { SupplierQuote, QuoteInput } from '../types/quote.js';

const COLLECTION = 'supplier_quotes';

type WithMongoId = { _id?: ObjectId };

function strip<T extends WithMongoId>(doc: T): Omit<T, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Omit<T, '_id'>;
}

export interface QuoteRepository {
  upsertDraft(tenantId: string, invitationId: string, eventId: string, supplierId: string, supplierNameSnapshot: string, input: QuoteInput, now: string): Promise<SupplierQuote>;
  submit(tenantId: string, invitationId: string, now: string): Promise<SupplierQuote | null>;
  findByInvitation(tenantId: string, invitationId: string): Promise<SupplierQuote | null>;
  listForEvent(tenantId: string, eventId: string): Promise<SupplierQuote[]>;
  findById(tenantId: string, id: string): Promise<SupplierQuote | null>;
}

export function createQuoteRepository(db: Db): QuoteRepository {
  const col = db.collection<SupplierQuote & WithMongoId>(COLLECTION);

  return {
    async upsertDraft(tenantId, invitationId, eventId, supplierId, supplierNameSnapshot, input, now) {
      const existing = await col.findOne({ tenantId, invitationId, status: 'DRAFT' });
      if (existing) {
        const result = await col.findOneAndUpdate(
          { tenantId, invitationId, status: 'DRAFT' },
          { $set: { ...input, updatedAt: now }, $inc: { version: 1 } },
          { returnDocument: 'after' },
        );
        return strip(result!) as SupplierQuote;
      }
      const doc: SupplierQuote = {
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
      const result = await col.findOneAndUpdate(
        { tenantId, invitationId, status: 'DRAFT' },
        { $set: { status: 'SUBMITTED', submittedAt: now, updatedAt: now }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      return result ? strip(result) as SupplierQuote : null;
    },

    async findByInvitation(tenantId, invitationId) {
      const doc = await col.findOne({ tenantId, invitationId });
      return doc ? strip(doc) as SupplierQuote : null;
    },

    async listForEvent(tenantId, eventId) {
      const docs = await col.find({ tenantId, eventId }).sort({ updatedAt: -1 }).toArray();
      return docs.map(d => strip(d) as SupplierQuote);
    },

    async findById(tenantId, id) {
      const doc = await col.findOne({ tenantId, id });
      return doc ? strip(doc) as SupplierQuote : null;
    },
  };
}
