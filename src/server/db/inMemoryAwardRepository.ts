import type { AwardRepository } from './awardRepository.js';
import type { AwardScenario } from '../../shared/types/award.js';

export function createInMemoryAwardRepository(): AwardRepository {
  const store = new Map<string, AwardScenario>();

  return {
    async save(scenario) {
      store.set(scenario.id, structuredClone(scenario));
      return structuredClone(scenario);
    },

    async getById(tenantId, id) {
      const doc = store.get(id);
      return doc?.tenantId === tenantId ? structuredClone(doc) : null;
    },

    async listForEvent(tenantId, eventId) {
      return [...store.values()]
        .filter(s => s.tenantId === tenantId && s.eventId === eventId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(s => structuredClone(s));
    },

    async getFinalized(tenantId, eventId) {
      const scenario = [...store.values()].find(s => s.tenantId === tenantId && s.eventId === eventId && s.isFinalized);
      return scenario ? structuredClone(scenario) : null;
    },
  };
}
