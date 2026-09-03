import type { Db, ObjectId } from 'mongodb';
import type { AwardScenario } from '../../shared/types/award.js';

const COLLECTION = 'award_scenarios';

type WithMongoId = { _id?: ObjectId };

function strip<T extends WithMongoId>(doc: T): Omit<T, '_id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = doc;
  return rest as Omit<T, '_id'>;
}

export interface AwardRepository {
  save(scenario: AwardScenario): Promise<AwardScenario>;
  getById(tenantId: string, id: string): Promise<AwardScenario | null>;
  listForEvent(tenantId: string, eventId: string): Promise<AwardScenario[]>;
  getFinalized(tenantId: string, eventId: string): Promise<AwardScenario | null>;
}

export function createAwardRepository(db: Db): AwardRepository {
  const col = db.collection<AwardScenario & WithMongoId>(COLLECTION);

  return {
    async save(scenario) {
      await col.replaceOne({ tenantId: scenario.tenantId, id: scenario.id }, { ...scenario }, { upsert: true });
      return scenario;
    },

    async getById(tenantId, id) {
      const doc = await col.findOne({ tenantId, id });
      return doc ? strip(doc) as AwardScenario : null;
    },

    async listForEvent(tenantId, eventId) {
      const docs = await col.find({ tenantId, eventId }).sort({ createdAt: -1 }).toArray();
      return docs.map(d => strip(d) as AwardScenario);
    },

    async getFinalized(tenantId, eventId) {
      const doc = await col.findOne({ tenantId, eventId, isFinalized: true });
      return doc ? strip(doc) as AwardScenario : null;
    },
  };
}
