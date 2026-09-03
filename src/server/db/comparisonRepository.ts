import type { Db, ObjectId } from 'mongodb';
import type { ComparisonSnapshot } from '../../shared/types/bid.js';

const COLLECTION = 'comparison_snapshots';

type WithMongoId = { _id?: ObjectId };

function strip<T extends WithMongoId>(doc: T): Omit<T, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Omit<T, '_id'>;
}

export interface ComparisonRepository {
  save(snapshot: ComparisonSnapshot): Promise<ComparisonSnapshot>;
  getById(tenantId: string, id: string): Promise<ComparisonSnapshot | null>;
  getLatest(tenantId: string, eventId: string): Promise<ComparisonSnapshot | null>;
  listForEvent(tenantId: string, eventId: string): Promise<ComparisonSnapshot[]>;
}

export function createComparisonRepository(db: Db): ComparisonRepository {
  const col = db.collection<ComparisonSnapshot & WithMongoId>(COLLECTION);

  return {
    async save(snapshot) {
      await col.replaceOne({ tenantId: snapshot.tenantId, id: snapshot.id }, { ...snapshot }, { upsert: true });
      return snapshot;
    },

    async getById(tenantId, id) {
      const doc = await col.findOne({ tenantId, id });
      return doc ? strip(doc) as ComparisonSnapshot : null;
    },

    async getLatest(tenantId, eventId) {
      const doc = await col.findOne({ tenantId, eventId }, { sort: { createdAt: -1 } });
      return doc ? strip(doc) as ComparisonSnapshot : null;
    },

    async listForEvent(tenantId, eventId) {
      const docs = await col.find({ tenantId, eventId }).sort({ createdAt: -1 }).toArray();
      return docs.map(d => strip(d) as ComparisonSnapshot);
    },
  };
}
