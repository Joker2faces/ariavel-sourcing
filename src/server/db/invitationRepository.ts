import { type Db, ObjectId } from 'mongodb';
import type { SupplierInvitation, InvitationInput, InvitationStatus } from '../types/invitation.js';

const COLLECTION = 'supplier_invitations';

type WithMongoId = { _id?: ObjectId };

function strip<T extends WithMongoId>(doc: T): Omit<T, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Omit<T, '_id'>;
}

export interface InvitationRepository {
  create(tenantId: string, input: InvitationInput, tokenHash: string, createdByUserId: string, now: string): Promise<SupplierInvitation>;
  findById(tenantId: string, id: string): Promise<SupplierInvitation | null>;
  findByTokenHash(tokenHash: string): Promise<SupplierInvitation | null>;
  listForEvent(tenantId: string, eventId: string): Promise<SupplierInvitation[]>;
  updateStatus(tenantId: string, id: string, status: InvitationStatus, extra: Partial<SupplierInvitation>, now: string): Promise<SupplierInvitation | null>;
  replaceToken(tenantId: string, id: string, newTokenHash: string, userId: string, now: string): Promise<SupplierInvitation | null>;
}

export function createInvitationRepository(db: Db): InvitationRepository {
  const col = db.collection<SupplierInvitation & WithMongoId>(COLLECTION);

  return {
    async create(tenantId, input, tokenHash, createdByUserId, now) {
      // tenantId/createdByUserId placed AFTER spread to guarantee JWT-derived values always win
      const doc: SupplierInvitation = {
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
      return doc ? strip(doc) as SupplierInvitation : null;
    },

    async findByTokenHash(tokenHash) {
      const doc = await col.findOne({ tokenHash });
      return doc ? strip(doc) as SupplierInvitation : null;
    },

    async listForEvent(tenantId, eventId) {
      const docs = await col.find({ tenantId, eventId }).sort({ createdAt: -1 }).toArray();
      return docs.map(d => strip(d) as SupplierInvitation);
    },

    async updateStatus(tenantId, id, status, extra, now) {
      const result = await col.findOneAndUpdate(
        { tenantId, id },
        { $set: { status, updatedAt: now, ...extra } },
        { returnDocument: 'after' },
      );
      return result ? strip(result) as SupplierInvitation : null;
    },

    async replaceToken(tenantId, id, newTokenHash, userId, now) {
      const result = await col.findOneAndUpdate(
        { tenantId, id },
        { $set: { tokenHash: newTokenHash, regeneratedAt: now, regeneratedByUserId: userId, updatedAt: now } },
        { returnDocument: 'after' },
      );
      return result ? strip(result) as SupplierInvitation : null;
    },
  };
}
