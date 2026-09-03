import type { Db, ObjectId } from 'mongodb';
import type { Attachment, AttachmentStatus } from '../../shared/types/document.js';

const COLLECTION = 'attachments';

type WithMongoId = { _id?: ObjectId };

function strip<T extends WithMongoId>(doc: T): Omit<T, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Omit<T, '_id'>;
}

export interface AttachmentRepository {
  create(attachment: Attachment): Promise<Attachment>;
  getById(tenantId: string, id: string): Promise<Attachment | null>;
  listForEntity(tenantId: string, entityType: string, entityId: string): Promise<Attachment[]>;
  updateStatus(tenantId: string, id: string, status: AttachmentStatus): Promise<Attachment | null>;
}

export function createAttachmentRepository(db: Db): AttachmentRepository {
  const col = db.collection<Attachment & WithMongoId>(COLLECTION);

  return {
    async create(attachment) {
      await col.insertOne({ ...attachment });
      return attachment;
    },

    async getById(tenantId, id) {
      const doc = await col.findOne({ tenantId, id });
      return doc ? strip(doc) as Attachment : null;
    },

    async listForEntity(tenantId, entityType, entityId) {
      const docs = await col.find({ tenantId, entityType: entityType as Attachment['entityType'], entityId, status: { $ne: 'DELETED' } }).sort({ uploadedAt: -1 }).toArray();
      return docs.map(d => strip(d) as Attachment);
    },

    async updateStatus(tenantId, id, status) {
      const result = await col.findOneAndUpdate(
        { tenantId, id },
        { $set: { status } },
        { returnDocument: 'after' },
      );
      return result ? strip(result) as Attachment : null;
    },
  };
}
